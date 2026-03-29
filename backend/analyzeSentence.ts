/**
 * backend/analyzeSentence.ts
 *
 * Express route handler for POST /api/sentence-analysis/detailed
 *
 * ─── Pipeline ──────────────────────────────────────────────────────────────────
 *
 *   1. Validate + sanitize request body (Zod)
 *   2. Call AI model (analyzeSentenceWithModel)
 *   3. Normalize model output (normalizeDetailedAnalysisResult)
 *   4. Log outcome
 *   5. Return JSON response
 *
 * ─── Error handling ────────────────────────────────────────────────────────────
 *
 *   - Invalid request body        → 400  (safe details, no internals)
 *   - OPENAI_API_KEY not set       → 503  (operational — not a client error)
 *   - Model timeout / provider err → 200  (buildFallbackResult, logged)
 *   - Empty / unparseable response → 200  (buildFallbackResult, logged)
 *   - Normalization error          → 200  (buildFallbackResult, logged)
 *
 *   The endpoint NEVER returns 500 to the client after request validation passes.
 *   Fallback results are served over crashes so the app stays usable.
 *
 * ─── Security ──────────────────────────────────────────────────────────────────
 *
 *   - No stack traces in client responses
 *   - No raw provider error details in client responses
 *   - No internal prompt text exposed
 *   - All validation errors reference field names only, not internal logic
 */

import { Router, Request, Response }               from 'express';
import { z }                                        from 'zod';
import { analyzeSentenceWithModel, ModelCallError } from './ai/analyzeSentenceWithModel';
import {
  normalizeDetailedAnalysisResult,
  buildFallbackResult,
}                                                   from './ai/normalizeDetailedAnalysisResult';
import { log, safeErrorSummary }                    from './logger';
import { getRequestId }                             from './middleware/requestId';
import { detailedAnalysisLimiter }                  from './middleware/rateLimiter';
import type { SentenceAnalysisRequest }             from './types';

// ─── Validation limits ────────────────────────────────────────────────────────

const MAX_TARGET_WORD_LEN  = 80;
const MAX_SENTENCE_LEN     = 800;
const MAX_USER_LEVEL_LEN   = 10;
const MAX_ISSUES_COUNT     = 20;
const MAX_MESSAGE_TR_LEN   = 300;
const MAX_ISSUE_TYPE_LEN   = 50;

// ─── Request validation schema ────────────────────────────────────────────────
//
// Strings are trimmed at the schema level so downstream code never sees
// leading/trailing whitespace.  Empty-after-trim strings are rejected.

const LocalIssueSchema = z.object({
  type:      z.string().trim().min(1).max(MAX_ISSUE_TYPE_LEN),
  subtype:   z.string().trim().max(MAX_ISSUE_TYPE_LEN).optional(),
  severity:  z.enum(['error', 'warning', 'suggestion']),
  messageTr: z.string().trim().min(1).max(MAX_MESSAGE_TR_LEN),
});

const LocalAnalysisSchema = z.object({
  status:         z.enum(['fail', 'partial', 'perfect']),
  usedTargetWord: z.boolean(),
  targetWordMode: z.enum(['exact', 'family', 'missing', 'typo_suspected']),
  score:          z.number().int().min(0).max(100),
  confidence:     z.enum(['low', 'medium', 'high']),
  issues:         z.array(LocalIssueSchema).max(MAX_ISSUES_COUNT),
});

const RequestBodySchema = z.object({
  targetWord:    z.string().trim().min(1).max(MAX_TARGET_WORD_LEN),
  sentence:      z.string().trim().min(1).max(MAX_SENTENCE_LEN),
  userLevel:     z.string().trim().max(MAX_USER_LEVEL_LEN).optional(),
  localAnalysis: LocalAnalysisSchema,
});

// ─── Router ───────────────────────────────────────────────────────────────────

export const analyzeSentenceRouter = Router();

// Rate limiting applied before the handler.
analyzeSentenceRouter.use(detailedAnalysisLimiter);

// ─── Route handler ────────────────────────────────────────────────────────────

analyzeSentenceRouter.post('/', async (req: Request, res: Response) => {
  const reqId     = getRequestId(res);
  const startedAt = Date.now();

  // ── 1. Validate + sanitize request body ─────────────────────────────────────
  const parseResult = RequestBodySchema.safeParse(req.body);

  if (!parseResult.success) {
    // Map Zod errors to safe field-path messages — no internal logic exposed.
    const fieldErrors = parseResult.error.issues.map(i => ({
      field:   i.path.join('.') || 'body',
      message: i.message,
    }));

    log.warn('request_validation_failed', reqId, {
      ip:         req.ip ?? 'unknown',
      errorCount: fieldErrors.length,
    });

    res.status(400).json({
      error:  'Invalid request',
      fields: fieldErrors,
    });
    return;
  }

  const body = parseResult.data as SentenceAnalysisRequest;
  const { targetWord, sentence, localAnalysis } = body;

  // Abuse guard: reject whitespace-only sentence that passed the trim but somehow
  // contains only punctuation / non-meaningful content.
  if (!sentence.replace(/[^a-zA-Z]/g, '').length) {
    log.warn('request_no_alpha_content', reqId, { ip: req.ip ?? 'unknown' });
    res.status(400).json({
      error:   'Invalid request',
      message: 'Sentence must contain at least one letter.',
    });
    return;
  }

  log.info('analysis_started', reqId, {
    sentenceLen:    sentence.length,
    targetWordLen:  targetWord.length,
    localStatus:    localAnalysis.status,
    localScore:     localAnalysis.score,
    localIssues:    localAnalysis.issues.length,
  });

  // ── 2. Call model ───────────────────────────────────────────────────────────
  let rawOutput: unknown;
  try {
    rawOutput = await analyzeSentenceWithModel(body);
  } catch (err) {
    const { code, message } = safeErrorSummary(err);

    // Config error (missing API key) → 503 so ops can detect misconfiguration.
    if (err instanceof ModelCallError && err.code === 'config') {
      log.error('model_config_error', reqId, { message });
      res.status(503).json({
        error:   'Service temporarily unavailable',
        message: 'The analysis service is not configured. Please try again later.',
      });
      return;
    }

    // Timeout / provider / empty response → fallback 200 (app stays usable).
    log.error('model_call_failed', reqId, {
      errorCode:  code,
      durationMs: Date.now() - startedAt,
    });
    const fallback = buildFallbackResult(localAnalysis, targetWord, code);
    log.info('analysis_fallback_served', reqId, {
      reason:     code,
      durationMs: Date.now() - startedAt,
    });
    res.json(fallback);
    return;
  }

  // ── 3. Normalize model output ───────────────────────────────────────────────
  let result;
  try {
    result = normalizeDetailedAnalysisResult(rawOutput, localAnalysis, targetWord);
  } catch (err) {
    // normalizeDetailedAnalysisResult is designed not to throw, but guard anyway.
    const { code } = safeErrorSummary(err);
    log.error('normalization_error', reqId, { errorCode: code });
    const fallback = buildFallbackResult(localAnalysis, targetWord, 'normalize-threw');
    log.info('analysis_fallback_served', reqId, {
      reason:     'normalize-threw',
      durationMs: Date.now() - startedAt,
    });
    res.json(fallback);
    return;
  }

  // ── 4. Log outcome ──────────────────────────────────────────────────────────
  log.info('analysis_complete', reqId, {
    status:          result.status,
    score:           result.score,
    grammarScore:    result.grammarScore,
    confidence:      result.confidence,
    issueCount:      result.issues.length,
    hasCorrected:    result.correctedSentence !== null,
    hasAlternative:  result.naturalAlternative !== null,
    isFallback:      result.tags.includes('fallback-response'),
    durationMs:      Date.now() - startedAt,
  });

  // ── 5. Return ────────────────────────────────────────────────────────────────
  res.json(result);
});
