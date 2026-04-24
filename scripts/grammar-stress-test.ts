/**
 * grammar-stress-test.ts
 *
 * Standalone stress-test harness for the Sentence Builder local grammar engine.
 *
 * Entry point: analyzeSentenceLocal() from sentenceAnalysisService.ts
 * Runner:      tsx scripts/grammar-stress-test.ts
 *
 * Output:
 *   - Total pass / fail counts
 *   - Category breakdown
 *   - CRITICAL: wrong sentences that passed (false negatives)
 *   - Unexpected failures on correct sentences (false positives)
 *   - Coverage gap summary
 */

import { analyzeSentenceLocal } from '../src/services/sentenceAnalysisService';

// ─── Test case type ────────────────────────────────────────────────────────────

interface TestCase {
  id:                    number;
  category:              string;
  targetWord:            string;
  sentence:              string;
  expectedStatus:        'perfect' | 'fail';
  shouldAwardXp:         boolean;  // true = expects XP (perfect), false = no XP (fail)
  note:                  string;
  expectedIssueContains?: string;  // partial Turkish string expected in issues
  expectNoCorrection?:   boolean;  // true = correction should NOT be shown
  knownLimit?:           boolean;  // true = known local-rule hard limit; shown in report but does NOT block push
}

// ─── Test matrix ──────────────────────────────────────────────────────────────

const TEST_CASES: TestCase[] = [

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 1: be + bare verb
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 1, category: 'be+bare',
    targetWord: 'support', sentence: 'I am support the team.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'am + bare verb — classic structural error',
  },
  {
    id: 2, category: 'be+bare',
    targetWord: 'increase', sentence: 'The price is increase every year.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'is + bare verb',
  },
  {
    id: 3, category: 'be+bare',
    targetWord: 'provide', sentence: 'They are provide good services.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'are + bare verb',
  },
  {
    id: 4, category: 'be+bare',
    targetWord: 'achieve', sentence: 'She was achieve her goals quickly.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'was + bare verb',
  },
  {
    id: 5, category: 'be+bare',
    targetWord: 'support', sentence: 'I am supporting the team.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — am + gerund is valid progressive',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 2: have/has/had + base verb
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 6, category: 'have+base',
    targetWord: 'improve', sentence: 'I have improve my skills recently.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'have + bare verb — missing past participle',
  },
  {
    id: 7, category: 'have+base',
    targetWord: 'provide', sentence: 'She has provide excellent support.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'has + bare verb',
  },
  {
    id: 8, category: 'have+base',
    targetWord: 'achieve', sentence: 'We had achieve our targets last year.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'had + bare verb',
  },
  {
    id: 9, category: 'have+base',
    targetWord: 'improve', sentence: 'I have improved my skills recently.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — have + past participle',
  },
  {
    id: 10, category: 'have+base',
    targetWord: 'achieve', sentence: 'She has achieved great results.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — has + past participle',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 3: do/does/did + regular -ed
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 11, category: 'do+ed',
    targetWord: 'achieve', sentence: 'I did achieved my goals yesterday.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'did + regular -ed — double past marking',
  },
  {
    id: 12, category: 'do+ed',
    targetWord: 'support', sentence: 'She does supported the project well.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'does + -ed form',
  },
  {
    id: 13, category: 'do+ed',
    targetWord: 'provide', sentence: 'They do provided good meals.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'do + -ed form',
  },
  {
    id: 14, category: 'do+ed',
    targetWord: 'achieve', sentence: 'I did achieve my goals yesterday.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — did + base form (emphatic)',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 4: do/does/did + irregular past
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 15, category: 'do+irregular',
    targetWord: 'achieve', sentence: 'I did went to achieve my dreams.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'did + irregular past form (went)',
  },
  {
    id: 16, category: 'do+irregular',
    targetWord: 'support', sentence: 'She didn\'t came to support us.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'didn\'t + irregular past',
  },
  {
    id: 17, category: 'do+irregular',
    targetWord: 'provide', sentence: 'They don\'t provide enough support.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — don\'t + base form',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 5: double auxiliary collision
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 18, category: 'double-aux',
    targetWord: 'achieve', sentence: 'I did was achieve something great.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'did + was — double aux',
  },
  {
    id: 19, category: 'double-aux',
    targetWord: 'support', sentence: 'She is did support the idea.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'is + did — double aux',
  },
  {
    id: 20, category: 'double-aux',
    targetWord: 'improve', sentence: 'They can did improve the system.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'can + did — double aux collision',
  },
  {
    id: 21, category: 'double-aux',
    targetWord: 'achieve', sentence: 'She will have achieved it by then.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — will + have + past participle (future perfect)',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 6: adjacent verb + auxiliary collision (new guard)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 22, category: 'adj-verb-aux',
    targetWord: 'provide', sentence: 'Can you provide is benefit to us.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'provide + is — adjacent verb-aux collision',
    expectNoCorrection: true,
  },
  {
    id: 23, category: 'adj-verb-aux',
    targetWord: 'achieve', sentence: 'She achieve can do great things.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'achieve + can — adjacent collision',
    expectNoCorrection: true,
  },
  {
    id: 24, category: 'adj-verb-aux',
    targetWord: 'support', sentence: 'I support will help everyone.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'support + will — adjacent verb-aux collision',
    expectNoCorrection: true,
  },
  {
    id: 25, category: 'adj-verb-aux',
    targetWord: 'manage', sentence: 'She manage was the difficult project.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'manage + was — adjacent collision',
    expectNoCorrection: true,
  },
  {
    id: 26, category: 'adj-verb-aux',
    targetWord: 'provide', sentence: 'She provides excellent support to everyone.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — no collision, 3rd-person form',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 7: no finite verb / noun phrase fragment
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 27, category: 'no-finite-verb',
    targetWord: 'support', sentence: 'A very important support for students everywhere.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'Pure noun phrase — no finite verb',
    expectNoCorrection: true,
  },
  {
    id: 28, category: 'no-finite-verb',
    targetWord: 'increase', sentence: 'Beautiful increase in productivity levels.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'Noun phrase fragment',
    expectNoCorrection: true,
  },
  {
    id: 29, category: 'no-finite-verb',
    targetWord: 'achieve', sentence: 'The achieve of my goals and dreams.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'Nominal compound with target word as noun',
    expectNoCorrection: true,
  },
  {
    id: 30, category: 'no-finite-verb',
    targetWord: 'provide', sentence: 'Providing excellent services to the community.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'Dangling gerund phrase — no subject/finite verb',
    expectNoCorrection: true,
  },
  {
    id: 31, category: 'no-finite-verb',
    targetWord: 'improve', sentence: 'I want to improve my English skills.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — finite verb "want" + infinitive',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 8: subject-verb agreement
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 32, category: 'sv-agreement',
    targetWord: 'support', sentence: 'He support his friends every day.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'he + base form — missing 3rd-person -s',
  },
  {
    id: 33, category: 'sv-agreement',
    targetWord: 'provide', sentence: 'She provide great services to clients.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'she + base form',
  },
  {
    id: 34, category: 'sv-agreement',
    targetWord: 'help', sentence: 'I helps my friends with their homework.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'I + 3rd-person form',
  },
  {
    id: 35, category: 'sv-agreement',
    targetWord: 'improve', sentence: 'They improves their skills every day.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'they + 3rd-person form',
  },
  {
    id: 36, category: 'sv-agreement',
    targetWord: 'support', sentence: 'He supports his friends every day.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — he + supports',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 9: wrong preposition
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 37, category: 'wrong-prep',
    targetWord: 'discuss', sentence: 'We discussed about the problem together.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'discuss + about — transitive verb error',
  },
  {
    id: 38, category: 'wrong-prep',
    targetWord: 'arrive', sentence: 'She arrived to the station on time.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'arrive to — should be arrive at',
  },
  {
    id: 39, category: 'wrong-prep',
    targetWord: 'provide', sentence: 'They provide support for the students.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — provide + direct object',
  },
  {
    id: 40, category: 'wrong-prep',
    targetWord: 'affect', sentence: 'This problem affects on everyone here.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'affect on — transitive verb, no preposition needed',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 10: gerund / infinitive misuse
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 41, category: 'gerund-infinitive',
    targetWord: 'enjoy', sentence: 'I enjoy to read books every evening.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'enjoy + to-infinitive — should be gerund',
  },
  {
    id: 42, category: 'gerund-infinitive',
    targetWord: 'suggest', sentence: 'She suggested to go to the park.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'suggest + to-infinitive — should be gerund',
  },
  {
    id: 43, category: 'gerund-infinitive',
    targetWord: 'improve', sentence: 'I am interested in improve my skills.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'interested in + bare verb — should be gerund',
  },
  {
    id: 44, category: 'gerund-infinitive',
    targetWord: 'improve', sentence: 'I am interested in improving my skills.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — interested in + gerund',
  },
  {
    id: 45, category: 'gerund-infinitive',
    targetWord: 'support', sentence: 'She is good at support her team.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'good at + bare verb — should be gerund',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 11: article errors
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 46, category: 'article',
    targetWord: 'important', sentence: 'This is a important decision to make.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'a + vowel-initial word — should be an',
  },
  {
    id: 47, category: 'article',
    targetWord: 'improve', sentence: 'This is an great way to improve.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'an + consonant-initial word — should be a',
  },
  {
    id: 48, category: 'article',
    targetWord: 'achieve', sentence: 'She wants to achieve an amazing result.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — an + vowel-initial, target word used directly',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 12: uncountable noun pluralization
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 49, category: 'uncountable-plural',
    targetWord: 'provide', sentence: 'She provides informations to all students.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'informations — uncountable noun wrongly pluralized',
  },
  {
    id: 50, category: 'uncountable-plural',
    targetWord: 'support', sentence: 'I need some advices to support my plan.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'advices — uncountable',
  },
  {
    id: 51, category: 'uncountable-plural',
    targetWord: 'provide', sentence: 'She provides information to all students.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — information (uncountable, no -s)',
  },
  {
    id: 52, category: 'uncountable-plural',
    targetWord: 'manage', sentence: 'Good feedbacks help manage teams better.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'feedbacks — uncountable',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 13: stative verb + progressive
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 53, category: 'stative-progressive',
    targetWord: 'support', sentence: 'I am knowing how to support the team.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'am knowing — stative verb in progressive',
  },
  {
    id: 54, category: 'stative-progressive',
    targetWord: 'achieve', sentence: 'She is believing she can achieve anything.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'is believing — stative verb in progressive',
  },
  {
    id: 55, category: 'stative-progressive',
    targetWord: 'improve', sentence: 'I know I can improve my skills.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — know in simple present',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 14: target word family / derivational false positive
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 56, category: 'target-word-family',
    targetWord: 'provide', sentence: 'The provider offers good services.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'provider is derivational — should NOT count as using "provide"',
  },
  {
    id: 57, category: 'target-word-family',
    targetWord: 'provide', sentence: 'The provision of services is excellent.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'provision is derivational — not a valid family match',
  },
  {
    id: 58, category: 'target-word-family',
    targetWord: 'provide', sentence: 'She provides excellent support daily.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — provides is inflectional family match',
  },
  {
    id: 59, category: 'target-word-family',
    targetWord: 'increase', sentence: 'The increasing demand affects everyone.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — increasing is inflectional (-ing family)',
  },
  {
    id: 60, category: 'target-word-family',
    targetWord: 'increase', sentence: 'There is an increasingly large gap.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'increasingly is derivational adverb — not valid family match',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 15: malformed clause / clearly broken sentences
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 61, category: 'malformed-clause',
    targetWord: 'provide', sentence: 'I will you be provide for at bus.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'Completely garbled — multiple errors. Known local-rule limit: "will" satisfies finite-verb guard; scrambled word order undetectable without parsing. AI layer handles this.',
    expectNoCorrection: true,
    knownLimit: true,
  },
  {
    id: 62, category: 'malformed-clause',
    targetWord: 'achieve', sentence: 'The expect will be you achieve.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: '"The expect" + malformed clause',
    expectNoCorrection: true,
  },
  {
    id: 63, category: 'malformed-clause',
    targetWord: 'support', sentence: 'We were hasn\'t support there.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'were + hasn\'t — double auxiliary collision',
    expectNoCorrection: true,
  },
  {
    id: 64, category: 'malformed-clause',
    targetWord: 'manage', sentence: 'The manage of project was difficult for team.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: '"The manage of" — target word as noun (nominal use, no finite verb chain)',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 16: correct simple sentences
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 65, category: 'correct-simple',
    targetWord: 'support', sentence: 'I support my friends when they need help.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'Simple correct sentence',
  },
  {
    id: 66, category: 'correct-simple',
    targetWord: 'improve', sentence: 'She wants to improve her English every day.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'Simple correct sentence with infinitive',
  },
  {
    id: 67, category: 'correct-simple',
    targetWord: 'achieve', sentence: 'We achieved our goals last year.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'Simple past tense',
  },
  {
    id: 68, category: 'correct-simple',
    targetWord: 'provide', sentence: 'The government provides free education.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: '3rd-person singular present',
  },
  {
    id: 69, category: 'correct-simple',
    targetWord: 'manage', sentence: 'He managed to finish the project on time.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'Past tense + infinitive',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 17: correct borderline sentences
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 70, category: 'correct-borderline',
    targetWord: 'support', sentence: 'Support is important in difficult times.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — support as noun (subject), finite verb "is"',
  },
  {
    id: 71, category: 'correct-borderline',
    targetWord: 'increase', sentence: 'The increase in prices is worrying.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — increase as noun, finite verb "is"',
  },
  {
    id: 72, category: 'correct-borderline',
    targetWord: 'provide', sentence: 'It is hard to provide everything people need.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — it-cleft with infinitive',
  },
  {
    id: 73, category: 'correct-borderline',
    targetWord: 'achieve', sentence: 'Achieving great results requires hard work.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — gerund subject + finite verb',
  },
  {
    id: 74, category: 'correct-borderline',
    targetWord: 'manage', sentence: 'It can be hard to manage time well.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — modal + be + infinitive',
  },
  {
    id: 75, category: 'correct-borderline',
    targetWord: 'improve', sentence: 'My English has improved a lot this year.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — present perfect with irregular past participle',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 18: false-positive guard scenarios
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 76, category: 'false-positive-guard',
    targetWord: 'support', sentence: 'She helps support the local community.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — catenative: helps + bare infinitive (support)',
  },
  {
    id: 77, category: 'false-positive-guard',
    targetWord: 'manage', sentence: 'Let her manage the project alone.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — let + bare infinitive',
  },
  {
    id: 78, category: 'false-positive-guard',
    targetWord: 'improve', sentence: 'I think we will improve our results.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — think + clause with will (not adjacent)',
  },
  {
    id: 79, category: 'false-positive-guard',
    targetWord: 'achieve', sentence: 'I were achieve nothing without friends.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'I were — be-agreement error (I were should be I was/I would)',
  },
  {
    id: 80, category: 'false-positive-guard',
    targetWord: 'provide', sentence: 'The school can provide books to students.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — modal + bare verb (provide)',
  },
  {
    id: 81, category: 'false-positive-guard',
    targetWord: 'support', sentence: 'She said she would support the plan.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — reported speech clause',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 19: double comparative / superlative
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 82, category: 'double-comparative',
    targetWord: 'improve', sentence: 'My skills are more better since I improve daily.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'more + comparative form — double comparative',
  },
  {
    id: 83, category: 'double-comparative',
    targetWord: 'achieve', sentence: 'She got the most best results to achieve.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'most + superlative — double superlative',
  },
  {
    id: 84, category: 'double-comparative',
    targetWord: 'improve', sentence: 'My results are better since I started to improve.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — comparative without "more"',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 20: modal + wrong verb form
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 85, category: 'modal-form',
    targetWord: 'consider', sentence: 'We should considered other options carefully.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'should + -ed form — Rule 6',
  },
  {
    id: 86, category: 'modal-form',
    targetWord: 'provide', sentence: 'They can to provide great support.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'can + to + verb — Rule 1',
  },
  {
    id: 87, category: 'modal-form',
    targetWord: 'achieve', sentence: 'You must achieve your goals this year.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — must + bare verb',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 21: function word typos
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 88, category: 'function-word-typo',
    targetWord: 'support', sentence: 'I shoud support my team better.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'shoud → should typo',
  },
  {
    id: 89, category: 'function-word-typo',
    targetWord: 'achieve', sentence: 'She doesnt achieve anything without effort.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'doesnt → doesn\'t missing apostrophe',
  },
  {
    id: 90, category: 'function-word-typo',
    targetWord: 'provide', sentence: 'I con provide help to anyone.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'con → can modal position typo',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 22: edge cases / tricky valid sentences
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 91, category: 'edge-case',
    targetWord: 'support', sentence: 'Without support, nothing can be achieved.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — without + noun (not gerund trigger here)',
  },
  {
    id: 92, category: 'edge-case',
    targetWord: 'provide', sentence: 'Good teachers provide students with knowledge.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — provide + indirect object structure',
  },
  {
    id: 93, category: 'edge-case',
    targetWord: 'improve', sentence: 'Studying hard is the best way to improve.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — gerund subject + infinitive without object',
  },
  {
    id: 94, category: 'edge-case',
    targetWord: 'achieve', sentence: 'Nothing great can be achieved without effort.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — passive voice',
  },
  {
    id: 95, category: 'edge-case',
    targetWord: 'manage', sentence: 'She knows how to manage her time effectively.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — knows how to + infinitive',
  },
  {
    id: 96, category: 'edge-case',
    targetWord: 'support', sentence: 'The support team works very hard.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — support as compound noun modifier (not the target in verb slot)',
  },
  {
    id: 97, category: 'edge-case',
    targetWord: 'provide', sentence: 'The program is designed to provide value.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — passive + to-infinitive',
  },
  {
    id: 98, category: 'edge-case',
    targetWord: 'improve', sentence: 'We need to improve the system right away.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — need + to-infinitive',
  },
  {
    id: 99, category: 'edge-case',
    targetWord: 'achieve', sentence: 'What did you achieve in the last year?',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — question form with did + base verb',
  },
  {
    id: 100, category: 'edge-case',
    targetWord: 'manage', sentence: 'How do you manage to stay so calm?',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — how do you + base verb',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 23: neg-aux + "to" + bare verb
  // Target words: explain, provide, consider, describe, manage
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 101, category: 'neg-aux-to',
    targetWord: 'explain', sentence: "I didn't to explain the result.",
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: false,
    note: "didn't to + bare verb — neg-aux + to always wrong",
  },
  {
    id: 102, category: 'neg-aux-to',
    targetWord: 'provide', sentence: "She doesn't to provide support.",
    expectedStatus: 'fail', shouldAwardXp: false,
    note: "doesn't to + bare verb",
  },
  {
    id: 103, category: 'neg-aux-to',
    targetWord: 'consider', sentence: "We don't to consider other options.",
    expectedStatus: 'fail', shouldAwardXp: false,
    note: "don't to + bare verb",
  },
  {
    id: 104, category: 'neg-aux-to',
    targetWord: 'describe', sentence: "He won't to describe the situation.",
    expectedStatus: 'fail', shouldAwardXp: false,
    note: "won't to + bare verb",
  },
  {
    id: 105, category: 'neg-aux-to',
    targetWord: 'manage', sentence: "They couldn't to manage the project.",
    expectedStatus: 'fail', shouldAwardXp: false,
    note: "couldn't to + bare verb",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 24: don't / doesn't + regular past form
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 106, category: 'neg-do-past',
    targetWord: 'explain', sentence: "They don't explained the reason.",
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: "don't + regular -ed: base form required",
  },
  {
    id: 107, category: 'neg-do-past',
    targetWord: 'provide', sentence: "She doesn't provided enough help.",
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: "doesn't + regular -ed",
  },
  {
    id: 108, category: 'neg-do-past',
    targetWord: 'describe', sentence: "He doesn't described it well.",
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: "doesn't + regular -ed",
  },
  {
    id: 109, category: 'neg-do-past',
    targetWord: 'manage', sentence: "We don't managed the time properly.",
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: "don't + regular -ed",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 25: imperative sentences — should PASS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 110, category: 'imperative-valid',
    targetWord: 'explain', sentence: 'Explain the problem clearly.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — imperative, target word at sentence start',
  },
  {
    id: 111, category: 'imperative-valid',
    targetWord: 'provide', sentence: 'Provide support to your team every day.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — imperative with object phrase',
  },
  {
    id: 112, category: 'imperative-valid',
    targetWord: 'consider', sentence: 'Consider all the options carefully.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — imperative',
  },
  {
    id: 113, category: 'imperative-valid',
    targetWord: 'describe', sentence: 'Describe your experience in detail.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — imperative',
  },
  {
    id: 114, category: 'imperative-valid',
    targetWord: 'manage', sentence: 'Manage your time wisely.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — imperative, short but 3 tokens',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 26: gerund fragment — should FAIL (imperative boundary)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 115, category: 'gerund-fragment',
    targetWord: 'explain', sentence: 'Explaining the problem clearly.',
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: 'Gerund fragment — no finite verb, not imperative',
  },
  {
    id: 116, category: 'gerund-fragment',
    targetWord: 'provide', sentence: 'Providing support to the community.',
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: 'Gerund phrase — no subject or finite verb',
  },
  {
    id: 117, category: 'gerund-fragment',
    targetWord: 'consider', sentence: 'Considering all available options.',
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: 'Gerund phrase fragment',
  },
  {
    id: 118, category: 'gerund-fragment',
    targetWord: 'manage', sentence: 'Managing a team of five people.',
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: 'Gerund phrase fragment',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 27: be + wrong verb form (new target words)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 119, category: 'be-wrong-form',
    targetWord: 'explain', sentence: 'I am explain the situation to you.',
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: 'be + bare verb: should be explaining',
  },
  {
    id: 120, category: 'be-wrong-form',
    targetWord: 'consider', sentence: 'She is consider the offer carefully.',
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: 'be + bare verb: should be considering',
  },
  {
    id: 121, category: 'be-wrong-form',
    targetWord: 'describe', sentence: 'They are describe the new policy.',
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: 'be + bare verb: should be describing',
  },
  {
    id: 122, category: 'be-wrong-form',
    targetWord: 'manage', sentence: 'He is manage the whole department.',
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: 'be + bare verb: should be managing',
  },
  {
    id: 123, category: 'be-wrong-form',
    targetWord: 'provide', sentence: 'She is provide good service to patients.',
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: 'be + bare verb: should be providing',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 28: have/has/had + base verb (new target words)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 124, category: 'have-base',
    targetWord: 'explain', sentence: 'She has explain the problem already.',
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: 'has + base form: should be explained',
  },
  {
    id: 125, category: 'have-base',
    targetWord: 'provide', sentence: 'They have provide us with the documents.',
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: 'have + base form: should be provided',
  },
  {
    id: 126, category: 'have-base',
    targetWord: 'describe', sentence: 'He had describe the event in detail.',
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: 'had + base form: should be described',
  },
  {
    id: 127, category: 'have-base',
    targetWord: 'manage', sentence: 'I have manage several difficult projects.',
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: 'have + base form: should be managed',
  },
  {
    id: 128, category: 'have-base',
    targetWord: 'consider', sentence: 'We have consider all the options.',
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: 'have + base form: should be considered',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 29: do/does/did misuse (new target words)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 129, category: 'do-misuse',
    targetWord: 'explain', sentence: 'She did explained the whole process.',
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: 'did + regular -ed: redundant past marking',
  },
  {
    id: 130, category: 'do-misuse',
    targetWord: 'provide', sentence: 'He does provided excellent service.',
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: 'does + regular -ed',
  },
  {
    id: 131, category: 'do-misuse',
    targetWord: 'consider', sentence: 'They did considered the risks.',
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: 'did + regular -ed',
  },
  {
    id: 132, category: 'do-misuse',
    targetWord: 'describe', sentence: 'She does described her experience well.',
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: 'does + regular -ed',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 30: passive voice — valid usage (should PASS)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 133, category: 'passive-valid',
    targetWord: 'explain', sentence: 'The process was explained clearly.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — valid passive: was + past participle',
  },
  {
    id: 134, category: 'passive-valid',
    targetWord: 'provide', sentence: 'Good service is provided by the team.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — valid passive: is + provided',
  },
  {
    id: 135, category: 'passive-valid',
    targetWord: 'consider', sentence: 'All options should be considered carefully.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — valid passive: should be + past participle',
  },
  {
    id: 136, category: 'passive-valid',
    targetWord: 'describe', sentence: 'The event was described in great detail.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — valid passive',
  },
  {
    id: 137, category: 'passive-valid',
    targetWord: 'manage', sentence: 'The project was managed by an experienced team.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — valid passive',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 31: passive misuse — be + bare verb in passive slot
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 138, category: 'passive-misuse',
    targetWord: 'explain', sentence: 'The problem was explain by the teacher.',
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: 'was + bare verb: should be explained (passive requires past participle)',
  },
  {
    id: 139, category: 'passive-misuse',
    targetWord: 'provide', sentence: 'The service is provide by our team.',
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: 'is + bare verb: should be provided',
  },
  {
    id: 140, category: 'passive-misuse',
    targetWord: 'manage', sentence: 'The team was manage by a senior director.',
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: 'was + bare verb: should be managed',
  },
  {
    id: 141, category: 'passive-misuse',
    targetWord: 'describe', sentence: 'The situation is describe in the report.',
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: 'is + bare verb: should be described',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 32: question structure — valid (should PASS)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 142, category: 'question-valid',
    targetWord: 'explain', sentence: 'Can you explain what happened here?',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — modal question + bare verb',
  },
  {
    id: 143, category: 'question-valid',
    targetWord: 'provide', sentence: 'Did she provide enough information?',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — did + base verb question',
  },
  {
    id: 144, category: 'question-valid',
    targetWord: 'manage', sentence: 'How does she manage to stay calm?',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — how does + base verb',
  },
  {
    id: 145, category: 'question-valid',
    targetWord: 'consider', sentence: 'Should we consider other options?',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — modal + base verb question',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 33: question structure — malformed (no aux inversion)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 146, category: 'question-malformed',
    targetWord: 'explain', sentence: 'Why you explained this to me?',
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: 'No aux inversion — known local-rule limit (wh + subject + verb FP risk)',
    knownLimit: true,
  },
  {
    id: 147, category: 'question-malformed',
    targetWord: 'provide', sentence: 'What she provide for the team?',
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: 'No aux inversion — known local-rule limit',
    knownLimit: true,
  },
  {
    id: 148, category: 'question-malformed',
    targetWord: 'manage', sentence: 'How he manage the project alone?',
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: 'No aux inversion — known local-rule limit',
    knownLimit: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 34: negative structure — valid (should PASS)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 149, category: 'negative-valid',
    targetWord: 'explain', sentence: "She didn't explain the answer correctly.",
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: "CORRECT — didn't + base verb",
  },
  {
    id: 150, category: 'negative-valid',
    targetWord: 'provide', sentence: "They don't provide enough support.",
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: "CORRECT — don't + base verb",
  },
  {
    id: 151, category: 'negative-valid',
    targetWord: 'consider', sentence: "He doesn't consider the consequences.",
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: "CORRECT — doesn't + base verb",
  },
  {
    id: 152, category: 'negative-valid',
    targetWord: 'manage', sentence: "We couldn't manage without your help.",
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: "CORRECT — couldn't + base verb",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 35: negative structure — malformed
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 153, category: 'negative-malformed',
    targetWord: 'explain', sentence: "She are don't explain anything.",
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: 'be-agreement error + double neg aux — multiple structural errors',
  },
  {
    id: 154, category: 'negative-malformed',
    targetWord: 'provide', sentence: "We did not provided the answer.",
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: 'did not + regular -ed: should be base form',
  },
  {
    id: 155, category: 'negative-malformed',
    targetWord: 'consider', sentence: "They didn't considered the risks.",
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: "didn't + regular -ed — standard learner error",
  },
  {
    id: 156, category: 'negative-malformed',
    targetWord: 'manage', sentence: "He didn't managed to finish on time.",
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: "didn't + regular -ed",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 36: target word present but structurally wrong
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 157, category: 'target-structural-wrong',
    targetWord: 'explain', sentence: 'I am explain you the answer.',
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: 'be + bare verb — target present, usage structurally wrong',
  },
  {
    id: 158, category: 'target-structural-wrong',
    targetWord: 'provide', sentence: 'The company can to provide good service.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: 'modal + to + bare verb — target present but wrong structure',
  },
  {
    id: 159, category: 'target-structural-wrong',
    targetWord: 'describe', sentence: 'She has describe her experience clearly.',
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: 'has + bare verb — target present, perfect tense misformed',
  },
  {
    id: 160, category: 'target-structural-wrong',
    targetWord: 'consider', sentence: 'We are consider this a serious problem.',
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: 'be + bare verb — target present, should be considering',
  },
  {
    id: 161, category: 'target-structural-wrong',
    targetWord: 'manage', sentence: 'She did managed to complete the task.',
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: 'did + regular -ed — double past marking',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 37: multi-error malformed sentences
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 162, category: 'multi-error',
    targetWord: 'explain', sentence: 'She are did explained the problem.',
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: 'be-agreement + double aux + -ed: 3 errors',
  },
  {
    id: 163, category: 'multi-error',
    targetWord: 'provide', sentence: 'I am was provide the service yesterday.',
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: 'double aux (am + was) + bare verb',
  },
  {
    id: 164, category: 'multi-error',
    targetWord: 'manage', sentence: 'He is did managed the project.',
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: 'be + double-aux collision + -ed',
  },
  {
    id: 165, category: 'multi-error',
    targetWord: 'consider', sentence: "We doesn't to consider this option.",
    expectedStatus: 'fail', shouldAwardXp: false,
    note: "doesn't to — neg-aux + to error",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 38: correct sentences — new target words
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 166, category: 'correct-new-targets',
    targetWord: 'explain', sentence: 'Let me explain the main idea.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: "CORRECT — let + pronoun + base verb",
  },
  {
    id: 167, category: 'correct-new-targets',
    targetWord: 'describe', sentence: 'She can describe the situation perfectly.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — modal + base verb',
  },
  {
    id: 168, category: 'correct-new-targets',
    targetWord: 'consider', sentence: 'I always consider the risks before deciding.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — simple present, I + base form',
  },
  {
    id: 169, category: 'correct-new-targets',
    targetWord: 'describe', sentence: 'Please describe your previous experience.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — polite imperative',
  },
  {
    id: 170, category: 'correct-new-targets',
    targetWord: 'manage', sentence: 'He managed to finish the work on time.',
    expectedStatus: 'perfect', shouldAwardXp: true,
    note: 'CORRECT — past tense, irregular-style -ed',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY 39: wrong POS / noun-slot misuse
  // Target word used as wrong part of speech (noun in verb slot, or verb used
  // as noun without derivational suffix).
  // Verdict: fail.  Correction: suppressed (no reliable fix possible locally).
  // Feedback quality is the primary concern — must not mislead with tense advice.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 171, category: 'wrong-pos',
    targetWord: 'decision', sentence: 'I have to decision this problem.',
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: '"decision" used as verb — noun in verb slot after "have to". Correct: "I have to make a decision about this problem." / "I need to decide." Engine should not give perfect-tense advice.',
  },
  {
    id: 172, category: 'wrong-pos',
    targetWord: 'describe', sentence: 'A clear describe of the system architecture.',
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: '"describe" used as noun — should be "description". Pattern B must NOT produce "describes" correction.',
  },
  {
    id: 173, category: 'wrong-pos',
    targetWord: 'consider', sentence: 'The consider of this issue was difficult.',
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: '"consider" used as noun — should be "consideration". "The consider of" is noun-slot misuse.',
  },
  {
    id: 174, category: 'wrong-pos',
    targetWord: 'explain', sentence: 'An explain of the problem is missing.',
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: '"explain" used as noun after article — should be "explanation". Local limit: "is missing" satisfies finite-verb guard; determiner-free noun-phrase detection requires NLP.',
    knownLimit: true,
  },
  {
    id: 175, category: 'wrong-pos',
    targetWord: 'manage', sentence: 'Good manage of resources is essential.',
    expectedStatus: 'fail', shouldAwardXp: false,
    expectNoCorrection: true,
    note: '"manage" used as noun after adjective — should be "management". Local limit: adjective (not determiner) subject → Pattern B does not fire; finite verb "is" present.',
    knownLimit: true,
  },
  {
    id: 176, category: 'wrong-prep',
    targetWord: 'support', sentence: 'He has supported about the issue.',
    expectedStatus: 'fail', shouldAwardXp: false,
    note: '"supported about" — "support" is transitive; "about" is wrong preposition. WRONG_PREP_RULES fires. Correction "He has supported the issue." is safe (have+past-participle, not bare verb).',
  },
];

// ─── Runner ────────────────────────────────────────────────────────────────────

interface TestResult {
  testCase:      TestCase;
  actualStatus:  'perfect' | 'fail';
  passed:        boolean;
  falseNegative: boolean;      // broken sentence that got perfect (worst case)
  falsePositive: boolean;      // correct sentence that got fail
  correctionShown: boolean;
  unsafeCorrection: boolean;   // correction shown but expected none
  isKnownLimit: boolean;       // known hard limit — reported but doesn't block push
}

const RESET  = '\x1b[0m';
const RED    = '\x1b[31m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';

function run(): void {
  console.log(`\n${BOLD}${CYAN}══════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}${CYAN}  WordSwipe — Local Grammar Engine Stress Test${RESET}`);
  console.log(`${BOLD}${CYAN}══════════════════════════════════════════════════════${RESET}\n`);

  const results: TestResult[] = [];

  for (const tc of TEST_CASES) {
    const result = analyzeSentenceLocal({
      targetWord: tc.targetWord,
      sentence:   tc.sentence,
    });

    const actualStatus    = result.status === 'perfect' ? 'perfect' : 'fail';
    const passed          = actualStatus === tc.expectedStatus;
    const falseNegative   = !passed && tc.expectedStatus === 'fail';   // should fail, passed
    const falsePositive   = !passed && tc.expectedStatus === 'perfect'; // should pass, failed
    const correctionShown = !!result.correctedSentence;
    const unsafeCorrection = tc.expectNoCorrection === true && correctionShown;
    const isKnownLimit    = !passed && tc.knownLimit === true;

    results.push({
      testCase:         tc,
      actualStatus,
      passed,
      falseNegative,
      falsePositive,
      correctionShown,
      unsafeCorrection,
      isKnownLimit,
    });
  }

  // ── Category summary ────────────────────────────────────────────────────────
  // `fn`  = real false negatives (blocks push)
  // `kl`  = known-limit failures (acknowledged, do NOT block push)
  // These two are kept separate so all three report levels use the same source.
  const categories = new Map<string, { pass: number; fail: number; fn: number; fp: number; kl: number }>();
  for (const r of results) {
    const cat = r.testCase.category;
    if (!categories.has(cat)) categories.set(cat, { pass: 0, fail: 0, fn: 0, fp: 0, kl: 0 });
    const c = categories.get(cat)!;
    if (r.passed)                              c.pass++;
    else if (r.isKnownLimit)                   c.kl++;    // known limit: own bucket
    else                                       c.fail++;
    if (r.falseNegative && !r.isKnownLimit)    c.fn++;    // real FN only
    if (r.falsePositive)                       c.fp++;
  }

  console.log(`${BOLD}Category Breakdown:${RESET}`);
  console.log(`${'Category'.padEnd(28)} ${'Pass'.padStart(5)} ${'Fail'.padStart(5)} ${'FN'.padStart(4)} ${'FP'.padStart(4)} ${'KL'.padStart(4)}`);
  console.log('─'.repeat(56));
  for (const [cat, c] of [...categories.entries()].sort()) {
    const hasProblem = c.fn > 0 || c.fp > 0;
    const color = hasProblem ? RED : (c.kl > 0 ? YELLOW : GREEN);
    const klStr = c.kl > 0 ? String(c.kl) : '—';
    console.log(
      `${color}${cat.padEnd(28)} ${String(c.pass).padStart(5)} ${String(c.fail).padStart(5)} ${String(c.fn).padStart(4)} ${String(c.fp).padStart(4)} ${klStr.padStart(4)}${RESET}` +
      (hasProblem ? ` ${YELLOW}◄${RESET}` : (c.kl > 0 ? ` ${DIM}⊘${RESET}` : '')),
    );
  }

  const total        = results.length;
  const passed       = results.filter(r => r.passed).length;
  const knownLimits  = results.filter(r => r.isKnownLimit).length;
  const fn           = results.filter(r => r.falseNegative && !r.isKnownLimit).length;
  const fp           = results.filter(r => r.falsePositive).length;
  const unsafe       = results.filter(r => r.unsafeCorrection).length;
  // realFail = genuine failures (not passed, not a known limit)
  const realFail     = total - passed - knownLimits;

  console.log('\n' + '─'.repeat(56));
  console.log(`${BOLD}Total:${RESET}   ${total}  |  ${GREEN}Pass: ${passed}${RESET}  |  ${RED}Fail: ${realFail}${RESET}  |  ${DIM}Known limits: ${knownLimits}${RESET}`);
  console.log(`${BOLD}FN (missed errors):${RESET}  ${fn > 0 ? RED : GREEN}${fn}${RESET}   ${DIM}(should fail, got perfect — blocks push)${RESET}`);
  console.log(`${BOLD}FP (over-flagged):${RESET}   ${fp > 0 ? YELLOW : GREEN}${fp}${RESET}   ${DIM}(should pass, got fail — blocks push)${RESET}`);
  console.log(`${BOLD}Unsafe corrections:${RESET}  ${unsafe > 0 ? YELLOW : GREEN}${unsafe}${RESET}   ${DIM}(correction shown when expectNoCorrection=true — blocks push)${RESET}`);
  if (knownLimits > 0) {
    console.log(`${BOLD}Known limits:${RESET}        ${DIM}${knownLimits}${RESET}   ${DIM}(local-rule hard limits — reported, do NOT block push)${RESET}`);
  }

  // ── FALSE NEGATIVES — critical: broken sentences that passed ────────────────
  const falseNegatives = results.filter(r => r.falseNegative && !r.isKnownLimit);
  if (falseNegatives.length > 0) {
    console.log(`\n${BOLD}${RED}══ FALSE NEGATIVES (broken sentence → PERFECT) ══${RESET}`);
    console.log(`${DIM}These are the most critical failures — wrong sentences awarded XP.${RESET}\n`);
    for (const r of falseNegatives) {
      const tc = r.testCase;
      console.log(`  ${RED}✗ [${tc.id}] [${tc.category}]${RESET}`);
      console.log(`    target: "${tc.targetWord}"`);
      console.log(`    sentence: "${tc.sentence}"`);
      console.log(`    note: ${tc.note}`);
      if (r.correctionShown) {
        console.log(`    ${DIM}correction shown (may be misleading)${RESET}`);
      }
      console.log();
    }
  } else {
    console.log(`\n${GREEN}✓ No false negatives — no broken sentences received PERFECT.${RESET}`);
  }

  // ── FALSE POSITIVES — correct sentences that failed ─────────────────────────
  const falsePositives = results.filter(r => r.falsePositive);
  if (falsePositives.length > 0) {
    console.log(`\n${BOLD}${YELLOW}══ FALSE POSITIVES (correct sentence → FAIL) ══${RESET}`);
    console.log(`${DIM}These correct sentences were incorrectly rejected.${RESET}\n`);
    for (const r of falsePositives) {
      const tc = r.testCase;
      const actual = analyzeSentenceLocal({ targetWord: tc.targetWord, sentence: tc.sentence });
      console.log(`  ${YELLOW}⚠ [${tc.id}] [${tc.category}]${RESET}`);
      console.log(`    target: "${tc.targetWord}"`);
      console.log(`    sentence: "${tc.sentence}"`);
      console.log(`    note: ${tc.note}`);
      console.log(`    ${DIM}actual feedback: "${actual.feedbackTr}"${RESET}`);
      console.log(`    ${DIM}usedTargetWord: ${actual.usedTargetWord}, targetWordMode: ${actual.targetWordMode}${RESET}`);
      console.log();
    }
  } else {
    console.log(`\n${GREEN}✓ No false positives — no correct sentences were rejected.${RESET}`);
  }

  // ── UNSAFE CORRECTIONS ───────────────────────────────────────────────────────
  if (unsafe > 0) {
    console.log(`\n${BOLD}${YELLOW}══ UNSAFE CORRECTIONS ══${RESET}`);
    for (const r of results.filter(r => r.unsafeCorrection)) {
      const tc = r.testCase;
      console.log(`  ${YELLOW}⚠ [${tc.id}] "${tc.sentence}"${RESET}`);
    }
  }

  // ── Coverage gap analysis ────────────────────────────────────────────────────
  // Only real FNs (c.fn > 0) count as gaps. Known-limit failures (c.kl) are not gaps.
  console.log(`\n${BOLD}${CYAN}══ Coverage Gap Analysis ══${RESET}`);

  const gapCategories = [...categories.entries()]
    .filter(([, c]) => c.fn > 0)
    .sort((a, b) => b[1].fn - a[1].fn);

  if (gapCategories.length === 0) {
    console.log(`${GREEN}No coverage gaps detected in the current test matrix.${RESET}`);
  } else {
    console.log(`${DIM}Categories with undetected errors (real false negatives):${RESET}`);
    for (const [cat, c] of gapCategories) {
      console.log(`  ${RED}${cat}${RESET}: ${c.fn} undetected error(s)`);
    }
  }

  // ── Strength / weakness summary ──────────────────────────────────────────────
  // Strong: no real FN, no FP, no real fail (known-limit failures don't disqualify).
  // Weak:   at least one real FN (c.fn > 0).
  // Known-limit-only: passes all but has acknowledged engine limits (c.kl > 0, c.fn === 0).
  const strongCategories = [...categories.entries()]
    .filter(([, c]) => c.fn === 0 && c.fp === 0 && c.fail === 0);
  const weakCategories = [...categories.entries()]
    .filter(([, c]) => c.fn > 0);

  console.log(`\n${BOLD}Strong (all tests pass, no FN/FP):${RESET}`);
  for (const [cat, c] of strongCategories) {
    const klNote = c.kl > 0 ? ` ${DIM}(${c.kl} known limit)${RESET}` : '';
    console.log(`  ${GREEN}✓ ${cat}${RESET}${klNote}`);
  }

  if (weakCategories.length > 0) {
    console.log(`\n${BOLD}Weak (real false negatives — errors passing as correct):${RESET}`);
    for (const [cat, c] of weakCategories) {
      console.log(`  ${RED}✗ ${cat} (${c.fn} FN)${RESET}`);
    }
  }

  const knownLimitCases = results.filter(r => r.isKnownLimit);
  if (knownLimitCases.length > 0) {
    console.log(`\n${BOLD}Known local-rule limits (acknowledged — not regressions):${RESET}`);
    for (const r of knownLimitCases) {
      console.log(`  ${DIM}⊘ [${r.testCase.id}] "${r.testCase.sentence}"${RESET}`);
    }
  }

  console.log(`\n${BOLD}${CYAN}══════════════════════════════════════════════════════${RESET}\n`);

  // Exit with non-zero code when any regression is detected:
  //   FN (false negatives, excluding known limits) — broken sentences passing as correct
  //   FP (false positives) — correct sentences rejected: bad UX
  //   Unsafe corrections   — correction shown when it shouldn't be
  // Known limits (knownLimit: true) are reported but do NOT block push.
  if (fn > 0 || fp > 0 || unsafe > 0) {
    process.exit(1);
  }
}

run();
