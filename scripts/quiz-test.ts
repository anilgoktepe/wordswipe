/**
 * quiz-test.ts
 *
 * Regression tests for quiz question generation.
 * Runner: tsx scripts/quiz-test.ts
 *
 * Imports the real generateQuiz from src/utils/quizGenerator.ts — no copy of
 * the algorithm lives here. That module is deliberately free of react-native
 * imports so it loads under plain Node.
 */

import { generateQuiz } from '../src/utils/quizGenerator';
import type { Word } from '../src/data/vocabulary';

// ─── Test runner ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function expect(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (ok) {
    console.log(`  \x1b[32m✓\x1b[0m \x1b[2m${label}\x1b[0m`);
    passed++;
  } else {
    console.log(`  \x1b[31m✗ ${label}\x1b[0m`);
    console.log(`      expected: ${JSON.stringify(expected)}`);
    console.log(`      received: ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────
//
// Minimal Word objects — generateQuiz only reads id and translation.

function w(id: number, word: string, translation: string): Word {
  return { id, word, translation, example: '', level: 'easy' } as Word;
}

const POOL_NORMAL: Word[] = [
  w(1, 'run',   'koşmak'),
  w(2, 'eat',   'yemek'),
  w(3, 'sleep', 'uyumak'),
  w(4, 'read',  'okumak'),
  w(5, 'write', 'yazmak'),
  w(6, 'jump',  'atlamak'),
];

// Mirrors the real dataset: 83 Turkish translations are shared by >1 word.
const POOL_WITH_DUPES: Word[] = [
  w(1,  'start',    'başlamak'),
  w(2,  'begin',    'başlamak'),   // duplicate
  w(3,  'commence', 'başlamak'),   // duplicate
  w(4,  'finish',   'bitirmek'),
  w(5,  'end',      'Bitirmek'),   // duplicate, case differs
  w(6,  'run',      'koşmak'),
  w(7,  'eat',      'yemek'),
  w(8,  'sleep',    ' uyumak '),   // duplicate, padded
  w(9,  'rest',     'uyumak'),
  w(10, 'write',    'yazmak'),
];

const POOL_TINY: Word[] = [
  w(1, 'run', 'koşmak'),
  w(2, 'eat', 'yemek'),
];

const norm = (s: string) => s.trim().toLowerCase();

// ─── Suite ────────────────────────────────────────────────────────────────────

console.log('\n\x1b[1m\x1b[36m══════════════════════════════════════════\x1b[0m');
console.log('\x1b[1mQuiz generation regression tests\x1b[0m');
console.log('\x1b[1m\x1b[36m══════════════════════════════════════════\x1b[0m\n');

// ── Q1: normal pool, no duplicate options ─────────────────────────────────────
{
  console.log('\x1b[1mQ1: Normal pool — options always unique\x1b[0m');
  let violations = 0;
  for (let i = 0; i < 200; i++) {
    const [q] = generateQuiz([POOL_NORMAL[0]], 'easy', POOL_NORMAL);
    if (new Set(q.options.map(norm)).size !== q.options.length) violations++;
  }
  expect('0 duplicate-option violations in 200 runs', violations, 0);
}

// ── Q2: pool containing duplicate translations ────────────────────────────────
{
  console.log('\n\x1b[1mQ2: Pool with duplicate translations — options still unique\x1b[0m');
  let violations = 0;
  for (const target of POOL_WITH_DUPES) {
    for (let i = 0; i < 50; i++) {
      const [q] = generateQuiz([target], 'easy', POOL_WITH_DUPES);
      if (new Set(q.options.map(norm)).size !== q.options.length) violations++;
    }
  }
  expect('0 violations across every word × 50 runs', violations, 0);
}

// ── Q3: correct answer appears exactly once ───────────────────────────────────
{
  console.log('\n\x1b[1mQ3: Correct answer appears exactly once\x1b[0m');
  let violations = 0;
  for (const target of POOL_WITH_DUPES) {
    for (let i = 0; i < 50; i++) {
      const [q] = generateQuiz([target], 'easy', POOL_WITH_DUPES);
      if (q.options.filter(o => norm(o) === norm(target.translation)).length !== 1) violations++;
    }
  }
  expect('0 violations across every word × 50 runs', violations, 0);
}

// ── Q4: correctIndex points at the correct translation ────────────────────────
{
  console.log('\n\x1b[1mQ4: correctIndex always points to the correct translation\x1b[0m');
  let violations = 0;
  for (const target of POOL_NORMAL) {
    for (let i = 0; i < 50; i++) {
      const [q] = generateQuiz([target], 'easy', POOL_NORMAL);
      if (q.options[q.correctIndex] !== target.translation) violations++;
    }
  }
  expect('0 violations across every word × 50 runs', violations, 0);
}

// ── Q5: correct translation never used as a distractor ────────────────────────
{
  console.log('\n\x1b[1mQ5: Correct translation never appears as a distractor\x1b[0m');
  let violations = 0;
  for (const target of POOL_WITH_DUPES) {
    for (let i = 0; i < 50; i++) {
      const [q] = generateQuiz([target], 'easy', POOL_WITH_DUPES);
      const distractors = q.options.filter((_, idx) => idx !== q.correctIndex);
      if (distractors.some(o => norm(o) === norm(target.translation))) violations++;
    }
  }
  expect('0 violations across every word × 50 runs', violations, 0);
}

// ── Q6: tiny pool degrades gracefully ─────────────────────────────────────────
{
  console.log('\n\x1b[1mQ6: Tiny pool — graceful with fewer than 4 options\x1b[0m');
  const [q] = generateQuiz([POOL_TINY[0]], 'easy', POOL_TINY);
  expect('at least 1 option', q.options.length >= 1, true);
  expect('at most 4 options', q.options.length <= 4, true);
  expect('no invented duplicates', new Set(q.options.map(norm)).size, q.options.length);
  expect('correctIndex within bounds', q.correctIndex < q.options.length, true);
  expect('correctIndex resolves correctly', q.options[q.correctIndex], POOL_TINY[0].translation);
}

// ── Q7: single-word pool — no distractors available ───────────────────────────
{
  console.log('\n\x1b[1mQ7: Single-word pool — correct answer only, no fabrication\x1b[0m');
  const solo = [w(1, 'run', 'koşmak')];
  const [q] = generateQuiz([solo[0]], 'easy', solo);
  expect('exactly 1 option', q.options.length, 1);
  expect('that option is the correct answer', q.options[0], 'koşmak');
  expect('correctIndex is 0', q.correctIndex, 0);
}

// ── Q8: multi-word quiz keeps every invariant ─────────────────────────────────
{
  console.log('\n\x1b[1mQ8: Multi-word quiz — all invariants hold per question\x1b[0m');
  let violations = 0;
  for (let i = 0; i < 100; i++) {
    const questions = generateQuiz(POOL_WITH_DUPES.slice(0, 5), 'easy', POOL_WITH_DUPES);
    if (questions.length !== 5) { violations++; continue; }
    for (const q of questions) {
      if (new Set(q.options.map(norm)).size !== q.options.length) violations++;
      if (q.options[q.correctIndex] !== q.word.translation) violations++;
    }
  }
  expect('0 violations across 100 × 5-word quizzes', violations, 0);
}

// ── Q9: a pool with enough unique translations always yields 4 options ────────
{
  console.log('\n\x1b[1mQ9: Enough unique translations — always exactly 4 options\x1b[0m');
  // POOL_WITH_DUPES has 10 words but only 6 unique translations, so every
  // target still leaves >= 3 distinct distractors available.
  let wrongCount = 0;
  for (const target of POOL_WITH_DUPES) {
    for (let i = 0; i < 50; i++) {
      const [q] = generateQuiz([target], 'easy', POOL_WITH_DUPES);
      if (q.options.length !== 4) wrongCount++;
    }
  }
  expect('every question had 4 options', wrongCount, 0);
}

// ── Q10: distractors vary between runs (shuffle actually applied) ─────────────
{
  console.log('\n\x1b[1mQ10: Distractor set varies across runs\x1b[0m');
  const target = POOL_NORMAL[0];
  const distinctSets = new Set<string>();
  for (let i = 0; i < 100; i++) {
    const [q] = generateQuiz([target], 'easy', POOL_NORMAL);
    const distractors = q.options.filter((_, idx) => idx !== q.correctIndex);
    distinctSets.add([...distractors].map(norm).sort().join('|'));
  }
  // 5 candidate distractors choose 3 => 10 possible sets; a working shuffle
  // should surface several of them over 100 runs.
  expect('more than one distinct distractor set observed', distinctSets.size > 1, true);
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n\x1b[1m\x1b[36m══════════════════════════════════════════\x1b[0m`);
console.log(`\x1b[1mTotal: ${passed + failed}\x1b[0m  |  \x1b[32mPass: ${passed}\x1b[0m  |  \x1b[31mFail: ${failed}\x1b[0m`);
console.log(`\x1b[1m\x1b[36m══════════════════════════════════════════\x1b[0m\n`);

if (failed > 0) process.exit(1);
