/**
 * premiumAnalysisService.ts
 *
 * Layer 2 of the Sentence Builder analysis pipeline.
 *
 * ─── Two-layer architecture ────────────────────────────────────────────────────
 *
 *   Layer 1 — sentenceAnalysisService.ts (local, instant, always runs)
 *     • Word-boundary target detection
 *     • Minimum-length guard
 *     • Rule-based grammar checks (wrong prepositions, modal misuse)
 *     • Cosmetic fixes
 *
 *   Layer 2 — THIS FILE (optional, user-triggered, calls backend)
 *     • AI-powered scoring and grammar analysis
 *     • Natural-language Turkish feedback
 *     • Sentence correction + more natural alternative
 *
 * ─── Security model ────────────────────────────────────────────────────────────
 *
 *   ⚠️  API keys NEVER live inside the React Native app bundle.
 *
 *   The app calls YOUR backend endpoint  →  backend calls the AI provider.
 *
 *   Recommended backend route:
 *     POST /api/sentence-analysis
 *     Authorization: Bearer <user-session-token>   // identifies the user
 *     Body: { targetWord, sentence, userLevel }     // PremiumAnalysisInput
 *     Response: PremiumAnalysisResult
 *
 *   The backend is responsible for:
 *     • Authenticating the request (JWT / session)
 *     • Rate-limiting
 *     • Calling the AI provider with its server-side API key
 *     • Returning the PremiumAnalysisResult shape
 *
 * ─── Activation ────────────────────────────────────────────────────────────────
 *
 *   Set PREMIUM_API_URL below to your backend endpoint to enable real AI.
 *   Leave it empty ('') to run the deterministic mock instead.
 *   No other code changes are needed — the contract is stable.
 */

import { Word } from './vocabularyService';

// ─── Configuration ─────────────────────────────────────────────────────────────

/**
 * Your secure backend endpoint that wraps the AI provider.
 *
 * Empty string → mock mode (no network calls, safe for development).
 * Example: 'https://api.yourapp.com/v1/sentence-analysis'
 */
const PREMIUM_API_URL = "http://localhost:8787/api/sentence-analysis";
// ─── Public types ──────────────────────────────────────────────────────────────

export interface PremiumAnalysisInput {
  /** The single target word the user is practising. */
  targetWord: string;
  /** The sentence the user typed. */
  sentence: string;
  /** Difficulty level of the target word — informs feedback complexity. */
  userLevel: Word['level'];
}

/**
 * A single grammar or style observation returned by the AI.
 *
 * `severity` values:
 *   'error'      — grammatically incorrect; should be fixed
 *   'warning'    — technically acceptable but unusual / awkward
 *   'suggestion' — correct, but a style improvement is available
 */
export interface GrammarIssue {
  description: string;
  severity: 'error' | 'warning' | 'suggestion';
}

export interface PremiumAnalysisResult {
  /** True when the AI judges the sentence grammatically acceptable. */
  isValid: boolean;
  /** Overall quality score — 0 (very poor) to 100 (excellent). */
  score: number;
  /** Whether the target word was used in the sentence. */
  usedTargetWord: boolean;
  /** Ordered list of grammar/style issues found (empty = no issues). */
  grammarIssues: GrammarIssue[];
  /** Detailed Turkish-language feedback shown to the learner. */
  feedbackTr: string;
  /**
   * Corrected version of the sentence (grammar + cosmetic).
   * Undefined when the original needs no changes.
   */
  correctedSentence?: string;
  /**
   * A more natural English alternative.
   * Undefined when the original already sounds native.
   * In mock mode this is always undefined — the real AI backend populates it.
   */
  moreNaturalSentence?: string;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Calls the premium AI analysis backend.
 *
 * Behaviour:
 *   - If PREMIUM_API_URL is set  → POST to backend, return parsed result.
 *   - If PREMIUM_API_URL is empty → return deterministic mock result instantly.
 *
 * Always resolves — never throws.  Network / parse errors return a safe fallback.
 */
export async function callPremiumAnalysis(
  input: PremiumAnalysisInput,
): Promise<PremiumAnalysisResult> {
  if (PREMIUM_API_URL) {
    try {
      const response = await fetch(PREMIUM_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.json()) as PremiumAnalysisResult;
    } catch {
      // Network failure → degrade silently to mock so the screen never crashes.
      return _mockAnalysis(input);
    }
  }
  return _mockAnalysis(input);
}

// ─── Grammar rule engine ──────────────────────────────────────────────────────

/**
 * Internal result from a single grammar rule check.
 * `fix` is a function that rewrites the sentence when provided.
 */
interface RuleMatch {
  /** Turkish error description for the grammar issues list. */
  description: string;
  /** Turkish override for the top-level feedbackTr message. */
  feedbackOverride: string;
  /** Rewrites the trimmed sentence with the error corrected. */
  fix: (s: string) => string;
}

// ── Rule 1: Modal verb + "to" + infinitive ────────────────────────────────────
// "can to go" → "can go"
const MODAL_TO_RE = /\b(can|could|will|would|shall|should|may|might|must)\s+to\s+([a-z]+)\b/gi;

function checkModalTo(s: string): RuleMatch | null {
  MODAL_TO_RE.lastIndex = 0;
  const m = MODAL_TO_RE.exec(s);
  if (!m) return null;
  const modal = m[1];
  const verb  = m[2];
  return {
    description:     `"${modal} to ${verb}" hatalı — modal fiillerden sonra "to" kullanılmaz.`,
    feedbackOverride: `Yardımcı fiilden (${modal}) sonra "to" kullanılmamalı. Doğrusu: "${modal} ${verb}".`,
    fix: (str) => {
      MODAL_TO_RE.lastIndex = 0;
      return str.replace(MODAL_TO_RE, '$1 $2');
    },
  };
}

// ── Rule 2: "opportunity" without "to" before an infinitive ──────────────────
// "opportunity learn" → "opportunity to learn"
// Catches any verb-like word that directly follows "opportunity" without "to".
// Safe-words (prepositions, articles, auxiliaries) are excluded from matching.
const OPPORTUNITY_MISSING_TO_RE =
  /\bopportunity\s+(?!to\b|of\b|for\b|in\b|at\b|on\b|the\b|a\b|an\b|this\b|that\b|which\b|is\b|are\b|was\b|were\b|have\b|has\b|had\b)([a-z]+)\b/gi;

function checkOpportunityTo(s: string): RuleMatch | null {
  OPPORTUNITY_MISSING_TO_RE.lastIndex = 0;
  const m = OPPORTUNITY_MISSING_TO_RE.exec(s);
  if (!m) return null;
  const verb = m[1];
  return {
    description:     `"opportunity ${verb}" hatalı — "opportunity" sonrasında infinitive için "to" gerekir.`,
    feedbackOverride: `"opportunity" kelimesinden sonra "to ${verb}" kullanılmalı. Doğrusu: "opportunity to ${verb}".`,
    fix: (str) => {
      OPPORTUNITY_MISSING_TO_RE.lastIndex = 0;
      return str.replace(OPPORTUNITY_MISSING_TO_RE, `opportunity to $1`);
    },
  };
}

// ── Rule 3: Third-person singular agreement ───────────────────────────────────
// Covers two patterns:
//
//   A. Pronoun subject directly before base verb:
//      "He need help" / "She want more" / "It make sense"
//
//   B. Demonstrative + noun phrase + base verb:
//      "This job require experience" / "That rule make no sense"
//
// A modal between subject and verb makes the base form correct — excluded via
// a negative lookahead in Pattern B and by not matching modal-only words.
const _3P_VERBS = [
  'require','need','want','make','have','do','go','come','get','take','give',
  'find','know','think','look','use','work','feel','try','ask','seem','play',
  'run','move','write','provide','include','continue','learn','change','allow',
  'become','mean','keep','begin','show','hear','appear','remain','help','start',
  'bring','hold','turn','open','close','read','speak','stand','live','cause',
  'expect','involve','relate','affect','support','represent','follow','suggest',
  'indicate','increase','decrease','improve','reduce','contain','produce',
  // common vocabulary-level words learners write as base forms
  'develop','protect','explain','describe','create','build','lead','grow',
  'send','receive','apply','pass','fail','miss','remember','forget','decide',
  'choose','prefer','enjoy','hate','love','like','differ','depend','belong',
  'exist','occur','result','matter','happen','seem','appear','sound','look',
  // management / action verbs frequently used without -s in learner writing
  'manage','handle','control','plan','perform','achieve','complete','prepare',
  'practice','understand','consider','accept','agree','believe','demonstrate',
  'experience','reach','approach','check','confirm','report','introduce',
  'organize','implement','ensure','identify','present','represent','connect',
  'respond','react','reflect','require','attend','gain','offer','serve','join',
].join('|');

const MODALS = 'can|could|will|would|shall|should|may|might|must';

// Pattern A: pronoun directly before verb  →  m[1]=subject, m[2]=verb
const THIRD_PERSON_DIRECT_RE = new RegExp(
  `\\b(he|she|it|this|that)\\s+(${_3P_VERBS})\\b`, 'gi',
);

// Pattern B: demonstrative + ONE noun (not a modal) + verb
//            →  m[1]=subject, m[2]=noun, m[3]=verb
const THIRD_PERSON_NP_RE = new RegExp(
  `\\b(this|that)\\s+(?!(?:${MODALS})\\b)(\\w+)\\s+(${_3P_VERBS})\\b`, 'gi',
);

/** Returns the correctly inflected 3rd-person singular form. */
function inflect3p(verb: string): string {
  const v = verb.toLowerCase();
  if (/(?:ch|sh|ss|x|o)$/.test(v)) return v + 'es';           // teach→teaches
  if (/[^aeiou]y$/.test(v))        return v.slice(0, -1) + 'ies'; // carry→carries
  return v + 's';                                               // require→requires
}

function checkThirdPerson(s: string): RuleMatch | null {
  // Pattern A first (more specific)
  THIRD_PERSON_DIRECT_RE.lastIndex = 0;
  const direct = THIRD_PERSON_DIRECT_RE.exec(s);
  if (direct) {
    const subject  = direct[1];
    const baseVerb = direct[2];
    const correct  = inflect3p(baseVerb);
    return {
      description:     `"${subject} ${baseVerb}" hatalı — 3. tekil şahıs için fiile "-s / -es" eklenmeli.`,
      feedbackOverride: `3. tekil şahıslarda (${subject}) fiile "-s" eklenmeli. Doğrusu: "${subject} ${correct}".`,
      fix: (str) => {
        THIRD_PERSON_DIRECT_RE.lastIndex = 0;
        return str.replace(THIRD_PERSON_DIRECT_RE, `$1 ${correct}`);
      },
    };
  }

  // Pattern B: demonstrative + noun phrase
  THIRD_PERSON_NP_RE.lastIndex = 0;
  const np = THIRD_PERSON_NP_RE.exec(s);
  if (np) {
    const subject  = np[1];
    const noun     = np[2];
    const baseVerb = np[3];
    const correct  = inflect3p(baseVerb);
    return {
      description:     `"${subject} ${noun} ${baseVerb}" hatalı — 3. tekil şahıs için fiile "-s / -es" eklenmeli.`,
      feedbackOverride: `3. tekil şahıslarda fiile "-s" eklenmeli. Doğrusu: "${subject} ${noun} ${correct}".`,
      fix: (str) => {
        THIRD_PERSON_NP_RE.lastIndex = 0;
        return str.replace(THIRD_PERSON_NP_RE, `$1 $2 ${correct}`);
      },
    };
  }

  return null;
}

/**
 * Runs all grammar rules in priority order.
 * Returns the FIRST match found (rules are ordered most-impactful first).
 */
function _runGrammarRules(sentence: string): RuleMatch | null {
  return (
    checkThirdPerson(sentence)   ??   // most common learner error first
    checkModalTo(sentence)       ??
    checkOpportunityTo(sentence) ??
    null
  );
}

// ── Cosmetic helpers ──────────────────────────────────────────────────────────

function _applyCosmetic(s: string): string {
  let r = s.trim();
  if (r.length > 0 && r[0] !== r[0].toUpperCase()) r = r[0].toUpperCase() + r.slice(1);
  if (!/[.!?]$/.test(r)) r += '.';
  return r;
}

// ─── Deterministic mock ────────────────────────────────────────────────────────

/**
 * Rule-based mock for `PremiumAnalysisResult`.
 *
 * Grammar checks run first and fully determine `status`.
 * Cosmetic issues (capitalisation, punctuation) are reported as 'suggestion'
 * severity only and never cause a sentence to be marked as partial or fail.
 *
 * Status hierarchy:
 *   fail    → target word not used at all
 *   partial → target word used BUT a grammar rule fired
 *   perfect → target word used AND no grammar errors detected
 *
 * `isValid`:  fail → false, partial/perfect → true
 * `score`:    grammar error = hard penalty (-25), cosmetic = minor (-5 each)
 *
 * `moreNaturalSentence` is always undefined in mock mode; the real AI backend
 * would populate it with a genuinely rephrased alternative.
 */
function _mockAnalysis({
  targetWord,
  sentence,
}: PremiumAnalysisInput): PremiumAnalysisResult {
  const trimmed   = sentence.trim();
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;

  // ── Target-word detection ─────────────────────────────────────────────────
  // Exact match OR derived form (e.g. "develop" matches "developer").
  const normalizedTarget = targetWord.toLowerCase().trim();
  const sentenceTokens   = trimmed.toLowerCase().split(/\W+/).filter(Boolean);
  const usedTargetWord   = sentenceTokens.some(
    (w) => w === normalizedTarget || w.startsWith(normalizedTarget),
  );

  // ── Cosmetic flags ────────────────────────────────────────────────────────
  const hasCapital = /^[A-Z]/.test(trimmed);
  const hasPunct   = /[.!?]$/.test(trimmed);
  const tooShort   = wordCount < 4;
  const tooLong    = wordCount > 25;

  // ── Grammar rules ─────────────────────────────────────────────────────────
  // Only run when the target word is present (no point flagging grammar if the
  // core requirement isn't met — the fail message takes priority).
  const grammarMatch = usedTargetWord ? _runGrammarRules(trimmed) : null;

  // ── Status ────────────────────────────────────────────────────────────────
  let status: 'perfect' | 'partial' | 'fail';
  if (!usedTargetWord) {
    status = 'fail';
  } else if (grammarMatch) {
    status = 'partial';
  } else {
    status = 'perfect';
  }

  // ── Grammar issues list ───────────────────────────────────────────────────
  // Grammar errors (severity='error') come first.
  // Cosmetic issues (severity='suggestion') come after and are never 'error'.
  const grammarIssues: GrammarIssue[] = [];

  if (!usedTargetWord) {
    grammarIssues.push({
      description: `"${targetWord}" kelimesi cümlede kullanılmamış.`,
      severity: 'error',
    });
  }
  if (grammarMatch) {
    grammarIssues.push({ description: grammarMatch.description, severity: 'error' });
  }
  if (!hasCapital) {
    grammarIssues.push({
      description: 'Cümle büyük harfle başlamalıdır.',
      severity: 'suggestion',
    });
  }
  if (!hasPunct) {
    grammarIssues.push({
      description: 'Cümle sonu noktalama işareti (. ? !) eklenmeli.',
      severity: 'suggestion',
    });
  }
  if (tooShort) {
    grammarIssues.push({
      description: 'Cümle çok kısa — daha fazla bağlam eklenerek geliştirilebilir.',
      severity: 'suggestion',
    });
  }
  if (tooLong) {
    grammarIssues.push({
      description: 'Cümle çok uzun olabilir. Daha kısa ve net bir ifade tercih edilebilir.',
      severity: 'suggestion',
    });
  }

  // ── Score ─────────────────────────────────────────────────────────────────
  // Grammar error: hard cap at 55 and -25 penalty.
  // Cosmetic issues: -5 each (minor).
  // Structural bonuses for length and completeness.
  let score = usedTargetWord ? 50 : 20;
  if (grammarMatch)    score -= 25;
  if (hasPunct)        score += 10;
  if (hasCapital)      score += 5;
  if (wordCount >= 6)  score += 10;
  if (wordCount >= 8)  score += 5;
  if (!tooShort && !tooLong) score += 5;
  // Grammar errors hard-cap the score — a sentence with a grammar error
  // cannot score "perfect" regardless of other bonuses.
  if (grammarMatch) score = Math.min(score, 55);
  score = Math.min(100, Math.max(0, score));

  // ── Turkish feedback ──────────────────────────────────────────────────────
  // Rule-specific feedback overrides the generic message for partial status.
  let feedbackTr: string;
  if (status === 'fail') {
    feedbackTr = `"${targetWord}" kelimesini cümlede kullanmalısın.`;
  } else if (status === 'partial') {
    // Use the rule's specific override when available, fall back to generic.
    feedbackTr = grammarMatch?.feedbackOverride
      ?? 'Kelimeyi doğru kullandın ama cümlede bir dilbilgisi hatası var.';
  } else {
    feedbackTr = 'Mükemmel! Cümle doğru ve doğal. ✅';
  }

  // ── Corrected sentence ────────────────────────────────────────────────────
  // If a grammar rule fired, apply its fix first, then layer cosmetic fixes.
  // If only cosmetic issues, apply cosmetic fixes only.
  let correctedSentence: string | undefined;
  if (grammarMatch) {
    const grammarFixed  = grammarMatch.fix(trimmed);
    const fullyFixed    = _applyCosmetic(grammarFixed);
    correctedSentence   = fullyFixed;
  } else if (!hasCapital || !hasPunct) {
    correctedSentence = _applyCosmetic(trimmed);
  }

  return {
    isValid: status !== 'fail',
    score,
    usedTargetWord,
    grammarIssues,
    feedbackTr,
    correctedSentence,
    moreNaturalSentence: undefined, // populated by real AI backend only
  };
}
