/**
 * detailedAnalysisService.ts
 *
 * Layer 2 of the Sentence Builder analysis pipeline.
 *
 * ─── Architecture ──────────────────────────────────────────────────────────────
 *
 *   Layer 1 — sentenceAnalysisService.ts  (local, instant, always runs)
 *     • Target-word detection (exact / family / typo / missing)
 *     • Minimum-length guard
 *     • 17 rule-based grammar checks (incl. function-word typos)
 *     • Cosmetic fixes + multi-pass correction
 *
 *   Layer 1.5 — languageToolService.ts  (optional, parallel with AI)
 *     • Grammar / agreement / article errors the local rules may miss
 *     • Turkish-translated feedback for ~25 common LT rule IDs
 *     • Auto-correction candidate via LT replacement suggestions
 *     • Structural LT errors lock verdict floor at FLAWED — AI cannot upgrade
 *
 *   Layer 2 — THIS FILE  (optional, user-triggered, backend-gated)
 *     • AI-powered grammar / naturalness / clarity scoring
 *     • Richer Turkish explanations
 *     • Corrected sentence + more natural alternative
 *     • Sub-scores: grammarScore, clarityScore, naturalnessScore
 *
 * ─── Security model ────────────────────────────────────────────────────────────
 *
 *   ⚠️  API keys NEVER live in the React Native bundle.
 *
 *   The app calls YOUR backend endpoint  →  backend calls the AI provider.
 *
 *   Recommended backend route:
 *     POST /api/sentence-analysis/detailed
 *     Authorization: Bearer <user-session-token>
 *     Body:     DetailedAnalysisInput
 *     Response: DetailedAnalysisResult
 *
 *   The backend handles:
 *     • Auth (JWT / session)
 *     • Rate-limiting / per-user quota
 *     • AI provider call with server-side API key
 *     • Returning `DetailedAnalysisResult`
 *
 * ─── Activation ────────────────────────────────────────────────────────────────
 *
 *   Set DETAILED_API_URL to your backend endpoint to enable real AI.
 *   Leave it empty ('') to run the deterministic mock instead.
 *   No other code changes needed — the request/response contract is stable.
 */

import { callLanguageTool, LTCallResult } from './languageToolService';
import { validateCorrectedSentence }       from './sentenceAnalysisService';

// ─── Configuration ─────────────────────────────────────────────────────────────

/**
 * Your secure backend endpoint.
 *
 * Empty string  → mock mode (no network calls, safe for development).
 * Dev (iOS Simulator): 'http://localhost:8787/api/sentence-analysis/detailed'
 * Production: set to your deployed backend URL before releasing.
 *
 * When this is non-empty, the backend handles LanguageTool server-side and
 * folds its findings into the normalized result.  The client-side LT call
 * (line ~265) is automatically skipped — no double-call.
 */
const DETAILED_API_URL = 'http://localhost:8787/api/sentence-analysis/detailed';

/** Network request timeout in milliseconds. */
const FETCH_TIMEOUT_MS = 10_000;

// ─── Shared enum types ─────────────────────────────────────────────────────────

export type ConfidenceLevel = 'low' | 'medium' | 'high';

export type TargetWordMode = 'exact' | 'family' | 'missing' | 'typo_suspected';

export type AnalysisStatus = 'perfect' | 'partial' | 'fail';

/**
 * Four-way evaluation verdict — stricter classification than the 3-way AnalysisStatus.
 *
 *   PERFECT    — grammatically correct and natural (score 100)
 *   ACCEPTABLE — correct structure, surface-only issues like typo/punctuation (score 85–90)
 *   FLAWED     — structural grammar error: verb pattern, wrong preposition, etc. (score 20–50)
 *   REJECTED   — target word missing, sentence incoherent, or target word misused (score 0)
 */
export type EvaluationVerdict = 'PERFECT' | 'ACCEPTABLE' | 'FLAWED' | 'REJECTED';

export type IssueSeverity = 'error' | 'warning' | 'suggestion';

// ─── Request contract ──────────────────────────────────────────────────────────

/**
 * Summary of the Layer-1 (local) analysis result, sent to the backend so the
 * AI does not need to repeat basic checks and can focus on higher-level feedback.
 */
export interface LocalAnalysisSummary {
  /** Local rule-based verdict. */
  status: AnalysisStatus;
  /** Whether the target word (or a close form) was found in the sentence. */
  usedTargetWord: boolean;
  /** How the target word was matched. */
  targetWordMode: TargetWordMode;
  /** 0–100 quality score from local rules. */
  score: number;
  /** Local engine confidence. */
  confidence: ConfidenceLevel;
  /** Issues detected by local rules. */
  issues: Array<{
    /** Category of the issue (e.g. 'grammar', 'spelling', 'style'). */
    type: string;
    /** Optional sub-category (e.g. 'subject-verb-agreement'). */
    subtype?: string;
    severity: IssueSeverity;
    /** Turkish-language description shown to the user. */
    messageTr: string;
  }>;
}

/**
 * Full request body sent to the backend.
 *
 * POST /api/sentence-analysis/detailed
 */
export interface DetailedAnalysisInput {
  /** The single target word the user is practising. */
  targetWord: string;
  /** The sentence the user typed. */
  sentence: string;
  /** Difficulty band — informs depth of AI feedback. */
  userLevel?: string;
  /** Layer-1 results, forwarded so the AI can focus on incremental value. */
  localAnalysis: LocalAnalysisSummary;
}

// ─── Response contract ─────────────────────────────────────────────────────────

/**
 * A single grammar or style observation from the AI.
 */
export interface DetailedAnalysisIssue {
  /** Top-level category: 'grammar' | 'spelling' | 'vocabulary' | 'clarity' | 'style' | … */
  type: string;
  /** Optional sub-category (e.g. 'subject-verb-agreement', 'wrong-preposition'). */
  subtype?: string;
  severity: IssueSeverity;
  /**
   * The exact word or phrase in the user's sentence that triggered this issue.
   * Undefined when the issue applies to the whole sentence rather than a span.
   */
  span?: string;
  /** Turkish-language description of the issue. */
  messageTr: string;
}

/**
 * Full response from the AI backend (or mock fallback).
 *
 * All fields are always present after normalization.
 * `correctedSentence` and `naturalAlternative` are null when not applicable.
 */
export interface DetailedAnalysisResult {
  /** Overall verdict. */
  status: AnalysisStatus;
  /** Whether the AI detected the target word (or a derived form). */
  usedTargetWord: boolean;
  /** How the target word was matched. */
  targetWordMode: TargetWordMode;
  /** Overall quality score 0–100 (weighted average of sub-scores). */
  score: number;
  /** Sub-score: grammar correctness 0–100. */
  grammarScore: number;
  /** Sub-score: sentence clarity 0–100. */
  clarityScore: number;
  /** Sub-score: naturalness / fluency 0–100. */
  naturalnessScore: number;
  /** AI confidence in this result. */
  confidence: ConfidenceLevel;
  /** Short Turkish feedback — shown as the primary card message. */
  shortFeedbackTr: string;
  /**
   * Grammar-corrected sentence.
   * null when no corrections are needed or confidence is too low.
   */
  correctedSentence: string | null;
  /**
   * A more natural English alternative phrasing.
   * Populated only by the real AI backend; null in mock mode.
   */
  naturalAlternative: string | null;
  /** Ordered issues list (empty array = no issues). */
  issues: DetailedAnalysisIssue[];
  /** Machine-readable classification tags (e.g. ['grammar-error', 'too-short']). */
  tags: string[];
  /** Four-way evaluation verdict (stricter than the 3-way status). */
  verdict: EvaluationVerdict;
  /**
   * How the corrected sentence was produced.
   * 'minor_fix'  — only typos / punctuation / capitalisation were changed.
   * 'rewrite'    — structure was significantly changed to fix a grammar error.
   * null         — no correction provided (verdict is PERFECT or REJECTED).
   */
  correctionType: 'minor_fix' | 'rewrite' | null;
  /**
   * 1–2 example sentences showing correct usage.
   * Only populated when verdict is REJECTED (target word missing/misused).
   * Always null in mock mode.
   */
  exampleSentences: string[] | null;
}

// ─── Typed error ───────────────────────────────────────────────────────────────

/**
 * Typed error thrown internally when the real backend request fails.
 *
 * `analyzeSentenceDetailed` always resolves (never throws) — it catches this
 * and falls back to the mock.  Consumers that call `_fetchDetailed` directly
 * should handle `DetailedAnalysisError`.
 */
export class DetailedAnalysisError extends Error {
  constructor(
    message: string,
    /** Failure category for logging / telemetry. */
    public readonly code: 'network' | 'timeout' | 'http' | 'parse' | 'validation',
    /** HTTP status code, when applicable. */
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'DetailedAnalysisError';
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Calls the detailed AI analysis backend (or mock if URL is unconfigured).
 *
 * Always resolves — never throws.
 *
 *   DETAILED_API_URL set   → POST to backend → normalize response → return
 *   DETAILED_API_URL empty → return deterministic mock instantly
 *   Network/parse failure  → degrade silently to deterministic mock
 */
export async function analyzeSentenceDetailed(
  input: DetailedAnalysisInput,
): Promise<DetailedAnalysisResult> {
  // ── Step 1: Local pre-validation floor ────────────────────────────────────
  //
  //   skippedAI: true  → hard failure (target word missing / sentence too short).
  //                       Return immediately — no network calls needed.
  //   ruleEngineOverride → structural grammar error from Layer 1.
  //                       Still call AI/LT for correction/feedback, but verdict
  //                       floor is locked — nothing can upgrade above FLAWED.
  //   null              → all checks passed; proceed to network layers.
  const preResult = _preValidate(input);
  if (preResult?.skippedAI) {
    return _preValidateToResult(preResult, input.targetWord);
  }

  // ── Step 2: Launch LanguageTool + AI in parallel ──────────────────────────
  //
  //   Normal path (backend URL set):
  //     Client-side LT is skipped — the backend calls LT server-side and folds
  //     its findings into the normalized result.  No double-call, no quota waste.
  //
  //   Offline fallback (backend fails):
  //     When the backend request throws, client-side LT is launched immediately
  //     so the mock result still benefits from structural grammar floor enforcement.
  //     Without this, a backend outage would strip all LT coverage.
  //
  //   Mock mode (DETAILED_API_URL empty):
  //     Client-side LT runs from the start, in parallel with the (skipped) backend.
  //
  let ltPromise: Promise<LTCallResult | null> = DETAILED_API_URL
    ? Promise.resolve(null)   // backend handles LT — skip unless backend fails below
    : callLanguageTool(input.sentence).catch(() => null);

  let aiResult: DetailedAnalysisResult | null = null;
  if (DETAILED_API_URL) {
    try {
      const raw = await _fetchDetailed(input);
      aiResult  = normalizeDetailedAnalysisResult(raw);
    } catch {
      // Network / timeout / parse failure — backend is offline.
      // Launch client-side LT now so the mock fallback has structural floor coverage.
      ltPromise = callLanguageTool(input.sentence).catch(() => null);
    }
  }

  // Await LT (instant when backend succeeded; real network call when backend failed).
  const ltResult = await ltPromise;

  // ── Step 3: Combine floors (Layer 1 pre-validation + LanguageTool) ────────
  //
  //   If LT found structural errors (GRAMMAR category matches), the effective
  //   floor becomes at least FLAWED — same as if Layer 1 had caught the error.
  //   This prevents a clean Layer-1 result from letting AI award PERFECT when
  //   LT independently detected a structural grammar problem.
  const effectiveFloor = _combineFloors(preResult, ltResult);

  // ── Step 4: Build base result ─────────────────────────────────────────────
  const baseResult: DetailedAnalysisResult = aiResult
    ? _mergeResults(effectiveFloor, aiResult)
    : mockDetailedAnalysis(input, effectiveFloor);

  // ── Step 5: Merge LT issues + LT correction into the base result ──────────
  //
  //   LT non-structural issues (spelling, style, punctuation) are appended to
  //   the issues list.  LT structural issues are also added if not already
  //   covered by the floor.  LT's corrected sentence is used as a fallback
  //   when the base result has no corrected sentence.
  return _mergeLTIntoResult(baseResult, ltResult);
}

// ─── Network layer ─────────────────────────────────────────────────────────────

/**
 * Performs the POST request with a hard timeout.
 * Returns the raw parsed JSON (unknown shape — caller must normalize).
 *
 * @throws {DetailedAnalysisError} on any network, timeout, HTTP, or parse error.
 */
async function _fetchDetailed(input: DetailedAnalysisInput): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(DETAILED_API_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(input),
      signal:  controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const name = (err as { name?: string })?.name;
    if (name === 'AbortError') {
      throw new DetailedAnalysisError(
        `Request timed out after ${FETCH_TIMEOUT_MS}ms`,
        'timeout',
      );
    }
    const msg = (err as { message?: string })?.message ?? 'Unknown network error';
    throw new DetailedAnalysisError(`Network error: ${msg}`, 'network');
  }

  clearTimeout(timeoutId);

  if (!response.ok) {
    throw new DetailedAnalysisError(
      `Backend returned HTTP ${response.status}`,
      'http',
      response.status,
    );
  }

  try {
    return await response.json();
  } catch {
    throw new DetailedAnalysisError(
      'Backend returned invalid JSON',
      'parse',
    );
  }
}

// ─── Normalization / validation ────────────────────────────────────────────────

const _ALLOWED_STATUSES    = new Set<string>(['perfect', 'partial', 'fail']);
const _ALLOWED_MODES       = new Set<string>(['exact', 'family', 'missing', 'typo_suspected']);
const _ALLOWED_CONFIDENCE  = new Set<string>(['low', 'medium', 'high']);
const _ALLOWED_SEVERITIES  = new Set<string>(['error', 'warning', 'suggestion']);

/**
 * Validates and normalizes a raw backend response into a `DetailedAnalysisResult`.
 *
 * Defensive rules:
 *   • Unknown enum values → safe defaults
 *   • Scores clamped to 0–100
 *   • String fields trimmed; empty → fallback
 *   • correctedSentence / naturalAlternative: blank/invalid → null
 *   • issues: invalid entries filtered out; always an array
 *   • tags: non-string entries stripped; always an array
 *
 * @throws {DetailedAnalysisError} if `raw` is not an object (total garbage).
 *   Callers should fall back to mock on any thrown error.
 */
export function normalizeDetailedAnalysisResult(raw: unknown): DetailedAnalysisResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new DetailedAnalysisError(
      'Backend response is not an object',
      'validation',
    );
  }

  const r = raw as Record<string, unknown>;

  // ── Status ──────────────────────────────────────────────────────────────────
  const status: AnalysisStatus = _ALLOWED_STATUSES.has(r.status as string)
    ? (r.status as AnalysisStatus)
    : 'fail';

  // ── Target word ─────────────────────────────────────────────────────────────
  const usedTargetWord = typeof r.usedTargetWord === 'boolean' ? r.usedTargetWord : false;

  const targetWordMode: TargetWordMode = _ALLOWED_MODES.has(r.targetWordMode as string)
    ? (r.targetWordMode as TargetWordMode)
    : 'missing';

  // ── Scores ──────────────────────────────────────────────────────────────────
  const score           = _clamp(typeof r.score           === 'number' ? r.score           : 0, 0, 100);
  const grammarScore    = _clamp(typeof r.grammarScore    === 'number' ? r.grammarScore    : score, 0, 100);
  const clarityScore    = _clamp(typeof r.clarityScore    === 'number' ? r.clarityScore    : score, 0, 100);
  const naturalnessScore = _clamp(typeof r.naturalnessScore === 'number' ? r.naturalnessScore : score, 0, 100);

  // ── Confidence ──────────────────────────────────────────────────────────────
  const confidence: ConfidenceLevel = _ALLOWED_CONFIDENCE.has(r.confidence as string)
    ? (r.confidence as ConfidenceLevel)
    : 'low';

  // ── Text fields ─────────────────────────────────────────────────────────────
  const shortFeedbackTr =
    typeof r.shortFeedbackTr === 'string' && r.shortFeedbackTr.trim()
      ? r.shortFeedbackTr.trim()
      : _fallbackFeedback(status);

  const correctedSentence: string | null =
    typeof r.correctedSentence === 'string' && r.correctedSentence.trim()
      ? r.correctedSentence.trim()
      : null;

  const naturalAlternative: string | null =
    typeof r.naturalAlternative === 'string' && r.naturalAlternative.trim()
      ? r.naturalAlternative.trim()
      : null;

  // ── Issues ──────────────────────────────────────────────────────────────────
  const issues: DetailedAnalysisIssue[] = Array.isArray(r.issues)
    ? (r.issues as unknown[])
        .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object' && !Array.isArray(i))
        .map(i => ({
          type:     typeof i.type    === 'string' && i.type.trim()    ? i.type.trim()    : 'grammar',
          subtype:  typeof i.subtype === 'string' && i.subtype.trim() ? i.subtype.trim() : undefined,
          severity: _ALLOWED_SEVERITIES.has(i.severity as string)
            ? (i.severity as IssueSeverity)
            : 'error',
          span:     typeof i.span === 'string' && i.span.trim() ? i.span.trim() : undefined,
          messageTr: typeof i.messageTr === 'string' ? i.messageTr.trim() : '',
        }))
        .filter(i => i.messageTr.length > 0)
    : [];

  // ── Tags ────────────────────────────────────────────────────────────────────
  const tags: string[] = Array.isArray(r.tags)
    ? (r.tags as unknown[]).filter((t): t is string => typeof t === 'string')
    : [];

  // ── Verdict + new fields ────────────────────────────────────────────────────
  const _ALLOWED_VERDICTS = new Set<string>(['PERFECT', 'ACCEPTABLE', 'FLAWED', 'REJECTED']);
  const verdict: EvaluationVerdict = _ALLOWED_VERDICTS.has(r.verdict as string)
    ? (r.verdict as EvaluationVerdict)
    : _statusToVerdict(status);

  const correctionType: 'minor_fix' | 'rewrite' | null =
    r.correctionType === 'minor_fix' || r.correctionType === 'rewrite'
      ? r.correctionType
      : null;

  const exampleSentences: string[] | null = Array.isArray(r.exampleSentences)
    ? (r.exampleSentences as unknown[]).filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    : null;

  return {
    status, usedTargetWord, targetWordMode,
    score, grammarScore, clarityScore, naturalnessScore,
    confidence, shortFeedbackTr,
    correctedSentence, naturalAlternative,
    issues, tags,
    verdict, correctionType, exampleSentences,
  };
}

// ─── Deterministic mock ────────────────────────────────────────────────────────

/**
 * Produces a deterministic `DetailedAnalysisResult` from the input without
 * hitting any network endpoint.
 *
 * Key design contracts:
 *
 *   1.  **Never contradicts a local grammar fail.**
 *       If `localAnalysis.status` is 'fail' AND `localAnalysis.usedTargetWord`
 *       is true (meaning the word is present but grammar is bad), the mock
 *       returns 'partial' at best — never 'perfect'.
 *
 *   2.  **Inherits local issues.**
 *       All local issues are promoted into `DetailedAnalysisIssue` shape,
 *       so the detailed panel shows the same errors the local layer found,
 *       plus any cosmetic observations.
 *
 *   3.  **No random values.**
 *       Same input always produces the same output.
 *
 *   4.  **naturalAlternative is always null.**
 *       Only a real AI backend can produce this.
 *
 *   5.  **correctedSentence defers to Layer 1.**
 *       The local engine's multi-pass `_applyAllCorrections()` is already
 *       the best correction available in mock mode.  The mock returns null
 *       here so the UI continues to display `result.correctedSentence` from
 *       Layer 1 rather than duplicating a potentially inferior correction.
 */
export function mockDetailedAnalysis(
  input: DetailedAnalysisInput,
  preResult: _PreValidateResult | null = null,
): DetailedAnalysisResult {
  const { targetWord, sentence, localAnalysis } = input;
  const trimmed   = sentence.trim();
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;

  // ── Target-word fields — trust Layer 1 ────────────────────────────────────
  const usedTargetWord = localAnalysis.usedTargetWord;
  const targetWordMode = localAnalysis.targetWordMode;

  // ── Cosmetic observations ─────────────────────────────────────────────────
  const hasCapital = /^[A-Z]/.test(trimmed);
  const hasPunct   = /[.!?]$/.test(trimmed);
  const tooShort   = wordCount < 4;
  const tooLong    = wordCount > 25;
  const hasCosmetic = !hasCapital || !hasPunct || tooShort || tooLong;

  // ── Verdict determination ─────────────────────────────────────────────────
  //
  //   Verdict hierarchy (strictest first):
  //     REJECTED   — target word not found / sentence incoherent
  //     FLAWED     — structural grammar error (verb pattern, wrong preposition…)
  //     ACCEPTABLE — grammatically correct but has surface issues (typo/punctuation)
  //     PERFECT    — grammatically correct and natural
  //
  //   If preResult has ruleEngineOverride, the verdict floor is already locked
  //   (Layer 1 caught a structural error); we cannot upgrade above it.
  //
  let verdict: EvaluationVerdict;

  if (preResult?.ruleEngineOverride) {
    // Layer 1 detected a structural grammar error — floor is FLAWED.
    verdict = preResult.ruleEngineOverride;
  } else if (!usedTargetWord) {
    verdict = 'REJECTED';
  } else if (localAnalysis.status === 'fail') {
    // Grammar error that slipped past preValidate (word present, Layer 1 failed).
    verdict = 'FLAWED';
  } else if (hasCosmetic) {
    verdict = 'ACCEPTABLE';
  } else {
    verdict = 'PERFECT';
  }

  // ── Map verdict → AnalysisStatus + score ─────────────────────────────────
  const status: AnalysisStatus = _verdictToStatus(verdict);

  const [scoreMin, scoreMax] = _scoreRange(verdict);
  // For ACCEPTABLE, prefer punctuation-only (90) over mixed cosmetic (85).
  const rawScore =
    verdict === 'PERFECT'    ? 100 :
    verdict === 'ACCEPTABLE' ? (!hasCapital ? 85 : 90) :
    verdict === 'FLAWED'     ? 20  : 0;
  const baseScore = _clamp(rawScore, scoreMin, scoreMax);

  // correctionType: how should the UI label the corrected sentence?
  const correctionType: 'minor_fix' | 'rewrite' | null =
    verdict === 'FLAWED'     ? 'rewrite'   :
    verdict === 'ACCEPTABLE' ? 'minor_fix' : null;

  // ── Build issues list ─────────────────────────────────────────────────────
  const issues: DetailedAnalysisIssue[] = [];

  // Promote every local issue into the richer DetailedAnalysisIssue shape.
  for (const li of localAnalysis.issues) {
    issues.push({
      type:      li.type ?? 'grammar',
      subtype:   li.subtype,
      severity:  li.severity === 'error' ? 'error' : 'suggestion',
      messageTr: li.messageTr,
    });
  }

  // Append cosmetic observations not already covered by local issues.
  if (!hasCapital) {
    issues.push({ type: 'style', severity: 'suggestion', messageTr: 'Cümle büyük harfle başlamalıdır.' });
  }
  if (!hasPunct) {
    issues.push({ type: 'style', severity: 'suggestion', messageTr: 'Cümle sonu noktalama işareti (. ? !) eklenmeli.' });
  }
  if (tooShort) {
    issues.push({ type: 'clarity', severity: 'suggestion', messageTr: 'Cümle çok kısa — daha fazla bağlam eklenebilir.' });
  }
  if (tooLong) {
    issues.push({ type: 'clarity', severity: 'suggestion', messageTr: 'Cümle çok uzun — daha kısa ve net bir ifade tercih edilebilir.' });
  }

  // Deduplicate issues by messageTr.
  const _seen = new Set<string>();
  const dedupIssues = issues.filter(i => {
    if (_seen.has(i.messageTr)) return false;
    _seen.add(i.messageTr);
    return true;
  });

  // ── Sub-scores ────────────────────────────────────────────────────────────
  const errorCount = dedupIssues.filter(i => i.severity === 'error').length;
  const grammarScore    = _clamp(errorCount > 0 ? Math.min(baseScore, 55 - (errorCount - 1) * 10) : Math.min(baseScore + 10, 100), 0, 100);
  const clarityScore    = _clamp(tooShort || tooLong ? Math.min(baseScore, 70) : Math.min(baseScore + 5, 100), 0, 100);
  const naturalnessScore = _clamp(!hasPunct || !hasCapital ? Math.min(baseScore, 80) : Math.min(baseScore + 5, 100), 0, 100);
  const score           = _clamp(Math.round((grammarScore + clarityScore + naturalnessScore) / 3), scoreMin, scoreMax);

  // ── Short feedback ────────────────────────────────────────────────────────
  //   Rules:
  //   • REJECTED  → point out missing word
  //   • FLAWED    → use first error message (structural); never praise
  //   • ACCEPTABLE → gentle note about surface fix
  //   • PERFECT   → positive confirmation
  let shortFeedbackTr: string;
  if (verdict === 'REJECTED') {
    shortFeedbackTr = `"${targetWord}" kelimesini cümlende kullanmalısın.`;
  } else if (verdict === 'FLAWED') {
    const firstError = dedupIssues.find(i => i.severity === 'error');
    shortFeedbackTr = firstError
      ? firstError.messageTr
      : 'Cümlende yapısal bir dilbilgisi hatası var. Aşağıdaki düzeltmeyi incele.';
  } else if (verdict === 'ACCEPTABLE') {
    shortFeedbackTr = 'Cümle doğru kurulmuş! Sadece küçük yazım/noktalama düzeltmesi gerekiyor.';
  } else {
    shortFeedbackTr = 'Mükemmel! Cümle doğru ve doğal. ✅';
  }

  // ── Tags ──────────────────────────────────────────────────────────────────
  const tags: string[] = [];
  if (usedTargetWord)           tags.push('target-word-used');
  if (verdict === 'PERFECT')    tags.push('no-errors');
  if (verdict === 'FLAWED')     tags.push('grammar-error');
  if (tooShort)                 tags.push('too-short');
  if (tooLong)                  tags.push('too-long');
  if (hasCosmetic)              tags.push('cosmetic-fix-needed');

  return {
    status,
    usedTargetWord,
    targetWordMode,
    score,
    grammarScore,
    clarityScore,
    naturalnessScore,
    confidence: 'medium',       // mock confidence is always 'medium'
    shortFeedbackTr,
    correctedSentence:  null,   // defer to Layer-1 correctedSentence
    naturalAlternative: null,   // real AI backend only
    issues: dedupIssues,
    tags,
    verdict,
    correctionType,
    exampleSentences: null,     // real AI backend only
  };
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

/** Clamps `v` to the inclusive range [min, max]. */
function _clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

// ─── Pre-validation ────────────────────────────────────────────────────────────

/**
 * Internal result from `_preValidate()`.
 * Does NOT escape the module — only used between `_preValidate`, `_preValidateToResult`,
 * and `mockDetailedAnalysis`.
 */
interface _PreValidateResult {
  verdict: EvaluationVerdict;
  score: number;
  errors: Array<{ type: string; messageTr: string }>;
  /** True → skip the AI call entirely; return this result as the final answer. */
  skippedAI: boolean;
  /**
   * When set, the AI may still be called for richer correction/feedback,
   * but its verdict cannot be upgraded above this value.
   */
  ruleEngineOverride?: EvaluationVerdict;
}

/**
 * Runs fast local checks BEFORE the AI call.
 *
 * Returns a `_PreValidateResult` if the sentence has a hard or structural
 * failure; returns `null` if all checks pass and the AI should run normally.
 */
function _preValidate(input: DetailedAnalysisInput): _PreValidateResult | null {
  const { targetWord, sentence, localAnalysis } = input;

  // Check 1 — Target word must be present (Layer 1 already verified this,
  //   but guard again so the AI is never called for a missing-word sentence).
  if (!localAnalysis.usedTargetWord) {
    return {
      verdict:    'REJECTED',
      score:      0,
      errors:     [{ type: 'target_word_missing', messageTr: `"${targetWord}" kelimesini cümlende kullanmalısın.` }],
      skippedAI:  true,
    };
  }

  // Check 2 — Minimum word count.
  const wordCount = sentence.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < 3) {
    return {
      verdict:    'REJECTED',
      score:      0,
      errors:     [{ type: 'incoherent', messageTr: 'Cümle çok kısa. Tam bir cümle yaz.' }],
      skippedAI:  true,
    };
  }

  // Check 3 — Layer 1 already detected a structural grammar error.
  //   The word is present but the sentence is grammatically wrong.
  //   Lock the verdict floor at FLAWED; still call the AI for correction/feedback.
  if (localAnalysis.status === 'fail' && localAnalysis.usedTargetWord) {
    const grammarErrors = localAnalysis.issues.filter(i => i.severity === 'error');
    return {
      verdict:              'FLAWED',
      score:                20,
      errors:               grammarErrors.map(e => ({ type: e.type ?? 'grammar', messageTr: e.messageTr })),
      skippedAI:            false,
      ruleEngineOverride:   'FLAWED',
    };
  }

  return null; // All pre-checks passed — proceed to AI / mock.
}

/**
 * Converts a hard-gate `_PreValidateResult` (skippedAI = true) into a full
 * `DetailedAnalysisResult` so the screen receives a properly-typed value.
 */
function _preValidateToResult(
  preResult: _PreValidateResult,
  targetWord: string,
): DetailedAnalysisResult {
  const status = _verdictToStatus(preResult.verdict);
  const shortFeedbackTr = preResult.verdict === 'REJECTED'
    ? `"${targetWord}" kelimesini cümlende kullanmalısın.`
    : 'Cümlende yapısal bir hata var. Aşağıdaki geri bildirimi incele.';

  return {
    status,
    usedTargetWord:    preResult.verdict !== 'REJECTED',
    targetWordMode:    preResult.verdict === 'REJECTED' ? 'missing' : 'exact',
    score:             preResult.score,
    grammarScore:      preResult.score,
    clarityScore:      preResult.score,
    naturalnessScore:  preResult.score,
    confidence:        'high',
    shortFeedbackTr,
    correctedSentence: null,
    naturalAlternative: null,
    issues: preResult.errors.map(e => ({
      type:      e.type,
      severity:  'error' as const,
      messageTr: e.messageTr,
    })),
    tags:              preResult.verdict === 'REJECTED' ? ['target-word-missing'] : ['grammar-error'],
    verdict:           preResult.verdict,
    correctionType:    null,
    exampleSentences:  null,
  };
}

/**
 * After receiving an AI response, applies these overrides:
 *   1. If the rule engine locked a verdict floor, the AI cannot upgrade above it.
 *   2. Score is clamped to the verdict's allowed range.
 *   3. Rule-engine errors are prepended to the AI errors list (max 4 items, deduped).
 */
function _mergeResults(
  preResult: _PreValidateResult | null,
  aiResult: DetailedAnalysisResult,
): DetailedAnalysisResult {
  if (!preResult?.ruleEngineOverride) {
    // No floor set — return AI result as-is (still enforce score range).
    const [min, max] = _scoreRange(aiResult.verdict);
    aiResult.score = _clamp(aiResult.score, min, max);
    return aiResult;
  }

  const verdictRank: Record<EvaluationVerdict, number> = {
    REJECTED: 0, FLAWED: 1, ACCEPTABLE: 2, PERFECT: 3,
  };
  const ruleRank = verdictRank[preResult.ruleEngineOverride];
  const aiRank   = verdictRank[aiResult.verdict];

  if (aiRank > ruleRank) {
    // AI was too optimistic — enforce rule-engine floor.
    aiResult.verdict = preResult.ruleEngineOverride;
    aiResult.status  = _verdictToStatus(preResult.ruleEngineOverride);
    aiResult.score   = Math.min(aiResult.score, preResult.score);
  }

  // Clamp score to verdict's valid range.
  const [min, max] = _scoreRange(aiResult.verdict);
  aiResult.score = _clamp(aiResult.score, min, max);

  // Merge errors: rule errors take priority; AI errors fill remaining slots.
  const ruleIssues: DetailedAnalysisIssue[] = preResult.errors.map(e => ({
    type: e.type, severity: 'error' as const, messageTr: e.messageTr,
  }));
  const aiIssues = (aiResult.issues || []).filter(
    e => !ruleIssues.some(re => re.type === e.type),
  );
  const merged = [...ruleIssues, ...aiIssues];

  // Deduplicate by messageTr.
  const seen = new Set<string>();
  aiResult.issues = merged.filter(e => {
    if (seen.has(e.messageTr)) return false;
    seen.add(e.messageTr);
    return true;
  }).slice(0, 4);

  return aiResult;
}

// ─── LanguageTool integration helpers ────────────────────────────────────────

/**
 * Merges the Layer-1 pre-validation floor with structural errors from
 * LanguageTool.
 *
 * Rules:
 *   1. If `ltResult` found no structural errors → return `preResult` unchanged.
 *   2. If `preResult` is REJECTED (word missing) → LT errors are secondary;
 *      return the REJECTED floor unchanged.
 *   3. Otherwise → produce a FLAWED floor that combines Layer-1 + LT errors.
 *
 * The combined floor is then used in exactly the same way as `preResult` — it
 * sets the verdict ceiling for `_mergeResults` and `mockDetailedAnalysis`.
 */
function _combineFloors(
  preResult: _PreValidateResult | null,
  ltResult:  LTCallResult | null,
): _PreValidateResult | null {
  // No LT structural errors → nothing to merge.
  if (!ltResult?.hasStructuralError) return preResult;

  // Word is missing (REJECTED) → LT grammar errors are moot.
  if (preResult?.verdict === 'REJECTED') return preResult;

  // Build LT structural error list (avoid duplicating messages already in preResult).
  const existingMessages = new Set((preResult?.errors ?? []).map(e => e.messageTr));
  const ltErrors = ltResult.matches
    .filter(m => m.isStructural)
    .map(m => ({ type: 'grammar', messageTr: m.feedbackTr }))
    .filter(e => !existingMessages.has(e.messageTr));

  // Combine: take the more restrictive verdict (FLAWED ≥ any existing partial floor).
  const combined: _PreValidateResult = {
    verdict:            'FLAWED',
    score:              Math.min(preResult?.score ?? 20, 20),
    errors:             [...(preResult?.errors ?? []), ...ltErrors],
    skippedAI:          false,
    ruleEngineOverride: 'FLAWED',
  };
  return combined;
}

/**
 * Appends LanguageTool issues and, optionally, LT's corrected sentence into
 * an already-built `DetailedAnalysisResult`.
 *
 * Structural LT matches (GRAMMAR category) are added as 'error' issues.
 * Non-structural matches (spelling, punctuation, style) are added as 'suggestion'.
 *
 * All additions are deduplicated against existing issues by `messageTr`.
 *
 * LT's auto-corrected sentence is used as `correctedSentence` ONLY when:
 *   – the base result currently has no corrected sentence, AND
 *   – the LT correction passes `validateCorrectedSentence()`.
 * This means LT fills the gap in mock mode (where Layer-2 AI returns null for
 * `correctedSentence`) while never overwriting a correction from Layer-1 or AI.
 */
function _mergeLTIntoResult(
  result:   DetailedAnalysisResult,
  ltResult: LTCallResult | null,
): DetailedAnalysisResult {
  if (!ltResult || ltResult.matches.length === 0) return result;

  // Build LT-derived issues.
  const newIssues: DetailedAnalysisIssue[] = ltResult.matches.map(m => ({
    type:      m.issueType === 'spelling' ? 'spelling' : 'grammar',
    subtype:   m.ruleId.toLowerCase(),
    severity:  (m.isStructural ? 'error' : 'suggestion') as IssueSeverity,
    messageTr: m.feedbackTr,
  }));

  // Deduplicate against existing issues.
  const seen = new Set(result.issues.map(i => i.messageTr));
  const deduped = newIssues.filter(i => {
    if (seen.has(i.messageTr)) return false;
    seen.add(i.messageTr);
    return true;
  });

  // LT correction fallback: use only when Layer-1 / AI provided no correction AND
  // the LT sentence itself passes our local grammar validator.
  const correctedSentence: string | null =
    result.correctedSentence ??
    (ltResult.correctedSentence &&
     validateCorrectedSentence(ltResult.correctedSentence)
       ? ltResult.correctedSentence
       : null);

  // Update correctionType when LT provides the correction.
  const correctionType: 'minor_fix' | 'rewrite' | null =
    correctedSentence && !result.correctedSentence
      ? (result.verdict === 'FLAWED' ? 'rewrite' : 'minor_fix')
      : result.correctionType;

  // Add 'lt-analyzed' tag so consumers / analytics can track LT usage.
  const tags = result.tags.includes('lt-analyzed')
    ? result.tags
    : [...result.tags, 'lt-analyzed'];

  return {
    ...result,
    correctedSentence,
    correctionType,
    issues: [...result.issues, ...deduped],
    tags,
  };
}

// ─── Verdict / status mapping helpers ─────────────────────────────────────────

/** Maps the 4-way verdict down to the 3-way AnalysisStatus used by the rest of the app. */
function _verdictToStatus(verdict: EvaluationVerdict): AnalysisStatus {
  if (verdict === 'PERFECT' || verdict === 'ACCEPTABLE') return 'perfect';
  if (verdict === 'FLAWED')                              return 'partial';
  return 'fail';
}

/** Maps AnalysisStatus back to the most likely verdict (used when backend omits verdict). */
function _statusToVerdict(status: AnalysisStatus): EvaluationVerdict {
  if (status === 'perfect') return 'PERFECT';
  if (status === 'partial') return 'FLAWED';
  return 'REJECTED';
}

/** Returns the [min, max] score range allowed for each verdict. */
function _scoreRange(verdict: EvaluationVerdict): [number, number] {
  if (verdict === 'PERFECT')    return [100, 100];
  if (verdict === 'ACCEPTABLE') return [85,  90];
  if (verdict === 'FLAWED')     return [20,  50];
  return [0, 0];
}

/** Safe fallback for shortFeedbackTr when the field is missing / empty. */
function _fallbackFeedback(status: AnalysisStatus): string {
  if (status === 'fail')    return 'Cümleni tekrar gözden geçir.';
  if (status === 'partial') return 'Birkaç düzeltme gerekiyor.';
  return 'Mükemmel!';
}
