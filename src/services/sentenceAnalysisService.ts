/**
 * sentenceAnalysisService.ts
 *
 * Modular AI sentence analysis layer for the Sentence Builder feature.
 *
 * Architecture:
 *   - `analyzeSentence()` is the single public entry point.
 *   - It runs a LOCAL rule-based analyser with 10 ordered grammar-rule categories:
 *       1.  Modal + "to" + infinitive          ("I can to go")
 *       2.  Transitive verb + wrong preposition ("discuss about", "protect to",
 *                                               "considered about")
 *           — all inflected forms caught, not just the base form
 *       3.  3rd-person singular agreement      ("he support", "this system help",
 *                                               "the support team help")
 *           — Pattern B now covers 3-word subjects (det + modifier + noun)
 *       4.  be-verb subject agreement           ("I is", "they is", "he are")
 *       5.  do/does subject-auxiliary agreement ("he don't", "they doesn't",
 *                                               "this decision don't")
 *       6.  Modal + past-participle/-ed form    ("should considered")
 *       7.  Double negation                     ("don't…nobody", "doesn't…nothing")
 *       8.  1st/2nd/plural + 3rd-singular verb  ("I goes", "they makes")
 *       9.  a/an article mismatch               ("a apple", "an book")
 *          — now also catches "A apple" when capitalised at sentence start
 *      10.  Irregular past after "to"/negatives ("to went", "didn't came")
 *      11.  Wrong preposition after "different"  ("different culture with her")
 *   - Fuzzy target-word detection: if the user wrote a near-misspelling of the
 *     target word, a "Bunu mu demek istedin?" hint is returned instead of a
 *     generic "word not found" message.
 *
 * Isolation contract:
 *   - ZERO knowledge of AppContext, wordProgress, SRS, XP, or app state.
 *   - Pure function: same input → same class of output.
 *   - Does NOT modify any app state.
 *
 * Upgrading to real AI:
 *   Replace the body of `analyzeSentence()` with an API call.
 *   The AnalysisInput / AnalysisResult contract and all call-sites stay unchanged.
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
  /** True when the sentence is grammatically acceptable AND uses at least one target word. */
  isValid: boolean;
  /** Human-readable Turkish feedback shown to the user. */
  feedback: string;
  /**
   * A corrected version of the sentence.
   * Populated for high-confidence grammar fixes and for cosmetic issues
   * (capitalisation / punctuation).  Omitted when correction confidence is low.
   */
  correctedSentence?: string;
  /** Subset of selectedWords detected in the sentence. */
  usedWords: Word[];
}

// ─── Layer-1 (local) public types ─────────────────────────────────────────────

export interface LocalAnalysisInput {
  /** The single target word the user is practising. */
  targetWord: string;
  /** The sentence the user typed. */
  sentence: string;
}

export interface LocalAnalysisIssue {
  /** Turkish-language description of the issue. */
  messageTr: string;
  /** 'error' blocks XP; 'suggestion' is advisory only. */
  severity: 'error' | 'suggestion';
}

export interface LocalAnalysisResult {
  /** 'perfect' = word used + no grammar errors; 'fail' = any blocking issue. */
  status: 'perfect' | 'fail';
  /** Whether the target word (or a derived form) was detected in the sentence. */
  usedTargetWord: boolean;
  /**
   * How the target word was matched:
   *   'exact'           — token === targetWord
   *   'family'          — token starts with targetWord (e.g. "increases" ← "increase")
   *   'missing'         — not found
   *   'typo_suspected'  — near-miss (Levenshtein ≤ threshold)
   */
  targetWordMode: 'exact' | 'family' | 'missing' | 'typo_suspected';
  /** 0–100 quality estimate based on local rules. */
  score: number;
  /** Primary Turkish-language feedback shown to the user. */
  feedbackTr: string;
  /** Ordered list of issues (empty = none detected). */
  issues: LocalAnalysisIssue[];
  /** Grammar- and cosmetic-corrected sentence, when available. */
  correctedSentence?: string;
  /** 0–1 confidence in the result. */
  confidence: number;
}

// ─── Rule 1 — modal + "to" + infinitive ───────────────────────────────────────

/**
 * Modal verbs followed by "to + infinitive" — incorrect in English.
 * e.g. "I can to go" → "I can go"
 */
const MODAL_TO_INFINITIVE =
  /\b(can|could|will|would|shall|should|may|might|must)\s+to\s+([a-z]+)\b/gi;

// ─── Rule 2 — transitive verb + wrong preposition ─────────────────────────────

/**
 * Verbs that take a DIRECT object — no preposition between verb and object.
 *
 * Patterns match ALL inflected forms (base / -s / -ed / -ing) so that
 * "discussed about" is caught as reliably as "discuss about".
 * `replacement` uses '$1' to re-insert the captured verb form, preserving tense.
 */
interface WrongPrepRule {
  pattern:     RegExp;
  replacement: string;
  feedback:    string;
}

const WRONG_PREP_RULES: WrongPrepRule[] = [
  {
    pattern:     /\b(protect(?:s|ed|ing)?)\s+to\b/gi,
    replacement: '$1',
    feedback:    '"protect to" hatalı bir kullanım. "Protect" doğrudan nesne alır — araya "to" girmez. Doğru örnek: "I can protect them."',
  },
  {
    pattern:     /\b(contact(?:s|ed|ing)?)\s+to\b/gi,
    replacement: '$1',
    feedback:    '"contact to" hatalı. "Contact" doğrudan nesne alır. Doğru örnek: "I will contact him."',
  },
  {
    pattern:     /\b(discuss(?:es|ed|ing)?)\s+about\b/gi,
    replacement: '$1',
    feedback:    '"discuss(ed) about" hatalı. "Discuss" doğrudan nesne alır, "about" eklenmez. Doğru örnek: "We discussed the problem."',
  },
  {
    pattern:     /\b(consider(?:s|ed|ing)?)\s+about\b/gi,
    replacement: '$1',
    feedback:    '"consider about" hatalı. "Consider" doğrudan nesne alır, "about" eklenmez. Doğru örnek: "We considered the options." veya "We thought about the options."',
  },
  {
    pattern:     /\b(mention(?:s|ed|ing)?)\s+about\b/gi,
    replacement: '$1',
    feedback:    '"mention about" hatalı. "Mention" doğrudan nesne alır. Doğru örnek: "She mentioned it."',
  },
  {
    pattern:     /\b(marr(?:y|ies|ied|ying))\s+with\b/gi,
    replacement: '$1',
    feedback:    '"marry with" hatalı. "Marry" doğrudan nesne alır. Doğru örnek: "He married her."',
  },
  {
    pattern:     /\b(resembl(?:e|es|ed|ing))\s+to\b/gi,
    replacement: '$1',
    feedback:    '"resemble to" hatalı. "Resemble" doğrudan nesne alır. Doğru örnek: "She resembles her mother."',
  },
  {
    pattern:     /\b(approach(?:es|ed|ing)?)\s+to\b/gi,
    replacement: '$1',
    feedback:    '"approach to" hatalı. "Approach" doğrudan nesne alır. Doğru örnek: "He approached the door."',
  },
  {
    pattern:     /\b(reach(?:es|ed|ing)?)\s+to\b/gi,
    replacement: '$1',
    feedback:    '"reach to" hatalı. "Reach" doğrudan nesne alır. Doğru örnek: "We reached the station."',
  },
  {
    pattern:     /\b(enter(?:s|ed|ing)?)\s+to\b/gi,
    replacement: '$1',
    feedback:    '"enter to" hatalı. "Enter" doğrudan nesne alır. Doğru örnek: "She entered the room."',
  },
  {
    pattern:     /\b(explain(?:s|ed|ing)?)\s+about\b/gi,
    replacement: '$1',
    feedback:    '"explain about" hatalı. "Explain" doğrudan nesne alır. Doğru örnek: "He explained the rule."',
  },
  {
    pattern:     /\b(await(?:s|ed|ing)?)\s+for\b/gi,
    replacement: '$1',
    feedback:    '"await for" hatalı. "Await" doğrudan nesne alır. Doğru örnek: "We await your reply."',
  },
  {
    pattern:     /\b(lack(?:s|ed|ing)?)\s+of\b/gi,
    replacement: '$1',
    feedback:    '"lack of" bu bağlamda hatalı. "Lack" doğrudan nesne alır. Doğru örnek: "She lacks confidence."',
  },
  {
    pattern:     /\b(affect(?:s|ed|ing)?)\s+on\b/gi,
    replacement: '$1',
    feedback:    '"affect on" hatalı. "Affect" doğrudan nesne alır — araya "on" girmez. Doğru örnek: "This decision affects everyone."',
  },
  // ── Preposition errors where a specific preposition is always required ────
  {
    // "arrive to the station" → "arrive at the station"
    // "arrive in" (city/country) is also correct but much harder to misuse; we
    // only rewrite "arrive to" which is never standard.
    pattern:     /\b(arriv(?:e|es|ed|ing))\s+to\b/gi,
    replacement: '$1 at',
    feedback:    '"arrive to" hatalı — "arrive" preposition olarak "to" değil "at" (belirli yer için) veya "in" (şehir/ülke için) alır. Doğru örnek: "She arrived at the station."',
  },
  {
    // "interested about science" → "interested in science"
    // Only the adjective form "interested" is flagged; "interesting about" is a valid phrase.
    pattern:     /\binterested\s+about\b/gi,
    replacement: 'interested in',
    feedback:    '"interested about" hatalı — "interested" preposition olarak "in" alır. Doğru örnek: "She is interested in science."',
  },
  {
    // "congratulate you for your success" → "congratulate you on your success"
    pattern:     /\b(congratulat(?:e|es|ed|ing))\s+for\b/gi,
    replacement: '$1 on',
    feedback:    '"congratulate for" hatalı — "congratulate" preposition olarak "on" alır. Doğru örnek: "I congratulate you on your achievement."',
  },
  {
    // "provide/give/offer support on users" → "support for users"
    // Restricts to the multi-word phrase to avoid flagging e.g. "the support on the shelf"
    pattern:     /\b((?:provide|give|offer)(?:s|d|ing)?)\s+support\s+on\b/gi,
    replacement: '$1 support for',
    feedback:    '"support on" hatalı — "provide/give/offer support" sonrasında "on" değil "for" kullanılır. Doğru örnek: "provide support for new users."',
  },
  {
    // "insist for doing it" → "insist on doing it"
    pattern:     /\b(insist(?:s|ed|ing)?)\s+for\b/gi,
    replacement: '$1 on',
    feedback:    '"insist for" hatalı — "insist" preposition olarak "on" alır. Doğru örnek: "She insisted on leaving early."',
  },
  {
    // "consist from/with parts" → "consist of parts"
    pattern:     /\b(consist(?:s|ed|ing)?)\s+(?:from|with|in)\b/gi,
    replacement: '$1 of',
    feedback:    '"consist from/with/in" hatalı — "consist" preposition olarak "of" alır. Doğru örnek: "The team consists of five people."',
  },
  {
    // "cope with" is CORRECT; "cope about/from/for" is not
    pattern:     /\b(cop(?:e|es|ed|ing))\s+(?:about|from|for)\b/gi,
    replacement: '$1 with',
    feedback:    '"cope about/from/for" hatalı — "cope" preposition olarak "with" alır. Doğru örnek: "She coped with the difficulty."',
  },
  {
    // "graduate from university" is correct; "graduate of/in/to" is not
    // Note: "graduate in [subject]" can be valid in British English; we only flag "graduate to"
    pattern:     /\b(graduat(?:e|es|ed|ing))\s+to\b/gi,
    replacement: '$1 from',
    feedback:    '"graduate to" hatalı — "graduate" preposition olarak "from" alır. Doğru örnek: "She graduated from university."',
  },
  {
    // "describe about X" → "describe X"
    pattern:     /\b(describ(?:e|es|ed|ing))\s+about\b/gi,
    replacement: '$1',
    feedback:    '"describe about" hatalı — "describe" doğrudan nesne alır, "about" eklenmez. Doğru: "describe the situation".',
  },
  {
    // "emphasize on/about X" → "emphasize X"
    pattern:     /\b(emphasiz(?:e|es|ed|ing))\s+(?:on|about)\b/gi,
    replacement: '$1',
    feedback:    '"emphasize on/about" hatalı — "emphasize" doğrudan nesne alır. Doğru: "emphasize the importance".',
  },
];

// ─── Rule 3 — 3rd-person singular subject–verb agreement ──────────────────────

/**
 * Common English verb base forms checked for 3rd-person singular agreement.
 *
 * Word-boundary matching (`\b…\b`) ensures "support" never accidentally
 * matches inside "supports", "supported", or "supporting".
 *
 * Irregular 3rd-person forms: have → has, do → does, be → is.
 */
const THIRD_PERSON_VERBS: readonly string[] = [
  // core high-frequency
  'have', 'do', 'say', 'get', 'make', 'go', 'know', 'take', 'see', 'come',
  'think', 'want', 'give', 'use', 'find', 'tell', 'ask', 'seem', 'feel',
  'try', 'leave', 'call', 'keep', 'let', 'begin', 'show', 'hear', 'play',
  'run', 'move', 'live', 'hold', 'bring', 'write', 'mean', 'read', 'spend',
  'grow', 'open', 'walk', 'win', 'sit', 'stand', 'lose', 'pay', 'meet',
  'fall', 'send', 'build', 'stay', 'cut', 'put', 'draw', 'eat', 'choose',
  'lead', 'set', 'look',
  // academic / learner vocabulary
  'support', 'help', 'work', 'need', 'provide', 'include', 'continue',
  'learn', 'change', 'follow', 'stop', 'create', 'speak', 'buy', 'wait',
  'serve', 'expect', 'reach', 'remain', 'suggest', 'raise', 'sell',
  'require', 'report', 'decide', 'pull', 'break', 'wish', 'improve',
  'describe', 'act', 'develop', 'produce', 'add', 'involve', 'enter',
  'count', 'allow', 'start', 'turn', 'cover', 'reduce', 'push', 'operate',
  'check', 'contain', 'achieve', 'record', 'accept', 'control', 'place',
  'receive', 'explain', 'appear', 'become', 'happen', 'cause', 'represent',
  'affect', 'enable', 'protect', 'connect', 'handle', 'manage', 'store',
  'belong', 'depend', 'exist', 'fail', 'form', 'matter', 'perform', 'relate',
  'replace', 'result', 'return', 'reveal', 'solve', 'spread', 'succeed',
  'suffer', 'tend', 'treat', 'understand', 'vary', 'like', 'love', 'consider',
  'remember',
  // common words absent from previous list
  'increase', 'decrease', 'rise', 'drop', 'earn', 'study', 'close', 'apply',
  'complete', 'focus', 'join', 'pass', 'practice', 'refuse', 'save', 'share',
  'teach', 'watch', 'compare', 'damage', 'engage', 'evaluate', 'explore',
  'ignore', 'maintain', 'mention', 'modify', 'obtain', 'predict', 'promote',
  'prove', 'realize', 'recognize', 'reflect', 'remove', 'research', 'respond',
  'review', 'select', 'submit', 'transform', 'verify', 'view', 'combine',
  'measure', 'monitor', 'observe', 'prefer', 'purchase', 'attempt', 'define',
  'demonstrate', 'determine', 'discover', 'confirm', 'test', 'visit', 'warn',
  'claim', 'argue', 'assume', 'note', 'notice', 'propose', 'prepare', 'plan',
  'finish', 'request', 'examine', 'identify', 'extend', 'limit', 'indicate',
  'introduce', 'employ', 'establish',
];

/** Converts a verb base form to its 3rd-person singular present simple form. */
function toThirdPersonSingular(verb: string): string {
  const v = verb.toLowerCase();
  if (v === 'have') return 'has';
  if (v === 'do')   return 'does';
  if (v === 'be')   return 'is';
  if (/(?:s|sh|ch|x|o)$/.test(v)) return v + 'es';
  if (/[^aeiou]y$/.test(v))        return v.slice(0, -1) + 'ies';
  return v + 's';
}

/**
 * Converts a regular past/participle -ed form back to an approximate base form.
 *
 *   tried      → try        (remove -ied, add -y)
 *   stopped    → stop       (doubled final consonant + ed)
 *   considered → consider   (remove -ed)
 *   helped     → help       (remove -ed)
 */
function edToBase(verb: string): string {
  const v = verb.toLowerCase();
  if (v.endsWith('ied'))                         return v.slice(0, -3) + 'y';
  if (/([bcdfghjklmnpqrstvwxz])\1ed$/.test(v))   return v.slice(0, -3);
  if (v.endsWith('ed') && v.length >= 4)          return v.slice(0, -2);
  return v;
}

/**
 * Checks for 3rd-person singular subject–verb agreement errors.
 *
 *   Pattern A — pronoun subject:    "he/she/it" immediately + base-form verb
 *   Pattern B — noun-phrase subject: det + noun + base-form verb + object
 *
 * Pattern B uses a negative lookahead over common compound-noun second elements
 * ("team", "system", "service"…) to prevent false positives on noun phrases.
 */
function _checkThirdPersonSingular(
  sentence: string,
): { feedback: string; corrected: string } | null {
  const verbAlt = [...new Set(THIRD_PERSON_VERBS)].join('|');

  // ── Pattern A: pronoun (he / she / it) + base-form verb ─────────────────
  const pronounRe = new RegExp(`\\b(he|she|it)\\s+(${verbAlt})\\b`, 'i');
  const mA = pronounRe.exec(sentence);
  if (mA) {
    const subj  = mA[1];
    const verb  = mA[2];
    const fixed = toThirdPersonSingular(verb);
    const corrected = sentence.replace(
      new RegExp(`\\b(he|she|it)\\s+(${verb})\\b`, 'gi'),
      (_, s, v) => `${s} ${toThirdPersonSingular(v)}`,
    );
    return {
      feedback:  `"${subj} ${verb}" hatalı — "${subj}" öznesinden sonra fiil 3. tekil şahıs eki almalı. Doğrusu: "${subj} ${fixed}".`,
      corrected: cosmeticFix(corrected) ?? corrected,
    };
  }

  // ── Pattern B: determiner + (optional modifier) + noun + base-form verb ──
  //
  // The optional middle word `(?:\\w+\\s+)?` extends coverage from 2-word
  // subjects ("this system help") to 3-word subjects ("the support team help",
  // "the customer service fail").  The negative lookahead on compound-noun
  // head words still prevents false positives like "the program support team".
  const compoundNounHeads =
    'team|group|system|center|centre|service|staff|network|manager|handler|' +
    'worker|agent|officer|coordinator|specialist|provider|unit|department|' +
    'committee|board|council|operation|process|structure|function|program|' +
    'programme|framework|platform|tool|approach|method|strategy|policy|' +
    'type|level|rate|role|plan|task|mode|phase|stage|step|base|side|line|point';

  const nounPhraseRe = new RegExp(
    `\\b((?:this|that|the|a|an|my|your|his|her|its|our|their|every|each)\\s+(?:\\w+\\s+)?\\w+)` +
    `\\s+(${verbAlt})\\b(?=\\s+(?!(?:${compoundNounHeads})\\b)\\S)`,
    'i',
  );
  const mB = nounPhraseRe.exec(sentence);
  if (mB) {
    const subjectPhrase = mB[1];
    const verb  = mB[2];
    const fixed = toThirdPersonSingular(verb);
    const corrected = sentence.replace(
      new RegExp(
        `(\\b(?:this|that|the|a|an|my|your|his|her|its|our|their|every|each)\\s+(?:\\w+\\s+)?\\w+\\s+)(${verb})\\b`,
        'gi',
      ),
      (_, prefix, v) => `${prefix}${toThirdPersonSingular(v)}`,
    );
    return {
      feedback:  `"${subjectPhrase} ${verb}" hatalı — tekil özne kullandığında fiil 3. tekil şahıs eki almalı. Doğrusu: "${subjectPhrase} ${fixed}".`,
      corrected: cosmeticFix(corrected) ?? corrected,
    };
  }

  return null;
}

// ─── Rule 4 — be-verb subject agreement ───────────────────────────────────────

/**
 * Catches mismatches between the subject pronoun and the form of "be".
 *
 *   I is / I are             → I am
 *   he/she/it am / are       → he/she/it is
 *   we/they/you is / am      → we/they/you are
 *   we/they/you was          → we/they/you were  (past tense)
 *
 * "I were" is intentionally not flagged — valid in the English subjunctive
 * ("If I were you…").
 */
function _checkBeAgreement(
  sentence: string,
): { feedback: string; corrected: string } | null {
  // I + is/are → am
  if (/\bI\s+(?:is|are)\b/i.test(sentence)) {
    const m = /\bI\s+(is|are)\b/i.exec(sentence)!;
    const fixed = sentence.replace(/\bI\s+(?:is|are)\b/gi, 'I am');
    return {
      feedback:  `"I ${m[1]}" hatalı — "I" öznesinden sonra "am" kullanılır. Doğrusu: "I am".`,
      corrected: cosmeticFix(fixed) ?? fixed,
    };
  }
  // he/she/it + am/are → is
  {
    const m = /\b(he|she|it)\s+(am|are)\b/i.exec(sentence);
    if (m) {
      const fixed = sentence.replace(/\b(he|she|it)\s+(?:am|are)\b/gi, (_, s) => `${s} is`);
      return {
        feedback:  `"${m[1]} ${m[2]}" hatalı — "he/she/it" öznesinden sonra "is" kullanılır. Doğrusu: "${m[1]} is".`,
        corrected: cosmeticFix(fixed) ?? fixed,
      };
    }
  }
  // we/they/you + is/am → are
  {
    const m = /\b(we|they|you)\s+(is|am)\b/i.exec(sentence);
    if (m) {
      const fixed = sentence.replace(/\b(we|they|you)\s+(?:is|am)\b/gi, (_, s) => `${s} are`);
      return {
        feedback:  `"${m[1]} ${m[2]}" hatalı — "we/they/you" öznesinden sonra "are" kullanılır. Doğrusu: "${m[1]} are".`,
        corrected: cosmeticFix(fixed) ?? fixed,
      };
    }
  }
  // we/they/you + was → were (past)
  {
    const m = /\b(we|they|you)\s+was\b/i.exec(sentence);
    if (m) {
      const fixed = sentence.replace(/\b(we|they|you)\s+was\b/gi, (_, s) => `${s} were`);
      return {
        feedback:  `"${m[1]} was" hatalı — "we/they/you" geçmiş zamanda "were" alır. Doğrusu: "${m[1]} were".`,
        corrected: cosmeticFix(fixed) ?? fixed,
      };
    }
  }
  return null;
}

// ─── Rule 5 — do/does subject-auxiliary agreement ─────────────────────────────

/**
 * Catches wrong "do/does" auxiliary form for the grammatical subject.
 *
 *   he/she/it + don't                        → he/she/it + doesn't
 *   I / we / they / you + doesn't            → ... + don't
 *   (this|that|every|each) + noun + don't    → ... + doesn't
 *     e.g. "This decision don't affect anybody."
 */
function _checkDoDoesAgreement(
  sentence: string,
): { feedback: string; corrected: string } | null {
  // he/she/it + don't → doesn't
  {
    const m = /\b(he|she|it)\s+don't\b/i.exec(sentence);
    if (m) {
      const fixed = sentence.replace(/\b(he|she|it)\s+don't\b/gi, (_, s) => `${s} doesn't`);
      return {
        feedback:  `"${m[1]} don't" hatalı — "he/she/it" ile "doesn't" kullanılır. Doğrusu: "${m[1]} doesn't".`,
        corrected: cosmeticFix(fixed) ?? fixed,
      };
    }
  }
  // I/we/they/you + doesn't → don't
  {
    const m = /\b(I|we|they|you)\s+doesn't\b/i.exec(sentence);
    if (m) {
      const fixed = sentence.replace(/\b(I|we|they|you)\s+doesn't\b/gi, (_, s) => `${s} don't`);
      return {
        feedback:  `"${m[1]} doesn't" hatalı — "I/we/they/you" ile "don't" kullanılır. Doğrusu: "${m[1]} don't".`,
        corrected: cosmeticFix(fixed) ?? fixed,
      };
    }
  }
  // (this|that|every|each) + noun + don't → doesn't
  {
    const m = /\b(this|that|every|each)\s+\w+\s+don't\b/i.exec(sentence);
    if (m) {
      const fixed = sentence.replace(
        /\b(this|that|every|each)(\s+\w+\s+)don't\b/gi,
        (_, det, mid) => `${det}${mid}doesn't`,
      );
      return {
        feedback:  `Tekil özne kullandıktan sonra "don't" yerine "doesn't" kullanılmalı. Doğrusu: "doesn't".`,
        corrected: cosmeticFix(fixed) ?? fixed,
      };
    }
  }
  return null;
}

// ─── Rule 6 — modal + past-participle / -ed form ──────────────────────────────

/**
 * After a modal verb (can, could, will, would, shall, should, may, might,
 * must) the main verb must be in its base (infinitive) form.
 * Using a regular past/participle -ed form is a common learner error.
 *
 *   "We should considered other options" → "We should consider other options"
 *   "You must completed this task"       → "You must complete this task"
 *
 * Safety notes:
 *   – "should have considered" is correct (perfect modal): "have" sits between
 *     modal and -ed form, breaking the direct-adjacency match.
 *   – "must be noted" is correct (passive): "be" breaks the match similarly.
 *   – `edToBase()` correction is approximate; feedback is the authoritative guide.
 */
function _checkModalWithParticipleForm(
  sentence: string,
): { feedback: string; corrected?: string } | null {
  const modals = 'can|could|will|would|shall|should|may|might|must';
  const re     = new RegExp(`\\b(${modals})\\s+(\\w+ed)\\b`, 'gi');
  re.lastIndex = 0;
  const m      = re.exec(sentence);
  if (!m) return null;

  const modal  = m[1];
  const edForm = m[2];
  const base   = edToBase(edForm);
  if (base === edForm) return null;

  const fixed = sentence.replace(
    new RegExp(`\\b(${modals})\\s+(${edForm})\\b`, 'gi'),
    (_, mod, v) => `${mod} ${edToBase(v)}`,
  );
  return {
    feedback:  `"${modal} ${edForm}" hatalı — modal fiillerden (can, could, should, will…) sonra fiilin sade hali kullanılmalı, geçmiş zaman/ortaç formu değil. Doğrusu: "${modal} ${base}".`,
    corrected: cosmeticFix(fixed) ?? fixed,
  };
}

// ─── Rule 7 — double negation ─────────────────────────────────────────────────

/**
 * English does not permit double negation.
 * Detects sentences that contain a negative auxiliary or adverb AND one of
 * the negative indefinite pronouns (nobody, nothing, nowhere, no one).
 *
 *   "This decision don't affect nobody" → "… doesn't affect anybody"
 *   "She didn't tell nothing"           → "… didn't tell anything"
 *
 * Only the negative pronoun is corrected here; subject-auxiliary agreement
 * (if also wrong) will be caught by Rules 4–5.
 */
function _checkDoubleNegation(
  sentence: string,
): { feedback: string; corrected: string } | null {
  const negTrigger =
    /\b(don't|doesn't|didn't|won't|wouldn't|couldn't|shouldn't|can't|mustn't|never|not)\b/i;
  if (!negTrigger.test(sentence)) return null;

  const negMap: Record<string, string> = {
    nobody:   'anybody',
    nothing:  'anything',
    nowhere:  'anywhere',
    'no one': 'anyone',
  };

  for (const [neg, pos] of Object.entries(negMap)) {
    if (new RegExp(`\\b${neg}\\b`, 'i').test(sentence)) {
      const fixed = sentence.replace(new RegExp(`\\b${neg}\\b`, 'gi'), pos);
      return {
        feedback:  `"${neg}" kullanımı çift olumsuzluk oluşturuyor — İngilizcede bir cümlede iki olumsuz ifade kullanılmaz. "${neg}" yerine "${pos}" kullanılmalı.`,
        corrected: cosmeticFix(fixed) ?? fixed,
      };
    }
  }
  return null;
}

// ─── Rule 8 — 1st / 2nd / plural subject + 3rd-singular inflected verb ────────

/**
 * Mirror of Rule 3: catches sentences where a 1st-person, 2nd-person, or
 * plural subject is paired with a 3rd-person singular verb form.
 *
 *   "I goes to school"   → "I go"
 *   "They makes dinner"  → "They make"
 *   "I has a problem"    → "I have"
 *   "They does the work" → "They do"
 */
function _checkPluralSubjectInflectedVerb(
  sentence: string,
): { feedback: string; corrected: string } | null {
  const inflectedToBase: Record<string, string> = {};
  for (const base of new Set(THIRD_PERSON_VERBS)) {
    inflectedToBase[toThirdPersonSingular(base)] = base;
  }
  const inflectedAlt = Object.keys(inflectedToBase).join('|');

  const re = new RegExp(`\\b(I|we|they|you)\\s+(${inflectedAlt})\\b`, 'i');
  const m  = re.exec(sentence);
  if (!m) return null;

  const subj      = m[1];
  const inflected = m[2].toLowerCase();
  const base      = inflectedToBase[inflected] ?? inflected;

  const corrected = sentence.replace(
    new RegExp(`\\b(I|we|they|you)\\s+(${inflected})\\b`, 'gi'),
    (_, s) => `${s} ${base}`,
  );
  return {
    feedback:  `"${subj} ${inflected}" hatalı — "${subj}" öznesinden sonra fiilin sade (yalın) hali kullanılır. Doğrusu: "${subj} ${base}".`,
    corrected: cosmeticFix(corrected) ?? corrected,
  };
}

// ─── Rule 9 — a / an article mismatch ─────────────────────────────────────────

/**
 * Detects indefinite article misuse:
 *   "a apple"  → "an apple"   (vowel-initial word → "an")
 *   "an book"  → "a book"     (consonant-initial word → "a")
 *
 * Safeguards:
 *   – Only matches words ≥ 3 chars, skips all-uppercase acronyms (USB, EU…).
 *   – "h" words excluded from the "an + consonant" check to avoid flagging
 *     "an hour", "an honest person", "an historic event".
 */
function _checkArticle(
  sentence: string,
): { feedback: string; corrected: string } | null {
  // "a" before vowel-initial word
  // NOTE: `i` flag is required so that "A apple" (capitalised at sentence
  // start) is caught as reliably as lowercase "a apple".
  {
    const re = /\ba\s+([aeiouAEIOU][a-zA-Z]{2,})\b/gi;
    re.lastIndex = 0;
    const m = re.exec(sentence);
    if (m && m[1] !== m[1].toUpperCase()) {
      const fixed = sentence.replace(
        /\ba(\s+)([aeiouAEIOU][a-zA-Z]{2,})\b/gi,
        (_, sp, w) => `an${sp}${w}`,
      );
      return {
        feedback:  `"a ${m[1]}" hatalı — sesli harfle başlayan kelimelerden önce "an" kullanılır. Doğrusu: "an ${m[1]}".`,
        corrected: cosmeticFix(fixed) ?? fixed,
      };
    }
  }
  // "an" before consonant-initial word (h excluded)
  {
    const re = /\ban\s+([bcdfgjklmnpqrstvwxyzBCDFGJKLMNPQRSTVWXYZ][a-zA-Z]{1,})\b/g;
    re.lastIndex = 0;
    const m = re.exec(sentence);
    if (m && m[1] !== m[1].toUpperCase()) {
      const fixed = sentence.replace(
        /\ban(\s+)([bcdfgjklmnpqrstvwxyzBCDFGJKLMNPQRSTVWXYZ][a-zA-Z]{1,})\b/g,
        (_, sp, w) => `a${sp}${w}`,
      );
      return {
        feedback:  `"an ${m[1]}" hatalı — ünsüz harfle başlayan kelimelerden önce "a" kullanılır. Doğrusu: "a ${m[1]}".`,
        corrected: cosmeticFix(fixed) ?? fixed,
      };
    }
  }
  return null;
}

// ─── Rule 10 — irregular past form after "to" / negative auxiliaries ──────────

/**
 * After "to" and after negative/modal auxiliaries, the verb must be in its
 * base (infinitive) form.  Using an irregular past tense form is a common
 * learner error.
 *
 *   "I want to went home"   → "I want to go home"
 *   "She didn't came back"  → "She didn't come back"
 *
 * Only pairs where past ≠ base are included, preventing false positives on
 * verbs like cut, put, let (where past = base = same spelling).
 */
const IRREGULAR_PAST_TO_BASE: Readonly<Record<string, string>> = {
  went: 'go',     ran: 'run',    came: 'come',   made: 'make',
  took: 'take',   gave: 'give',  got: 'get',     saw: 'see',
  knew: 'know',   thought: 'think', found: 'find', told: 'tell',
  kept: 'keep',   brought: 'bring', wrote: 'write', sat: 'sit',
  stood: 'stand', lost: 'lose',  paid: 'pay',    met: 'meet',
  left: 'leave',  fell: 'fall',  built: 'build', chose: 'choose',
  led: 'lead',    ate: 'eat',    meant: 'mean',  won: 'win',
  bought: 'buy',  sent: 'send',  broke: 'break', drew: 'draw',
  spoke: 'speak', spent: 'spend', grew: 'grow',   flew: 'fly',
  threw: 'throw', blew: 'blow',  wore: 'wear',   swam: 'swim',
  sang: 'sing',   rang: 'ring',  drank: 'drink', began: 'begin',
  drove: 'drive', rode: 'ride',  rose: 'rise',   froze: 'freeze',
  held: 'hold',   sold: 'sell',  said: 'say',    heard: 'hear',
  had: 'have',    did: 'do',     was: 'be',      were: 'be',
};

function _checkWrongFormAfterAuxiliary(
  sentence: string,
): { feedback: string; corrected: string } | null {
  const pastAlt  = Object.keys(IRREGULAR_PAST_TO_BASE).join('|');
  const triggers = "to|didn't|don't|doesn't|won't|wouldn't|couldn't|shouldn't|can't|mustn't";

  const re = new RegExp(`\\b(${triggers})\\s+(${pastAlt})\\b`, 'gi');
  re.lastIndex = 0;
  const m = re.exec(sentence);
  if (!m) return null;

  const trigger  = m[1];
  const pastForm = m[2].toLowerCase();
  const baseForm = IRREGULAR_PAST_TO_BASE[pastForm] ?? pastForm;
  if (baseForm === pastForm) return null;

  const fixed = sentence.replace(
    new RegExp(`\\b(${triggers})\\s+(${pastForm})\\b`, 'gi'),
    (_, trig, past) => `${trig} ${IRREGULAR_PAST_TO_BASE[past.toLowerCase()] ?? past}`,
  );
  return {
    feedback:  `"${trigger} ${pastForm}" hatalı — "${trigger}"den sonra fiilin sade (yalın) hali gelir. Doğrusu: "${trigger} ${baseForm}".`,
    corrected: cosmeticFix(fixed) ?? fixed,
  };
}

// ─── Rule 11 — wrong preposition after "different" ────────────────────────────

/**
 * "different [noun] with [personal pronoun]" is a classic learner transfer
 * error; the correct preposition is "from" in English.
 *
 *   "We have different culture with her"   → "different culture FROM her"
 *   "He has a different opinion with me"   → "different opinion FROM me"
 *
 * The pattern is restricted to sentences where the pronoun (him/her/them/us/
 * me/you/it) immediately follows "with", which keeps the rule tight enough to
 * avoid false positives on constructions like "a different approach with X
 * benefits" where "with" introduces a noun phrase, not a comparator.
 *
 * No corrected sentence is produced: the right phrasing often requires a
 * broader restructuring ("We come from different cultures"), so feedback is
 * the authoritative guide.
 */
function _checkDifferentWithPrep(
  sentence: string,
): { feedback: string; corrected?: string } | null {
  const re = /\bdifferent\s+\w+\s+with\s+(?:him|her|them|us|me|you|it)\b/gi;
  if (!re.test(sentence)) return null;
  return {
    feedback: '"different [şey] with [kişi]" hatalı — karşılaştırmalarda "with" değil "from" kullanılır. Doğru örnek: "We have a different culture from her" veya "We come from different cultures."',
  };
}

// ─── Rule 12 — common learner spelling mistakes ───────────────────────────────

/**
 * Curated table of high-confidence misspellings frequently seen in EFL/ESL writing.
 *
 * Design constraints:
 *   • Every entry must be a word whose only plausible meaning in a learner sentence
 *     is the corrected form — zero-ambiguity misspellings only.
 *   • The `replacement` field is the correct spelling (used in `_checkGrammar` output).
 *   • Patterns use `\b` word boundaries and the `gi` flags.
 *
 * This is NOT a one-off special-case per word — it is a data-driven lookup that
 * feeds into the same multi-pass correction pipeline as every other rule.
 */
const COMMON_MISSPELLINGS: readonly WrongPrepRule[] = [
  // ── High-frequency function words / connectors ───────────────────────────
  { pattern: /\bti\b/gi,          replacement: 'to',           feedback: '"ti" yazım hatası — doğrusu "to".' },
  { pattern: /\bevert\b/gi,       replacement: 'every',        feedback: '"evert" yazım hatası — doğrusu "every".' },
  { pattern: /\bevrey\b/gi,       replacement: 'every',        feedback: '"evrey" yazım hatası — doğrusu "every".' },
  { pattern: /\balot\b/gi,        replacement: 'a lot',        feedback: '"alot" tek kelime yazılmaz — doğrusu "a lot".' },
  { pattern: /\bwich\b/gi,        replacement: 'which',        feedback: '"wich" yazım hatası — doğrusu "which".' },
  { pattern: /\bthier\b/gi,       replacement: 'their',        feedback: '"thier" yazım hatası — doğrusu "their".' },
  { pattern: /\buntill\b/gi,      replacement: 'until',        feedback: '"untill" yazım hatası — doğrusu "until".' },
  // ── Conjunctions / discourse markers ─────────────────────────────────────
  { pattern: /\bbecouse\b/gi,     replacement: 'because',      feedback: '"becouse" yazım hatası — doğrusu "because".' },
  { pattern: /\bbecuase\b/gi,     replacement: 'because',      feedback: '"becuase" yazım hatası — doğrusu "because".' },
  { pattern: /\bbecasue\b/gi,     replacement: 'because',      feedback: '"becasue" yazım hatası — doğrusu "because".' },
  { pattern: /\bbeacuse\b/gi,     replacement: 'because',      feedback: '"beacuse" yazım hatası — doğrusu "because".' },
  { pattern: /\baltough\b/gi,     replacement: 'although',     feedback: '"altough" yazım hatası — doğrusu "although".' },
  { pattern: /\balthoug\b/gi,     replacement: 'although',     feedback: '"althoug" yazım hatası — doğrusu "although".' },
  // ── High-frequency content words ─────────────────────────────────────────
  { pattern: /\bpoeple\b/gi,      replacement: 'people',       feedback: '"poeple" yazım hatası — doğrusu "people".' },
  { pattern: /\bpeaple\b/gi,      replacement: 'people',       feedback: '"peaple" yazım hatası — doğrusu "people".' },
  { pattern: /\bpepole\b/gi,      replacement: 'people',       feedback: '"pepole" yazım hatası — doğrusu "people".' },
  { pattern: /\bsocity\b/gi,      replacement: 'society',      feedback: '"socity" yazım hatası — doğrusu "society".' },
  // ── Academic / essay vocabulary ───────────────────────────────────────────
  { pattern: /\bimportent\b/gi,   replacement: 'important',    feedback: '"importent" yazım hatası — doğrusu "important".' },
  { pattern: /\bimporant\b/gi,    replacement: 'important',    feedback: '"imporant" yazım hatası — doğrusu "important".' },
  { pattern: /\benviroment\b/gi,  replacement: 'environment',  feedback: '"enviroment" yazım hatası — doğrusu "environment".' },
  { pattern: /\benviorment\b/gi,  replacement: 'environment',  feedback: '"enviorment" yazım hatası — doğrusu "environment".' },
  { pattern: /\bknolwedge\b/gi,   replacement: 'knowledge',    feedback: '"knolwedge" yazım hatası — doğrusu "knowledge".' },
  { pattern: /\bknowlege\b/gi,    replacement: 'knowledge',    feedback: '"knowlege" yazım hatası — doğrusu "knowledge".' },
  { pattern: /\bseperate\b/gi,    replacement: 'separate',     feedback: '"seperate" yazım hatası — doğrusu "separate".' },
  { pattern: /\bgoverment\b/gi,   replacement: 'government',   feedback: '"goverment" yazım hatası — doğrusu "government".' },
  { pattern: /\bgovernement\b/gi, replacement: 'government',   feedback: '"governement" yazım hatası — doğrusu "government".' },
  { pattern: /\breponsible\b/gi,  replacement: 'responsible',  feedback: '"reponsible" yazım hatası — doğrusu "responsible".' },
  { pattern: /\bresponsibilty\b/gi, replacement: 'responsibility', feedback: '"responsibilty" yazım hatası — doğrusu "responsibility".' },
  { pattern: /\btechnolgy\b/gi,   replacement: 'technology',   feedback: '"technolgy" yazım hatası — doğrusu "technology".' },
  { pattern: /\boppertunity\b/gi, replacement: 'opportunity',  feedback: '"oppertunity" yazım hatası — doğrusu "opportunity".' },
  { pattern: /\bopurtunity\b/gi,  replacement: 'opportunity',  feedback: '"opurtunity" yazım hatası — doğrusu "opportunity".' },
  { pattern: /\bexperiance\b/gi,  replacement: 'experience',   feedback: '"experiance" yazım hatası — doğrusu "experience".' },
  { pattern: /\bcomunication\b/gi, replacement: 'communication', feedback: '"comunication" yazım hatası — doğrusu "communication".' },
  { pattern: /\brecieve\b/gi,     replacement: 'receive',      feedback: '"recieve" yazım hatası — doğrusu "receive".' },
  { pattern: /\bacheive\b/gi,     replacement: 'achieve',      feedback: '"acheive" yazım hatası — doğrusu "achieve".' },
  { pattern: /\bachive\b/gi,      replacement: 'achieve',      feedback: '"achive" yazım hatası — doğrusu "achieve".' },
  { pattern: /\bdefinately\b/gi,  replacement: 'definitely',   feedback: '"definately" yazım hatası — doğrusu "definitely".' },
  { pattern: /\bdefenitely\b/gi,  replacement: 'definitely',   feedback: '"defenitely" yazım hatası — doğrusu "definitely".' },
  { pattern: /\bcareer\b/gi,      replacement: 'career',       feedback: '' }, // already correct — sentinel to ensure no false positive
];

/**
 * Scans `sentence` for common high-confidence misspellings.
 * Checked AFTER all grammar rules so grammar feedback takes priority.
 * Returns the first misspelling found (multi-pass will catch the rest).
 */
function _checkCommonMisspellings(
  sentence: string,
): { feedback: string; corrected: string } | null {
  for (const rule of COMMON_MISSPELLINGS) {
    if (!rule.feedback) continue;          // sentinel entries (already-correct words)
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

// ─── Rule 13 — wrong preposition with group / membership nouns ────────────────

/**
 * In English, membership of a team or group is expressed with "in" (British)
 * or "on" (American), never "at".
 *
 *   "Everyone at the team should contribute."   → "in the team"
 *   "She is a valuable member at our group."    → "in our group"
 *
 * Safeguards:
 *   – Only fires for the two clearly unambiguous nouns: "team" and "group".
 *   – Negative lookahead excludes compounds where "team/group" modifies a
 *     following noun ("at the team meeting", "at the group level").
 *   – Excludes possessives ("at the team's expense") which are structurally
 *     different — "the team's" modifies the next noun, so "at" can be correct.
 */
function _checkGroupMembershipPrep(
  sentence: string,
): { feedback: string; corrected: string } | null {
  // Nouns where "at the X" for membership is always wrong
  const groupNouns = 'team|group';
  // If "team/group" is immediately followed by one of these, "at" may be fine
  // ("at the team meeting", "at the group level", "at the team's ...")
  const safeSuffixes =
    "meeting|level|event|practice|training|session|presentation|" +
    "building|office|room|chat|captain|leader|manager|member|'s";

  const reStr =
    `\\bat\\s+(the|a|an|my|our|your|his|her|its|their)\\s+(${groupNouns})` +
    `\\b(?!\\s+(?:${safeSuffixes})\\b)(?!'s)`;

  const re = new RegExp(reStr, 'gi');
  re.lastIndex = 0;
  const m = re.exec(sentence);
  if (!m) return null;

  const noun = m[2];
  re.lastIndex = 0;
  const fixed = sentence.replace(re, (_, det, n) => `in ${det} ${n}`);
  return {
    feedback:  `"at the ${noun}" hatalı — grup üyeliğini ifade ederken "at" değil "in" kullanılır. Doğru örnek: "She is in the ${noun}".`,
    corrected: cosmeticFix(fixed) ?? fixed,
  };
}

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
 *   – Capitalises the first letter
 *   – Appends a full stop if no terminal punctuation is present
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
 * Computes the Levenshtein edit distance between two strings.
 * Used for near-miss target-word detection.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// ─── Grammar orchestrator ─────────────────────────────────────────────────────

// ─── Rule 14 — invalid "require + to-infinitive" argument structure ──────────

/**
 * Detects active-voice "require + to + [word]" which is invalid English.
 *
 * "require" is transitive: it takes a direct object ("require help") or a
 * "require someone to do something" structure.  Using it with a direct
 * to-infinitive ("require to go", "require to gym") is a structural error.
 *
 * Excluded (valid):
 *   - Passive: "is/are/was/were required to [verb]"   → standard usage
 *   - Passive infinitive: "requires to be [done]"     → "requires to be" skipped
 */
function _checkVerbArgumentErrors(
  sentence: string,
): { feedback: string; corrected?: string } | null {
  // Match "require/requires" + "to" + any word that is NOT "be"
  // (passive infinitive "requires to be done" is valid and excluded).
  const hasActiveRequireTo =
    /\brequires?\s+to\s+(?!be\b)[a-z]/i.test(sentence);
  const isPassive =
    /\b(?:is|are|was|were|be|been)\s+required\s+to\b/i.test(sentence);

  if (hasActiveRequireTo && !isPassive) {
    return {
      feedback:
        '"require to [eylem/nesne]" yapısı İngilizce\'de kullanılmaz. ' +
        '"require" doğrudan nesne alır ("require help", "require attention") ' +
        'ya da "require someone to do something" kalıbı kullanılır.',
      // No auto-correction: the correct restructuring depends on the
      // intended meaning and cannot be determined from the sentence alone.
    };
  }

  return null;
}

// ─── Rule 15 — verb + wrong complement structure (general table) ─────────────

/**
 * Data-driven table of verbs whose complements are structurally restricted.
 *
 * Two categories:
 *
 *   A. Transitive-direct verbs — take a plain noun/pronoun object; inserting
 *      "to" before the object is always wrong.
 *      e.g. "achieve to success" → "achieve success"
 *
 *   B. Gerund-only verbs — complement must be [verb]-ing, not "to + infinitive".
 *      e.g. "enjoy to swimming" → "enjoy swimming"
 *           "avoid to make"     → "avoid make"  (partial fix; still flagged)
 *
 * Replacement always removes the offending "to" so the multi-pass correction
 * loop in _applyAllCorrections can continue fixing any remaining errors.
 *
 * Add new entries here to extend coverage — no other code changes needed.
 */
const VERB_STRUCTURE_RULES: readonly {
  pattern:     RegExp;
  replacement: string;
  feedback:    string;
}[] = [
  // ── Category A: transitive-direct verbs ──────────────────────────────────
  {
    pattern:     /\b(achiev(?:e|es|ed|ing))\s+to\b/gi,
    replacement: '$1',
    feedback:    '"achieve to …" hatalı. "Achieve" doğrudan nesne alır. Doğru: "achieve success", "achieve your goals".',
  },

  // ── Category C: transitive verbs where "to + reflexive pronoun" is wrong ──
  // These verbs take the reflexive pronoun as a *direct object* (no preposition).
  // "develop to myself" → "develop myself", "improve to yourself" → "improve yourself"
  // Excluded on purpose: prove/talk/say/speak/admit/promise (all valid with "to + reflexive").
  {
    pattern: /\b(develop(?:s|ed|ing)?|improve(?:s|d|ing)?|push(?:es|ed|ing)?|challenge(?:s|d|ing)?|train(?:s|ed|ing)?|motivate(?:s|d|ing)?|force(?:s|d|ing)?|build(?:s|ing)?|strengthen(?:s|ed|ing)?|expand(?:s|ed|ing)?|boost(?:s|ed|ing)?|enhance(?:s|d|ing)?)\s+to\s+(myself|yourself|himself|herself|itself|ourselves|yourselves|themselves)\b/gi,
    replacement: '$1 $2',
    feedback: '"[fiil] to [zamir]" yapısı hatalı — bu fiil doğrudan nesne alır, arasına "to" girmez. Doğru: "[fiil] [zamir]" (örn. "develop myself", "improve yourself", "push yourself").',
  },

  // ── Category B: gerund-only verbs ─────────────────────────────────────────
  {
    pattern:     /\b(enjoy(?:s|ed|ing)?)\s+to\s+/gi,
    replacement: '$1 ',
    feedback:    '"enjoy to …" hatalı. "Enjoy" gerund (fiil+-ing) alır. Doğru: "enjoy swimming", "enjoy reading".',
  },
  {
    pattern:     /\b(avoid(?:s|ed|ing)?)\s+to\s+/gi,
    replacement: '$1 ',
    feedback:    '"avoid to …" hatalı. "Avoid" gerund alır. Doğru: "avoid making mistakes", "avoid eating junk food".',
  },
  {
    pattern:     /\b(finish(?:es|ed|ing)?)\s+to\s+/gi,
    replacement: '$1 ',
    feedback:    '"finish to …" hatalı. "Finish" gerund alır. Doğru: "finish working", "finish reading the book".',
  },
  {
    pattern:     /\b(miss(?:es|ed|ing)?)\s+to\s+/gi,
    replacement: '$1 ',
    feedback:    '"miss to …" hatalı. "Miss" gerund alır. Doğru: "miss seeing you", "miss going there".',
  },
  {
    // "imagine to be" is excluded — "imagine to be" can appear in valid passive
    // constructions; only flag "imagine to [non-be word]".
    pattern:     /\b(imagine(?:s|d|ing)?)\s+to\s+(?!be\b)/gi,
    replacement: '$1 ',
    feedback:    '"imagine to …" hatalı. "Imagine" gerund alır. Doğru: "imagine doing", "imagine living there".',
  },
  {
    pattern:     /\b(risk(?:s|ed|ing)?)\s+to\s+/gi,
    replacement: '$1 ',
    feedback:    '"risk to …" hatalı. "Risk" gerund alır. Doğru: "risk losing", "risk making a mistake".',
  },
  {
    pattern:     /\b(deny|denies|denied|denying)\s+to\s+/gi,
    replacement: '$1 ',
    feedback:    '"deny to …" hatalı. "Deny" gerund alır. Doğru: "deny doing", "deny having taken it".',
  },
  {
    pattern:     /\b(practis(?:e|es|ed|ing)|practic(?:e|es|ed|ing))\s+to\s+/gi,
    replacement: '$1 ',
    feedback:    '"practise/practice to …" hatalı. Bu fiiller gerund alır. Doğru: "practise speaking", "practice writing".',
  },
  // ── Category B continued ──────────────────────────────────────────────────
  {
    pattern:     /\b(postpone(?:s|d|ing)?)\s+to\s+/gi,
    replacement: '$1 ',
    feedback:    '"postpone to …" hatalı. "Postpone" gerund alır. Doğru: "postpone doing", "postpone making the decision".',
  },
  {
    pattern:     /\b(delay(?:s|ed|ing)?)\s+to\s+/gi,
    replacement: '$1 ',
    feedback:    '"delay to …" hatalı. "Delay" gerund alır. Doğru: "delay doing", "delay starting".',
  },
  {
    // Exclude indirect-object use: "recommend to him/her/them/us/me/you/it"
    // and determiner-led noun phrases: "recommend to the/a/an/their…"
    pattern:     /\b(recommend(?:s|ed|ing)?)\s+to\s+(?!him\b|her\b|them\b|us\b|me\b|you\b|it\b|the\b|a\b|an\b|my\b|your\b|his\b|our\b|their\b|this\b|that\b)/gi,
    replacement: '$1 ',
    feedback:    '"recommend to [eylem]" hatalı. "Recommend" gerund veya "that" cümlesi alır. Doğru: "recommend doing", "recommend going".',
  },
  {
    // Exclude indirect-object use: "suggest to him/her/them/us/me/you/it"
    // and determiner-led noun phrases: "suggest to the/a/an/their…"
    pattern:     /\b(suggest(?:s|ed|ing)?)\s+to\s+(?!him\b|her\b|them\b|us\b|me\b|you\b|it\b|the\b|a\b|an\b|my\b|your\b|his\b|our\b|their\b|this\b|that\b)/gi,
    replacement: '$1 ',
    feedback:    '"suggest to [eylem]" hatalı. "Suggest" gerund veya "that" cümlesi alır. Doğru: "suggest going", "suggest doing it".',
  },
  {
    // Exclude "consider X to be Y" and "consider X to have done Y" (valid constructions)
    pattern:     /\b(consider(?:s|ed|ing)?)\s+to\s+(?!be\b|have\b)/gi,
    replacement: '$1 ',
    feedback:    '"consider to [eylem]" hatalı. "Consider" gerund alır. Doğru: "consider doing", "consider starting a new project".',
  },
  {
    pattern:     /\b(dislik(?:e|es|ed|ing))\s+to\s+/gi,
    replacement: '$1 ',
    feedback:    '"dislike to …" hatalı. "Dislike" gerund alır. Doğru: "dislike doing", "dislike working late".',
  },
  {
    pattern:     /\b(quit(?:s|ted|ting)?)\s+to\s+/gi,
    replacement: '$1 ',
    feedback:    '"quit to …" hatalı. "Quit" gerund alır. Doğru: "quit doing", "quit smoking".',
  },
  {
    pattern:     /\b(mind(?:s|ed|ing)?)\s+to\s+/gi,
    replacement: '$1 ',
    feedback:    '"mind to …" hatalı. "Mind" gerund alır. Doğru: "Do you mind opening the window?", "I don\'t mind helping".',
  },
];

/**
 * Checks the sentence against the VERB_STRUCTURE_RULES table.
 * Returns the first matching rule's error, or null when no errors are found.
 */
function _checkVerbStructure(
  sentence: string,
): { feedback: string; corrected: string } | null {
  for (const rule of VERB_STRUCTURE_RULES) {
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

// ─── Rule 16 — gerund-requiring preposition constructions ────────────────────

/**
 * Many English adjective/verb + preposition constructions require a gerund
 * (-ing form) after the preposition.  Turkish EFL learners frequently use the
 * base verb form instead.
 *
 *   "interested in learn"    → "interested in learning"
 *   "good at swim"           → "good at swimming"
 *   "responsible for manage" → "responsible for managing"
 *   "instead of go"          → "instead of going"
 *   "without ask permission" → "without asking permission"
 *   "look forward to see"    → "look forward to seeing"
 *
 * Strategy:
 *   Each trigger is a preposition or adjective+preposition phrase.  After the
 *   trigger, if the next word is a member of GERUND_CHECK_VERBS (a curated set
 *   of unambiguously verbal base forms) AND does not already end in -ing, the
 *   rule fires and auto-corrects by converting the base form to its gerund.
 *
 *   GERUND_CHECK_VERBS deliberately excludes words that are also common nouns
 *   after these prepositions ("work", "support", "help", "care", "control") to
 *   keep the false-positive rate near zero.
 */
const GERUND_CHECK_VERBS: ReadonlySet<string> = new Set([
  // Core action verbs — unambiguously verbal after gerund-requiring prepositions
  'go', 'do', 'see', 'ask', 'try', 'pay', 'say',
  'come', 'run', 'eat', 'drink', 'sleep', 'walk', 'swim', 'fly', 'drive',
  'wait', 'read', 'write', 'speak', 'listen', 'learn', 'study', 'teach',
  'understand', 'explain', 'describe', 'discuss', 'argue', 'decide', 'choose',
  'apply', 'achieve', 'improve', 'develop', 'grow', 'build', 'create', 'solve',
  'manage', 'produce', 'perform', 'analyze', 'evaluate', 'demonstrate',
  'implement', 'organize', 'prepare', 'present', 'communicate', 'negotiate',
  'collaborate', 'participate', 'contribute', 'interact', 'engage', 'compete',
  'succeed', 'fail', 'progress', 'increase', 'decrease', 'reduce', 'maintain',
  'complete', 'finish', 'start', 'begin', 'continue', 'repeat', 'practice',
  'practise', 'explore', 'discover', 'identify', 'define', 'compare', 'connect',
  'share', 'join', 'meet', 'visit', 'lead', 'follow', 'respond', 'adapt',
  'overcome', 'handle', 'express', 'focus', 'think', 'remember', 'move',
  'travel', 'translate', 'pronounce', 'review', 'measure', 'monitor',
  'receive', 'send',
]);

/**
 * Converts a verb base form to its simple gerund (-ing) form.
 * CVC doubling is applied only for short words (≤ 4 chars) to avoid
 * incorrectly doubling longer words like "develop" → "developping".
 */
function _toSimpleGerund(verb: string): string {
  const v = verb.toLowerCase();
  if (v.endsWith('ie'))  return v.slice(0, -2) + 'ying';
  if (v.endsWith('e') && v.length > 2 && !v.endsWith('ee') && !v.endsWith('oe'))
    return v.slice(0, -1) + 'ing';
  if (v.length <= 4 && /[^aeiou][aeiou][bcdfghjklmnpqrstvz]$/.test(v))
    return v + v.slice(-1) + 'ing';
  return v + 'ing';
}

interface PrepGerundTrigger {
  pattern:    RegExp;
  /** Called with (triggerPhrase, baseVerb) — both already lowercased. */
  feedbackFn: (triggerPhrase: string, verb: string) => string;
}

const PREP_GERUND_TRIGGERS: readonly PrepGerundTrigger[] = [
  {
    // "interested in learn" → "interested in learning"
    pattern:    /\b(interested\s+in)\s+([a-z]{2,})\b/gi,
    feedbackFn: (t, v) =>
      `"${t} ${v}" hatalı — "${t}" sonrasında gerund (-ing) gelir. Doğru: "${t} ${_toSimpleGerund(v)}".`,
  },
  {
    // "good/bad/great/terrible/skilled/talented/experienced at [verb]"
    pattern:    /\b((?:good|bad|great|terrible|skilled|talented|experienced)\s+at)\s+([a-z]{2,})\b/gi,
    feedbackFn: (t, v) =>
      `"${t} ${v}" hatalı — "at" sonrasında gerund (-ing) gelir. Doğru: "${t} ${_toSimpleGerund(v)}".`,
  },
  {
    // "responsible/famous/known/criticized/rewarded/punished/blamed for [verb]"
    pattern:    /\b((?:responsible|famous|known|criticized|rewarded|punished|blamed)\s+for)\s+([a-z]{2,})\b/gi,
    feedbackFn: (t, v) =>
      `"${t} ${v}" hatalı — "for" sonrasında gerund (-ing) gelir. Doğru: "${t} ${_toSimpleGerund(v)}".`,
  },
  {
    // "tired/sick/afraid/scared/capable/incapable/proud/ashamed/fond of [verb]"
    pattern:    /\b((?:tired|sick|afraid|scared|capable|incapable|proud|ashamed|fond)\s+of)\s+([a-z]{2,})\b/gi,
    feedbackFn: (t, v) =>
      `"${t} ${v}" hatalı — "of" sonrasında gerund (-ing) gelir. Doğru: "${t} ${_toSimpleGerund(v)}".`,
  },
  {
    // "instead of [verb]"
    pattern:    /\b(instead\s+of)\s+([a-z]{2,})\b/gi,
    feedbackFn: (t, v) =>
      `"${t} ${v}" hatalı — "instead of" sonrasında gerund (-ing) gelir. Doğru: "${t} ${_toSimpleGerund(v)}".`,
  },
  {
    // "without [verb]" — GERUND_CHECK_VERBS excludes common nouns like "help", "support"
    pattern:    /\b(without)\s+([a-z]{2,})\b/gi,
    feedbackFn: (t, v) =>
      `"without ${v}" hatalı — "without" sonrasında gerund (-ing) gelir. Doğru: "without ${_toSimpleGerund(v)}".`,
  },
  {
    // "before/after [verb]" — GERUND_CHECK_VERBS excludes time nouns like "work", "class"
    pattern:    /\b(before|after)\s+([a-z]{2,})\b/gi,
    feedbackFn: (t, v) =>
      `"${t} ${v}" yapısında gerund (-ing) kullanılmalı. Doğru: "${t} ${_toSimpleGerund(v)}".`,
  },
  {
    // "look(ing/s/ed) forward to [verb]" — always requires gerund, never infinitive
    pattern:    /\b(look(?:ing|s|ed)?\s+forward\s+to)\s+([a-z]{2,})\b/gi,
    feedbackFn: (t, v) =>
      `"${t} ${v}" hatalı — "look forward to" sonrasında gerund (-ing) gelir. Doğru: "${t} ${_toSimpleGerund(v)}".`,
  },
  {
    // "am/is/are/was/were/be/been used to [verb]" — "be used to" requires gerund
    // (distinct from habitual-past "used to + base verb", which has no "be" preceding)
    pattern:    /\b((?:am|is|are|was|were|be|been)\s+used\s+to)\s+([a-z]{2,})\b/gi,
    feedbackFn: (t, v) =>
      `"${t} ${v}" hatalı — "be used to" sonrasında gerund (-ing) gelir. Doğru: "${t} ${_toSimpleGerund(v)}".`,
  },
];

/**
 * Checks the sentence against PREP_GERUND_TRIGGERS.
 * Fires when a known base-form verb (from GERUND_CHECK_VERBS) follows a
 * gerund-requiring preposition phrase and the verb is NOT already in -ing form.
 * Returns null when no error is found.
 */
function _checkPrepGerundErrors(
  sentence: string,
): { feedback: string; corrected: string } | null {
  for (const trigger of PREP_GERUND_TRIGGERS) {
    trigger.pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    // Use exec loop so multiple occurrences are tried; first base-verb match wins.
    while ((m = trigger.pattern.exec(sentence)) !== null) {
      const candidateWord = m[2].toLowerCase();
      if (GERUND_CHECK_VERBS.has(candidateWord) && !candidateWord.endsWith('ing')) {
        const gerund    = _toSimpleGerund(candidateWord);
        const feedback  = trigger.feedbackFn(m[1].toLowerCase(), candidateWord);
        // Replace just the base verb with its gerund, preserving everything else.
        const corrected =
          sentence.slice(0, m.index + m[0].length - m[2].length) +
          gerund +
          sentence.slice(m.index + m[0].length);
        return { feedback, corrected: cosmeticFix(corrected) ?? corrected };
      }
    }
  }
  return null;
}

/**
 * Runs all grammar-rule checks against `sentence` in priority order.
 * Returns the first error found, or null when no errors are detected.
 *
 * `corrected` is optional: omitted when correction confidence is low (Rule 11).
 */
function _checkGrammar(
  sentence: string,
): { feedback: string; corrected?: string } | null {

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

  // ── Rule 3: 3rd-person singular subject–verb agreement ───────────────────
  const r3 = _checkThirdPersonSingular(sentence);
  if (r3) return r3;

  // ── Rule 4: be-verb subject agreement ────────────────────────────────────
  const r4 = _checkBeAgreement(sentence);
  if (r4) return r4;

  // ── Rule 5: do/does subject-auxiliary agreement ───────────────────────────
  const r5 = _checkDoDoesAgreement(sentence);
  if (r5) return r5;

  // ── Rule 6: modal + past-participle / -ed form ────────────────────────────
  const r6 = _checkModalWithParticipleForm(sentence);
  if (r6) return r6;

  // ── Rule 7: double negation ───────────────────────────────────────────────
  const r7 = _checkDoubleNegation(sentence);
  if (r7) return r7;

  // ── Rule 8: 1st/2nd/plural subject + 3rd-singular verb form ──────────────
  const r8 = _checkPluralSubjectInflectedVerb(sentence);
  if (r8) return r8;

  // ── Rule 9: a / an article mismatch ──────────────────────────────────────
  const r9 = _checkArticle(sentence);
  if (r9) return r9;

  // ── Rule 10: irregular past form after "to" / negative auxiliaries ────────
  const r10 = _checkWrongFormAfterAuxiliary(sentence);
  if (r10) return r10;

  // ── Rule 11: wrong preposition after "different" ──────────────────────────
  const r11 = _checkDifferentWithPrep(sentence);
  if (r11) return r11;

  // ── Rule 12: common learner misspellings ──────────────────────────────────
  const r12 = _checkCommonMisspellings(sentence);
  if (r12) return r12;

  // ── Rule 13: wrong preposition with group-membership nouns ────────────────
  const r13 = _checkGroupMembershipPrep(sentence);
  if (r13) return r13;

  // ── Rule 14: invalid "require + to-infinitive" argument structure ─────────
  const r14 = _checkVerbArgumentErrors(sentence);
  if (r14) return r14;

  // ── Rule 15: verb + wrong complement structure ────────────────────────────
  const r15 = _checkVerbStructure(sentence);
  if (r15) return r15;

  // ── Rule 16: gerund-requiring preposition constructions ───────────────────
  const r16 = _checkPrepGerundErrors(sentence);
  if (r16) return r16;

  return null;
}

// ─── Multi-pass correction ────────────────────────────────────────────────────

/**
 * Applies grammar corrections iteratively until no more rules fire or the
 * safety limit is reached.
 *
 * Problem this solves:
 *   `_checkGrammar` returns on the FIRST error found.  A sentence may contain
 *   more than one independent grammar error (e.g. a wrong preposition AND a
 *   subject-verb agreement error).  Running only one pass leaves the corrected
 *   sentence partially fixed.
 *
 *   Example:
 *     "This decision affect on everyone in the company"
 *     Pass 1 — Rule 2 fires: removes "on"  → "This decision affect everyone …"
 *     Pass 2 — Rule 3 fires: fixes verb    → "This decision affects everyone …"
 *     Pass 3 — no more errors               → done ✓
 *
 * Termination guarantees:
 *   • Loop exits when `_checkGrammar` returns null (no errors).
 *   • Loop exits when the rule returns no `corrected` string (Rule 11 —
 *     restructuring required, no automatic fix possible).
 *   • Loop exits when a pass produces no net change (safety against cycles).
 *   • Hard cap of `MAX_CORRECTION_PASSES` iterations.
 *
 * Returns the fully corrected sentence, or `undefined` when the original
 * sentence had no detectable errors (caller should not show a correction box).
 */
const MAX_CORRECTION_PASSES = 5;

function _applyAllCorrections(sentence: string): string | undefined {
  let current = sentence;
  let changed = false;

  for (let pass = 0; pass < MAX_CORRECTION_PASSES; pass++) {
    const error = _checkGrammar(current);
    if (!error) break;                       // no more errors — fully corrected
    if (!error.corrected) break;             // rule can't auto-fix (e.g. Rule 11)
    if (error.corrected === current) break;  // safety: fix produced no net change
    current = error.corrected;
    changed = true;
  }

  return changed ? current : undefined;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Analyses a user sentence against a set of target words.
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

  // ── Step 1: detect target-word usage ─────────────────────────────────────
  const usedWords = detectUsedWords(selectedWords, trimmed);

  if (usedWords.length === 0) {
    // Fuzzy match: check whether any target word was nearly typed (misspelling)
    const sentenceTokens = trimmed
      .toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .split(/\s+/)
      .filter(Boolean);

    for (const target of selectedWords) {
      const targetLower = target.word.toLowerCase();
      // threshold: ≤1 for short words, ≤2 for medium, ≤3 for long
      const threshold   = targetLower.length >= 8 ? 3 : targetLower.length >= 4 ? 2 : 1;
      for (const token of sentenceTokens) {
        const dist = levenshtein(targetLower, token);
        if (dist > 0 && dist <= threshold) {
          return {
            isValid:  false,
            feedback: `Bunu mu demek istedin: "${target.word}"? Hedef kelimeyi doğru yazdığından emin ol.`,
            usedWords: [],
          };
        }
      }
    }

    // No fuzzy match — target word genuinely absent
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
  const grammarError = _checkGrammar(trimmed);
  if (grammarError) {
    return {
      isValid:           false,
      feedback:          grammarError.feedback,
      correctedSentence: _applyAllCorrections(trimmed) ?? grammarError.corrected,
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

// ─── Layer-1 public entry point ───────────────────────────────────────────────

/**
 * Synchronous local analysis for a single target word.
 *
 * Runs all 11 grammar rules + fuzzy target-word detection.
 * Returns `LocalAnalysisResult` — always returns, never throws.
 *
 * Call this from SentenceBuilderScreen instead of the legacy
 * `analyzeSentence()`.  The legacy function remains for backward compatibility.
 */
export function analyzeSentenceLocal(input: LocalAnalysisInput): LocalAnalysisResult {
  try {
    return _localAnalyze(input);
  } catch {
    return {
      status:          'perfect',
      usedTargetWord:  true,
      targetWordMode:  'exact',
      score:           50,
      feedbackTr:      'Cümlen kaydedildi. Devam et! ✅',
      issues:          [],
      confidence:      0.5,
    };
  }
}

function _localAnalyze({ targetWord, sentence }: LocalAnalysisInput): LocalAnalysisResult {
  const trimmed = sentence.trim();

  // ── Guard: empty input ────────────────────────────────────────────────────
  if (!trimmed) {
    return {
      status:         'fail',
      usedTargetWord: false,
      targetWordMode: 'missing',
      score:          0,
      feedbackTr:     'Bir cümle yazmalısın.',
      issues:         [{ messageTr: 'Cümle boş.', severity: 'error' }],
      confidence:     1,
    };
  }

  // ── Step 1: target-word detection ────────────────────────────────────────
  const targetLower = targetWord.toLowerCase().trim();
  const tokens = trimmed
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);

  let usedTargetWord = false;
  let targetWordMode: LocalAnalysisResult['targetWordMode'] = 'missing';

  if (tokens.some(t => t === targetLower)) {
    usedTargetWord = true;
    targetWordMode = 'exact';
  } else if (tokens.some(t => t.startsWith(targetLower) && t !== targetLower)) {
    // word-family match: "increases" satisfies target "increase"
    usedTargetWord = true;
    targetWordMode = 'family';
  } else {
    // fuzzy / typo check
    const threshold = targetLower.length >= 8 ? 3 : targetLower.length >= 4 ? 2 : 1;
    const hasClose  = tokens.some(t => {
      const d = levenshtein(targetLower, t);
      return d > 0 && d <= threshold;
    });
    if (hasClose) targetWordMode = 'typo_suspected';
    // else stays 'missing'
  }

  if (!usedTargetWord) {
    const messageTr = targetWordMode === 'typo_suspected'
      ? `Bunu mu demek istedin: "${targetWord}"? Hedef kelimeyi doğru yazdığından emin ol.`
      : `"${targetWord}" kelimesi cümlede kullanılmamış.`;
    return {
      status:         'fail',
      usedTargetWord: false,
      targetWordMode,
      score:          15,
      feedbackTr:     messageTr,
      issues:         [{ messageTr, severity: 'error' }],
      confidence:     0.95,
    };
  }

  // ── Step 2: minimum sentence length ──────────────────────────────────────
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  if (wordCount < 4) {
    const msg = 'Cümle çok kısa. En az 4–5 kelimeden oluşan tam bir cümle yaz.';
    return {
      status:         'fail',
      usedTargetWord: true,
      targetWordMode,
      score:          20,
      feedbackTr:     msg,
      issues:         [{ messageTr: 'Cümle çok kısa — en az 4 kelime gerekli.', severity: 'error' }],
      confidence:     1,
    };
  }

  // ── Step 3: grammar error detection ──────────────────────────────────────
  const grammarError = _checkGrammar(trimmed);
  if (grammarError) {
    // Apply ALL detectable corrections in multiple passes so the corrected
    // sentence reflects every rule that fires — not just the first one.
    // e.g. "affect on everyone" → (Rule 2) → "affect everyone"
    //                           → (Rule 3) → "affects everyone"  ← final
    const fullyCorrected = _applyAllCorrections(trimmed);
    return {
      status:            'fail',
      usedTargetWord:    true,
      targetWordMode,
      score:             35,
      feedbackTr:        grammarError.feedback,
      issues:            [{ messageTr: grammarError.feedback, severity: 'error' }],
      correctedSentence: fullyCorrected ?? grammarError.corrected,
      confidence:        0.9,
    };
  }

  // ── Step 4: cosmetic suggestions (non-blocking) ───────────────────────────
  const hasPunct   = /[.!?]$/.test(trimmed);
  const hasCap     = /^[A-Z]/.test(trimmed);
  const suggestions: LocalAnalysisIssue[] = [];
  if (!hasPunct) suggestions.push({ messageTr: 'Cümle sonu noktalama işareti (. ? !) eklenmeli.', severity: 'suggestion' });
  if (!hasCap)   suggestions.push({ messageTr: 'Cümle büyük harfle başlamalıdır.', severity: 'suggestion' });

  // ── Step 5: score ─────────────────────────────────────────────────────────
  let score = 70;
  if (hasPunct)       score += 10;
  if (hasCap)         score += 5;
  if (wordCount >= 6) score += 8;
  if (wordCount >= 8) score += 7;
  score = Math.min(100, score);

  // ── Step 6: feedback ──────────────────────────────────────────────────────
  let feedbackTr = `Mükemmel! "${targetWord}" kelimesini başarıyla kullandın. 🏆`;
  if (suggestions.length > 0) {
    const tips: string[] = [];
    if (!hasPunct) tips.push('noktalama işareti (. ! ?) eklemeyi');
    if (!hasCap)   tips.push('büyük harfle başlamayı');
    feedbackTr += ` 💡 ${tips.join(' ve ')} unutma.`;
  }

  return {
    status:            'perfect',
    usedTargetWord:    true,
    targetWordMode,
    score,
    feedbackTr,
    issues:            suggestions,
    correctedSentence: cosmeticFix(trimmed),
    confidence:        0.85,
  };
}
