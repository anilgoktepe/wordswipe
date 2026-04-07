/**
 * languageToolService.ts
 *
 * Thin wrapper around the LanguageTool REST API.
 *
 * ─── Purpose ───────────────────────────────────────────────────────────────────
 *
 *   LanguageTool is an optional grammar/spelling analysis layer that runs
 *   ALONGSIDE the deterministic local rules (sentenceAnalysisService) and the
 *   AI backend (detailedAnalysisService).
 *
 *   It detects issues the local rules may miss — complex subject-verb agreement,
 *   article errors, double-negation variants, confused words — and provides
 *   Turkish-language feedback and suggested replacements.
 *
 * ─── Integration model ────────────────────────────────────────────────────────
 *
 *   Called from detailedAnalysisService.analyzeSentenceDetailed() in parallel
 *   with the real AI backend (when configured) or used stand-alone in mock mode.
 *
 *   • Returns `null` on any network / timeout / parse failure — callers must
 *     treat null as "no additional information" and continue normally.
 *   • Never throws.
 *   • Adds `lt-analyzed` tag to the final result so the UI can optionally badge it.
 *
 * ─── Activation ────────────────────────────────────────────────────────────────
 *
 *   LT_API_URL non-empty  →  real HTTP call to LanguageTool (free public API or
 *                             self-hosted instance).
 *   LT_API_URL empty      →  callLanguageTool() immediately returns null.
 *
 *   Free public API: https://api.languagetool.org/v2/check
 *     • No API key needed for basic use.
 *     • Rate limit: 20 requests/minute, 75,000 characters/month.
 *     • For higher volume: self-host LT or subscribe to LT Premium.
 *
 * ─── Security model ───────────────────────────────────────────────────────────
 *
 *   The free public LanguageTool API does not require authentication.
 *   User sentences are sent to languagetool.org for analysis.
 *   For privacy-sensitive deployments, replace LT_API_URL with a self-hosted
 *   instance URL.
 */

// ─── Configuration ──────────────────────────────────────────────────────────

/**
 * LanguageTool API endpoint.
 *
 * Public free API (rate-limited):
 *   'https://api.languagetool.org/v2/check'
 *
 * Self-hosted / premium:
 *   'https://lt.yourserver.com/v2/check'
 *
 * Empty string → LT disabled (callLanguageTool always returns null).
 */
export const LT_API_URL = 'https://api.languagetool.org/v2/check';

/** Request timeout. Keeps LT from blocking the UI if the server is slow. */
const LT_TIMEOUT_MS = 6_000;

/**
 * LT rule IDs to disable globally.
 *
 * These rules either overlap with our local grammar rules (causing duplicate
 * Turkish feedback) or generate too many false positives for learner writing.
 *
 * Rationale per entry:
 *   WHITESPACE_RULE              — cosmetic, handled by cosmeticFix() locally.
 *   UPPERCASE_SENTENCE_START     — handled locally; LT version fires even inside
 *                                  quoted text, causing false positives.
 *   SENTENCE_WHITESPACE          — same as above.
 *   COMMA_PARENTHESIS_WHITESPACE — too aggressive for informal learner writing.
 *   MORFOLOGIK_RULE_EN_US        — LT's main spell-checker.  Disabled because:
 *                                  (a) our Rule 12 + Rule 17 already catch the
 *                                      common function-word typos;
 *                                  (b) it flags proper nouns, brand names, and
 *                                      vocabulary words as "misspellings".
 */
const DISABLED_LT_RULES = [
  'WHITESPACE_RULE',
  'UPPERCASE_SENTENCE_START',
  'SENTENCE_WHITESPACE',
  'COMMA_PARENTHESIS_WHITESPACE',
  'MORFOLOGIK_RULE_EN_US',
].join(',');

// ─── Public types ────────────────────────────────────────────────────────────

/**
 * Normalised version of a single LanguageTool match.
 * All raw LT fields are validated and typed; unknown values fall back to safe defaults.
 */
export interface LTMatch {
  /** LT rule identifier, e.g. 'EN_A_VS_AN', 'HE_VERB_AGR'. */
  ruleId:        string;
  /** LT category identifier, e.g. 'GRAMMAR', 'TYPOS', 'PUNCTUATION'. */
  categoryId:    string;
  /** LT issue type string ('grammar' | 'spelling' | 'style' | 'duplication'). */
  issueType:     string;
  /** Character offset of the error in the original sentence. */
  offset:        number;
  /** Character length of the error span. */
  length:        number;
  /** Up to 3 replacement candidates (first = best). */
  suggestions:   string[];
  /** Turkish-language feedback derived from ruleId / categoryId. */
  feedbackTr:    string;
  /**
   * Whether this match represents a structural grammar error.
   *
   * `true`  — GRAMMAR category: subject-verb agreement, wrong tense form, etc.
   *            These lock the verdict floor at FLAWED (block PERFECT/ACCEPTABLE).
   * `false` — TYPOS / PUNCTUATION / STYLE / CASING: surface-level issues that
   *            can be flagged as suggestions without downgrading the verdict.
   */
  isStructural:  boolean;
}

/**
 * The normalised result returned by `callLanguageTool()`.
 */
export interface LTCallResult {
  /** All normalised matches (may be empty). */
  matches:             LTMatch[];
  /** True when at least one match is structural (GRAMMAR category). */
  hasStructuralError:  boolean;
  /** True when at least one match is a spelling error (TYPOS category). */
  hasSpellingError:    boolean;
  /**
   * A best-effort auto-corrected sentence produced by applying the first
   * replacement suggestion for each match, in reverse offset order.
   *
   * `null` when:
   *   – no match has suggestions, or
   *   – matches overlap (unsafe to apply automatically).
   */
  correctedSentence:   string | null;
}

// ─── Turkish feedback map ────────────────────────────────────────────────────

/**
 * Maps known LanguageTool rule IDs to Turkish-language feedback strings.
 *
 * Fallback: if a rule ID is not in this map, `_feedbackTr()` returns a generic
 * Turkish message based on the issue type (grammar / spelling / style).
 *
 * Extending: add one entry per new rule ID — no code changes required.
 */
const LT_FEEDBACK_TR: Readonly<Record<string, string>> = {
  // ── Subject-verb agreement ──────────────────────────────────────────────
  'BE_VERB_AGREEMENT':     '"be" fiili ile özne arasında uyumsuzluk.',
  'HE_VERB_AGR':           '"he/she/it" ile fiil arasında uyumsuzluk — 3. tekil şahıs eki gerekli.',
  'NON3PRS_VERB':          'Özne ile fiil arasında uyumsuzluk.',
  'AGREEMENT_SENT_START':  'Cümle başında özne-fiil uyumsuzluğu.',
  'SUBJECT_VERB_AGREEMENT':'Özne-fiil uyumsuzluğu.',
  'SINGULAR_AGREEMENT_SENT_START': '3. tekil şahıs öznesinden sonra fiil eki gerekli.',
  // ── Verb form errors ────────────────────────────────────────────────────
  'A_INFINITIVE':           'Modal fiilden sonra "to" kullanılmaz; fiilin sade hali gelir.',
  'TO_NON_BASE':            '"to" sonrasında fiilin sade hali (base form) kullanılmalı.',
  'BEEN_PART_AGREEMENT':    '"been" sonrasında geçmiş ortaç (past participle) gerekli.',
  'HAD_PLUS_BASE_VERB':     '"had" sonrasında geçmiş ortaç (past participle) gerekli.',
  'HAVE_PART_AGREEMENT':    '"have/has" sonrasında geçmiş ortaç (past participle) gerekli.',
  'PAST_PERFECT_WITH_WRONG_VERB': 'Geçmiş zaman form hatası.',
  'INCORRECT_VERB_TENSE':   'Fiil zaman formu hatalı.',
  // ── Articles ────────────────────────────────────────────────────────────
  'EN_A_VS_AN':             '"a" ve "an" kullanımı hatalı — sesli harfle başlayan kelimelerden önce "an" kullanılır.',
  // ── Negation ────────────────────────────────────────────────────────────
  'DOUBLE_NEGATION':        'Çift olumsuzluk kullanılmış — İngilizce\'de geçersiz.',
  'NEG_SENT':               'Cümlede çift olumsuzluk var.',
  // ── Punctuation (cosmetic) ──────────────────────────────────────────────
  'COMMA_COMPOUND_SENTENCE':'Bileşik cümlede virgül gerekebilir.',
  'MISSING_COMMA_AFTER_INTRODUCTORY_PHRASE': 'Giriş ifadesinden sonra virgül gerekebilir.',
  'DOUBLE_PUNCTUATION':     'Çift noktalama işareti kullanılmamalı.',
  'PERIOD_OF_ABBREVIATION': 'Kısaltmadan sonra nokta gereklidir.',
  // ── Confused words ──────────────────────────────────────────────────────
  'THEIR_THERE_THEY_RE':    '"their" / "there" / "they\'re" karıştırılmış.',
  'YOUR_YOU_RE':            '"your" / "you\'re" karıştırılmış.',
  'ITS_IT_S':               '"its" / "it\'s" karıştırılmış.',
  'WHOSE_WHO_S':            '"whose" / "who\'s" karıştırılmış.',
  'THEN_THAN':              '"then" / "than" karıştırılmış.',
  'TOO_TO_TWO':             '"to" / "too" / "two" karıştırılmış.',
  // ── Word repetition ─────────────────────────────────────────────────────
  'ENGLISH_WORD_REPEAT_RULE': 'Aynı kelime üst üste tekrar edilmiş.',
};

// ─── Structural classification ───────────────────────────────────────────────

/**
 * LT category IDs whose matches lock the verdict floor at FLAWED.
 *
 * Strategy: any match whose LT category is GRAMMAR counts as structural.
 * All other categories (TYPOS, STYLE, PUNCTUATION, CASING…) are treated as
 * non-structural suggestions.
 */
const STRUCTURAL_CATEGORIES = new Set<string>(['GRAMMAR']);

function _isStructural(categoryId: string): boolean {
  return STRUCTURAL_CATEGORIES.has(categoryId.toUpperCase());
}

// ─── Turkish feedback derivation ─────────────────────────────────────────────

function _feedbackTr(ruleId: string, issueType: string): string {
  if (LT_FEEDBACK_TR[ruleId]) return LT_FEEDBACK_TR[ruleId];
  const t = issueType.toLowerCase();
  if (t === 'grammar')     return 'Dilbilgisi hatası tespit edildi.';
  if (t === 'spelling')    return 'Yazım hatası olabilir.';
  if (t === 'duplication') return 'Kelime tekrarı var.';
  return 'İfade geliştirilebilir.';
}

// ─── Auto-correction ─────────────────────────────────────────────────────────

/**
 * Builds a corrected sentence by applying the first suggestion for each match,
 * processed in **reverse offset order** so earlier offsets remain valid.
 *
 * Returns `null` when:
 *   – no match has at least one suggestion, or
 *   – any two matches overlap (applying both would produce nonsense).
 */
function _applyLTCorrections(sentence: string, matches: LTMatch[]): string | null {
  const applicable = matches
    .filter(m => m.suggestions.length > 0)
    .sort((a, b) => b.offset - a.offset); // descending by offset

  if (applicable.length === 0) return null;

  // Reject overlapping matches — unsafe to apply both automatically.
  for (let i = 0; i < applicable.length - 1; i++) {
    const cur  = applicable[i];
    const next = applicable[i + 1];
    // After sorting descending, `next.offset` < `cur.offset`.
    // Overlap if the end of `next` reaches into `cur`.
    if (next.offset + next.length > cur.offset) return null;
  }

  let result = sentence;
  for (const m of applicable) {
    result =
      result.slice(0, m.offset) +
      m.suggestions[0] +
      result.slice(m.offset + m.length);
  }

  const trimmed = result.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// ─── Main API call ───────────────────────────────────────────────────────────

/**
 * Calls the LanguageTool API and returns normalised results.
 *
 * Always resolves — never throws.  Returns `null` on:
 *   – LT disabled (LT_API_URL = '')
 *   – network error
 *   – timeout
 *   – unexpected response shape
 */
export async function callLanguageTool(
  sentence: string,
): Promise<LTCallResult | null> {
  if (!LT_API_URL || !sentence.trim()) return null;

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), LT_TIMEOUT_MS);

  try {
    // LT v2 accepts application/x-www-form-urlencoded POST.
    const body =
      'text='          + encodeURIComponent(sentence) +
      '&language=en-US' +
      '&disabledRules=' + encodeURIComponent(DISABLED_LT_RULES);

    const response = await fetch(LT_API_URL, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept':       'application/json',
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const data = await response.json() as { matches?: unknown };
    if (!Array.isArray(data.matches)) return null;

    // ── Normalise each raw match ───────────────────────────────────────────
    const matches: LTMatch[] = [];

    for (const raw of data.matches) {
      if (!raw || typeof raw !== 'object') continue;
      const m = raw as Record<string, unknown>;

      // Safely dig into the nested `rule` object.
      const rule       = (m.rule as Record<string, unknown> | undefined) ?? {};
      const ruleId     = typeof rule.id         === 'string' ? rule.id         : '';
      const issueType  = typeof rule.issueType  === 'string' ? rule.issueType  : 'other';

      const cat        = (rule.category as Record<string, unknown> | undefined) ?? {};
      const categoryId = typeof cat.id === 'string' ? cat.id : '';

      const offset     = typeof m.offset === 'number' ? m.offset : 0;
      const length     = typeof m.length === 'number' ? m.length : 0;

      // Extract up to 3 suggestions.
      const suggestions: string[] = Array.isArray(m.replacements)
        ? (m.replacements as unknown[])
            .map(r => {
              const rv = (r as Record<string, unknown> | null)?.value;
              return typeof rv === 'string' ? rv : '';
            })
            .filter(Boolean)
            .slice(0, 3)
        : [];

      if (!ruleId) continue; // skip malformed entries

      matches.push({
        ruleId,
        categoryId,
        issueType,
        offset,
        length,
        suggestions,
        feedbackTr:  _feedbackTr(ruleId, issueType),
        isStructural: _isStructural(categoryId),
      });
    }

    const hasStructuralError = matches.some(m => m.isStructural);
    const hasSpellingError   = matches.some(m => m.issueType === 'spelling');
    const correctedSentence  = _applyLTCorrections(sentence, matches);

    return { matches, hasStructuralError, hasSpellingError, correctedSentence };

  } catch {
    clearTimeout(timeoutId);
    return null; // network error, timeout, or parse failure — always graceful
  }
}
