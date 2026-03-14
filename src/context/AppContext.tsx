import React, { createContext, useContext, useReducer, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Word, vocabulary, getWordsByLevel } from '../data/vocabulary';

export type Level = 'easy' | 'medium' | 'hard';

export interface AppState {
  level: Level | null;
  xp: number;
  streak: number;
  lastStudyDate: string | null;
  difficultWords: number[];
  learnedWordIds: number[];
  darkMode: boolean;
  sessionWords: Word[];
  sessionResults: {
    correct: number;
    incorrect: number;
    wrongWordIds: number[];
  } | null;
  // Fix 2: words from the last completed lesson, shown on home screen
  lastLessonWordIds: number[];
  lessonSize: number;
}

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

const initialState: AppState = {
  level: null,
  xp: 0,
  streak: 0,
  lastStudyDate: null,
  difficultWords: [],
  learnedWordIds: [],
  darkMode: false,
  sessionWords: [],
  sessionResults: null,
  lastLessonWordIds: [],
  lessonSize: 20,
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_LEVEL':
      return { ...state, level: action.level };
    case 'ADD_XP':
      return { ...state, xp: state.xp + action.amount };
    case 'UPDATE_STREAK': {
      const today = new Date().toDateString();
      const yesterday = new Date(Date.now() - 86400000).toDateString();
      if (state.lastStudyDate === today) return state;
      const newStreak =
        state.lastStudyDate === yesterday ? state.streak + 1 : 1;
      return { ...state, streak: newStreak, lastStudyDate: today };
    }
    case 'ADD_DIFFICULT_WORD':
      if (state.difficultWords.includes(action.wordId)) return state;
      return {
        ...state,
        difficultWords: [...state.difficultWords, action.wordId],
        // Remove from learned words — wrong on first attempt cancels learned status
        learnedWordIds: state.learnedWordIds.filter(id => id !== action.wordId),
      };
    case 'REMOVE_DIFFICULT_WORD':
      return {
        ...state,
        difficultWords: state.difficultWords.filter(id => id !== action.wordId),
      };
    case 'MARK_WORD_LEARNED':
      if (state.learnedWordIds.includes(action.wordId)) return state;
      return { ...state, learnedWordIds: [...state.learnedWordIds, action.wordId] };
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
    case 'LOAD_STATE':
      return { ...state, ...action.state };
    case 'RESET_PROGRESS':
      return {
        ...initialState,
        level: state.level,
        darkMode: state.darkMode,
      };
    default:
      return state;
  }
}

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
  // Fix 1: track when AsyncStorage has finished loading
  const [isLoaded, setIsLoaded] = useState(false);

  // Load persisted state
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

  // Persist state on every change (skip until loaded to avoid overwriting)
  useEffect(() => {
    if (!isLoaded) return;
    const { sessionWords, sessionResults, ...persistable } = state;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
  }, [state, isLoaded]);

  const getDailyWords = (): Word[] => {
    if (!state.level) return [];
    const levelWords = getWordsByLevel(state.level);
    const unlearnedWords = levelWords.filter(
      w => !state.learnedWordIds.includes(w.id)
    );
    const difficultWordObjects = vocabulary.filter(w =>
      state.difficultWords.includes(w.id)
    );
    const combined = [
      ...difficultWordObjects,
      ...unlearnedWords.filter(w => !state.difficultWords.includes(w.id)),
    ];
    return combined.slice(0, state.lessonSize);
  };

  const getDifficultWordObjects = (): Word[] =>
    vocabulary.filter(w => state.difficultWords.includes(w.id));

  // Fix 2: resolve last lesson word objects
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
