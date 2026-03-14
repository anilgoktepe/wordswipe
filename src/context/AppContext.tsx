import React, { createContext, useContext, useReducer, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Word, vocabulary, getWordsByLevel } from '../data/vocabulary';

export type Level = 'easy' | 'medium' | 'hard';

// ─── Spaced-repetition intervals ────────────────────────────────────────────
const MS_PER_DAY = 86_400_000;
/** Wrong answer → try again tomorrow */
const INTERVAL_WRONG        = 1 * MS_PER_DAY;
/** First correct (no wrong attempts) → review in 3 days */
const INTERVAL_FIRST_LEARN  = 3 * MS_PER_DAY;
/** Difficult word corrected → review sooner (2 days) */
const INTERVAL_DIFFICULT_OK = 2 * MS_PER_DAY;
/** Subsequent correct reviews → review in 7 days */
const INTERVAL_REVIEW       = 7 * MS_PER_DAY;

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
  | { type: 'RESET_PROGRESS' };

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
    wp[id] = {
      seenCount:         1,
      correctCount:      isLearned   ? 1 : 0,
      wrongCount:        isDifficult ? 1 : 0,
      firstAttemptWrong: isDifficult,
      isLearned,
      isDifficult,
      // Schedule all migrated words for immediate review
      nextReviewAt: now,
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
        wrongCount:        existing.wrongCount + 1,
        // If this is the first-ever interaction and it's wrong → flag it
        firstAttemptWrong: isFirstEver ? true : existing.firstAttemptWrong,
        isDifficult:       true,
        // Cancel learned status: wrong on first attempt (isFirstEver) reverts
        // to unlearned; otherwise keep existing isLearned
        isLearned:         isFirstEver ? false : existing.isLearned,
        // Schedule review: tomorrow
        nextReviewAt:      Date.now() + INTERVAL_WRONG,
        // seenCount increments only on the first wrong (= first encounter)
        seenCount:         isFirstEver ? existing.seenCount + 1 : existing.seenCount,
      };

      const wordProgress = { ...state.wordProgress, [action.wordId]: updated };
      return { ...state, wordProgress, ...deriveFromProgress(wordProgress) };
    }

    // ── Quiz evaluation: first-attempt correct ───────────────────────────────
    case 'MARK_WORD_LEARNED': {
      const existing = state.wordProgress[action.wordId] ?? emptyProgress();

      // If already learned (and not currently marked difficult) → no-op
      if (existing.isLearned && !existing.isDifficult) return state;

      const wasDifficult = existing.isDifficult;
      const isFirstSeen  = existing.correctCount === 0 && existing.wrongCount === 0;

      // Choose review interval:
      // • Previously difficult word finally answered correctly → 2 days
      // • Subsequent review (correctCount ≥ 1) → 7 days
      // • Brand-new word answered correctly on first attempt → 3 days
      let interval: number;
      if (wasDifficult)                           interval = INTERVAL_DIFFICULT_OK;
      else if (existing.correctCount >= 1)        interval = INTERVAL_REVIEW;
      else                                        interval = INTERVAL_FIRST_LEARN;

      const updated: WordProgress = {
        ...existing,
        correctCount: existing.correctCount + 1,
        isLearned:    true,
        // Keep difficult flag as-is (spec: "keep difficult if needed").
        // A difficult word that is answered correctly still needs re-review
        // until it eventually falls out of the difficult bucket naturally
        // via getDailyWords() priority ordering.
        nextReviewAt: Date.now() + interval,
        // seenCount increments if this is the first-ever encounter
        seenCount:    isFirstSeen ? existing.seenCount + 1 : existing.seenCount,
      };

      const wordProgress = { ...state.wordProgress, [action.wordId]: updated };
      return { ...state, wordProgress, ...deriveFromProgress(wordProgress) };
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
      };
    }

    // ── Full reset (keeps level + dark mode preference) ──────────────────────
    case 'RESET_PROGRESS':
      return {
        ...initialState,
        level:    state.level,
        darkMode: state.darkMode,
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
  getDailyWords: () => Word[];
  getDifficultWordObjects: () => Word[];
  getLastLessonWords: () => Word[];
}

const AppContext = createContext<AppContextValue | null>(null);

const STORAGE_KEY = '@wordswipe_state';

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [isLoaded, setIsLoaded] = useState(false);

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

  // Persist on every change (skip until first load to avoid clobbering saved data)
  useEffect(() => {
    if (!isLoaded) return;
    const { sessionWords, sessionResults, ...persistable } = state;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
  }, [state, isLoaded]);

  // ─── getDailyWords — priority-ordered spaced-repetition selection ─────────
  const getDailyWords = (): Word[] => {
    if (!state.level) return [];
    const now    = Date.now();
    const target = state.lessonSize ?? 20;
    const wp     = state.wordProgress;

    // ── Bucket 1: Difficult words due for review (most overdue first) ────────
    const difficultDue: Word[] = Object.entries(wp)
      .filter(([, p]) => p.isDifficult && p.nextReviewAt <= now)
      .sort(([, a], [, b]) => a.nextReviewAt - b.nextReviewAt)
      .map(([id]) => vocabulary.find(w => w.id === Number(id)))
      .filter((w): w is Word => w !== undefined);

    // ── Bucket 2: Learned words due for review (most overdue first) ──────────
    // Exclude words already in bucket 1 (isDifficult && isLearned overlap)
    const learnedDue: Word[] = Object.entries(wp)
      .filter(([, p]) => p.isLearned && !p.isDifficult && p.nextReviewAt <= now)
      .sort(([, a], [, b]) => a.nextReviewAt - b.nextReviewAt)
      .map(([id]) => vocabulary.find(w => w.id === Number(id)))
      .filter((w): w is Word => w !== undefined);

    // ── Bucket 3: New/unseen words from current level ────────────────────────
    const seenIds   = new Set(Object.keys(wp).map(Number));
    const levelWords = getWordsByLevel(state.level);
    const newWords  = levelWords.filter(w => !seenIds.has(w.id));

    // Merge in priority order, deduplicate, stop at lessonSize
    const seen   = new Set<number>();
    const result: Word[] = [];

    for (const w of [...difficultDue, ...learnedDue, ...newWords]) {
      if (result.length >= target) break;
      if (!seen.has(w.id)) {
        seen.add(w.id);
        result.push(w);
      }
    }

    return result;
  };

  // ─── Helper accessors ─────────────────────────────────────────────────────
  const getDifficultWordObjects = (): Word[] =>
    vocabulary.filter(w => state.difficultWords.includes(w.id));

  const getLastLessonWords = (): Word[] =>
    vocabulary.filter(w => state.lastLessonWordIds.includes(w.id));

  return (
    <AppContext.Provider
      value={{ state, dispatch, isLoaded, getDailyWords, getDifficultWordObjects, getLastLessonWords }}
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
