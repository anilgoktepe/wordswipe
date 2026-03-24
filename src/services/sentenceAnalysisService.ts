/**
 * sentenceAnalysisService.ts
 *
 * Modular AI sentence analysis layer for the Sentence Builder feature.
 *
 * Architecture:
 *   - `analyzeSentence()` is the single public entry point.
 *   - It currently runs a LOCAL rule-based analyser:
 *       1. Word-boundary detection of target words
 *       2. Minimum-length guard
 *       3. Grammar error detection (wrong prepositions, modal misuse)
 *       4. Cosmetic fixes (capitalisation, punctuation)
 *   - To connect a real AI API (e.g. OpenAI, Gemini, Claude), replace only
 *     the body of `analyzeSentence()`.  The AnalysisInput / AnalysisResult
 *     contract stays unchanged — the screen does not need to be updated.
 *
 * Isolation contract:
 *   - This service has ZERO knowledge of AppContext, wordProgress, SRS, XP, or
 *     any other app-state concern.
 *   - It is a pure function: same input always produces the same class of output.
 *   - It does NOT modify any app state.
 */

import { Word } from './vocabularyService';

// ─── Public types ──────────────────────────────────────────────────────────────

export interface AnalysisInput {
  /** The target word(s) shown to the user for this exercise. */
  selectedWords: Word[];
  /** The sentence the user typed. */
  sentence: string;
}

export interface AnalysisResult {
  /** True when the sentence is grammatically acceptable AND at least one target word is used. */
  isValid: boolean;
  /** Human-readable Turkish feedback shown to the user. */
  feedback: string;
  /**
   * A corrected version of the sentence.
   * Populated for grammar errors (with the fix applied) and for cosmetic-only
   * issues (capitalisation / punctuation).  Undefined when no fix is needed.
   */
  correctedSentence?: string;
  /** Subset of selectedWords that were detected in the sentence. */
  usedWords: Word[];
}

// ─── Grammar rule tables ───────────────────────────────────────────────────────

/**
 * Transitive verbs that take a DIRECT object — no preposition between the verb
 * and its object.  Each entry captures the verb + the preposition that learners
 * commonly (and incorrectly) insert.
 *
 * Pattern notes:
 *   - Use /gi so the regex resets correctly when called multiple times.
 *   - `replacement` is the corrected verb phrase (preposition removed).
 *   - `feedback` is a Turkish explanation shown to the learner.
 */
interface WrongPrepRule {
  /** Matches the incorrect verb+preposition combination in a sentence. */
  pattern: RegExp;
  /** The corrected replacement string (just the verb, no preposition). */
  replacement: string;
  /** Turkish error explanation including the correct form. */
  feedback: string;
}

const WRONG_PREP_RULES: WrongPrepRule[] = [
  {
    pattern: /\bprotect\s+to\b/gi,
    replacement: 'protect',
    feedback:
      '"protect to" hatalı bir kullanım. "Protect" doğrudan nesne alır — araya "to" girmez. Doğru örnek: "I can protect them."',
  },
  {
    pattern: /\bcontact\s+to\b/gi,
    replacement: 'contact',
    feedback:
      '"contact to" hatalı. "Contact" doğrudan nesne alır. Doğru örnek: "I will contact him."',
  },
  {
    pattern: /\bdiscuss\s+about\b/gi,
    replacement: 'discuss',
    feedback:
      '"discuss about" hatalı. "Discuss" doğrudan nesne alır, "about" eklenmez. Doğru örnek: "We discussed the problem."',
  },
  {
    pattern: /\bmention\s+about\b/gi,
    replacement: 'mention',
    feedback:
      '"mention about" hatalı. "Mention" doğrudan nesne alır. Doğru örnek: "She mentioned it."',
  },
  {
    pattern: /\bmarry\s+with\b/gi,
    replacement: 'marry',
    feedback:
      '"marry with" hatalı. "Marry" doğrudan nesne alır. Doğru örnek: "He married her."',
  },
  {
    pattern: /\bresemble\s+to\b/gi,
    replacement: 'resemble',
    feedback:
      '"resemble to" hatalı. "Resemble" doğrudan nesne alır. Doğru örnek: "She resembles her mother."',
  },
  {
    pattern: /\bapproach\s+to\b/gi,
    replacement: 'approach',
    feedback:
      '"approach to" hatalı. "Approach" doğrudan nesne alır. Doğru örnek: "He approached the door."',
  },
  {
    pattern: /\breach\s+to\b/gi,
    replacement: 'reach',
    feedback:
      '"reach to" hatalı. "Reach" doğrudan nesne alır. Doğru örnek: "We reached the station."',
  },
  {
    pattern: /\benter\s+to\b/gi,
    replacement: 'enter',
    feedback:
      '"enter to" hatalı. "Enter" doğrudan nesne alır. Doğru örnek: "She entered the room."',
  },
  {
    pattern: /\bexplain\s+about\b/gi,
    replacement: 'explain',
    feedback:
      '"explain about" hatalı. "Explain" doğrudan nesne alır. Doğru örnek: "He explained the rule."',
  },
  {
    pattern: /\bawait\s+for\b/gi,
    replacement: 'await',
    feedback:
      '"await for" hatalı. "Await" doğrudan nesne alır. Doğru örnek: "We await your reply."',
  },
  {
    pattern: /\black\s+of\b/gi,
    replacement: 'lack',
    feedback:
      '"lack of" bu bağlamda hatalı. "Lack" doğrudan nesne alır. Doğru örnek: "She lacks confidence."',
  },
];

/**
 * Modal verbs followed by "to + infinitive" — incorrect in English.
 * e.g. "I can to go" → "I can go"
 *
 * Capture groups: $1 = modal, $2 = main verb stem.
 */
const MODAL_TO_INFINITIVE = /\b(can|could|will|would|shall|should|may|might|must)\s+to\s+([a-z]+)\b/gi;

// ─── Private helpers ───────────────────────────────────────────────────────────

/**
 * Returns which words from `words` appear in `sentence` using word-boundary
 * matching so that "cat" does not falsely match inside "concatenate".
 */
function detectUsedWords(words: Word[], sentence: string): Word[] {
  return words.filter(w => {
    const escaped = w.word.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(?<![a-z])${escaped}(?![a-z])`, 'i');
    return pattern.test(sentence);
  });
}

/**
 * Applies minimal cosmetic fixes to an already-valid sentence:
 *   - Capitalises the first letter
 *   - Appends a full stop if no terminal punctuation is present
 *
 * Returns undefined when no fix is needed.
 */
function cosmeticFix(sentence: string): string | undefined {
  let s = sentence.trim();
  const needsCapital = s.length > 0 && s[0] !== s[0].toUpperCase();
  const needsPunct   = !/[.!?]$/.test(s);

  if (!needsCapital && !needsPunct) return undefined;

  if (needsCapital) s = s.charAt(0).toUpperCase() + s.slice(1);
  if (needsPunct)   s = s + '.';
  return s;
}

/**
 * Runs the grammar rule tables against `sentence`.
 *
 * Returns the first error found (checked in priority order):
 *   1. Modal + "to" + infinitive  (e.g. "can to protect")
 *   2. Transitive verb + wrong preposition  (e.g. "protect to", "discuss about")
 *
 * Returns null when no grammar errors are detected.
 *
 * `corrected` is the sentence with the offending token(s) replaced and
 * cosmetic fixes (capital + punctuation) applied on top.
 */
function _checkGrammar(sentence: string): { feedback: string; corrected: string } | null {
  // ── Rule 1: modal + "to" + infinitive ────────────────────────────────────
  MODAL_TO_INFINITIVE.lastIndex = 0;
  const modalMatch = MODAL_TO_INFINITIVE.exec(sentence);
  if (modalMatch) {
    const modal = modalMatch[1];
    const verb  = modalMatch[2];
    MODAL_TO_INFINITIVE.lastIndex = 0;
    const fixed = sentence.replace(MODAL_TO_INFINITIVE, '$1 $2');
    return {
      feedback:  `"${modal} to ${verb}" hatalı — modal fiillerden (can, will, should…) sonra "to" gelmez. Doğrusu: "${modal} ${verb}".`,
      corrected: cosmeticFix(fixed) ?? fixed,
    };
  }

  // ── Rule 2: transitive verb + wrong preposition ───────────────────────────
  for (const rule of WRONG_PREP_RULES) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(sentence)) {
      rule.pattern.lastIndex = 0;
      const fixed = sentence.replace(rule.pattern, rule.replacement);
      return {
        feedback:  rule.feedback,
        corrected: cosmeticFix(fixed) ?? fixed,
      };
    }
  }

  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Analyses a user sentence against a set of target words.
 *
 * ### Validation pipeline
 *   1. Empty-input guard
 *   2. Target-word presence check (word-boundary regex)
 *   3. Minimum sentence length (≥ 4 words)
 *   4. Grammar error detection (modal misuse, wrong prepositions)
 *   5. Positive feedback proportional to word coverage
 *   6. Cosmetic correction (capitalisation + punctuation)
 *
 * ### Upgrading to real AI
 * Replace this function body with an API call:
 * ```ts
 *   const res = await fetch('/api/analyze', {
 *     method: 'POST',
 *     body: JSON.stringify(input),
 *   });
 *   return res.json() as AnalysisResult;
 * ```
 * The AnalysisInput / AnalysisResult contract and all call-sites remain unchanged.
 *
 * Always resolves — never throws.
 */
export async function analyzeSentence(input: AnalysisInput): Promise<AnalysisResult> {
  try {
    return _mockAnalyze(input);
  } catch {
    return {
      isValid:  true,
      feedback: 'Cümlen kaydedildi. Devam et! ✅',
      usedWords: [],
    };
  }
}

// ─── Rule-based implementation ────────────────────────────────────────────────

function _mockAnalyze({ selectedWords, sentence }: AnalysisInput): AnalysisResult {
  const trimmed = sentence.trim();

  // ── Guard: empty input ────────────────────────────────────────────────────
  if (!trimmed) {
    return { isValid: false, feedback: 'Bir cümle yazmalısın.', usedWords: [] };
  }

  // ── Step 1: detect target-word coverage ──────────────────────────────────
  const usedWords = detectUsedWords(selectedWords, trimmed);

  if (usedWords.length === 0) {
    const targets = selectedWords.map(w => `"${w.word}"`).join(', ');
    return {
      isValid:  false,
      feedback: `Hedef kelimelerden hiçbirini kullanmadın. Şu kelimelerden en az birini cümlene ekle: ${targets}.`,
      usedWords: [],
    };
  }

  // ── Step 2: minimum sentence length ──────────────────────────────────────
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  if (wordCount < 4) {
    return {
      isValid:  false,
      feedback: 'Cümle çok kısa. En az 4–5 kelimeden oluşan tam bir cümle yaz.',
      usedWords,
    };
  }

  // ── Step 3: grammar error detection ──────────────────────────────────────
  // Runs AFTER length check so we only flag grammar when there is a real sentence.
  const grammarError = _checkGrammar(trimmed);
  if (grammarError) {
    return {
      isValid:           false,
      feedback:          grammarError.feedback,
      correctedSentence: grammarError.corrected,
      usedWords,
    };
  }

  // ── Step 4: positive feedback proportional to word coverage ──────────────
  const total    = selectedWords.length;
  const used     = usedWords.length;
  const coverage = `${used}/${total}`;
  let feedback: string;

  if (used >= total) {
    feedback = `Mükemmel! Tüm kelimeleri (${coverage}) başarıyla kullandın. 🏆`;
  } else if (used >= 2) {
    const names = usedWords.map(w => `"${w.word}"`).join(', ');
    feedback = `Harika! ${names} kelimelerini kullandın (${coverage}). Diğerlerini de eklemeyi dene!`;
  } else {
    feedback = `İyi başlangıç! "${usedWords[0].word}" kelimesini kullandın (${coverage}). Daha fazla kelime kullanmayı dene.`;
  }

  // ── Step 5: structural tips (capitalisation / punctuation reminders) ──────
  const hasPunctuation = /[.!?]$/.test(trimmed);
  const startsCapital  = /^[A-Z]/.test(trimmed);
  const tips: string[] = [];
  if (!hasPunctuation) tips.push('noktalama işareti (. ! ?) eklemeyi');
  if (!startsCapital)  tips.push('büyük harfle başlamayı');
  if (tips.length > 0) feedback += ` 💡 ${tips.join(' ve ')} unutma.`;

  // ── Step 6: cosmetic correction ───────────────────────────────────────────
  const correctedSentence = cosmeticFix(trimmed);

  return { isValid: true, feedback, correctedSentence, usedWords };
}
