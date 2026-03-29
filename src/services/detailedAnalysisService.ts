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
 *     • 13 rule-based grammar checks
 *     • Cosmetic fixes + multi-pass correction
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

// ─── Configuration ─────────────────────────────────────────────────────────────

/**
 * Your secure backend endpoint.
 *
 * Empty string  → mock mode (no network calls, safe for development).
 * Example: 'https://api.yourapp.com/v1/sentence-analysis/detailed'
 */
const DETAILED_API_URL = '';

/** Network request timeout in milliseconds. */
const FETCH_TIMEOUT_MS = 10_000;

// ─── Shared enum types ─────────────────────────────────────────────────────────

export type ConfidenceLevel = 'low' | 'medium' | 'high';

export type TargetWordMode = 'exact' | 'family' | 'missing' | 'typo_suspected';

export type AnalysisStatus = 'perfect' | 'partial' | 'fail';

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
  if (DETAILED_API_URL) {
    try {
      const raw = await _fetchDetailed(input);
      return normalizeDetailedAnalysisResult(raw);
    } catch {
      // Network / timeout / parse failure → degrade to mock.
      return mockDetailedAnalysis(input);
    }
  }
  return mockDetailedAnalysis(input);
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

  return {
    status, usedTargetWord, targetWordMode,
    score, grammarScore, clarityScore, naturalnessScore,
    confidence, shortFeedbackTr,
    correctedSentence, naturalAlternative,
    issues, tags,
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

  // ── Status — derive from localAnalysis; never silently upgrade a local fail ─
  //
  //   Local reported fail AND word IS present → grammar error → 'partial'
  //   Local reported fail AND word NOT present → missing word → 'fail'
  //   Local reported perfect → inspect cosmetics only → keep 'perfect'
  //
  const localHasGrammarError =
    localAnalysis.status === 'fail' && localAnalysis.usedTargetWord;

  let status: AnalysisStatus;
  if (!usedTargetWord) {
    status = 'fail';
  } else if (localHasGrammarError) {
    status = 'partial';
  } else {
    status = 'perfect';
  }

  // ── Build issues list ─────────────────────────────────────────────────────
  const issues: DetailedAnalysisIssue[] = [];

  // Promote every local issue into the richer DetailedAnalysisIssue shape.
  // 'suggestion' stays 'suggestion'; 'error' stays 'error'.
  for (const li of localAnalysis.issues) {
    issues.push({
      type:     li.type ?? 'grammar',
      subtype:  li.subtype,
      severity: li.severity === 'error' ? 'error' : 'suggestion',
      messageTr: li.messageTr,
    });
  }

  // Append cosmetic observations not already covered by local issues.
  if (!hasCapital) {
    issues.push({
      type: 'style', severity: 'suggestion',
      messageTr: 'Cümle büyük harfle başlamalıdır.',
    });
  }
  if (!hasPunct) {
    issues.push({
      type: 'style', severity: 'suggestion',
      messageTr: 'Cümle sonu noktalama işareti (. ? !) eklenmeli.',
    });
  }
  if (tooShort) {
    issues.push({
      type: 'clarity', severity: 'suggestion',
      messageTr: 'Cümle çok kısa — daha fazla bağlam eklenebilir.',
    });
  }
  if (tooLong) {
    issues.push({
      type: 'clarity', severity: 'suggestion',
      messageTr: 'Cümle çok uzun — daha kısa ve net bir ifade tercih edilebilir.',
    });
  }

  // ── Sub-scores ────────────────────────────────────────────────────────────
  //
  // Derive from the local score rather than inventing arbitrary numbers.
  // Grammar errors heavily penalize grammarScore; cosmetic issues are softer.
  //
  const base        = localAnalysis.score;
  const errorCount  = issues.filter(i => i.severity === 'error').length;

  const grammarScore    = _clamp(errorCount > 0 ? Math.min(base, 55 - (errorCount - 1) * 10) : Math.min(base + 10, 100), 0, 100);
  const clarityScore    = _clamp(tooShort || tooLong ? Math.min(base, 70) : Math.min(base + 5, 100), 0, 100);
  const naturalnessScore = _clamp(!hasPunct || !hasCapital ? Math.min(base, 80) : Math.min(base + 5, 100), 0, 100);
  const score           = _clamp(Math.round((grammarScore + clarityScore + naturalnessScore) / 3), 0, 100);

  // ── Short feedback ────────────────────────────────────────────────────────
  let shortFeedbackTr: string;
  if (status === 'fail') {
    shortFeedbackTr = `"${targetWord}" kelimesini cümlede kullanmalısın.`;
  } else if (status === 'partial') {
    // Prefer the first error's message for focus; fall back to a generic summary.
    const firstError = issues.find(i => i.severity === 'error');
    shortFeedbackTr = firstError
      ? firstError.messageTr
      : 'Kelimeyi doğru kullandın ama cümlede düzeltilmesi gereken bir dilbilgisi hatası var.';
  } else {
    shortFeedbackTr = 'Mükemmel! Cümle doğru ve doğal. ✅';
  }

  // ── Tags ──────────────────────────────────────────────────────────────────
  const tags: string[] = [];
  if (usedTargetWord)          tags.push('target-word-used');
  if (status === 'perfect')    tags.push('no-errors');
  if (localHasGrammarError)    tags.push('grammar-error');
  if (tooShort)                tags.push('too-short');
  if (tooLong)                 tags.push('too-long');
  if (!hasCapital || !hasPunct) tags.push('cosmetic-fix-needed');

  return {
    status,
    usedTargetWord,
    targetWordMode,
    score,
    grammarScore,
    clarityScore,
    naturalnessScore,
    confidence: 'medium', // mock confidence is always 'medium'
    shortFeedbackTr,
    correctedSentence:  null,   // defer to Layer-1 correctedSentence
    naturalAlternative: null,   // real AI backend only
    issues,
    tags,
  };
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

/** Clamps `v` to the inclusive range [min, max]. */
function _clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Safe fallback for shortFeedbackTr when the field is missing / empty. */
function _fallbackFeedback(status: AnalysisStatus): string {
  if (status === 'fail')    return 'Cümleni tekrar gözden geçir.';
  if (status === 'partial') return 'Birkaç düzeltme gerekiyor.';
  return 'Mükemmel!';
}
