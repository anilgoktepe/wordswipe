import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Animated,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useApp } from '../context/AppContext';
import { Word, getWordsByLevel } from '../data/vocabulary';
import { getTheme, spacing, radius, typography, shadows } from '../utils/theme';

// Haptics helper — only fires on native
function haptic(type: 'success' | 'error' | 'light') {
  if (Platform.OS === 'web') return;
  try {
    if (type === 'success') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (type === 'error') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  } catch (_) {}
}

interface QuizQuestion {
  word: Word;
  options: string[];
  correctIndex: number;
}

function generateQuiz(words: Word[], level: 'easy' | 'medium' | 'hard'): QuizQuestion[] {
  const levelPool = getWordsByLevel(level);
  return words.map(word => {
    const wrongOptions = levelPool
      .filter(w => w.id !== word.id)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .map(w => w.translation);

    const correctIndex = Math.floor(Math.random() * 4);
    const options = [...wrongOptions];
    options.splice(correctIndex, 0, word.translation);

    return { word, options, correctIndex };
  });
}

interface Props {
  navigation: any;
}

export const QuizScreen: React.FC<Props> = ({ navigation }) => {
  const { state, dispatch } = useApp();
  const theme = getTheme(state.darkMode);

  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  // Fix 3: track which wrong indices have been tried per question
  const [wrongIndices, setWrongIndices] = useState<number[]>([]);
  const [isAnsweredCorrectly, setIsAnsweredCorrectly] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [incorrectCount, setIncorrectCount] = useState(0);
  const [wrongWordIds, setWrongWordIds] = useState<number[]>([]);
  const [streak, setStreak] = useState(0);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const words = state.sessionWords;
    if (words.length > 0 && state.level) {
      setQuestions(generateQuiz(words, state.level));
    }
  }, []);

  // Reset per-question state when question advances
  useEffect(() => {
    setWrongIndices([]);
    setIsAnsweredCorrectly(false);
  }, [currentQ]);

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 12, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -12, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const bounce = () => {
    Animated.sequence([
      Animated.spring(scaleAnim, { toValue: 1.06, useNativeDriver: true, speed: 50 }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 50 }),
    ]).start();
  };

  const handleSelect = (index: number) => {
    // Already answered correctly or already tried this wrong option — ignore
    if (isAnsweredCorrectly || wrongIndices.includes(index)) return;

    const q = questions[currentQ];
    const isFirstAttempt = wrongIndices.length === 0;

    if (index === q.correctIndex) {
      // ✅ Correct answer selected
      setIsAnsweredCorrectly(true);
      bounce();
      haptic('success');
      dispatch({ type: 'ADD_XP', amount: 1 });
      const newStreak = streak + 1;
      setStreak(newStreak);
      if (newStreak > 0 && newStreak % 3 === 0) {
        dispatch({ type: 'ADD_XP', amount: newStreak >= 10 ? 5 : 3 });
      }
      // Only count as correct if no wrong attempts for this question
      let newCorrect = correctCount;
      if (isFirstAttempt) {
        newCorrect = correctCount + 1;
        setCorrectCount(newCorrect);
        dispatch({ type: 'MARK_WORD_LEARNED', wordId: q.word.id });
      }

      setTimeout(() => {
        if (currentQ + 1 >= questions.length) {
          finishQuiz(newCorrect, incorrectCount, wrongWordIds);
        } else {
          setCurrentQ(prev => prev + 1);
        }
      }, 700);
    } else {
      // ❌ Wrong answer selected — only increment incorrect on FIRST wrong attempt
      shake();
      haptic('error');
      setStreak(0);
      setWrongIndices(prev => [...prev, index]);
      if (isFirstAttempt) {
        setIncorrectCount(prev => prev + 1);
        const wid = q.word.id;
        dispatch({ type: 'ADD_DIFFICULT_WORD', wordId: wid });
        if (!wrongWordIds.includes(wid)) {
          setWrongWordIds(prev => [...prev, wid]);
        }
      }
    }
  };

  const finishQuiz = (correct: number, incorrect: number, wrongIds: number[]) => {
    dispatch({
      type: 'SET_SESSION_RESULTS',
      results: { correct, incorrect, wrongWordIds: wrongIds },
    });
    navigation.replace('Results');
  };

  if (questions.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: theme.text, fontSize: 16 }}>Quiz hazırlanıyor...</Text>
      </View>
    );
  }

  const q = questions[currentQ];
  const progress = (currentQ / questions.length) * 100;

  // Fix 3: option coloring logic
  const getOptionColors = (index: number): { bg: string; border: string; text: string } => {
    if (isAnsweredCorrectly && index === q.correctIndex) {
      // User just got it right — this is the selected correct option
      return { bg: theme.correctLight, border: theme.correct, text: theme.correct };
    }
    if (wrongIndices.includes(index)) {
      // This option was tried and is wrong
      return { bg: theme.incorrectLight, border: theme.incorrect, text: theme.incorrect };
    }
    // Default
    return { bg: theme.surface, border: theme.border, text: theme.text };
  };

  const hasWrongAttempt = wrongIndices.length > 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.replace('Main')} style={styles.backBtn}>
            <Text style={{ color: theme.textSecondary, fontSize: 20 }}>✕</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, marginHorizontal: spacing.md }}>
            <View style={[styles.progressBg, { backgroundColor: theme.surfaceSecondary }]}>
              <LinearGradient
                colors={['#6C63FF', '#9B5CF6']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.progressFill, { width: `${progress}%` }]}
              />
            </View>
            <Text style={[styles.progressCount, { color: theme.textSecondary }]}>
              {currentQ + 1} / {questions.length}
            </Text>
          </View>
          <View style={styles.scoreRow}>
            <Text style={[styles.scoreText, { color: theme.correct }]}>✓{correctCount}</Text>
            <Text style={{ color: theme.textTertiary, marginHorizontal: 4 }}>|</Text>
            <Text style={[styles.scoreText, { color: theme.incorrect }]}>✕{incorrectCount}</Text>
          </View>
        </View>

        {/* Question Word Card */}
        <View style={styles.questionArea}>
          <Text style={[styles.questionLabel, { color: theme.textSecondary }]}>
            Bu kelimenin Türkçe anlamı nedir?
          </Text>
          <Animated.View
            style={[
              styles.wordCard,
              { backgroundColor: theme.surface, transform: [{ scale: scaleAnim }] },
              shadows.lg,
            ]}
          >
            <LinearGradient
              colors={['#6C63FF10', '#9B5CF610']}
              style={StyleSheet.absoluteFillObject}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
            <Text style={[styles.questionWord, { color: theme.text }]}>
              {q.word.word}
            </Text>
            {streak >= 3 && (
              <View style={styles.streakBadge}>
                <Text style={styles.streakBadgeText}>🔥 {streak} seri</Text>
              </View>
            )}
          </Animated.View>
        </View>

        {/* Options */}
        <Animated.View
          style={[styles.optionsArea, { transform: [{ translateX: shakeAnim }] }]}
        >
          {q.options.map((option, index) => {
            const colors = getOptionColors(index);
            const isDisabled = wrongIndices.includes(index) || isAnsweredCorrectly;
            return (
              <TouchableOpacity
                key={index}
                onPress={() => handleSelect(index)}
                activeOpacity={isDisabled ? 1 : 0.85}
                style={[
                  styles.option,
                  {
                    backgroundColor: colors.bg,
                    borderColor: colors.border,
                    ...shadows.sm,
                    opacity: isDisabled && !wrongIndices.includes(index) && !isAnsweredCorrectly ? 0.5 : 1,
                  },
                ]}
              >
                <View
                  style={[
                    styles.optionBadge,
                    {
                      backgroundColor:
                        colors.bg === theme.surface ? theme.surfaceSecondary : colors.bg,
                    },
                  ]}
                >
                  <Text style={[styles.optionBadgeText, { color: colors.text }]}>
                    {String.fromCharCode(65 + index)}
                  </Text>
                </View>
                <Text style={[styles.optionText, { color: colors.text }]}>
                  {option}
                </Text>
                {isAnsweredCorrectly && index === q.correctIndex && (
                  <Text style={{ color: theme.correct, fontSize: 18, marginLeft: 'auto' }}>✓</Text>
                )}
                {wrongIndices.includes(index) && (
                  <Text style={{ color: theme.incorrect, fontSize: 18, marginLeft: 'auto' }}>✕</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </Animated.View>

        {/* Hint: shown only after at least one wrong attempt */}
        {hasWrongAttempt && !isAnsweredCorrectly && (
          <View style={styles.hintArea}>
            <Text style={[styles.hintText, { color: theme.textSecondary }]}>
              💡 Doğru cevabı seçmeye devam et
            </Text>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressBg: {
    height: 6,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  progressCount: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scoreText: {
    fontSize: 14,
    fontWeight: '700',
  },
  questionArea: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  questionLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: spacing.md,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  wordCard: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 140,
    overflow: 'hidden',
  },
  questionWord: {
    ...typography.word,
    textAlign: 'center',
  },
  streakBadge: {
    marginTop: spacing.md,
    backgroundColor: '#FF6B3520',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  streakBadgeText: {
    color: '#FF6B35',
    fontWeight: '700',
    fontSize: 13,
  },
  optionsArea: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    flex: 1,
  },
  option: {
    borderRadius: radius.lg,
    borderWidth: 2,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  optionBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionBadgeText: {
    fontSize: 14,
    fontWeight: '800',
  },
  optionText: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  hintArea: {
    alignItems: 'center',
    paddingBottom: spacing.lg,
  },
  hintText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
