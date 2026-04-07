/**
 * backend/ai/languageToolService.ts
 *
 * Server-side LanguageTool wrapper for the sentence-analysis pipeline.
 *
 * ─── Purpose ───────────────────────────────────────────────────────────────────
 *
 *   Runs alongside the AI model call (in parallel) inside `analyzeSentence.ts`.
 *   Its structural findings are fed into `normalizeDetailedAnalysisResult` to
 *   enforce a grammar-error floor that the AI cannot override.
 *
 *   Running LT server-side (rather than client-side) means:
 *     • No CORS issues
 *     • No rate-limit pressure from individual client IPs
 *     • LT findings can be used in normalization even before AI responds
 *     • A single LT call per user request (no client+server duplication)
 *
 * ─── Activation ────────────────────────────────────────────────────────────────
 *
 *   LT_API_URL env var → custom endpoint (self-hosted LT for privacy/scale)
 *   LT_API_URL absent  → public free API: https://api.languagetool.org/v2/check
 *   LT_API_URL = ''    → set to empty string to disable LT entirely
 *
 *   Free public API limits: 20 req/min, 75k chars/month.
 *   Self-host instructions: https://dev.languagetool.org/http-server
 *
 * ─── Always safe ───────────────────────────────────────────────────────────────
 *
 *   `callLanguageTool` never throws.  Any failure (network, timeout, parse)
 *   returns null, and the pipeline continues with AI alone.
 */

import { log } from '../logger';

// ─── Configuration ──────────────────────────────────────────────────────────

/**
 * Override with process.env.LT_API_URL to point at a self-hosted instance.
 * Set LT_API_URL='' to disable LT entirely.
 */
const LT_API_URL =
  process.env.LT_API_URL !== undefined
    ? process.env.LT_API_URL
    : 'https://api.languagetool.org/v2/check';

const LT_TIMEOUT_MS = 5_000;

/**
 * Rules to suppress.
 * Rationale:
 *   MORFOLOGIK_RULE_EN_US  — LT's spell-checker fires on proper nouns and
 *                             vocabulary words; local Rule 12 + Rule 17 already
 *                             cover the important function-word typos.
 *   WHITESPACE_RULE        — cosmetic; handled by cosmeticFix() locally.
 *   UPPERCASE_SENTENCE_START — fires on quoted text; handled locally.
 *   SENTENCE_WHITESPACE    — cosmetic.
 */
const DISABLED_LT_RULES = [
  'MORFOLOGIK_RULE_EN_US',
  'WHITESPACE_RULE',
  'UPPERCASE_SENTENCE_START',
  'SENTENCE_WHITESPACE',
].join(',');

// ─── Public types ────────────────────────────────────────────────────────────

export interface LTMatch {
  /** LT rule identifier, e.g. 'EN_A_VS_AN', 'HE_VERB_AGR'. */
  ruleId:        string;
  /** LT category identifier, e.g. 'GRAMMAR', 'TYPOS', 'PUNCTUATION'. */
  categoryId:    string;
  /** LT issue type: 'grammar' | 'spelling' | 'style' | 'duplication' | 'other'. */
  issueType:     string;
  /** Character offset of the error span in the original sentence. */
  offset:        number;
  /** Length of the error span in characters. */
  length:        number;
  /** Up to 3 replacement candidates; first is the best suggestion. */
  suggestions:   string[];
  /** Turkish-language feedback derived from ruleId / category. */
  feedbackTr:    string;
  /**
   * Structural = true → GRAMMAR category match.
   * Locks the verdict floor at FLAWED (blocks PERFECT/ACCEPTABLE).
   * Everything else (TYPOS, PUNCTUATION, STYLE) is non-structural.
   */
  isStructural:  boolean;
}

export interface LTResult {
  matches:             LTMatch[];
  /** True if at least one match is structural (GRAMMAR category). */
  hasStructuralError:  boolean;
  /** True if at least one match is a spelling typo (TYPOS category). */
  hasSpellingError:    boolean;
  /**
   * Best-effort auto-corrected sentence (first suggestion per match, reverse-offset).
   * null when no match has suggestions or when matches overlap.
   */
  correctedSentence:   string | null;
}

// ─── Turkish feedback map ────────────────────────────────────────────────────

/**
 * Known LT rule IDs → Turkish feedback.
 * Fallback: `_feedbackTr()` returns a generic string by issue type.
 * Extend: add one entry per new rule ID — no code changes needed.
 */
const LT_FEEDBACK_TR: Readonly<Record<string, string>> = {
  // Subject-verb agreement
  'BE_VERB_AGREEMENT':             '"be" fiili ile özne arasında uyumsuzluk.',
  'HE_VERB_AGR':                   '"he/she/it" ile fiil arasında uyumsuzluk — 3. tekil şahıs eki gerekli.',
  'NON3PRS_VERB':                  'Özne ile fiil arasında uyumsuzluk.',
  'AGREEMENT_SENT_START':          'Cümle başında özne-fiil uyumsuzluğu.',
  'SUBJECT_VERB_AGREEMENT':        'Özne-fiil uyumsuzluğu.',
  'SINGULAR_AGREEMENT_SENT_START': '3. tekil şahıs öznesinden sonra fiil eki gerekli.',
  // Verb form errors
  'A_INFINITIVE':                  'Modal fiilden sonra "to" kullanılmaz; fiilin sade hali gelir.',
  'TO_NON_BASE':                   '"to" sonrasında fiilin sade hali (base form) kullanılmalı.',
  'BEEN_PART_AGREEMENT':           '"been" sonrasında geçmiş ortaç (past participle) gerekli.',
  'HAD_PLUS_BASE_VERB':            '"had" sonrasında geçmiş ortaç (past participle) gerekli.',
  'HAVE_PART_AGREEMENT':           '"have/has" sonrasında geçmiş ortaç (past participle) gerekli.',
  'PAST_PERFECT_WITH_WRONG_VERB':  'Geçmiş zaman form hatası.',
  'INCORRECT_VERB_TENSE':          'Fiil zaman formu hatalı.',
  // Articles
  'EN_A_VS_AN':                    '"a" ve "an" kullanımı hatalı — sesli harfle başlayan kelimelerden önce "an" kullanılır.',
  // Negation
  'DOUBLE_NEGATION':               'Çift olumsuzluk kullanılmış — İngilizce\'de geçersiz.',
  'NEG_SENT':                      'Cümlede çift olumsuzluk var.',
  // Punctuation (cosmetic — non-structural)
  'COMMA_COMPOUND_SENTENCE':       'Bileşik cümlede virgül gerekebilir.',
  'MISSING_COMMA_AFTER_INTRODUCTORY_PHRASE': 'Giriş ifadesinden sonra virgül gerekebilir.',
  'DOUBLE_PUNCTUATION':            'Çift noktalama işareti kullanılmamalı.',
  // Confused words
  'THEIR_THERE_THEY_RE':           '"their" / "there" / "they\'re" karıştırılmış.',
  'YOUR_YOU_RE':                   '"your" / "you\'re" karıştırılmış.',
  'ITS_IT_S':                      '"its" / "it\'s" karıştırılmış.',
  'THEN_THAN':                     '"then" / "than" karıştırılmış.',
  // Word repetition
  'ENGLISH_WORD_REPEAT_RULE':      'Aynı kelime üst üste tekrar edilmiş.',
};

// ─── Classification helpers ──────────────────────────────────────────────────

/** GRAMMAR category matches are structural (block PERFECT/ACCEPTABLE). */
const STRUCTURAL_CATEGORIES = new Set<string>(['GRAMMAR']);

function _isStructural(categoryId: string): boolean {
  return STRUCTURAL_CATEGORIES.has(categoryId.toUpperCase());
}

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
 * Applies the first LT suggestion per match in reverse-offset order.
 * Returns null if no matches have suggestions or if matches overlap.
 */
function _applyCorrections(sentence: string, matches: LTMatch[]): string | null {
  const applicable = matches
    .filter(m => m.suggestions.length > 0)
    .sort((a, b) => b.offset - a.offset);

  if (applicable.length === 0) return null;

  // Reject overlapping spans.
  for (let i = 0; i < applicable.length - 1; i++) {
    if (applicable[i + 1].offset + applicable[i + 1].length > applicable[i].offset) {
      return null;
    }
  }

  let result = sentence;
  for (const m of applicable) {
    result = result.slice(0, m.offset) + m.suggestions[0] + result.slice(m.offset + m.length);
  }
  const trimmed = result.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Calls LanguageTool and returns normalised results.
 *
 * @param sentence  - The sentence to check.
 * @param reqId     - Request ID for log correlation (optional).
 *
 * Always resolves — never throws.
 * Returns null on: LT disabled, network error, timeout, or bad response.
 */
export async function callLanguageTool(
  sentence: string,
  reqId?: string,
): Promise<LTResult | null> {
  if (!LT_API_URL || !sentence.trim()) return null;

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), LT_TIMEOUT_MS);

  try {
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

    if (!response.ok) {
      log.warn('lt_http_error', reqId, { status: response.status });
      return null;
    }

    const data = await response.json() as { matches?: unknown };
    if (!Array.isArray(data.matches)) return null;

    const matches: LTMatch[] = [];

    for (const raw of data.matches) {
      if (!raw || typeof raw !== 'object') continue;
      const m = raw as Record<string, unknown>;

      const rule       = (m.rule as Record<string, unknown> | undefined) ?? {};
      const ruleId     = typeof rule.id        === 'string' ? rule.id        : '';
      const issueType  = typeof rule.issueType === 'string' ? rule.issueType : 'other';
      const cat        = (rule.category as Record<string, unknown> | undefined) ?? {};
      const categoryId = typeof cat.id === 'string' ? cat.id : '';

      const offset      = typeof m.offset === 'number' ? m.offset : 0;
      const length      = typeof m.length === 'number' ? m.length : 0;

      const suggestions: string[] = Array.isArray(m.replacements)
        ? (m.replacements as unknown[])
            .map(r => {
              const v = (r as Record<string, unknown> | null)?.value;
              return typeof v === 'string' ? v : '';
            })
            .filter(Boolean)
            .slice(0, 3)
        : [];

      if (!ruleId) continue;

      matches.push({
        ruleId,
        categoryId,
        issueType,
        offset,
        length,
        suggestions,
        feedbackTr:   _feedbackTr(ruleId, issueType),
        isStructural: _isStructural(categoryId),
      });
    }

    log.info('lt_complete', reqId, {
      matchCount:      matches.length,
      structuralCount: matches.filter(m => m.isStructural).length,
    });

    return {
      matches,
      hasStructuralError:  matches.some(m => m.isStructural),
      hasSpellingError:    matches.some(m => m.issueType === 'spelling'),
      correctedSentence:   _applyCorrections(sentence, matches),
    };

  } catch {
    clearTimeout(timeoutId);
    log.warn('lt_call_failed', reqId, {});
    return null;
  }
}
