/**
 * scripts/validate-vocabulary.ts
 *
 * Vocabulary validation — final gate before commit/release.
 * Run: npm run validate:vocab
 *
 * ─── Checks ───────────────────────────────────────────────────────────────────
 *
 *   Errors (block release):
 *     • duplicate words (normalizeWordKey)
 *     • missing or too-short examples (< 30 chars)
 *     • missing translations
 *     • CEFR/level mismatch (A1/A2→easy, B1/B2→medium, C1/C2→hard)
 *
 *   Warnings (informational):
 *     • unknown partOfSpeech values
 *     • unknown topic values
 *     • target word not found in example (base or common inflected form)
 *
 *   Reports (always printed):
 *     • total word count + level distribution
 *     • partOfSpeech coverage + breakdown
 *     • topic coverage + breakdown
 *
 *   Quality summary (always printed):
 *     • total words, examples < 40 chars, slash translations,
 *       CEFR mismatches, target-word warnings
 */

import { vocabulary, PartOfSpeech, WordTopic } from '../src/data/vocabulary';

const MIN_EXAMPLE_LENGTH = 30;

const CEFR_LEVEL_MAP: Record<string, string> = {
  A1: 'easy', A2: 'easy',
  B1: 'medium', B2: 'medium',
  C1: 'hard', C2: 'hard',
};

const VALID_POS: Set<string> = new Set<PartOfSpeech>([
  'noun', 'verb', 'adjective', 'adverb', 'phrase', 'other',
]);

const VALID_TOPICS: Set<string> = new Set<WordTopic>([
  'daily', 'academic', 'business', 'nature', 'social',
  'emotions', 'travel', 'health', 'technology', 'education',
]);

// ─── Counters ─────────────────────────────────────────────────────────────────

const distribution: Record<string, number> = { easy: 0, medium: 0, hard: 0 };
const seenKeys = new Map<string, number>(); // normalizedKey → id

const duplicates:    { id: number; word: string; conflictsWithId: number }[]                    = [];
const shortExample:  { id: number; word: string; example: string }[]                            = [];
const noTranslation: { id: number; word: string }[]                                             = [];
const cefrMismatch:  { id: number; word: string; cefrLevel: string; level: string; expected: string }[] = [];
const badPOS:        { id: number; word: string; value: string }[]                              = [];
const badTopic:      { id: number; word: string; value: string }[]                              = [];
// Slash in translation may indicate POS-type mixing — editorial review trigger.
const slashTranslation: { id: number; word: string; translation: string }[]  = [];

// Target word not found in example — soft warning only.
const wordMissing: { id: number; word: string; example: string }[] = [];

// Returns true when the example contains the base word or a common inflected form.
function wordInExample(word: string, example: string): boolean {
  const w = word.toLowerCase();
  const ex = example.toLowerCase();
  const candidates = [
    w,                                    // exact base
    w + 's', w + 'es',                    // plural / 3rd-person
    w + 'd', w + 'ed',                    // past simple (love→loved, walk→walked)
    w.replace(/e$/, 'ed'),                // close→closed, move→moved
    w.replace(/e$/, 'ing'),               // close→closing, make→making
    w + 'ing',                            // walk→walking, go→going
    w.replace(/([^aeiou])$/, '$1$1ing'),  // run→running, sit→sitting
    w.replace(/([^aeiou])$/, '$1$1ed'),   // stop→stopped
    w.replace(/y$/, 'ies'),               // carry→carries
    w.replace(/y$/, 'ied'),               // carry→carried
  ];
  return candidates.some(c => new RegExp(`\\b${c}\\b`).test(ex));
}

const posCounts:   Record<string, number> = {};
const topicCounts: Record<string, number> = {};

let withExTr  = 0;
let withPOS   = 0;
let withTopic = 0;

const shortExampleTr: { id: number; word: string; exampleTr: string }[] = [];

// ─── Scan ─────────────────────────────────────────────────────────────────────

for (const w of vocabulary) {
  // Level distribution
  if (w.level in distribution) distribution[w.level]++;

  // Duplicate check
  const key = w.word.toLowerCase().trim();
  if (seenKeys.has(key)) {
    duplicates.push({ id: w.id, word: w.word, conflictsWithId: seenKeys.get(key)! });
  } else {
    seenKeys.set(key, w.id);
  }

  // Example check
  if (!w.example || w.example.trim().length < MIN_EXAMPLE_LENGTH) {
    shortExample.push({ id: w.id, word: w.word, example: w.example ?? '' });
  }

  // Target word presence check (warning only)
  if (w.example && !wordInExample(w.word, w.example)) {
    wordMissing.push({ id: w.id, word: w.word, example: w.example });
  }

  // exampleTr check — optional; count when present, warn if too short
  if (w.exampleTr) {
    if (w.exampleTr.trim().length >= 5) {
      withExTr++;
    } else {
      shortExampleTr.push({ id: w.id, word: w.word, exampleTr: w.exampleTr });
    }
  }

  // Translation check
  if (!w.translation || w.translation.trim().length === 0) {
    noTranslation.push({ id: w.id, word: w.word });
  }

  // CEFR/level consistency
  if (w.cefrLevel && w.level) {
    const expected = CEFR_LEVEL_MAP[w.cefrLevel];
    if (expected && w.level !== expected) {
      cefrMismatch.push({ id: w.id, word: w.word, cefrLevel: w.cefrLevel, level: w.level, expected });
    }
  }

  // Slash in translation — soft warning for editorial review.
  // Legitimate: "mektup / harf" (genuinely different meanings).
  // Problematic: POS-type mixing like "iş / çalışmak" (noun + verb form).
  if (w.translation?.includes('/')) {
    slashTranslation.push({ id: w.id, word: w.word, translation: w.translation });
  }

  // partOfSpeech
  if (w.partOfSpeech !== undefined) {
    if (VALID_POS.has(w.partOfSpeech)) {
      withPOS++;
      posCounts[w.partOfSpeech] = (posCounts[w.partOfSpeech] ?? 0) + 1;
    } else {
      badPOS.push({ id: w.id, word: w.word, value: w.partOfSpeech });
    }
  }

  // topic
  if (w.topic !== undefined) {
    if (VALID_TOPICS.has(w.topic)) {
      withTopic++;
      topicCounts[w.topic] = (topicCounts[w.topic] ?? 0) + 1;
    } else {
      badTopic.push({ id: w.id, word: w.word, value: w.topic });
    }
  }
}

// ─── Report ───────────────────────────────────────────────────────────────────

function pct(n: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((n / total) * 100)}%`;
}

const hr  = '─'.repeat(58);
const hr2 = '·'.repeat(58);

console.log(`\n${hr}`);
console.log('  WordSwipe — Vocabulary Validation Report');
console.log(hr);

// ── Level distribution ──────────────────────────────────────────────────────
console.log(`\n📦 Total words : ${vocabulary.length}`);
console.log(`   easy        : ${distribution.easy}`);
console.log(`   medium      : ${distribution.medium}`);
console.log(`   hard        : ${distribution.hard}`);

// ── Metadata coverage ───────────────────────────────────────────────────────
console.log(`\n📊 Metadata coverage`);
console.log(`   exampleTr    : ${withExTr} / ${vocabulary.length} (${pct(withExTr, vocabulary.length)})`);
console.log(`   partOfSpeech : ${withPOS} / ${vocabulary.length} (${pct(withPOS, vocabulary.length)})`);
console.log(`   topic        : ${withTopic} / ${vocabulary.length} (${pct(withTopic, vocabulary.length)})`);

if (Object.keys(posCounts).length > 0) {
  console.log(`\n${hr2}`);
  console.log('   partOfSpeech breakdown:');
  for (const [pos, count] of Object.entries(posCounts).sort((a, b) => b[1] - a[1])) {
    const bar = '█'.repeat(Math.round(count / vocabulary.length * 40));
    console.log(`     ${pos.padEnd(12)}: ${String(count).padStart(3)}  ${bar}`);
  }
}

if (Object.keys(topicCounts).length > 0) {
  console.log(`\n${hr2}`);
  console.log('   topic breakdown:');
  for (const [topic, count] of Object.entries(topicCounts).sort((a, b) => b[1] - a[1])) {
    const bar = '█'.repeat(Math.round(count / vocabulary.length * 40));
    console.log(`     ${topic.padEnd(12)}: ${String(count).padStart(3)}  ${bar}`);
  }
}

// ── Errors ──────────────────────────────────────────────────────────────────
console.log(`\n${hr}`);
if (duplicates.length === 0) {
  console.log('✅ No duplicates found.');
} else {
  console.log(`❌ Duplicates (${duplicates.length}):`);
  for (const d of duplicates) {
    console.log(`   id:${d.id} "${d.word}"  ←  conflicts with id:${d.conflictsWithId}`);
  }
}

console.log(`\n${hr}`);
if (shortExample.length === 0) {
  console.log('✅ All examples look good.');
} else {
  console.log(`❌ Missing or short examples (${shortExample.length}):`);
  for (const e of shortExample) {
    const preview = e.example ? `"${e.example}"` : '(empty)';
    console.log(`   id:${e.id} "${e.word}" → ${preview}`);
  }
}

console.log(`\n${hr}`);
if (noTranslation.length === 0) {
  console.log('✅ All translations present.');
} else {
  console.log(`❌ Missing translations (${noTranslation.length}):`);
  for (const t of noTranslation) {
    console.log(`   id:${t.id} "${t.word}"`);
  }
}

console.log(`\n${hr}`);
if (cefrMismatch.length === 0) {
  console.log('✅ All CEFR/level mappings are consistent.');
} else {
  console.log(`❌ CEFR/level mismatches (${cefrMismatch.length}):`);
  for (const m of cefrMismatch) {
    console.log(`   id:${m.id} "${m.word}" → cefrLevel=${m.cefrLevel} but level=${m.level} (expected: ${m.expected})`);
  }
}

console.log(`\n${hr}`);
if (shortExampleTr.length === 0) {
  console.log('✅ All present exampleTr values are valid (or none set yet).');
} else {
  console.log(`⚠️  exampleTr values too short — < 5 chars (${shortExampleTr.length}):`);
  for (const e of shortExampleTr) {
    console.log(`   id:${e.id} "${e.word}" → "${e.exampleTr}"`);
  }
}

// ── Warning: target word not in example ─────────────────────────────────────
console.log(`\n${hr}`);
if (wordMissing.length === 0) {
  console.log('✅ All examples contain the target word.');
} else {
  console.log(`⚠️  Target word not found in example (${wordMissing.length}) — review for derived forms:`);
  for (const m of wordMissing) {
    console.log(`   id:${m.id} "${m.word}" → "${m.example}"`);
  }
}

// ── Warnings (metadata) ─────────────────────────────────────────────────────
console.log(`\n${hr}`);
const totalWarnings = badPOS.length + badTopic.length + wordMissing.length;
if (totalWarnings === 0) {
  console.log('✅ All metadata values are valid.');
} else {
  if (badPOS.length > 0) {
    console.log(`⚠️  Unknown partOfSpeech values (${badPOS.length}):`);
    for (const b of badPOS) {
      console.log(`   id:${b.id} "${b.word}" → "${b.value}"`);
    }
  }
  if (badTopic.length > 0) {
    console.log(`⚠️  Unknown topic values (${badTopic.length}):`);
    for (const b of badTopic) {
      console.log(`   id:${b.id} "${b.word}" → "${b.value}"`);
    }
  }
}

// ── Slash translation report ─────────────────────────────────────────────────
// Informational — not a blocking error.  Review for POS-type mixing:
//   OK  : "mektup / harf" (same POS, genuinely different meanings)
//   Risk: "iş / çalışmak" (noun + verb form mixed — Sentence Builder ambiguity)
console.log(`\n${hr}`);
console.log(`📝 Slash translations: ${slashTranslation.length} / ${vocabulary.length} (${pct(slashTranslation.length, vocabulary.length)})`);
if (slashTranslation.length > 0) {
  console.log('   Review for POS-type mixing before expanding Sentence Builder validation:');
  for (const s of slashTranslation.slice(0, 10)) {
    console.log(`   id:${s.id} "${s.word}" → "${s.translation}"`);
  }
  if (slashTranslation.length > 10) {
    console.log(`   ... and ${slashTranslation.length - 10} more. Run with --verbose-slash to see all.`);
  }
}

// ── Quality summary ──────────────────────────────────────────────────────────
const under40 = vocabulary.filter(w => (w.example ?? '').length < 40).length;
console.log(`\n${hr}`);
console.log('📋 Quality summary');
console.log(`   Total words             : ${vocabulary.length}`);
console.log(`   Examples < 40 chars     : ${under40}`);
console.log(`   Slash translations      : ${slashTranslation.length}`);
console.log(`   CEFR/level mismatches   : ${cefrMismatch.length}`);
console.log(`   Target-word warnings    : ${wordMissing.length}`);

// ── Pass / fail ──────────────────────────────────────────────────────────────
const totalErrors = duplicates.length + shortExample.length + noTranslation.length + cefrMismatch.length;
console.log(`\n${hr}`);
if (totalErrors === 0 && totalWarnings === 0) {
  console.log('🎉 All checks passed. Dataset is clean.');
} else if (totalErrors === 0) {
  console.log(`⚠️  ${totalWarnings} warning(s). No blocking errors.`);
} else {
  console.log(`❌ ${totalErrors} blocking error(s) found. Fix before release.`);
  if (totalWarnings > 0) console.log(`⚠️  ${totalWarnings} additional warning(s).`);
}
console.log(hr + '\n');

if (totalErrors > 0) process.exit(1);
