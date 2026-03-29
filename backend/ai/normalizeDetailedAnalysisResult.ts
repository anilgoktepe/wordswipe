/**
 * backend/ai/normalizeDetailedAnalysisResult.ts
 *
 * Zod-based validation and normalization of the raw model output.
 *
 * Guarantees:
 *   • Every field present and correctly typed
 *   • Scores clamped to 0–100
 *   • Unknown enum values → safe defaults
 *   • correctedSentence / naturalAlternative → null if blank/invalid
 *   • issues always an array; invalid entries filtered
 *   • tags always an array of strings
 *   • shortFeedbackTr never empty
 *   • Status never silently upgraded past what localAnalysis allows
 *
 * If the raw value cannot be parsed at all, a safe fallback is returned.
 */

import { z } from 'zod';
import type {
  DetailedAnalysisResult,
  DetailedIssue,
  LocalAnalysisSummary,
  AnalysisStatus,
  IssueSeverity,
} from '../types';

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const StatusSchema      = z.enum(['fail', 'partial', 'perfect']);
const TargetModeSchema  = z.enum(['exact', 'family', 'missing', 'typo_suspected']);
const ConfidenceSchema  = z.enum(['low', 'medium', 'high']);

/**
 * Lenient schema: every field has a `.catch()` so the whole object
 * never fails to parse — individual bad values fall back to safe defaults.
 * Issues and tags are kept as `unknown[]` here; they are validated manually
 * below to preserve explicit `DetailedIssue` typing.
 */
const RawResultSchema = z.object({
  status:            StatusSchema.catch('fail'),
  usedTargetWord:    z.boolean().catch(false),
  targetWordMode:    TargetModeSchema.catch('missing'),
  score:             z.number().catch(0),
  grammarScore:      z.number().catch(0),
  clarityScore:      z.number().catch(0),
  naturalnessScore:  z.number().catch(0),
  confidence:        ConfidenceSchema.catch('low'),
  shortFeedbackTr:   z.string().catch(''),
  correctedSentence:  z.union([z.string(), z.null()]).catch(null),
  naturalAlternative: z.union([z.string(), z.null()]).catch(null),
  issues: z.array(z.unknown()).catch([]),
  tags:   z.array(z.unknown()).catch([]),
});

// ─── Allowed severity values set ──────────────────────────────────────────────

const _ALLOWED_SEVERITIES = new Set<string>(['error', 'warning', 'suggestion']);

// ─── Score helpers ─────────────────────────────────────────────────────────────

function clamp(v: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, Math.round(v)));
}

// ─── Main normalization function ──────────────────────────────────────────────

/**
 * Parses and normalizes a raw model response.
 *
 * @param raw          - Whatever the model returned (may be string or parsed object)
 * @param localAnalysis - The client-side summary, used as a safety floor
 * @param targetWord   - Used to build a safe shortFeedbackTr fallback
 *
 * @returns A fully valid `DetailedAnalysisResult` — never throws.
 */
export function normalizeDetailedAnalysisResult(
  raw: unknown,
  localAnalysis: LocalAnalysisSummary,
  targetWord: string,
): DetailedAnalysisResult {

  // ── Step 1: coerce string → object ────────────────────────────────────────
  let parsed: unknown = raw;

  if (typeof raw === 'string') {
    parsed = _extractJson(raw);
    if (parsed === null) {
      return buildFallbackResult(localAnalysis, targetWord, 'parse-failed');
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return buildFallbackResult(localAnalysis, targetWord, 'not-object');
  }

  // ── Step 2: parse with lenient Zod schema ─────────────────────────────────
  const result = RawResultSchema.safeParse(parsed);
  if (!result.success) {
    // Should never happen because every field has .catch(), but be safe.
    return buildFallbackResult(localAnalysis, targetWord, 'schema-failed');
  }

  const r = result.data;

  // ── Step 3: clamp and clean individual fields ─────────────────────────────
  const score           = clamp(r.score);
  const grammarScore    = clamp(r.grammarScore);
  const clarityScore    = clamp(r.clarityScore);
  const naturalnessScore = clamp(r.naturalnessScore);

  const correctedSentence: string | null =
    typeof r.correctedSentence === 'string' && r.correctedSentence.trim().length > 0
      ? r.correctedSentence.trim()
      : null;

  const naturalAlternative: string | null =
    typeof r.naturalAlternative === 'string' && r.naturalAlternative.trim().length > 0
      ? r.naturalAlternative.trim()
      : null;

  // Parse and filter issues with explicit typing to avoid Zod v4 inference quirks.
  const issues: DetailedIssue[] = (r.issues as unknown[])
    .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object' && !Array.isArray(i))
    .map((i): DetailedIssue | null => {
      const messageTr = typeof i.messageTr === 'string' ? i.messageTr.trim() : '';
      if (!messageTr) return null;
      return {
        type:     typeof i.type === 'string' && i.type.trim() ? i.type.trim() : 'grammar',
        subtype:  typeof i.subtype === 'string' && i.subtype.trim() ? i.subtype.trim() : undefined,
        severity: _ALLOWED_SEVERITIES.has(i.severity as string) ? (i.severity as IssueSeverity) : 'error',
        span:     typeof i.span === 'string' && i.span.trim() ? i.span.trim() : undefined,
        messageTr,
      };
    })
    .filter((i): i is DetailedIssue => i !== null);

  // Filter tags to strings only.
  const tags = (r.tags as unknown[]).filter((t): t is string => typeof t === 'string');

  // Ensure shortFeedbackTr is never empty.
  const shortFeedbackTr = r.shortFeedbackTr.trim().length > 0
    ? r.shortFeedbackTr.trim()
    : _fallbackFeedback(r.status, targetWord);

  // ── Step 4: safety-floor check ────────────────────────────────────────────
  //
  // The model must never silently upgrade a local grammar failure to "perfect".
  //
  //   Local rule found grammar error (fail + word present) → floor is 'partial'
  //   Local rule found missing word                        → floor is 'fail'
  //
  const safeStatus = _applyStatusFloor(r.status, localAnalysis);

  // ── Step 5: assemble final result ─────────────────────────────────────────
  return {
    status:            safeStatus,
    usedTargetWord:    r.usedTargetWord,
    targetWordMode:    r.targetWordMode,
    score,
    grammarScore,
    clarityScore,
    naturalnessScore,
    confidence:        r.confidence,
    shortFeedbackTr,
    correctedSentence,
    naturalAlternative,
    issues,
    tags,
  };
}

// ─── Status floor ─────────────────────────────────────────────────────────────

/**
 * Ensures the model's status verdict is never better than what the local
 * rule engine already determined for a clearly broken sentence.
 *
 * Policy:
 *   Local status 'fail' + word IS present → grammar was bad → floor is 'partial'
 *   Local status 'fail' + word NOT present → word missing   → floor is 'fail'
 *   Local status 'perfect'                                  → model verdict is trusted
 *
 * The floor only prevents upgrades; the model is free to downgrade further.
 */
function _applyStatusFloor(
  modelStatus: AnalysisStatus,
  local: LocalAnalysisSummary,
): AnalysisStatus {
  const rank = (s: AnalysisStatus): number =>
    s === 'perfect' ? 2 : s === 'partial' ? 1 : 0;

  const floor: AnalysisStatus =
    local.status === 'fail'
      ? local.usedTargetWord
        ? 'partial'   // word present but grammar bad → at best partial
        : 'fail'      // word missing → must be fail
      : 'perfect';    // local was OK → trust model fully

  // Take whichever is worse.
  return rank(modelStatus) < rank(floor) ? modelStatus : floor;
}

// ─── Fallback builder ─────────────────────────────────────────────────────────

/**
 * Builds a safe `DetailedAnalysisResult` derived entirely from the client-side
 * local analysis when the model response cannot be used.
 *
 * Key properties:
 *   • confidence is always 'low'  (caller knows it is a fallback)
 *   • tags includes 'fallback-response' for telemetry
 *   • correctedSentence and naturalAlternative are null
 *   • Score is inherited from localAnalysis (no invention)
 *   • Status respects the same floor as the normalizer
 */
export function buildFallbackResult(
  local: LocalAnalysisSummary,
  targetWord: string,
  _reason?: string,
): DetailedAnalysisResult {
  const status = _applyStatusFloor('perfect', local); // 'perfect' input → floor applies

  const issues: DetailedIssue[] = local.issues.map(i => ({
    type:      i.type,
    subtype:   i.subtype,
    severity:  i.severity,
    messageTr: i.messageTr,
  }));

  const hasErrors = issues.some(i => i.severity === 'error');
  const base       = local.score;
  const grammarScore    = clamp(hasErrors ? Math.min(base, 55) : base);
  const clarityScore    = clamp(base);
  const naturalnessScore = clamp(base);
  const score            = clamp(Math.round((grammarScore + clarityScore + naturalnessScore) / 3));

  const tags = ['fallback-response'];
  if (local.usedTargetWord)   tags.push('target-word-used');
  if (!local.usedTargetWord)  tags.push('target-word-missing');
  if (hasErrors)              tags.push('grammar-error');

  return {
    status,
    usedTargetWord:    local.usedTargetWord,
    targetWordMode:    local.targetWordMode,
    score,
    grammarScore,
    clarityScore,
    naturalnessScore,
    confidence:        'low',
    shortFeedbackTr:   _fallbackFeedback(status, targetWord),
    correctedSentence:  null,
    naturalAlternative: null,
    issues,
    tags,
  };
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Extracts a JSON object from a string that may contain surrounding prose or
 * markdown code fences.  Returns parsed object or null on failure.
 */
function _extractJson(text: string): unknown | null {
  // Strip markdown code fences if present.
  const stripped = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  // Try direct parse first.
  try { return JSON.parse(stripped); } catch { /* fall through */ }

  // Look for first { ... } block in case model added extra prose.
  const start = stripped.indexOf('{');
  const end   = stripped.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { return JSON.parse(stripped.slice(start, end + 1)); } catch { /* fall through */ }
  }

  return null;
}

/** Safe Turkish feedback string when model output is absent or unusable. */
function _fallbackFeedback(status: AnalysisStatus, targetWord: string): string {
  if (status === 'fail')    return `"${targetWord}" kelimesini cümlende kullanmalısın.`;
  if (status === 'partial') return 'Kelimeyi doğru kullandın ama cümlede düzeltilmesi gereken hatalar var.';
  return 'Mükemmel! Cümle doğru ve doğal.';
}
