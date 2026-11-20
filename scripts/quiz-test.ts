/**
 * quiz-test.ts
 *
 * Regression tests for the generateQuiz function in QuizScreen.tsx.
 * Runner: tsx scripts/quiz-test.ts
 *
 * Tests are self-contained: generateQuiz is inlined here because QuizScreen.tsx
 * imports react-native which cannot load in a plain Node.js process.
 * The logic must stay in sync with QuizScreen.tsx manually.
 */

// ─── Minimal Word type (mirrors src/data/vocabulary.ts) ───────────────────────

interface Word {
  id: number;
  word: string;
  translation: string;
  level: 'easy' | 'medium' | 'hard';
}

// ─── generateQuiz (mirrors QuizScreen.tsx) ────────────────────────────────────

function generateQuiz(
  words: Word[],
  levelPool: Word[],
): Array<{ word: Word; options: string[]; correctIndex: number }> {
  return words.map(word => {
    const normalizedCorrect = word.translation.trim().toLowerCase();

    const shuffled = [...levelPool].sort(() => Math.random() - 0.5);

    const seen = new Set<string>([normalizedCorrect]);
    const uniquePool: Word[] = [];
    for (const w of shuffled) {
      if (w.id === word.id) continue;
      const norm = w.translation.trim().toLowerCase();
      if (seen.has(norm)) continue;
      seen.add(norm);
      uniquePool.push(w);
    }

    const wrongOptions = uniquePool.slice(0, 3).map(w => w.translation);
    const correctIndex = Math.floor(Math.random() * (wrongOptions.length + 1));
    const options = [...wrongOptions];
    options.splice(correctIndex, 0, word.translation);

    return { word, options, correctIndex };
  });
}

// ─── Test runner ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function expect(label: string, actual: unknown, expected: unknown) {
  const ok =
    typeof expected === 'function'
      ? (expected as (v: unknown) => boolean)(actual)
      : actual === expected;
  if (ok) {
    console.log(`  \x1b[32m✓\x1b[0m \x1b[2m${label}\x1b[0m`);
    passed++;
  } else {
    console.log(`  \x1b[31m✗ ${label}\x1b[0m`);
    console.log(`      expected: ${typeof expected === 'function' ? '(predicate)' : JSON.stringify(expected)}`);
    console.log(`      received: ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ─── Vocabulary fixtures ──────────────────────────────────────────────────────

const POOL_NORMAL: Word[] = [
  { id: 1, word: 'run',    translation: 'koşmak',    level: 'easy' },
  { id: 2, word: 'eat',    translation: 'yemek',     level: 'easy' },
  { id: 3, word: 'sleep',  translation: 'uyumak',    level: 'easy' },
  { id: 4, word: 'read',   translation: 'okumak',    level: 'easy' },
  { id: 5, word: 'write',  translation: 'yazmak',    level: 'easy' },
  { id: 6, word: 'jump',   translation: 'atlamak',   level: 'easy' },
];

// Pool with duplicate translations (mirrors the real vocabulary situation)
const POOL_WITH_DUPES: Word[] = [
  { id: 1,  word: 'start',    translation: 'başlamak',   level: 'easy' },
  { id: 2,  word: 'begin',    translation: 'başlamak',   level: 'easy' }, // duplicate
  { id: 3,  word: 'commence', translation: 'başlamak',   level: 'easy' }, // duplicate
  { id: 4,  word: 'finish',   translation: 'bitirmek',   level: 'easy' },
  { id: 5,  word: 'end',      translation: 'Bitirmek',   level: 'easy' }, // same (case diff)
  { id: 6,  word: 'run',      translation: 'koşmak',     level: 'easy' },
  { id: 7,  word: 'eat',      translation: 'yemek',      level: 'easy' },
  { id: 8,  word: 'sleep',    translation: ' uyumak ',   level: 'easy' }, // leading/trailing space
  { id: 9,  word: 'rest',     translation: 'uyumak',     level: 'easy' }, // duplicate of #8 after trim
  { id: 10, word: 'write',    translation: 'yazmak',     level: 'easy' },
];

// Pool too small to fill 3 wrong options
const POOL_TINY: Word[] = [
  { id: 1, word: 'run',  translation: 'koşmak', level: 'easy' },
  { id: 2, word: 'eat',  translation: 'yemek',  level: 'easy' },
];

// ─── Test suite ───────────────────────────────────────────────────────────────

console.log('\n\x1b[1m\x1b[36m══════════════════════════════════════════\x1b[0m');
console.log('\x1b[1mQuiz generation regression tests\x1b[0m');
console.log('\x1b[1m\x1b[36m══════════════════════════════════════════\x1b[0m\n');

// ── Q1: No duplicate options in a normal pool ─────────────────────────────────
{
  console.log('\x1b[1mQ1: Normal pool — no duplicate options\x1b[0m');
  const target = POOL_NORMAL[0]; // 'run' / 'koşmak'
  for (let i = 0; i < 50; i++) {
    const [q] = generateQuiz([target], POOL_NORMAL);
    const unique = new Set(q.options.map(o => o.trim().toLowerCase()));
    expect(`run (iteration ${i+1}) — all 4 options unique`, unique.size, q.options.length);
    if (unique.size !== q.options.length) break; // stop spamming on first failure
  }
}

// ── Q2: No duplicate options with a pool that has duplicate translations ──────
{
  console.log('\n\x1b[1mQ2: Pool with duplicate translations — no duplicate options\x1b[0m');
  const target = POOL_WITH_DUPES[5]; // 'run' / 'koşmak'
  let dupeFound = false;
  for (let i = 0; i < 100; i++) {
    const [q] = generateQuiz([target], POOL_WITH_DUPES);
    const normalized = q.options.map(o => o.trim().toLowerCase());
    const unique = new Set(normalized);
    if (unique.size !== q.options.length) { dupeFound = true; break; }
  }
  expect('no duplicate option found across 100 iterations', dupeFound, false);
}

// ── Q3: Correct answer appears exactly once ───────────────────────────────────
{
  console.log('\n\x1b[1mQ3: Correct answer appears exactly once\x1b[0m');
  const target = POOL_NORMAL[1]; // 'eat' / 'yemek'
  for (let i = 0; i < 50; i++) {
    const [q] = generateQuiz([target], POOL_NORMAL);
    const count = q.options.filter(o => o === target.translation).length;
    expect(`eat (iteration ${i+1}) — correct answer count = 1`, count, 1);
    if (count !== 1) break;
  }
}

// ── Q4: correctIndex always points to the correct translation ─────────────────
{
  console.log('\n\x1b[1mQ4: correctIndex always points to correct translation\x1b[0m');
  const target = POOL_NORMAL[2]; // 'sleep' / 'uyumak'
  for (let i = 0; i < 100; i++) {
    const [q] = generateQuiz([target], POOL_NORMAL);
    expect(
      `sleep (iteration ${i+1}) — options[correctIndex] === translation`,
      q.options[q.correctIndex],
      target.translation,
    );
    if (q.options[q.correctIndex] !== target.translation) break;
  }
}

// ── Q5: Case and whitespace differences treated as same translation ────────────
{
  console.log('\n\x1b[1mQ5: Case / whitespace variants of same translation de-duped\x1b[0m');
  const target = POOL_WITH_DUPES[3]; // 'finish' / 'bitirmek'
  let casedupeFound = false;
  for (let i = 0; i < 100; i++) {
    const [q] = generateQuiz([target], POOL_WITH_DUPES);
    const normalized = q.options.map(o => o.trim().toLowerCase());
    const unique = new Set(normalized);
    if (unique.size !== q.options.length) { casedupeFound = true; break; }
  }
  expect('no case/whitespace dupe found across 100 iterations', casedupeFound, false);
}

// ── Q6: Correct translation is never used as a distractor ─────────────────────
{
  console.log('\n\x1b[1mQ6: Correct translation never appears as a wrong option\x1b[0m');
  const target = POOL_WITH_DUPES[0]; // 'start' / 'başlamak' — 3 duplicates in pool
  let correctAsDistractor = false;
  for (let i = 0; i < 100; i++) {
    const [q] = generateQuiz([target], POOL_WITH_DUPES);
    const wrongOpts = q.options.filter((_, idx) => idx !== q.correctIndex);
    if (wrongOpts.some(o => o.trim().toLowerCase() === target.translation.toLowerCase())) {
      correctAsDistractor = true;
      break;
    }
  }
  expect('correct translation never used as distractor (100 iters)', correctAsDistractor, false);
}

// ── Q7: Small pool — graceful fallback with fewer than 4 options ──────────────
{
  console.log('\n\x1b[1mQ7: Tiny pool — graceful with fewer than 4 options\x1b[0m');
  const target = POOL_TINY[0]; // 'run' — only 1 other unique wrong translation
  const [q] = generateQuiz([target], POOL_TINY);
  expect('options count >= 1', q.options.length >= 1, true);
  expect('options count <= 4', q.options.length <= 4, true);
  expect('correct answer present', q.options.includes(target.translation), true);
  expect('correctIndex in bounds', q.correctIndex < q.options.length, true);
  expect('options[correctIndex] is correct answer', q.options[q.correctIndex], target.translation);
}

// ── Q8: Multiple questions in one quiz call all pass invariants ───────────────
{
  console.log('\n\x1b[1mQ8: Multi-word quiz — all questions pass invariants\x1b[0m');
  const targets = POOL_NORMAL.slice(0, 4);
  let anyViolation = false;
  for (let iter = 0; iter < 20; iter++) {
    const questions = generateQuiz(targets, POOL_NORMAL);
    for (const q of questions) {
      const normalized = q.options.map(o => o.trim().toLowerCase());
      const unique = new Set(normalized);
      if (unique.size !== q.options.length) { anyViolation = true; break; }
      if (q.options[q.correctIndex] !== q.word.translation) { anyViolation = true; break; }
    }
    if (anyViolation) break;
  }
  expect('no invariant violations in 20 × 4-word quiz runs', anyViolation, false);
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n\x1b[1m\x1b[36m══════════════════════════════════════════\x1b[0m`);
console.log(`\x1b[1mTotal: ${passed + failed}\x1b[0m  |  \x1b[32mPass: ${passed}\x1b[0m  |  \x1b[31mFail: ${failed}\x1b[0m`);
console.log(`\x1b[1m\x1b[36m══════════════════════════════════════════\x1b[0m\n`);

if (failed > 0) process.exit(1);
