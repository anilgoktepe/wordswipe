// ─── Quiz question generation ────────────────────────────────────────────────
//
// Kept free of react-native imports so scripts/quiz-test.ts can import and
// exercise the real implementation under plain Node.

import { Word, getWordsByLevel } from '../data/vocabulary';

export interface QuizQuestion {
  word: Word;
  options: string[];
  correctIndex: number;
}

/**
 * Builds one multiple-choice question per word.
 *
 * Distractors are de-duplicated by normalized translation because the
 * vocabulary contains many English words sharing a Turkish translation —
 * filtering by word id alone would let the same option render twice.
 */
export function generateQuiz(
  words: Word[],
  level: 'easy' | 'medium' | 'hard',
  levelPool: Word[] = getWordsByLevel(level),
): QuizQuestion[] {
  return words.map(word => {
    const normalizedCorrect = word.translation.trim().toLowerCase();

    // Shuffle first so that among words sharing a translation, a random one wins.
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
