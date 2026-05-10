/**
 * srs-test.ts
 *
 * Standalone SRS reducer unit tests for WordSwipe.
 * Runner: tsx scripts/srs-test.ts
 *
 * NOTE: AppContext.tsx imports react-native and AsyncStorage which cannot load
 * in a plain Node.js process. The pure SRS logic is therefore inlined here and
 * must be kept in sync with AppContext.tsx manually whenever SRS policy changes.
 * The exports added to AppContext (reducer, initialState, emptyProgress, Action)
 * are available for future use with a proper React Native test environment.
 */

// ─── SRS constants (mirrors AppContext.tsx) ────────────────────────────────────

const MS_PER_DAY      = 86_400_000;
const INTERVAL_WRONG  = 1 * MS_PER_DAY;
const SRS_INTERVALS   = [1, 3, 7, 14, 30].map(d => d * MS_PER_DAY);

function srsInterval(newCorrectCount: number): number {
  const idx = Math.min(newCorrectCount, SRS_INTERVALS.length) - 1;
  return SRS_INTERVALS[Math.max(0, idx)];
}

// ─── Types (subset of AppState / WordProgress) ────────────────────────────────

interface WordProgress {
  seenCount:          number;
  correctCount:       number;
  wrongCount:         number;
  firstAttemptWrong:  boolean;
  isLearned:          boolean;
  isDifficult:        boolean;
  consecutiveCorrect: number;
  nextReviewAt:       number;
}

type WP = Record<number, WordProgress>;

interface DailyState {
  extraAiAnalyses:          number;
  aiAnalysisDate:           string;
  dailyProgress:            number;
  dailyLearnedIds:          number[];
  dailyAdsShown:            number;
  adsDate:                  string;
  dailyAiAnalysesUsed:      number;
  todayDate:                string;
  dailyBaseSessionStarted:  boolean;
  dailyLessonBonusClaimed:  boolean;
  dailyBonusSessionStarted: boolean;
}

function emptyProgress(): WordProgress {
  return {
    seenCount: 0, correctCount: 0, wrongCount: 0,
    firstAttemptWrong: false, isLearned: false, isDifficult: false,
    consecutiveCorrect: 0, nextReviewAt: 0,
  };
}

function freshDailyState(): DailyState {
  const today = new Date().toDateString();
  return {
    extraAiAnalyses: 0, aiAnalysisDate: today,
    dailyProgress: 0, dailyLearnedIds: [],
    dailyAdsShown: 0, adsDate: today,
    dailyAiAnalysesUsed: 0,
    todayDate: today,
    dailyBaseSessionStarted: false,
    dailyLessonBonusClaimed: false,
    dailyBonusSessionStarted: false,
  };
}

// ─── Reducer case helpers (mirrors AppContext.tsx exactly) ────────────────────

function applyMarkWordLearned(wp: WP, wordId: number): WP {
  const existing        = wp[wordId] ?? emptyProgress();
  const newCorrectCount = existing.correctCount + 1;
  const newConsecutive  = existing.isDifficult
    ? existing.consecutiveCorrect + 1
    : existing.consecutiveCorrect;
  const newIsDifficult  = existing.isDifficult && newConsecutive < 3;
  return {
    ...wp,
    [wordId]: {
      ...existing,
      correctCount:       newCorrectCount,
      isLearned:          true,
      isDifficult:        newIsDifficult,
      consecutiveCorrect: newIsDifficult ? newConsecutive : 0,
      nextReviewAt:       Date.now() + srsInterval(newCorrectCount),
    },
  };
}

function applyAddDifficultWord(wp: WP, wordId: number): WP {
  const existing   = wp[wordId] ?? emptyProgress();
  const isFirstEver = existing.wrongCount === 0 && existing.correctCount === 0;
  return {
    ...wp,
    [wordId]: {
      ...existing,
      wrongCount:         existing.wrongCount + 1,
      firstAttemptWrong:  isFirstEver ? true : existing.firstAttemptWrong,
      isDifficult:        true,
      consecutiveCorrect: 0,
      isLearned:          isFirstEver ? false : existing.isLearned,
      nextReviewAt:       Date.now() + INTERVAL_WRONG,
      seenCount:          isFirstEver ? existing.seenCount + 1 : existing.seenCount,
    },
  };
}

function applyScheduleWordReview(wp: WP, wordId: number): WP {
  const existing = wp[wordId] ?? emptyProgress();
  return {
    ...wp,
    [wordId]: { ...existing, nextReviewAt: Date.now() + INTERVAL_WRONG },
  };
}

function applyGrantAiAnalysisBonus(s: DailyState, amount: number): DailyState {
  const today = new Date().toDateString();
  const base  = s.aiAnalysisDate === today ? s.extraAiAnalyses : 0;
  return { ...s, extraAiAnalyses: base + amount, aiAnalysisDate: today };
}

function applyCheckNewDay(s: DailyState, simulatedYesterday?: string): DailyState {
  const today    = new Date().toDateString();
  const dateInState = simulatedYesterday ?? s.todayDate;
  if (dateInState === today) return s;
  return {
    ...s,
    todayDate:                today,
    dailyProgress:            0,
    dailyLearnedIds:          [],
    dailyBaseSessionStarted:  false,
    dailyLessonBonusClaimed:  false,
    dailyBonusSessionStarted: false,
    dailyAdsShown:            0,
    adsDate:                  today,
    dailyAiAnalysesUsed:      0,
    aiAnalysisDate:           today,
    extraAiAnalyses:          0,
  };
}

// ─── Assertion helpers ─────────────────────────────────────────────────────────

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

// nextReviewAt is set at dispatch time; test runs <100ms later.
// 2-second window is more than enough.
const TIMING_TOLERANCE = 2_000;

function assertNear(actual: number, expected: number, label: string): void {
  const diff = Math.abs(actual - expected);
  if (diff > TIMING_TOLERANCE) {
    throw new Error(
      `${label}: expected ≈${expected} (±${TIMING_TOLERANCE}ms) but diff was ${diff}ms`,
    );
  }
}

// ─── Test runner ───────────────────────────────────────────────────────────────

const RESET = '\x1b[0m';
const RED   = '\x1b[31m';
const GREEN = '\x1b[32m';
const CYAN  = '\x1b[36m';
const BOLD  = '\x1b[1m';
const DIM   = '\x1b[2m';

interface TestResult { name: string; passed: boolean; failure?: string }
const results: TestResult[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn();
    results.push({ name, passed: true });
  } catch (e: any) {
    results.push({ name, passed: false, failure: String(e.message ?? e) });
  }
}

// ─── Test cases ────────────────────────────────────────────────────────────────

// ── A. MARK_WORD_LEARNED ──────────────────────────────────────────────────────

test('A1: MARK_WORD_LEARNED → isLearned=true', () => {
  const wp = applyMarkWordLearned({}, 1);
  assert(wp[1].isLearned === true, 'isLearned should be true');
});

test('A2: MARK_WORD_LEARNED → correctCount increments', () => {
  const wp = applyMarkWordLearned({}, 1);
  assert(wp[1].correctCount === 1, `correctCount should be 1, got ${wp[1].correctCount}`);
});

test('A3: MARK_WORD_LEARNED twice → correctCount=2', () => {
  let wp = applyMarkWordLearned({}, 1);
  wp = applyMarkWordLearned(wp, 1);
  assert(wp[1].correctCount === 2, `correctCount should be 2, got ${wp[1].correctCount}`);
});

test('A4: MARK_WORD_LEARNED (not difficult) → consecutiveCorrect unchanged at 0', () => {
  const wp = applyMarkWordLearned({}, 1);
  assert(wp[1].consecutiveCorrect === 0, `consecutiveCorrect should be 0, got ${wp[1].consecutiveCorrect}`);
});

test('A5: MARK_WORD_LEARNED → nextReviewAt is in the future', () => {
  const before = Date.now();
  const wp     = applyMarkWordLearned({}, 1);
  assert(wp[1].nextReviewAt > before, 'nextReviewAt should be in the future');
});

test('A6: MARK_WORD_LEARNED (1st correct) → nextReviewAt ≈ now + 1 day', () => {
  const wp = applyMarkWordLearned({}, 1);
  assertNear(wp[1].nextReviewAt, Date.now() + 1 * MS_PER_DAY, 'nextReviewAt after 1st correct');
});

test('A7: MARK_WORD_LEARNED (2nd correct) → nextReviewAt ≈ now + 3 days', () => {
  let wp = applyMarkWordLearned({}, 1);
  wp = applyMarkWordLearned(wp, 1);
  assertNear(wp[1].nextReviewAt, Date.now() + 3 * MS_PER_DAY, 'nextReviewAt after 2nd correct');
});

test('A8: MARK_WORD_LEARNED (5th correct) → nextReviewAt ≈ now + 30 days (max interval)', () => {
  let wp: WP = {};
  for (let i = 0; i < 5; i++) wp = applyMarkWordLearned(wp, 1);
  assertNear(wp[1].nextReviewAt, Date.now() + 30 * MS_PER_DAY, 'nextReviewAt at max interval');
});

// ── B. ADD_DIFFICULT_WORD ─────────────────────────────────────────────────────

test('B1: ADD_DIFFICULT_WORD → isDifficult=true', () => {
  const wp = applyAddDifficultWord({}, 1);
  assert(wp[1].isDifficult === true, 'isDifficult should be true');
});

test('B2: ADD_DIFFICULT_WORD → wrongCount increments', () => {
  const wp = applyAddDifficultWord({}, 1);
  assert(wp[1].wrongCount === 1, `wrongCount should be 1, got ${wp[1].wrongCount}`);
});

test('B3: ADD_DIFFICULT_WORD → consecutiveCorrect resets to 0', () => {
  // Give word some consecutive correct first
  let wp = applyMarkWordLearned({}, 1);
  wp = applyAddDifficultWord(wp, 1);
  assert(wp[1].consecutiveCorrect === 0, `consecutiveCorrect should be 0, got ${wp[1].consecutiveCorrect}`);
});

test('B4: ADD_DIFFICULT_WORD → nextReviewAt ≈ now + 1 day', () => {
  const wp = applyAddDifficultWord({}, 1);
  assertNear(wp[1].nextReviewAt, Date.now() + INTERVAL_WRONG, 'nextReviewAt after difficult');
});

test('B5: ADD_DIFFICULT_WORD on virgin word → isLearned stays false', () => {
  const wp = applyAddDifficultWord({}, 1);
  assert(wp[1].isLearned === false, 'isLearned should be false for virgin word');
});

test('B6: ADD_DIFFICULT_WORD on already-learned word → isLearned preserved', () => {
  let wp = applyMarkWordLearned({}, 1);
  wp = applyAddDifficultWord(wp, 1);
  assert(wp[1].isLearned === true, 'isLearned should stay true on non-first encounter');
});

// ── C. SCHEDULE_WORD_REVIEW ───────────────────────────────────────────────────

test('C1: SCHEDULE_WORD_REVIEW → nextReviewAt ≈ now + 1 day', () => {
  const wp = applyScheduleWordReview({}, 1);
  assertNear(wp[1].nextReviewAt, Date.now() + INTERVAL_WRONG, 'nextReviewAt after schedule review');
});

test('C2: SCHEDULE_WORD_REVIEW does not change correctCount', () => {
  let wp = applyMarkWordLearned({}, 1); // correctCount=1
  wp = applyScheduleWordReview(wp, 1);
  assert(wp[1].correctCount === 1, `correctCount should remain 1, got ${wp[1].correctCount}`);
});

test('C3: SCHEDULE_WORD_REVIEW does not change wrongCount', () => {
  const wp = applyScheduleWordReview({}, 1);
  assert(wp[1].wrongCount === 0, `wrongCount should remain 0, got ${wp[1].wrongCount}`);
});

test('C4: SCHEDULE_WORD_REVIEW does not change isDifficult', () => {
  const wp = applyScheduleWordReview({}, 1);
  assert(wp[1].isDifficult === false, `isDifficult should remain false, got ${wp[1].isDifficult}`);
});

test('C5: SCHEDULE_WORD_REVIEW does not change isLearned', () => {
  let wp = applyMarkWordLearned({}, 1);
  wp = applyScheduleWordReview(wp, 1);
  assert(wp[1].isLearned === true, 'isLearned should remain true after schedule review');
});

// ── D. Wrong-then-correct (Option A): ADD_DIFFICULT_WORD + SCHEDULE_WORD_REVIEW

test('D1: wrong-then-correct → word remains difficult', () => {
  let wp = applyAddDifficultWord({}, 1);
  wp = applyScheduleWordReview(wp, 1);
  assert(wp[1].isDifficult === true, 'word should still be difficult');
});

test('D2: wrong-then-correct → wrongCount remains 1', () => {
  let wp = applyAddDifficultWord({}, 1);
  wp = applyScheduleWordReview(wp, 1);
  assert(wp[1].wrongCount === 1, `wrongCount should be 1, got ${wp[1].wrongCount}`);
});

test('D3: wrong-then-correct → correctCount stays 0', () => {
  let wp = applyAddDifficultWord({}, 1);
  wp = applyScheduleWordReview(wp, 1);
  assert(wp[1].correctCount === 0, `correctCount should be 0, got ${wp[1].correctCount}`);
});

test('D4: wrong-then-correct → nextReviewAt ≈ now + 1 day (not immediate)', () => {
  let wp = applyAddDifficultWord({}, 1);
  wp = applyScheduleWordReview(wp, 1);
  assertNear(wp[1].nextReviewAt, Date.now() + INTERVAL_WRONG, 'nextReviewAt after wrong-then-correct');
});

test('D5: wrong-then-correct → nextReviewAt is in the future (not due immediately)', () => {
  let wp = applyAddDifficultWord({}, 1);
  wp = applyScheduleWordReview(wp, 1);
  assert(wp[1].nextReviewAt > Date.now(), 'nextReviewAt should be in the future');
});

// ── E. isDifficult auto-clears after 3 consecutive first-attempt-correct ──────

test('E1: difficult word after 1 correct → still difficult', () => {
  let wp = applyAddDifficultWord({}, 1);
  wp = applyMarkWordLearned(wp, 1);
  assert(wp[1].isDifficult === true, 'should still be difficult after 1 correct');
});

test('E2: difficult word after 2 corrects → still difficult', () => {
  let wp = applyAddDifficultWord({}, 1);
  wp = applyMarkWordLearned(wp, 1);
  wp = applyMarkWordLearned(wp, 1);
  assert(wp[1].isDifficult === true, 'should still be difficult after 2 corrects');
});

test('E3: difficult word after 3 consecutive corrects → isDifficult cleared', () => {
  let wp = applyAddDifficultWord({}, 1);
  wp = applyMarkWordLearned(wp, 1);
  wp = applyMarkWordLearned(wp, 1);
  wp = applyMarkWordLearned(wp, 1);
  assert(wp[1].isDifficult === false, 'isDifficult should be cleared after 3 consecutive corrects');
});

test('E4: difficult + 3 corrects → consecutiveCorrect resets to 0 after clear', () => {
  let wp = applyAddDifficultWord({}, 1);
  wp = applyMarkWordLearned(wp, 1);
  wp = applyMarkWordLearned(wp, 1);
  wp = applyMarkWordLearned(wp, 1);
  assert(wp[1].consecutiveCorrect === 0, `consecutiveCorrect should be 0 after clear, got ${wp[1].consecutiveCorrect}`);
});

test('E5: wrong breaks streak → re-wronging resets consecutiveCorrect to 0', () => {
  let wp = applyAddDifficultWord({}, 1);
  wp = applyMarkWordLearned(wp, 1); // consecutiveCorrect=1
  wp = applyMarkWordLearned(wp, 1); // consecutiveCorrect=2
  wp = applyAddDifficultWord(wp, 1); // wrong → reset
  assert(wp[1].consecutiveCorrect === 0, 'wrong should reset consecutiveCorrect');
  assert(wp[1].isDifficult === true, 'should still be difficult after wrong');
});

// ── F. GRANT_AI_ANALYSIS_BONUS ────────────────────────────────────────────────

test('F1: GRANT_AI_ANALYSIS_BONUS increases extraAiAnalyses by given amount', () => {
  const s  = freshDailyState();
  const s2 = applyGrantAiAnalysisBonus(s, 3);
  assert(s2.extraAiAnalyses === 3, `extraAiAnalyses should be 3, got ${s2.extraAiAnalyses}`);
});

test('F2: GRANT_AI_ANALYSIS_BONUS accumulates within same day', () => {
  const s  = freshDailyState();
  const s2 = applyGrantAiAnalysisBonus(s, 2);
  const s3 = applyGrantAiAnalysisBonus(s2, 2);
  assert(s3.extraAiAnalyses === 4, `extraAiAnalyses should be 4, got ${s3.extraAiAnalyses}`);
});

test('F3: GRANT_AI_ANALYSIS_BONUS resets base to 0 if aiAnalysisDate is stale', () => {
  const yesterday = new Date(Date.now() - MS_PER_DAY).toDateString();
  const s  = { ...freshDailyState(), extraAiAnalyses: 99, aiAnalysisDate: yesterday };
  const s2 = applyGrantAiAnalysisBonus(s, 1);
  assert(s2.extraAiAnalyses === 1, `extraAiAnalyses should be 1 (not 100), got ${s2.extraAiAnalyses}`);
});

// ── G. CHECK_NEW_DAY ──────────────────────────────────────────────────────────

test('G1: CHECK_NEW_DAY resets dailyProgress to 0', () => {
  const s  = { ...freshDailyState(), dailyProgress: 5 };
  const s2 = applyCheckNewDay(s, 'Mon Jan 01 2024');
  assert(s2.dailyProgress === 0, `dailyProgress should be 0, got ${s2.dailyProgress}`);
});

test('G2: CHECK_NEW_DAY resets dailyLearnedIds to []', () => {
  const s  = { ...freshDailyState(), dailyLearnedIds: [1, 2, 3] };
  const s2 = applyCheckNewDay(s, 'Mon Jan 01 2024');
  assert(s2.dailyLearnedIds.length === 0, 'dailyLearnedIds should be empty');
});

test('G3: CHECK_NEW_DAY resets dailyAdsShown to 0', () => {
  const s  = { ...freshDailyState(), dailyAdsShown: 2 };
  const s2 = applyCheckNewDay(s, 'Mon Jan 01 2024');
  assert(s2.dailyAdsShown === 0, `dailyAdsShown should be 0, got ${s2.dailyAdsShown}`);
});

test('G4: CHECK_NEW_DAY resets extraAiAnalyses to 0', () => {
  const s  = { ...freshDailyState(), extraAiAnalyses: 5 };
  const s2 = applyCheckNewDay(s, 'Mon Jan 01 2024');
  assert(s2.extraAiAnalyses === 0, `extraAiAnalyses should be 0, got ${s2.extraAiAnalyses}`);
});

test('G5: CHECK_NEW_DAY resets session flags', () => {
  const s = {
    ...freshDailyState(),
    dailyBaseSessionStarted: true,
    dailyLessonBonusClaimed: true,
    dailyBonusSessionStarted: true,
  };
  const s2 = applyCheckNewDay(s, 'Mon Jan 01 2024');
  assert(s2.dailyBaseSessionStarted  === false, 'dailyBaseSessionStarted should be false');
  assert(s2.dailyLessonBonusClaimed  === false, 'dailyLessonBonusClaimed should be false');
  assert(s2.dailyBonusSessionStarted === false, 'dailyBonusSessionStarted should be false');
});

test('G6: CHECK_NEW_DAY is a no-op when todayDate already matches today', () => {
  const s  = { ...freshDailyState(), dailyProgress: 7 };
  const s2 = applyCheckNewDay(s); // no simulatedYesterday → todayDate matches today
  assert(s2.dailyProgress === 7, 'should be no-op when same day');
});

// ── H. Lesson selection policy (mirrors simplified getDailyWords) ─────────────
//
// getDailyWords now returns ONLY words with correctCount===0 AND wrongCount===0
// at the user's level, excluding lastLessonWordIds, up to lessonSize.
// No review-candidate fallback.

interface MockWord { id: number; level: string; }

/**
 * Mirrors the new getDailyWords logic (AppContext.tsx).
 * Takes a flat word list and a wordProgress map and returns new-only words.
 */
function selectNewLessonWords(
  allVocab: MockWord[],
  level: string,
  wp: WP,
  lastLessonIds: number[],
  lessonSize: number,
): MockWord[] {
  const lastLesson    = new Set(lastLessonIds);
  const interactedIds = new Set(
    Object.entries(wp)
      .filter(([, p]) => p.correctCount > 0 || p.wrongCount > 0)
      .map(([id]) => Number(id)),
  );
  return allVocab
    .filter(w => w.level === level && !interactedIds.has(w.id) && !lastLesson.has(w.id))
    .slice(0, lessonSize);
}

/**
 * Mirrors the Zorlandıklarım filter (HomeScreen.tsx):
 *   isDifficult === true OR (wrongCount > 0 AND correctCount === 0)
 */
function selectDifficultWords(allIds: number[], wp: WP): number[] {
  return allIds.filter(id => {
    const p = wp[id];
    return p ? p.isDifficult || (p.wrongCount > 0 && p.correctCount === 0) : false;
  });
}

/**
 * Mirrors the Tekrar Et filter (HomeScreen.tsx):
 *   correctCount > 0 AND nextReviewAt <= now
 */
function selectReviewDueWords(allIds: number[], wp: WP, now: number): number[] {
  return allIds.filter(id => {
    const p = wp[id];
    return p && p.correctCount > 0 && p.nextReviewAt <= now;
  });
}

const VOCAB: MockWord[] = [
  { id: 1, level: 'easy' },
  { id: 2, level: 'easy' },
  { id: 3, level: 'easy' },
  { id: 4, level: 'easy' },
  { id: 5, level: 'easy' },
  { id: 6, level: 'medium' }, // different level — should not appear in easy lessons
];
const ALL_IDS = VOCAB.map(w => w.id);

test('H1: getDailyWords returns words with correctCount===0 AND wrongCount===0 only', () => {
  // word 1: learned, word 2: wrong — both should be excluded
  const wp: WP = {
    1: { ...emptyProgress(), correctCount: 1, isLearned: true, nextReviewAt: Date.now() + MS_PER_DAY },
    2: { ...emptyProgress(), wrongCount: 1, isDifficult: true, nextReviewAt: Date.now() + MS_PER_DAY },
  };
  const result = selectNewLessonWords(VOCAB, 'easy', wp, [], 10);
  assert(!result.some(w => w.id === 1), 'learned word (id=1) must not appear');
  assert(!result.some(w => w.id === 2), 'wrong word (id=2) must not appear');
  assert(result.some(w => w.id === 3), 'unseen word (id=3) must appear');
});

test('H2: a word with correctCount=1 is excluded from getDailyWords', () => {
  const wp: WP = { 1: { ...emptyProgress(), correctCount: 1, isLearned: true, nextReviewAt: Date.now() + MS_PER_DAY } };
  const result = selectNewLessonWords(VOCAB, 'easy', wp, [], 10);
  assert(!result.some(w => w.id === 1), 'correctCount=1 word must be excluded');
});

test('H3: a word with wrongCount=1 (isDifficult) is excluded from getDailyWords', () => {
  const wp: WP = { 1: { ...emptyProgress(), wrongCount: 1, isDifficult: true, nextReviewAt: Date.now() + MS_PER_DAY } };
  const result = selectNewLessonWords(VOCAB, 'easy', wp, [], 10);
  assert(!result.some(w => w.id === 1), 'wrongCount=1 word must be excluded');
});

test('H4: in-recovery word (wrongCount=1, correctCount=1) is excluded from getDailyWords', () => {
  const wp: WP = { 1: { ...emptyProgress(), wrongCount: 1, correctCount: 1, isDifficult: true, isLearned: true, nextReviewAt: Date.now() + MS_PER_DAY } };
  const result = selectNewLessonWords(VOCAB, 'easy', wp, [], 10);
  assert(!result.some(w => w.id === 1), 'in-recovery word must be excluded');
});

test('H5: lastLessonWordIds excludes words from getDailyWords', () => {
  const result = selectNewLessonWords(VOCAB, 'easy', {}, [1, 2], 10);
  assert(!result.some(w => w.id === 1), 'lastLesson word (id=1) must be excluded');
  assert(!result.some(w => w.id === 2), 'lastLesson word (id=2) must be excluded');
  assert(result.some(w => w.id === 3), 'non-lastLesson word (id=3) must appear');
});

test('H6: getDailyWords returns at most lessonSize words', () => {
  const result = selectNewLessonWords(VOCAB, 'easy', {}, [], 3);
  assert(result.length <= 3, `result length ${result.length} must be ≤ 3`);
});

test('H7: getDailyWords returns fewer than lessonSize when pool is smaller (no padding)', () => {
  // Only 2 easy words are unseen; lessonSize is 10
  const wp: WP = {
    1: { ...emptyProgress(), correctCount: 1, isLearned: true, nextReviewAt: Date.now() + MS_PER_DAY },
    2: { ...emptyProgress(), correctCount: 1, isLearned: true, nextReviewAt: Date.now() + MS_PER_DAY },
    3: { ...emptyProgress(), wrongCount: 1, isDifficult: true, nextReviewAt: Date.now() + MS_PER_DAY },
    4: { ...emptyProgress(), wrongCount: 1, isDifficult: true, nextReviewAt: Date.now() + MS_PER_DAY },
    5: { ...emptyProgress(), wrongCount: 1, isDifficult: true, nextReviewAt: Date.now() + MS_PER_DAY },
  };
  // Wait — 1-5 are all interacted; but we need at least one unseen. Let's redo:
  // Use only ids 1-3 as interacted, 4-5 remain new
  const wp2: WP = {
    1: { ...emptyProgress(), correctCount: 1, isLearned: true, nextReviewAt: Date.now() + MS_PER_DAY },
    2: { ...emptyProgress(), wrongCount: 1, isDifficult: true, nextReviewAt: Date.now() + MS_PER_DAY },
    3: { ...emptyProgress(), wrongCount: 1, isDifficult: true, nextReviewAt: Date.now() + MS_PER_DAY },
  };
  // 2 unseen easy words remain (id=4, id=5)
  const result = selectNewLessonWords(VOCAB, 'easy', wp2, [], 10);
  assert(result.length === 2, `expected 2 words (no padding), got ${result.length}`);
});

test('H8: getDailyWords returns [] when all words at level are interacted', () => {
  const wp: WP = {};
  for (let i = 1; i <= 5; i++) {
    wp[i] = { ...emptyProgress(), correctCount: 1, isLearned: true, nextReviewAt: Date.now() + MS_PER_DAY };
  }
  const result = selectNewLessonWords(VOCAB, 'easy', wp, [], 10);
  assert(result.length === 0, `expected 0 words, got ${result.length}`);
});

test('H9: Zorlandıklarım includes isDifficult=true words even with correctCount>0 (in-recovery)', () => {
  const wp: WP = {
    1: { ...emptyProgress(), isDifficult: true, wrongCount: 1, correctCount: 1, isLearned: true, nextReviewAt: Date.now() + MS_PER_DAY },
  };
  const result = selectDifficultWords([1, 2, 3], wp);
  assert(result.includes(1), 'in-recovery word (isDifficult=true, correctCount=1) must appear in Zorlandıklarım');
});

test('H10: Zorlandıklarım includes wrongCount>0, correctCount===0 words', () => {
  const wp: WP = {
    1: { ...emptyProgress(), wrongCount: 1, isDifficult: true },
  };
  const result = selectDifficultWords([1, 2, 3], wp);
  assert(result.includes(1), 'wrong-never-correct word must appear in Zorlandıklarım');
});

test('H11: Zorlandıklarım excludes unseen words (correctCount===0, wrongCount===0)', () => {
  const result = selectDifficultWords([1, 2, 3], {});
  assert(!result.includes(1), 'unseen word must not appear in Zorlandıklarım');
  assert(result.length === 0, 'empty wp → empty Zorlandıklarım');
});

// ── Voluntary Tekrar Et selection (mirrors HomeScreen.tsx learnedReviewWords) ─

interface MockWordWithId { id: number; }

/**
 * Mirrors the learnedReviewWords computation in HomeScreen:
 *   - includes all words with correctCount > 0 (no nextReviewAt gate)
 *   - sorted: due first → isDifficult → lowest correctCount → most overdue
 */
function selectVoluntaryReviewWords(
  allIds: number[],
  wp: WP,
  now: number,
): number[] {
  return allIds
    .filter(id => {
      const p = wp[id];
      return p && p.correctCount > 0;
    })
    .sort((a, b) => {
      const pA = wp[a];
      const pB = wp[b];
      const aDue = pA.nextReviewAt <= now;
      const bDue = pB.nextReviewAt <= now;
      if (aDue !== bDue) return aDue ? -1 : 1;
      if (pA.isDifficult !== pB.isDifficult) return pA.isDifficult ? -1 : 1;
      if (pA.correctCount !== pB.correctCount) return pA.correctCount - pB.correctCount;
      return pA.nextReviewAt - pB.nextReviewAt;
    });
}

test('H12: Tekrar Et includes all correctCount>0 words regardless of nextReviewAt', () => {
  const now = Date.now();
  const wp: WP = {
    1: { ...emptyProgress(), correctCount: 1, isLearned: true, nextReviewAt: now - 1000 },        // due
    2: { ...emptyProgress(), correctCount: 1, isLearned: true, nextReviewAt: now + MS_PER_DAY },   // future
    3: { ...emptyProgress(), wrongCount: 1, isDifficult: true, nextReviewAt: now - 1000 },         // wrong, correctCount=0
  };
  const result = selectVoluntaryReviewWords([1, 2, 3], wp, now);
  assert(result.includes(1),  'due correct word must appear in Tekrar Et');
  assert(result.includes(2),  'future-due correct word must ALSO appear (voluntary review)');
  assert(!result.includes(3), 'wrong-never-correct word must not appear in Tekrar Et');
});

test('H13: Tekrar Et priority — due words appear before future words', () => {
  const now = Date.now();
  const wp: WP = {
    1: { ...emptyProgress(), correctCount: 1, isLearned: true, nextReviewAt: now + MS_PER_DAY },   // future
    2: { ...emptyProgress(), correctCount: 1, isLearned: true, nextReviewAt: now - 1000 },         // due
  };
  const result = selectVoluntaryReviewWords([1, 2], wp, now);
  assert(result[0] === 2, `due word (id=2) should be first, got id=${result[0]}`);
  assert(result[1] === 1, `future word (id=1) should be second, got id=${result[1]}`);
});

test('H14: Tekrar Et priority — among future words, isDifficult before non-difficult', () => {
  const now = Date.now();
  const wp: WP = {
    1: { ...emptyProgress(), correctCount: 2, isLearned: true, isDifficult: false, nextReviewAt: now + MS_PER_DAY },
    2: { ...emptyProgress(), correctCount: 1, isLearned: true, isDifficult: true,  nextReviewAt: now + MS_PER_DAY },
  };
  const result = selectVoluntaryReviewWords([1, 2], wp, now);
  assert(result[0] === 2, `in-recovery word (id=2, isDifficult) should be first, got id=${result[0]}`);
});

test('H15: Tekrar Et priority — among same-due-status non-difficult words, lower correctCount first', () => {
  const now = Date.now();
  const wp: WP = {
    1: { ...emptyProgress(), correctCount: 3, isLearned: true, nextReviewAt: now + 2 * MS_PER_DAY },
    2: { ...emptyProgress(), correctCount: 1, isLearned: true, nextReviewAt: now + MS_PER_DAY },
  };
  const result = selectVoluntaryReviewWords([1, 2], wp, now);
  assert(result[0] === 2, `lower correctCount (id=2) should be first, got id=${result[0]}`);
});

// ─── Review rotation helper ───────────────────────────────────────────────────
// Mirrors handleReviewWords in HomeScreen: fresh words fill first, stale backfill.

function selectRotatingReviewWords(
  allIds: number[],
  wp: WP,
  lastReviewIds: number[],
  cap: number,
  now: number,
): number[] {
  const sorted  = selectVoluntaryReviewWords(allIds, wp, now);
  const lastSet = new Set(lastReviewIds);
  const fresh   = sorted.filter(id => !lastSet.has(id));
  const stale   = sorted.filter(id =>  lastSet.has(id));
  return [...fresh, ...stale].slice(0, cap);
}

test('H16: review rotation — fresh words preferred when alternatives exist', () => {
  const now = Date.now();
  const wp: WP = {
    1: { ...emptyProgress(), correctCount: 1, isLearned: true, nextReviewAt: now + MS_PER_DAY },
    2: { ...emptyProgress(), correctCount: 1, isLearned: true, nextReviewAt: now + MS_PER_DAY },
    3: { ...emptyProgress(), correctCount: 1, isLearned: true, nextReviewAt: now + MS_PER_DAY },
    4: { ...emptyProgress(), correctCount: 1, isLearned: true, nextReviewAt: now + MS_PER_DAY },
    5: { ...emptyProgress(), correctCount: 1, isLearned: true, nextReviewAt: now + MS_PER_DAY },
    6: { ...emptyProgress(), correctCount: 1, isLearned: true, nextReviewAt: now + MS_PER_DAY },
  };
  const result = selectRotatingReviewWords([1,2,3,4,5,6], wp, [1,2,3], 3, now);
  assert(!result.includes(1), 'last-session word id=1 should be excluded when fresh words available');
  assert(!result.includes(2), 'last-session word id=2 should be excluded when fresh words available');
  assert(!result.includes(3), 'last-session word id=3 should be excluded when fresh words available');
  assert(result.includes(4), 'fresh word id=4 should be selected');
  assert(result.includes(5), 'fresh word id=5 should be selected');
  assert(result.includes(6), 'fresh word id=6 should be selected');
  assert(result.length === 3, `should return exactly 3 words, got ${result.length}`);
});

test('H17: review rotation — stale words backfill when fresh pool is smaller than cap', () => {
  const now = Date.now();
  const wp: WP = {
    1: { ...emptyProgress(), correctCount: 1, isLearned: true, nextReviewAt: now + MS_PER_DAY },
    2: { ...emptyProgress(), correctCount: 1, isLearned: true, nextReviewAt: now + MS_PER_DAY },
    3: { ...emptyProgress(), correctCount: 1, isLearned: true, nextReviewAt: now + MS_PER_DAY },
    4: { ...emptyProgress(), correctCount: 1, isLearned: true, nextReviewAt: now + MS_PER_DAY },
  };
  const result = selectRotatingReviewWords([1,2,3,4], wp, [1,2,3], 3, now);
  assert(result.includes(4), 'fresh word id=4 must appear first');
  assert(result.length === 3, `should return exactly 3 words, got ${result.length}`);
  const staleInResult = result.filter(id => [1,2,3].includes(id));
  assert(staleInResult.length === 2, `should backfill 2 stale words, got ${staleInResult.length}`);
});

test('H18: review rotation — no starvation when entire pool was last session', () => {
  const now = Date.now();
  const wp: WP = {
    1: { ...emptyProgress(), correctCount: 1, isLearned: true, nextReviewAt: now + MS_PER_DAY },
    2: { ...emptyProgress(), correctCount: 1, isLearned: true, nextReviewAt: now + MS_PER_DAY },
    3: { ...emptyProgress(), correctCount: 1, isLearned: true, nextReviewAt: now + MS_PER_DAY },
  };
  const result = selectRotatingReviewWords([1,2,3], wp, [1,2,3], 3, now);
  assert(result.length === 3, `all 3 words must be returned to prevent starvation, got ${result.length}`);
  assert(result.includes(1) && result.includes(2) && result.includes(3), 'all ids must be present');
});

test('H19: review rotation — empty lastReviewWordIds behaves identically to base selection', () => {
  const now = Date.now();
  const wp: WP = {
    1: { ...emptyProgress(), correctCount: 1, isLearned: true, nextReviewAt: now + MS_PER_DAY },
    2: { ...emptyProgress(), correctCount: 1, isLearned: true, nextReviewAt: now + MS_PER_DAY },
    3: { ...emptyProgress(), correctCount: 1, isLearned: true, nextReviewAt: now + MS_PER_DAY },
    4: { ...emptyProgress(), correctCount: 1, isLearned: true, nextReviewAt: now + MS_PER_DAY },
    5: { ...emptyProgress(), correctCount: 1, isLearned: true, nextReviewAt: now + MS_PER_DAY },
  };
  const base    = selectVoluntaryReviewWords([1,2,3,4,5], wp, now).slice(0, 3);
  const rotated = selectRotatingReviewWords([1,2,3,4,5], wp, [], 3, now);
  assert(
    JSON.stringify(base) === JSON.stringify(rotated),
    `empty lastReviewIds should produce identical result: base=${base} rotated=${rotated}`,
  );
});

// ─── Summary ───────────────────────────────────────────────────────────────────

function run(): void {
  console.log(`\n${BOLD}${CYAN}════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}${CYAN}  WordSwipe — SRS Reducer Unit Tests${RESET}`);
  console.log(`${BOLD}${CYAN}════════════════════════════════════════${RESET}\n`);

  const passed  = results.filter(r => r.passed).length;
  const failed  = results.filter(r => !r.passed).length;
  const total   = results.length;

  for (const r of results) {
    if (r.passed) {
      console.log(`  ${GREEN}✓${RESET} ${DIM}${r.name}${RESET}`);
    } else {
      console.log(`  ${RED}✗ ${r.name}${RESET}`);
      console.log(`    ${RED}${r.failure}${RESET}`);
    }
  }

  console.log('\n' + '─'.repeat(42));
  console.log(
    `${BOLD}Total: ${total}${RESET}  |  ` +
    `${GREEN}Pass: ${passed}${RESET}  |  ` +
    `${failed > 0 ? RED : DIM}Fail: ${failed}${RESET}`,
  );
  console.log(`${BOLD}${CYAN}════════════════════════════════════════${RESET}\n`);

  if (failed > 0) process.exit(1);
}

run();
