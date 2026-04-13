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
 *   • Status never silently upgraded past what localAnalysis + LT allows
 *
 * Strict structural-error contract:
 *   ANY error-severity issue whose type is NOT in the SURFACE_ONLY_ISSUE_TYPES
 *   whitelist is treated as a structural grammar problem.  This includes any
 *   type string the AI might invent: 'verb-form', 'tense', 'agreement', 'aspect',
 *   'complement', 'word-order', 'pronoun', 'auxiliary', 'vocabulary', etc.
 *   Structural errors ALWAYS produce FLAWED or REJECTED — never ACCEPTABLE or
 *   PERFECT — regardless of what the AI model returned.
 *
 *   PERFECT is only possible with zero error-severity or warning-severity issues.
 *   ACCEPTABLE requires that every error-severity issue is surface-only (typo /
 *   punctuation / capitalisation).
 *
 * If the raw value cannot be parsed at all, a safe fallback is returned.
 */

import { z } from 'zod';
import type {
  DetailedAnalysisResult,
  DetailedIssue,
  LocalAnalysisSummary,
  AnalysisStatus,
  EvaluationVerdict,
  IssueSeverity,
} from '../types';
import type { LTResult } from './languageToolService';

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const StatusSchema      = z.enum(['fail', 'partial', 'perfect']);
const TargetModeSchema  = z.enum(['exact', 'family', 'missing', 'typo_suspected']);
const ConfidenceSchema  = z.enum(['low', 'medium', 'high']);

/**
 * Lenient schema: every field has a `.catch()` so the whole object never fails
 * to parse — individual bad values fall back to safe defaults.
 * Issues and tags are kept as `unknown[]` here; they are validated manually
 * below to preserve explicit `DetailedIssue` typing.
 */
const RawResultSchema = z.object({
  status:             StatusSchema.catch('fail'),
  usedTargetWord:     z.boolean().catch(false),
  targetWordMode:     TargetModeSchema.catch('missing'),
  score:              z.number().catch(0),
  grammarScore:       z.number().catch(0),
  clarityScore:       z.number().catch(0),
  naturalnessScore:   z.number().catch(0),
  confidence:         ConfidenceSchema.catch('low'),
  shortFeedbackTr:    z.string().catch(''),
  correctedSentence:  z.union([z.string(), z.null()]).catch(null),
  naturalAlternative: z.union([z.string(), z.null()]).catch(null),
  issues: z.array(z.unknown()).catch([]),
  tags:   z.array(z.unknown()).catch([]),
});

// ─── Allowed severity values ───────────────────────────────────────────────────

const _ALLOWED_SEVERITIES = new Set<string>(['error', 'warning', 'suggestion']);

// ─── Surface-only issue type whitelist ────────────────────────────────────────
//
//   These are the ONLY issue types that can ever produce ACCEPTABLE or PERFECT.
//   Every other error-severity issue — regardless of what string the AI chose
//   as the type — is treated as a structural grammar problem, producing FLAWED.
//
//   Surface-only:
//     spelling      — misspelled word, wrong apostrophe contraction
//     punctuation   — missing / extra punctuation mark
//     capitalization — wrong capitalisation
//     typo          — keyboard typo that does not affect grammar structure
//
//   NOT surface-only (all produce FLAWED when severity is 'error'):
//     grammar       — catch-all for grammar errors
//     preposition   — wrong / spurious preposition (affect on, interested about)
//     verb-form     — wrong verb inflection (he give → he gives)
//     tense         — wrong tense (I go there yesterday)
//     agreement     — subject-verb or determiner-noun agreement
//     aspect        — progressive with stative verb (I am knowing)
//     complement    — wrong verb complement pattern (suggest to → suggest + -ing)
//     word-order    — wrong word order
//     pronoun       — wrong pronoun case (me and my friend goes)
//     auxiliary     — wrong auxiliary / helper verb usage
//     vocabulary    — wrong lexical choice that changes meaning structurally
//     clarity       — missing required sentence element
//     article       — missing/extra article when structurally required
//     …and any other type string not listed above
//
const SURFACE_ONLY_ISSUE_TYPES = new Set<string>([
  'spelling',
  'punctuation',
  'capitalization',
  'typo',
]);

/**
 * Returns true when the issue list contains at least one structural error:
 * an error-severity issue whose type is NOT in the surface-only whitelist.
 *
 * Deliberately broad — this function does not need to know every possible
 * AI type string.  If it is not explicitly a surface issue, it is structural.
 *
 * Used by both _applyStatusFloor (score capping) and _computeVerdict (FLAWED
 * gate) so the two share an identical structural-error definition.
 */
function _hasStructuralIssue(
  issues: ReadonlyArray<{ type: string; severity: string }>,
): boolean {
  return issues.some(
    i => i.severity === 'error' && !SURFACE_ONLY_ISSUE_TYPES.has(i.type),
  );
}

// ─── Score helpers ─────────────────────────────────────────────────────────────

function clamp(v: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, Math.round(v)));
}

// ─── Main normalization function ──────────────────────────────────────────────

/**
 * Parses and normalizes a raw model response.
 *
 * @param raw           - Whatever the model returned (may be string or parsed object)
 * @param localAnalysis - The client-side summary, used as a safety floor
 * @param targetWord    - Used to build a safe shortFeedbackTr fallback
 * @param ltResult      - Optional LanguageTool findings (run in parallel by route handler)
 *
 * @returns A fully valid `DetailedAnalysisResult` — never throws.
 */
export function normalizeDetailedAnalysisResult(
  raw: unknown,
  localAnalysis: LocalAnalysisSummary,
  targetWord: string,
  ltResult?: LTResult | null,
): DetailedAnalysisResult {

  // ── Step 1: coerce string → object ────────────────────────────────────────
  let parsed: unknown = raw;

  if (typeof raw === 'string') {
    parsed = _extractJson(raw);
    if (parsed === null) {
      return buildFallbackResult(localAnalysis, targetWord, 'parse-failed', ltResult);
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return buildFallbackResult(localAnalysis, targetWord, 'not-object', ltResult);
  }

  // ── Step 2: parse with lenient Zod schema ─────────────────────────────────
  const result = RawResultSchema.safeParse(parsed);
  if (!result.success) {
    return buildFallbackResult(localAnalysis, targetWord, 'schema-failed', ltResult);
  }

  const r = result.data;

  // ── Step 3: clamp individual scores ───────────────────────────────────────
  let score            = clamp(r.score);
  let grammarScore     = clamp(r.grammarScore);
  let clarityScore     = clamp(r.clarityScore);
  let naturalnessScore = clamp(r.naturalnessScore);

  const correctedSentence: string | null =
    typeof r.correctedSentence === 'string' && r.correctedSentence.trim().length > 0
      ? r.correctedSentence.trim()
      : null;

  const naturalAlternative: string | null =
    typeof r.naturalAlternative === 'string' && r.naturalAlternative.trim().length > 0
      ? r.naturalAlternative.trim()
      : null;

  // Parse and validate AI issues.
  const aiIssues: DetailedIssue[] = (r.issues as unknown[])
    .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object' && !Array.isArray(i))
    .map((i): DetailedIssue | null => {
      const messageTr = typeof i.messageTr === 'string' ? i.messageTr.trim() : '';
      if (!messageTr) return null;
      return {
        type:      typeof i.type    === 'string' && i.type.trim()    ? i.type.trim()    : 'grammar',
        subtype:   typeof i.subtype === 'string' && i.subtype.trim() ? i.subtype.trim() : undefined,
        severity:  _ALLOWED_SEVERITIES.has(i.severity as string) ? (i.severity as IssueSeverity) : 'error',
        span:      typeof i.span    === 'string' && i.span.trim()    ? i.span.trim()    : undefined,
        messageTr,
      };
    })
    .filter((i): i is DetailedIssue => i !== null);

  // Filter tags to strings only.
  let tags = (r.tags as unknown[]).filter((t): t is string => typeof t === 'string');

  // Ensure shortFeedbackTr is never empty.
  const shortFeedbackTr = r.shortFeedbackTr.trim().length > 0
    ? r.shortFeedbackTr.trim()
    : _fallbackFeedback(r.status, targetWord);

  // ── Step 4: status floor (local + LT + local structural issues) ───────────
  //
  //   Floors at 'partial' when local rules OR LT found a structural error,
  //   even if local.status was already 'partial' or 'perfect'.
  //   This triggers score caps in Step 5 so grammarScore ends up ≤ 55 < 65,
  //   guaranteeing FLAWED in Step 8 via the grammarScore threshold.
  //
  const safeStatus = _applyStatusFloor(r.status, localAnalysis, ltResult);

  // ── Step 5: mechanical score caps per status ───────────────────────────────
  //
  //   fail    → score ≤ 40,  grammarScore ≤ 30
  //   partial → score ≤ 65,  grammarScore ≤ 55   (always < 65, so Step 8 fires)
  //   perfect → no cap from status alone
  //   Cross-field: grammarScore < 65 → score ≤ 70
  //
  ({ score, grammarScore, clarityScore, naturalnessScore } = _applyScoreFloor(
    score, grammarScore, clarityScore, naturalnessScore, safeStatus,
  ));

  // ── Step 6: merge all issue sources, deduplicated ─────────────────────────
  const issues = _mergeAndDedup(aiIssues, localAnalysis, ltResult);

  // ── Step 7: correction candidate ─────────────────────────────────────────
  //
  //   Prefer AI's correctedSentence; fall back to LT's auto-correction.
  //   Track the source so the trust gate (Step 8c) can apply the right rules.
  //
  let correctionCandidate: string | null = null;
  let correctionFromLT = false;
  if (correctedSentence) {
    correctionCandidate = correctedSentence;
  } else if (ltResult?.correctedSentence && ltResult.correctedSentence.trim().length > 0) {
    correctionCandidate = ltResult.correctedSentence.trim();
    correctionFromLT    = true;
  }

  // ── Step 8: compute 4-way verdict ─────────────────────────────────────────
  //
  //   Uses the merged issue list (all three sources).  Whitelist logic means
  //   any AI type string other than the four surface-only types will trigger
  //   FLAWED when paired with severity:'error'.
  //
  const verdict = _computeVerdict(safeStatus, issues, grammarScore, !!ltResult?.hasStructuralError);

  // ── Step 8b: post-verdict score reality-check ─────────────────────────────
  //
  //   Edge case: local was clean, floor stayed 'perfect', Step 5 applied no
  //   caps — but AI issues caused FLAWED.  Retroactively cap to 'partial'
  //   ceiling so scores are consistent with the verdict shown to the user.
  //
  if ((verdict === 'FLAWED' || verdict === 'REJECTED') && score > 65) {
    score        = Math.min(score, 65);
    grammarScore = Math.min(grammarScore, 55);
  }

  // ── Step 8c: LT feedback priority ────────────────────────────────────────
  //
  //   When LT found a structural grammar error, its feedback is more precise
  //   than the AI's generated text (which may be vague or occasionally wrong).
  //   Override shortFeedbackTr with the first structural LT match's Turkish
  //   message so the learner sees a deterministic, rule-based explanation.
  //
  //   Condition: only when verdict is FLAWED (structural error confirmed) AND
  //   LT has a structural match with a known Turkish message.  REJECTED keeps
  //   its own feedback (target word missing — LT is not relevant there).
  //
  let finalFeedbackTr = shortFeedbackTr;
  if (verdict === 'FLAWED' && ltResult?.hasStructuralError) {
    const ltStructural = ltResult.matches.find(m => m.isStructural && m.feedbackTr.trim().length > 0);
    if (ltStructural) {
      finalFeedbackTr = ltStructural.feedbackTr.trim();
    }
  }

  // ── Step 8d: correction trust gate ────────────────────────────────────────
  //
  //   A wrong correction is worse than no correction (CLAUDE.md product rule).
  //   Gate runs after verdict is finalised so it has full context.
  //
  //   Rule: display correctedSentence only when _isCorrectionTrusted() passes.
  //   Otherwise null → UI falls back to exampleSentences (if present).
  //
  const finalCorrected: string | null =
    correctionCandidate !== null &&
    _isCorrectionTrusted(correctionCandidate, verdict, r.confidence, ltResult, correctionFromLT)
      ? correctionCandidate
      : null;

  // ── Step 9: tag bookkeeping ────────────────────────────────────────────────
  if (ltResult && !tags.includes('lt-analyzed')) tags = [...tags, 'lt-analyzed'];

  // ── Step 10: assemble final result ────────────────────────────────────────
  return {
    status:            safeStatus,
    usedTargetWord:    r.usedTargetWord,
    targetWordMode:    r.targetWordMode,
    score,
    grammarScore,
    clarityScore,
    naturalnessScore,
    confidence:        r.confidence,
    shortFeedbackTr:   finalFeedbackTr,
    correctedSentence: finalCorrected,
    naturalAlternative,
    issues,
    tags,
    verdict,
  };
}

// ─── Status floor ─────────────────────────────────────────────────────────────

/**
 * Ensures the model's status is never better than what the local rule engine,
 * LanguageTool, and local issue list together permit.
 *
 * Policy (evaluated in priority order):
 *   local 'fail' + word NOT present   → floor 'fail'    (word missing)
 *   local 'fail' + word IS present    → floor 'partial'  (grammar blocked the word)
 *   LT has GRAMMAR category match     → floor 'partial'  (structural confirmation)
 *   local issues contain structural error (any error-severity non-surface type)
 *                                     → floor 'partial'  (triggers score caps in Step 5)
 *   otherwise                         → floor 'perfect'  (trust the model)
 *
 * The floor only prevents upgrades; the model can always return a worse verdict.
 */
function _applyStatusFloor(
  modelStatus: AnalysisStatus,
  local: LocalAnalysisSummary,
  ltResult?: LTResult | null,
): AnalysisStatus {
  const rank = (s: AnalysisStatus): number =>
    s === 'perfect' ? 2 : s === 'partial' ? 1 : 0;

  let floor: AnalysisStatus;
  if (local.status === 'fail') {
    floor = local.usedTargetWord
      ? 'partial'   // word present but rule engine failed → grammar was bad
      : 'fail';     // word missing → must remain fail
  } else if (ltResult?.hasStructuralError) {
    // LT independently confirmed a GRAMMAR category match.
    floor = 'partial';
  } else if (_hasStructuralIssue(local.issues)) {
    // Local rule engine produced a structural error.
    // Floor at 'partial' so _applyScoreFloor caps grammarScore ≤ 55 < 65,
    // which guarantees FLAWED in _computeVerdict even if AI type strings vary.
    floor = 'partial';
  } else {
    floor = 'perfect'; // no deterministic error detected — trust the model
  }

  return rank(modelStatus) < rank(floor) ? modelStatus : floor;
}

// ─── Score caps per status ────────────────────────────────────────────────────

/**
 * Mechanically enforces score ranges per status.
 *
 *   fail    → score ≤ 40,  grammarScore ≤ 30
 *   partial → score ≤ 65,  grammarScore ≤ 55
 *             (grammarScore ≤ 55 is always < 65, so _computeVerdict will
 *              fire the grammarScore < 65 structural-error branch)
 *   perfect → no caps from status (Step 8b handles post-verdict mismatches)
 *   Cross-field: grammarScore < 65 → score ≤ 70
 */
function _applyScoreFloor(
  score: number,
  grammarScore: number,
  clarityScore: number,
  naturalnessScore: number,
  status: AnalysisStatus,
): { score: number; grammarScore: number; clarityScore: number; naturalnessScore: number } {
  if (status === 'fail') {
    score        = Math.min(score, 40);
    grammarScore = Math.min(grammarScore, 30);
  } else if (status === 'partial') {
    score        = Math.min(score, 65);
    grammarScore = Math.min(grammarScore, 55);
  }
  // Cross-field: grammarScore below confidence threshold caps overall quality.
  if (grammarScore < 65) {
    score = Math.min(score, 70);
  }
  return { score, grammarScore, clarityScore, naturalnessScore };
}

// ─── Issue merge + dedup ───────────────────────────────────────────────────────

/**
 * Combines issues from all three sources and deduplicates by normalised messageTr.
 *
 * Priority (first wins on collision):
 *   1. Local rule-engine   — deterministic, most trusted
 *   2. LanguageTool        — structural grammar floor, precise character offsets
 *   3. AI model            — richest human-readable annotations, least reliable
 */
function _mergeAndDedup(
  aiIssues: DetailedIssue[],
  local: LocalAnalysisSummary,
  ltResult?: LTResult | null,
): DetailedIssue[] {
  const seen   = new Set<string>();
  const merged: DetailedIssue[] = [];

  function add(issue: DetailedIssue): void {
    const msgKey = issue.messageTr.trim().toLowerCase();

    // Semantic key: type + subtype + span — catches same-error different-wording
    // across sources (e.g. local Step 2b and AI both describing "has + bare verb"
    // with different Turkish sentences).  Only applied when all three fields are
    // non-empty to avoid false collisions on issues that lack span/subtype.
    const semKey = (issue.type && issue.subtype && issue.span)
      ? `${issue.type}|${issue.subtype}|${issue.span.toLowerCase()}`
      : null;

    if (seen.has(msgKey)) return;
    if (semKey && seen.has(semKey)) return;

    seen.add(msgKey);
    if (semKey) seen.add(semKey);
    merged.push(issue);
  }

  // 1. Local rule-engine issues (highest trust)
  for (const i of local.issues) {
    add({ type: i.type, subtype: i.subtype, severity: i.severity, messageTr: i.messageTr });
  }

  // 2. LanguageTool issues
  if (ltResult) {
    for (const m of ltResult.matches) {
      add({
        type:      m.isStructural             ? 'grammar'
                 : m.issueType === 'spelling'  ? 'spelling'
                 : 'style',
        severity:  m.isStructural ? 'error' : 'suggestion',
        messageTr: m.feedbackTr,
      });
    }
  }

  // 3. AI issues (may overlap with above; dedup key handles it)
  for (const i of aiIssues) {
    add(i);
  }

  return merged;
}

// ─── Correction structural checks ────────────────────────────────────────────

/**
 * Returns true when the sentence contains a `be-verb + bare verb/noun` pattern
 * that indicates an incomplete or misleading correction.
 *
 * LT's mechanical offset substitution can fix be-verb agreement while leaving
 * the overall structure wrong:
 *   "I are support"  → LT fixes "are"→"am" → "I am support"   ← be + bare noun
 *   "they is learn"  → LT fixes "is"→"are" → "they are learn"  ← be + bare verb
 *   "he are help"    → LT fixes "are"→"is" → "he is help"      ← be + bare verb
 *
 * Pattern: am|is|are|was|were followed immediately by a bare verb/noun token
 * (no -ing, no past participle -ed, no article/determiner in between).
 */
function _hasBeBareverb(sentence: string): boolean {
  return /\b(?:am|is|are|was|were)\s+(?!(?:a|an|the|my|your|his|her|its|our|their|not|also|still|just|very|being|going|having|getting|making|taking|doing|saying|coming|working|thinking|trying|looking|using|knowing|finding|giving|putting|starting|keeping|running|calling|turning|showing|waiting|playing|moving|standing|changing|bringing|asking|following|carrying|writing|helping|talking|building|reading|living|seeing|sitting|leaving|feeling|meeting|going)\b)\b[a-z]+(?<!ing)(?<!ed)(?<!en)\b/i.test(sentence);
}

/**
 * Returns true when the sentence contains a `have/has/had + bare verb` pattern
 * that indicates an incomplete perfect-tense correction.
 *
 * Example:
 *   "I have increase the budget" → still wrong after be-agreement fix
 *   "She has achieve her goals"  → still wrong
 *
 * Mirrors the client-side `_localHasHaveBareverb` check so that the backend
 * trust gate and the client display gate are symmetric.
 */
function _hasHaveBareverb(sentence: string): boolean {
  const IRREGULAR_PAST_PARTICIPLES = new Set([
    'been','gone','done','seen','come','run','won','put','cut','let','set','hit',
    'hurt','read','shut','known','shown','written','ridden','taken','given',
    'spoken','broken','chosen','driven','forgotten','risen','fallen','grown',
    'thrown','built','bought','brought','caught','taught','thought','fought',
    'meant','sent','spent','left','kept','slept','felt','dealt','held','led',
    'met','paid','said','sat','stood','lost','heard','found','made','told',
    'not','also','just','already','never','always',
  ]);
  const re = /\b(?:have|has|had)\s+([a-z]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sentence)) !== null) {
    const word = m[1].toLowerCase();
    if (IRREGULAR_PAST_PARTICIPLES.has(word)) continue;
    if (word.endsWith('ed') || word.endsWith('en')) continue;
    return true;
  }
  return false;
}

// ─── Correction trust gate ────────────────────────────────────────────────────

/**
 * Returns true only when a correction candidate is safe to display.
 *
 * Design principle (CLAUDE.md): a wrong correction is worse than no correction.
 * No network calls — decision uses data already available at normalisation time.
 *
 * Rules by verdict:
 *   REJECTED — never show a correction (sentence is fundamentally broken).
 *   PERFECT  — never show a correction (nothing to fix).
 *   FLAWED / ACCEPTABLE — apply source-specific trust check:
 *
 * Structural safety (both sources):
 *   - be + bare verb: be-agreement fix that leaves verb form wrong
 *   - have/has/had + bare verb: perfect-tense fix that leaves verb form wrong
 *   Both checks mirror the client-side validateCorrectedSentence gate so the
 *   two layers are symmetric and independently safe.
 *
 * AI-sourced correction:
 *   Trusted only when AI confidence is 'high'.
 *   'medium' or 'low' → AI itself is uncertain → suppress.
 *
 * LT-sourced correction (mechanical offset replacement):
 *   Trusted only when LT had at least one suggestion for every structural match.
 *   If any structural match has no suggestion, the correction is incomplete and
 *   may leave grammar errors → suppress.
 */
function _isCorrectionTrusted(
  candidate:    string,
  verdict:      EvaluationVerdict,
  aiConfidence: string,
  ltResult:     LTResult | null | undefined,
  fromLT:       boolean,
): boolean {
  if (verdict === 'REJECTED' || verdict === 'PERFECT') return false;

  // Structural safety checks — applied to ALL sources.
  // A correction that still contains these patterns is never safe to display,
  // regardless of confidence or LT suggestion coverage.
  if (_hasBeBareverb(candidate))   return false;
  if (_hasHaveBareverb(candidate)) return false;

  if (fromLT) {
    // LT correction is trustworthy only when every structural match had a
    // suggestion (LT could fix all of them).  If any match has no suggestion,
    // the correction is incomplete and may leave grammar errors → suppress.
    const structural   = (ltResult?.matches ?? []).filter(m => m.isStructural);
    const allSuggestable = structural.length > 0 && structural.every(m => m.suggestions.length > 0);
    return allSuggestable;
  }

  // AI correction: require high confidence.
  // 'medium' or 'low' → AI itself is uncertain → suppress.
  return aiConfidence === 'high';
}

// ─── 4-way verdict ────────────────────────────────────────────────────────────

/**
 * Computes the client-facing EvaluationVerdict from finalised status,
 * merged issue list, and grammar score.
 *
 * ─── FLAWED gate (structural error present) ───────────────────────────────────
 *
 *   Fires when ANY of:
 *     a) LT confirmed a GRAMMAR category match (independent structural signal)
 *     b) grammarScore < 65 — AI itself rates grammar below the passing threshold.
 *        After _applyScoreFloor, 'partial' status caps grammarScore ≤ 55 which
 *        is always < 65, so this branch fires for every partial sentence.
 *     c) _hasStructuralIssue(issues) — any error-severity issue in the MERGED
 *        list whose type is NOT in SURFACE_ONLY_ISSUE_TYPES.
 *        Coverage: 'grammar', 'preposition', 'verb-form', 'tense', 'agreement',
 *        'aspect', 'complement', 'word-order', 'pronoun', 'auxiliary',
 *        'vocabulary', 'clarity', 'article', and any other type string the AI
 *        might invent — everything not explicitly surface-only.
 *
 * ─── ACCEPTABLE ───────────────────────────────────────────────────────────────
 *
 *   Structural gate did not fire.  At least one error-severity or warning-severity
 *   issue remains (all must be surface-only types: spelling/punctuation/etc.).
 *
 * ─── PERFECT ──────────────────────────────────────────────────────────────────
 *
 *   Zero error-severity or warning-severity issues.
 *   Suggestion-level issues (style notes, mild naturalness hints) are allowed.
 *
 * ─── REJECTED ─────────────────────────────────────────────────────────────────
 *
 *   status is 'fail' (target word missing or sentence incoherent).
 */
function _computeVerdict(
  status: AnalysisStatus,
  issues: DetailedIssue[],
  grammarScore: number,
  ltHasStructural: boolean,
): EvaluationVerdict {
  if (status === 'fail') return 'REJECTED';

  const hasStructuralError =
    // (a) LT GRAMMAR category match
    ltHasStructural ||
    // (b) AI grammarScore below confidence threshold
    grammarScore < 65 ||
    // (c) Merged issue list contains any non-surface error-severity issue.
    //     Whitelist approach: catches every type string the AI might use.
    _hasStructuralIssue(issues);

  if (hasStructuralError) return 'FLAWED';

  // No structural errors.  Distinguish surface issues from a clean result.
  //
  //   ACCEPTABLE: at least one error- or warning-severity issue present
  //               (all must be surface-only types since FLAWED gate passed)
  //   PERFECT:    only suggestion-severity issues, or no issues at all
  //
  const hasNonSuggestionIssue = issues.some(i => i.severity !== 'suggestion');

  return hasNonSuggestionIssue ? 'ACCEPTABLE' : 'PERFECT';
}

// ─── Fallback builder ─────────────────────────────────────────────────────────

/**
 * Builds a safe `DetailedAnalysisResult` from client-side local analysis alone,
 * used when the AI model response cannot be parsed or the call failed.
 *
 *   • confidence always 'low'
 *   • tags include 'fallback-response' for telemetry
 *   • correctedSentence and naturalAlternative are null
 *   • Scores derived from local.score (no invention)
 *   • Status, verdict, and issues respect the same floors as the normalizer
 *   • LT structural errors are included if ltResult is provided
 */
export function buildFallbackResult(
  local: LocalAnalysisSummary,
  targetWord: string,
  _reason?: string,
  ltResult?: LTResult | null,
): DetailedAnalysisResult {
  // 'perfect' as model input → floor applies and pulls status down as needed.
  const status = _applyStatusFloor('perfect', local, ltResult);

  // No AI issues in fallback — local + LT only.
  const issues = _mergeAndDedup([], local, ltResult);

  const hasErrors        = issues.some(i => i.severity === 'error');
  const base             = local.score;
  const grammarScore     = clamp(hasErrors ? Math.min(base, 55) : base);
  const clarityScore     = clamp(base);
  const naturalnessScore = clamp(base);
  const score            = clamp(Math.round((grammarScore + clarityScore + naturalnessScore) / 3));

  const tags = ['fallback-response'];
  if (local.usedTargetWord)                      tags.push('target-word-used');
  if (!local.usedTargetWord)                     tags.push('target-word-missing');
  if (hasErrors)                                 tags.push('grammar-error');
  if (ltResult && !tags.includes('lt-analyzed')) tags.push('lt-analyzed');

  const verdict = _computeVerdict(status, issues, grammarScore, !!ltResult?.hasStructuralError);

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
    verdict,
  };
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Extracts a JSON object from a string that may contain surrounding prose or
 * markdown code fences.  Returns parsed object or null on failure.
 */
function _extractJson(text: string): unknown | null {
  const stripped = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  try { return JSON.parse(stripped); } catch { /* fall through */ }

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
