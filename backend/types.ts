/**
 * backend/types.ts
 *
 * Canonical request/response types for the detailed sentence-analysis endpoint.
 *
 * These mirror the client-side contracts in:
 *   src/services/detailedAnalysisService.ts
 *
 * Keep both in sync.  The backend is the authoritative schema owner;
 * the client must accept everything the backend returns.
 */

// ─── Shared enum literals ──────────────────────────────────────────────────────

export type AnalysisStatus   = 'fail' | 'partial' | 'perfect';
export type TargetWordMode   = 'exact' | 'family' | 'missing' | 'typo_suspected';
export type ConfidenceLevel  = 'low' | 'medium' | 'high';
export type IssueSeverity    = 'error' | 'warning' | 'suggestion';

// ─── Request ──────────────────────────────────────────────────────────────────

/**
 * A single issue from Layer-1 (local) analysis, forwarded to the backend
 * so the model can build on existing findings rather than repeating them.
 */
export interface LocalIssue {
  type: string;
  subtype?: string;
  severity: IssueSeverity;
  messageTr: string;
}

/**
 * Summary of the client-side (Layer-1) analysis result.
 *
 * Included in the request body so the backend can:
 *   • skip re-checking things the local engine already found
 *   • never return a verdict that is better than what local already detected
 *     (the backend can downgrade but should not silently upgrade)
 */
export interface LocalAnalysisSummary {
  status: AnalysisStatus;
  usedTargetWord: boolean;
  targetWordMode: TargetWordMode;
  score: number;
  confidence: ConfidenceLevel;
  issues: LocalIssue[];
}

/**
 * Full request body for POST /api/sentence-analysis/detailed
 */
export interface SentenceAnalysisRequest {
  /** The single target vocabulary word the user is practising. */
  targetWord: string;
  /** The sentence the user typed. */
  sentence: string;
  /** Difficulty band: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' — optional. */
  userLevel?: string;
  /** Layer-1 analysis results forwarded from the client. */
  localAnalysis: LocalAnalysisSummary;
}

// ─── Response ─────────────────────────────────────────────────────────────────

/**
 * A single grammar / style observation produced by the AI.
 */
export interface DetailedIssue {
  /** Top-level category: 'grammar' | 'spelling' | 'vocabulary' | 'clarity' | 'style' */
  type: string;
  /** Sub-category e.g. 'subject-verb-agreement', 'wrong-preposition'. Optional. */
  subtype?: string;
  severity: IssueSeverity;
  /** The exact offending word or phrase from the user's sentence. Optional. */
  span?: string;
  /** Turkish-language explanation shown to the learner. */
  messageTr: string;
}

/**
 * Full response from POST /api/sentence-analysis/detailed
 *
 * All fields are always present after normalization.
 * Nullable fields are null (not undefined) when not applicable.
 */
export interface DetailedAnalysisResult {
  status: AnalysisStatus;
  usedTargetWord: boolean;
  targetWordMode: TargetWordMode;
  /** Overall quality score 0–100 (weighted average of sub-scores). */
  score: number;
  /** Grammar correctness 0–100. */
  grammarScore: number;
  /** Sentence clarity 0–100. */
  clarityScore: number;
  /** Naturalness / fluency 0–100. */
  naturalnessScore: number;
  confidence: ConfidenceLevel;
  /** Primary Turkish feedback shown in the card heading. */
  shortFeedbackTr: string;
  /**
   * Grammar-corrected version of the user's sentence.
   * null unless confidence is high AND correction is complete (all errors fixed).
   */
  correctedSentence: string | null;
  /**
   * A more natural alternative phrasing.
   * null unless the sentence is grammatically OK but sounds unnatural.
   */
  naturalAlternative: string | null;
  issues: DetailedIssue[];
  /** Machine-readable classification tags. */
  tags: string[];
}
