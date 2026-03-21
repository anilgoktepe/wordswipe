import React, { createContext, useContext, useReducer, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Word, getLocalWords, getWords, WordSource } from '../services/vocabularyService';

export type Level = 'easy' | 'medium' | 'hard';

// ─── Spaced-repetition intervals ────────────────────────────────────────────
const MS_PER_DAY = 86_400_000;

/** Wrong answer → try again tomorrow */
const INTERVAL_WRONG = 1 * MS_PER_DAY;

/**
 * Growing review intervals keyed by how many times the word has been answered
 * correctly (AFTER counting this answer).
 *   1st correct → 1 day
 *   2nd correct → 3 days
 *   3rd correct → 7 days
 *   4th correct → 14 days
 *   5th+ correct → 30 days
 */
const SRS_INTERVALS = [1, 3, 7, 14, 30].map(d => d * MS_PER_DAY);

/** Return the review interval for a given correctCount (1-based, post-increment). */
function srsInterval(newCorrectCount: number): number {
  const idx = Math.min(newCorrectCount, SRS_INTERVALS.length) - 1;
  return SRS_INTERVALS[Math.max(0, idx)];
}

// ─── Per-word progress record ────────────────────────────────────────────────
export interface WordProgress {
  /** How many quiz sessions this word has been encountered in */
  seenCount: number;
  /** Times answered correctly on first attempt (across all sessions) */
  correctCount: number;
  /** Total wrong attempts (across all sessions) */
  wrongCount: number;
  /** Was the very first quiz interaction with this word wrong? */
  firstAttemptWrong: boolean;
  /** Passed at least one first-attempt-correct quiz */
  isLearned: boolean;
  /** Has had at least one wrong answer; still needs reinforcement */
  isDifficult: boolean;
  /**
   * Consecutive first-attempt-correct answers while isDifficult is true.
   * Resets to 0 on any wrong answer. When it reaches 3, isDifficult is cleared.
   */
  consecutiveCorrect: number;
  /** Unix-ms timestamp: earliest this word should reappear as a review */
  nextReviewAt: number;
}

// ─── App state ───────────────────────────────────────────────────────────────
export interface AppState {
  level: Level | null;
  xp: number;
  streak: number;
  lastStudyDate: string | null;

  /** Source-of-truth learning engine */
  wordProgress: Record<number, WordProgress>;

  /**
   * Derived from wordProgress for UI-screen compatibility.
   * Never write to these directly — they are always recomputed by the reducer.
   */
  difficultWords: number[];
  learnedWordIds: number[];

  darkMode: boolean;
  sessionWords: Word[];
  sessionResults: {
    correct: number;
    incorrect: number;
    wrongWordIds: number[];
  } | null;
  lastLessonWordIds: number[];
  lessonSize: number;

  /** Daily progress tracking — resets every new calendar day */
  dailyProgress: number;
  /** ISO date string (toDateString) of the last day dailyProgress was updated */
  todayDate: string;
  /** Word IDs already counted toward dailyProgress today (prevents double-counting) */
  dailyLearnedIds: number[];

  // ── Ad system ──────────────────────────────────────────────────────────────
  /** Premium users see no ads */
  isPremium: boolean;
  /** How many ads have been shown today */
  dailyAdsShown: number;
  /** Date string matching dailyAdsShown — resets counter on a new day */
  adsDate: string;
}

// ─── Actions (unchanged surface API so all screens keep working) ─────────────
type Action =
  | { type: 'SET_LEVEL'; level: Level }
  | { type: 'ADD_XP'; amount: number }
  | { type: 'UPDATE_STREAK' }
  | { type: 'ADD_DIFFICULT_WORD'; wordId: number }
  | { type: 'REMOVE_DIFFICULT_WORD'; wordId: number }
  | { type: 'MARK_WORD_LEARNED'; wordId: number }
  | { type: 'TOGGLE_DARK_MODE' }
  | { type: 'SET_SESSION_WORDS'; words: Word[] }
  | { type: 'SET_SESSION_RESULTS'; results: AppState['sessionResults'] }
  | { type: 'SET_LAST_LESSON_WORDS'; wordIds: number[] }
  | { type: 'SET_LESSON_SIZE'; size: number }
  | { type: 'LOAD_STATE'; state: Partial<AppState> }
  | { type: 'RESET_PROGRESS' }
  | { type: 'RECORD_AD_SHOWN' };

// ─── Helpers ─────────────────────────────────────────────────────────────────

const initialState: AppState = {
  level: null,
  xp: 0,
  streak: 0,
  lastStudyDate: null,
  wordProgress: {},
  difficultWords: [],
  learnedWordIds: [],
  darkMode: false,
  sessionWords: [],
  sessionResults: null,
  lastLessonWordIds: [],
  lessonSize: 20,
  dailyProgress: 0,
  todayDate: new Date().toDateString(),
  dailyLearnedIds: [],
  isPremium: false,
  dailyAdsShown: 0,
  adsDate: new Date().toDateString(),
};

/** Build an empty progress entry for a word that has never been seen */
function emptyProgress(): WordProgress {
  return {
    seenCount: 0,
    correctCount: 0,
    wrongCount: 0,
    firstAttemptWrong: false,
    isLearned: false,
    isDifficult: false,
    consecutiveCorrect: 0,
    nextReviewAt: 0,
  };
}

/**
 * Recompute the derived arrays that UI screens read directly from state.
 * Call this after every mutation to wordProgress.
 */
function deriveFromProgress(
  wp: Record<number, WordProgress>,
): Pick<AppState, 'learnedWordIds' | 'difficultWords'> {
  const learnedWordIds: number[] = [];
  const difficultWords: number[] = [];
  for (const key of Object.keys(wp)) {
    const id = Number(key);
    if (wp[id].isLearned)   learnedWordIds.push(id);
    if (wp[id].isDifficult) difficultWords.push(id);
  }
  return { learnedWordIds, difficultWords };
}

/**
 * Migrate legacy saved state (learnedWordIds / difficultWords arrays) into the
 * new wordProgress map. Used once on first load after an upgrade.
 */
function migrateFromLegacy(
  legacyLearned: number[],
  legacyDifficult: number[],
): Record<number, WordProgress> {
  const now = Date.now();
  const wp: Record<number, WordProgress> = {};
  const allIds = new Set([...legacyLearned, ...legacyDifficult]);

  for (const id of allIds) {
    const isLearned   = legacyLearned.includes(id);
    const isDifficult = legacyDifficult.includes(id);
    const correctCount = isLearned ? 1 : 0;
    wp[id] = {
      seenCount:          1,
      correctCount,
      wrongCount:         isDifficult ? 1 : 0,
      firstAttemptWrong:  isDifficult,
      isLearned,
      isDifficult,
      consecutiveCorrect: 0,
      // Difficult words are due immediately; learned-only words get a 1-day
      // grace period so they don't all flood back into the very next lesson.
      nextReviewAt: isDifficult ? now : now + srsInterval(correctCount),
    };
  }
  return wp;
}

// ─── Reducer ─────────────────────────────────────────────────────────────────
function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    // ── Simple non-progress actions ──────────────────────────────────────────
    case 'SET_LEVEL':
      return { ...state, level: action.level };

    case 'ADD_XP':
      return { ...state, xp: state.xp + action.amount };

    case 'UPDATE_STREAK': {
      const today     = new Date().toDateString();
      const yesterday = new Date(Date.now() - 86_400_000).toDateString();
      if (state.lastStudyDate === today) return state;
      const newStreak = state.lastStudyDate === yesterday ? state.streak + 1 : 1;
      return { ...state, streak: newStreak, lastStudyDate: today };
    }

    case 'TOGGLE_DARK_MODE':
      return { ...state, darkMode: !state.darkMode };

    case 'SET_SESSION_WORDS':
      return { ...state, sessionWords: action.words };

    case 'SET_SESSION_RESULTS':
      return { ...state, sessionResults: action.results };

    case 'SET_LAST_LESSON_WORDS':
      return { ...state, lastLessonWordIds: action.wordIds };

    case 'SET_LESSON_SIZE':
      return { ...state, lessonSize: action.size };

    // ── Quiz evaluation: wrong answer ────────────────────────────────────────
    case 'ADD_DIFFICULT_WORD': {
      const existing = state.wordProgress[action.wordId] ?? emptyProgress();

      // isFirstEver: true when this is the very first quiz interaction
      const isFirstEver = existing.wrongCount === 0 && existing.correctCount === 0;

      const updated: WordProgress = {
        ...existing,
        wrongCount:         existing.wrongCount + 1,
        // If this is the first-ever interaction and it's wrong → flag it
        firstAttemptWrong:  isFirstEver ? true : existing.firstAttemptWrong,
        isDifficult:        true,
        // Any wrong answer breaks the consecutive-correct streak
        consecutiveCorrect: 0,
        // Cancel learned status only if this is the very first encounter
        isLearned:          isFirstEver ? false : existing.isLearned,
        // Schedule review: tomorrow
        nextReviewAt:       Date.now() + INTERVAL_WRONG,
        // seenCount increments only on the first wrong (= first encounter)
        seenCount:          isFirstEver ? existing.seenCount + 1 : existing.seenCount,
      };

      const wordProgress = { ...state.wordProgress, [action.wordId]: updated };
      return { ...state, wordProgress, ...deriveFromProgress(wordProgress) };
    }

    // ── Quiz evaluation: first-attempt correct ───────────────────────────────
    case 'MARK_WORD_LEARNED': {
      const existing = state.wordProgress[action.wordId] ?? emptyProgress();
      const isFirstSeen   = existing.correctCount === 0 && existing.wrongCount === 0;
      const newCorrectCount = existing.correctCount + 1;

      // Track consecutive correct answers for difficult words.
      // Increment if word is currently difficult; otherwise carry existing value.
      const newConsecutive = existing.isDifficult
        ? existing.consecutiveCorrect + 1
        : existing.consecutiveCorrect;

      // Auto-clear isDifficult after 3 consecutive first-attempt-correct answers
      const newIsDifficult = existing.isDifficult && newConsecutive < 3
        ? true
        : false;

      const updated: WordProgress = {
        ...existing,
        correctCount:       newCorrectCount,
        isLearned:          true,
        isDifficult:        newIsDifficult,
        consecutiveCorrect: newIsDifficult ? newConsecutive : 0,
        // Interval grows with each correct answer (1→3→7→14→30 days)
        nextReviewAt:       Date.now() + srsInterval(newCorrectCount),
        seenCount:          isFirstSeen ? existing.seenCount + 1 : existing.seenCount,
      };

      const wordProgress = { ...state.wordProgress, [action.wordId]: updated };

      // ── Daily progress: count each word only once per calendar day ──────────
      // Recalculate today on every action so midnight crossings are handled
      // correctly even if the app runs past midnight without restarting.
      const today = new Date().toDateString();
      const isSameDay = state.todayDate === today;
      // On a new day, start daily counters fresh before applying this word.
      const baseProgress    = isSameDay ? state.dailyProgress    : 0;
      const baseLearnedIds  = isSameDay ? state.dailyLearnedIds  : [];
      const alreadyCountedToday = isSameDay && baseLearnedIds.includes(action.wordId);
      const newDailyProgress   = alreadyCountedToday ? baseProgress : baseProgress + 1;
      const newDailyLearnedIds = alreadyCountedToday
        ? baseLearnedIds
        : [...baseLearnedIds, action.wordId];

      return {
        ...state,
        wordProgress,
        ...deriveFromProgress(wordProgress),
        dailyProgress:   newDailyProgress,
        todayDate:       today,
        dailyLearnedIds: newDailyLearnedIds,
      };
    }

    // ── Manual difficult removal (DifficultWordsScreen) ─────────────────────
    case 'REMOVE_DIFFICULT_WORD': {
      const existing = state.wordProgress[action.wordId];
      if (!existing) return state;
      const updated: WordProgress = { ...existing, isDifficult: false };
      const wordProgress = { ...state.wordProgress, [action.wordId]: updated };
      return { ...state, wordProgress, ...deriveFromProgress(wordProgress) };
    }

    // ── State hydration + legacy migration ───────────────────────────────────
    case 'LOAD_STATE': {
      const loaded = action.state as any; // any to safely access legacy fields

      let wordProgress: Record<number, WordProgress>;

      if (loaded.wordProgress && Object.keys(loaded.wordProgress).length > 0) {
        // Already using new format — use directly
        wordProgress = loaded.wordProgress as Record<number, WordProgress>;
      } else {
        // Legacy format: build wordProgress from the old arrays
        const legacyLearned:   number[] = loaded.learnedWordIds  ?? [];
        const legacyDifficult: number[] = loaded.difficultWords   ?? [];
        wordProgress = migrateFromLegacy(legacyLearned, legacyDifficult);
      }

      const derived = deriveFromProgress(wordProgress);

      // ── Daily progress: reset if the saved date is not today ─────────────────
      const today = new Date().toDateString();
      const savedDate    = loaded.todayDate ?? '';
      const isNewDay     = savedDate !== today;
      const savedAdsDate = loaded.adsDate ?? '';
      const isNewAdsDay  = savedAdsDate !== today;

      return {
        ...state,
        level:             loaded.level             ?? state.level,
        xp:                loaded.xp                ?? state.xp,
        streak:            loaded.streak            ?? state.streak,
        lastStudyDate:     loaded.lastStudyDate     ?? state.lastStudyDate,
        darkMode:          loaded.darkMode          ?? state.darkMode,
        lastLessonWordIds: loaded.lastLessonWordIds ?? state.lastLessonWordIds,
        lessonSize:        loaded.lessonSize        ?? state.lessonSize,
        wordProgress,
        ...derived,
        // Reset daily counters on a new day; otherwise restore saved values
        dailyProgress:   isNewDay    ? 0  : (loaded.dailyProgress   ?? 0),
        todayDate:       today,
        dailyLearnedIds: isNewDay    ? [] : (loaded.dailyLearnedIds ?? []),
        // Ad state
        isPremium:       loaded.isPremium    ?? false,
        dailyAdsShown:   isNewAdsDay ? 0  : (loaded.dailyAdsShown   ?? 0),
        adsDate:         today,
      };
    }

    // ── Ad impression tracking ────────────────────────────────────────────────
    case 'RECORD_AD_SHOWN': {
      const today = new Date().toDateString();
      // Reset counter if somehow called on a new day before LOAD_STATE fires
      const base = state.adsDate === today ? state.dailyAdsShown : 0;
      return { ...state, dailyAdsShown: base + 1, adsDate: today };
    }

    // ── Full reset (keeps level + dark mode + premium status) ────────────────
    case 'RESET_PROGRESS':
      return {
        ...initialState,
        level:      state.level,
        darkMode:   state.darkMode,
        isPremium:  state.isPremium,   // preserve subscription across resets
        // initialState.todayDate is computed once at module load and can be
        // stale if the app runs past midnight. Always use the real current date
        // so dailyLearnedIds / dailyProgress start clean from the correct day.
        todayDate: new Date().toDateString(),
        adsDate:   new Date().toDateString(),
      };

    default:
      return state;
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────
interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  isLoaded: boolean;
  vocabularySource: WordSource;
  setVocabularySource: (source: WordSource) => void;
  getDailyWords: () => Word[];
  getDifficultWordObjects: () => Word[];
  getLastLessonWords: () => Word[];
  getSupplementaryApiWords: () => Promise<Word[]>;
}

const AppContext = createContext<AppContextValue | null>(null);

const STORAGE_KEY = '@wordswipe_state';

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [isLoaded, setIsLoaded] = useState(false);

  // ── Vocabulary source ──────────────────────────────────────────────────────
  // Preserved for future use. Does NOT affect the main lesson/quiz/progress
  // engine — all core flows always use the authoritative local word list.
  const [vocabularySource, setVocabularySource] = useState<WordSource>('local');

  // The authoritative local word list — used by every lesson/quiz/progress helper.
  // Never replaced by API data to keep the learning engine stable.
  const localVocabulary = getLocalWords();

  // Load persisted state once on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        try {
          const saved = JSON.parse(raw);
          dispatch({ type: 'LOAD_STATE', state: saved });
        } catch {}
      }
      setIsLoaded(true);
    });
  }, []);

  // Persist on every change (skip until first load to avoid clobbering saved data).
  // Excluded from storage:
  //   sessionWords / sessionResults — transient UI state, rebuilt per session
  //   learnedWordIds / difficultWords — always derived from wordProgress on load
  useEffect(() => {
    if (!isLoaded) return;
    // Excluded: sessionWords, sessionResults (transient)
    //           learnedWordIds, difficultWords (always re-derived from wordProgress on load)
    const { sessionWords, sessionResults, learnedWordIds, difficultWords, ...persistable } = state;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
  }, [state, isLoaded]);

  // ─── getDailyWords — priority-ordered spaced-repetition selection ─────────
  const getDailyWords = (): Word[] => {
    if (!state.level) return [];
    const now        = Date.now();
    const target     = state.lessonSize ?? 20;
    const wp         = state.wordProgress;

    // Words seen in the previous lesson — avoid immediate repetition.
    // These are used as a secondary filter: primary pass skips them;
    // fallback pass uses them only if there aren't enough other words.
    const lastLesson = new Set(state.lastLessonWordIds);

    // ── Bucket 1: Difficult words due for review (most overdue first) ────────
    const difficultDue: Word[] = Object.entries(wp)
      .filter(([, p]) => p.isDifficult && p.nextReviewAt <= now)
      .sort(([, a], [, b]) => a.nextReviewAt - b.nextReviewAt)
      .map(([id]) => localVocabulary.find(w => w.id === Number(id)))
      .filter((w): w is Word => w !== undefined);

    // ── Bucket 2: Learned words due for review (most overdue first) ──────────
    const learnedDue: Word[] = Object.entries(wp)
      .filter(([, p]) => p.isLearned && !p.isDifficult && p.nextReviewAt <= now)
      .sort(([, a], [, b]) => a.nextReviewAt - b.nextReviewAt)
      .map(([id]) => localVocabulary.find(w => w.id === Number(id)))
      .filter((w): w is Word => w !== undefined);

    // ── Bucket 3: New/unseen words from current level ────────────────────────
    const seenIds    = new Set(Object.keys(wp).map(Number));
    const levelWords = localVocabulary.filter(w => w.level === state.level);
    const newWords   = levelWords.filter(w => !seenIds.has(w.id));

    // ── Primary pass: fill up to target, skipping last-lesson words ──────────
    const added  = new Set<number>();
    const result: Word[] = [];

    for (const w of [...difficultDue, ...learnedDue, ...newWords]) {
      if (result.length >= target) break;
      if (!added.has(w.id) && !lastLesson.has(w.id)) {
        added.add(w.id);
        result.push(w);
      }
    }

    // ── Fallback pass: if still under target, backfill from last-lesson words ─
    // (guarantees a full lesson even when the available pool is small)
    if (result.length < target) {
      for (const w of [...difficultDue, ...learnedDue, ...newWords]) {
        if (result.length >= target) break;
        if (!added.has(w.id)) {
          added.add(w.id);
          result.push(w);
        }
      }
    }

    return result;
  };

  // ─── Helper accessors ─────────────────────────────────────────────────────
  // Read from wordProgress (source of truth), not the derived cache arrays.
  // This guarantees freshness even when a screen is re-focused after being
  // frozen by react-freeze while another screen was active.
  const getDifficultWordObjects = (): Word[] =>
    localVocabulary.filter(w => state.wordProgress[w.id]?.isDifficult === true);

  const getLastLessonWords = (): Word[] =>
    localVocabulary.filter(w => state.lastLessonWordIds.includes(w.id));

  // ─── Supplementary API words ───────────────────────────────────────────────
  // Isolated from the core learning engine. API words returned here:
  //   - are NOT tracked in wordProgress
  //   - do NOT affect learnedWordIds, difficultWords, or seen counts
  //   - are NOT used by getDailyWords, getDifficultWordObjects, or getLastLessonWords
  // Safe to display alongside local content (e.g. explore/browse screens).
  const getSupplementaryApiWords = (): Promise<Word[]> =>
    getWords({ source: 'api' });

  return (
    <AppContext.Provider
      value={{ state, dispatch, isLoaded, vocabularySource, setVocabularySource, getDailyWords, getDifficultWordObjects, getLastLessonWords, getSupplementaryApiWords }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = (): AppContextValue => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
};
