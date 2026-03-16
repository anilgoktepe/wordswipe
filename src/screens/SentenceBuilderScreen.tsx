import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { vocabulary, Word } from '../data/vocabulary';
import { getTheme, spacing, radius, typography, shadows } from '../utils/theme';

interface Props {
  navigation: any;
}

interface EvalResult {
  isCorrect: boolean;
  feedback: string;
  tip?: string;
  xpAwarded: number;
}

function pickRandomWord(learnedIds: number[], excludeId?: number): Word | null {
  const pool = vocabulary.filter(
    w => learnedIds.includes(w.id) && w.id !== excludeId
  );
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

function evaluate(sentence: string, word: Word): EvalResult {
  const trimmed = sentence.trim();
  const lower = trimmed.toLowerCase();
  const wordLower = word.word.toLowerCase();

  // Use word-boundary regex so "cat" doesn't falsely match inside "concatenate".
  const wordBoundaryRegex = new RegExp(`(?<![a-z])${wordLower}(?![a-z])`, 'i');
  if (!wordBoundaryRegex.test(lower)) {
    return {
      isCorrect: false,
      feedback: `"${word.word}" kelimesini cümlende kullanmadın.`,
      tip: `İpucu: "${word.word}" kelimesini cümlenin içine yerleştirmeyi dene.`,
      xpAwarded: 0,
    };
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 4) {
    return {
      isCorrect: false,
      feedback: 'Cümle çok kısa. Daha anlamlı ve uzun bir cümle yaz.',
      tip: 'En az 4-5 kelimeden oluşan tam bir cümle yazmayı dene.',
      xpAwarded: 0,
    };
  }

  const hasPunctuation = /[.!?]$/.test(trimmed);
  if (!hasPunctuation) {
    return {
      isCorrect: true,
      feedback: `Harika! "${word.word}" kelimesini doğru kullandın. 🎉`,
      tip: 'Küçük not: İngilizce cümlelerin sonuna noktalama işareti (. ! ?) eklemeyi unutma.',
      xpAwarded: 5,
    };
  }

  const startsCapital = /^[A-Z]/.test(trimmed);
  if (!startsCapital) {
    return {
      isCorrect: true,
      feedback: `Süper! "${word.word}" kelimesini başarıyla kullandın. ✅`,
      tip: 'Küçük not: İngilizce cümleler büyük harfle başlamalı.',
      xpAwarded: 5,
    };
  }

  return {
    isCorrect: true,
    feedback: `Mükemmel! "${word.word}" kelimesini doğru ve eksiksiz bir cümlede kullandın. 🏆`,
    xpAwarded: 8,
  };
}

export const SentenceBuilderScreen: React.FC<Props> = ({ navigation }) => {
  const { state, dispatch } = useApp();
  const theme = getTheme(state.darkMode);

  const learnedIds = state.learnedWordIds;
  const [word, setWord] = useState<Word | null>(() => pickRandomWord(learnedIds));
  const [sentence, setSentence] = useState('');
  const [result, setResult] = useState<EvalResult | null>(null);
  const [totalXp, setTotalXp] = useState(0);

  const handleSubmit = useCallback(() => {
    if (!word || sentence.trim().length === 0) return;
    const evalResult = evaluate(sentence, word);
    setResult(evalResult);
    if (evalResult.xpAwarded > 0) {
      dispatch({ type: 'ADD_XP', amount: evalResult.xpAwarded });
      setTotalXp(prev => prev + evalResult.xpAwarded);
    }
  }, [word, sentence]);

  const handleNextWord = useCallback(() => {
    const next = pickRandomWord(learnedIds, word?.id);
    setWord(next);
    setSentence('');
    setResult(null);
  }, [learnedIds, word]);

  const handleRetry = useCallback(() => {
    setSentence('');
    setResult(null);
  }, []);

  if (learnedIds.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center', padding: spacing.lg }]}>
        <Text style={{ fontSize: 48, marginBottom: spacing.md }}>📚</Text>
        <Text style={[typography.h3, { color: theme.text, textAlign: 'center', marginBottom: spacing.sm }]}>
          Henüz kelime öğrenmedin
        </Text>
        <Text style={[{ color: theme.textSecondary, textAlign: 'center', marginBottom: spacing.xl }]}>
          Önce bir ders tamamla ve kelimeleri öğren, sonra cümle kurma pratiği yap.
        </Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: theme.primary }]}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Geri Dön</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <SafeAreaView style={{ flex: 1 }}>
          {/* Header */}
          <LinearGradient
            colors={['#6C63FF', '#9B5CF6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.header}
          >
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBackBtn}>
              <Text style={{ color: '#fff', fontSize: 20 }}>←</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Cümle Kur ✍️</Text>
              <Text style={styles.headerSub}>Öğrendiğin kelimelerle cümle yaz</Text>
            </View>
            {totalXp > 0 && (
              <View style={styles.xpBadge}>
                <Text style={styles.xpBadgeText}>+{totalXp} XP</Text>
              </View>
            )}
          </LinearGradient>

          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {word ? (
              <>
                {/* Word Card */}
                <View style={[styles.wordCard, { backgroundColor: theme.surface, ...shadows.lg }]}>
                  <LinearGradient
                    colors={['#6C63FF10', '#9B5CF610']}
                    style={StyleSheet.absoluteFillObject}
                  />
                  <Text style={[styles.wordHint, { color: theme.textTertiary }]}>
                    Bu kelimeyi kullanarak bir cümle yaz:
                  </Text>
                  <Text style={[styles.wordText, { color: theme.text }]}>
                    {word.word}
                  </Text>
                  <Text style={[styles.wordMeaning, { color: theme.primary }]}>
                    {word.translation}
                  </Text>
                  <View style={[styles.levelPill, { backgroundColor: theme.primaryLight }]}>
                    <Text style={[styles.levelPillText, { color: theme.primary }]}>
                      {word.level === 'easy' ? 'Kolay' : word.level === 'medium' ? 'Orta' : 'Zor'}
                    </Text>
                  </View>
                </View>

                {/* Input */}
                {!result && (
                  <>
                    <TextInput
                      style={[
                        styles.input,
                        {
                          backgroundColor: theme.surface,
                          borderColor: theme.border,
                          color: theme.text,
                        },
                      ]}
                      placeholder={`"${word.word}" kelimesini kullanarak bir cümle yaz...`}
                      placeholderTextColor={theme.textTertiary}
                      value={sentence}
                      onChangeText={setSentence}
                      multiline
                      textAlignVertical="top"
                      autoCapitalize="sentences"
                      autoCorrect={false}
                    />
                    <TouchableOpacity
                      onPress={handleSubmit}
                      disabled={sentence.trim().length === 0}
                      style={[styles.submitBtn, { opacity: sentence.trim().length === 0 ? 0.5 : 1 }]}
                    >
                      <LinearGradient
                        colors={['#6C63FF', '#9B5CF6']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.submitGradient}
                      >
                        <Text style={styles.submitText}>Gönder →</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </>
                )}

                {/* Result */}
                {result && (
                  <View style={[
                    styles.resultCard,
                    {
                      backgroundColor: result.isCorrect ? theme.correctLight : theme.incorrectLight,
                      borderColor: result.isCorrect ? theme.correct : theme.incorrect,
                    },
                  ]}>
                    <Text style={styles.resultIcon}>{result.isCorrect ? '🎉' : '❌'}</Text>
                    <Text style={[styles.resultFeedback, { color: result.isCorrect ? theme.correct : theme.incorrect }]}>
                      {result.feedback}
                    </Text>
                    {result.tip && (
                      <Text style={[styles.resultTip, { color: theme.textSecondary }]}>
                        💡 {result.tip}
                      </Text>
                    )}
                    {result.xpAwarded > 0 && (
                      <View style={[styles.xpEarned, { backgroundColor: theme.correct + '20' }]}>
                        <Text style={[styles.xpEarnedText, { color: theme.correct }]}>
                          +{result.xpAwarded} XP kazandın!
                        </Text>
                      </View>
                    )}

                    {/* Sentence typed */}
                    <View style={[styles.sentenceDisplay, { backgroundColor: theme.surface + 'CC' }]}>
                      <Text style={[{ color: theme.textSecondary, fontSize: 12, marginBottom: 4, fontWeight: '600' }]}>
                        Yazdığın cümle:
                      </Text>
                      <Text style={[{ color: theme.text, fontSize: 15, fontStyle: 'italic' }]}>
                        "{sentence}"
                      </Text>
                    </View>

                    {/* Example sentence */}
                    <View style={[styles.exampleBox, { backgroundColor: theme.surfaceSecondary }]}>
                      <Text style={[{ color: theme.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 4 }]}>
                        Örnek cümle:
                      </Text>
                      <Text style={[{ color: theme.text, fontSize: 14 }]}>
                        {word.example}
                      </Text>
                    </View>

                    <View style={styles.resultActions}>
                      <TouchableOpacity
                        onPress={handleRetry}
                        style={[styles.retryBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}
                      >
                        <Text style={[{ color: theme.text, fontWeight: '700', fontSize: 14 }]}>
                          Tekrar Dene
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={handleNextWord}
                        style={[styles.nextWordBtn, { backgroundColor: theme.primary }]}
                      >
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                          Yeni Kelime →
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* Skip button */}
                {!result && (
                  <TouchableOpacity onPress={handleNextWord} style={styles.skipLink}>
                    <Text style={[styles.skipLinkText, { color: theme.textTertiary }]}>
                      Bu kelimeyi geç →
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <View style={styles.emptyState}>
                <Text style={{ fontSize: 48 }}>🎊</Text>
                <Text style={[typography.h3, { color: theme.text, textAlign: 'center', marginTop: spacing.md }]}>
                  Tüm kelimeleri denedin!
                </Text>
                <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: theme.primary, marginTop: spacing.xl }]}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Ana Sayfaya Dön</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  headerBackBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
  },
  headerSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 1,
  },
  xpBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  xpBadgeText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
  scroll: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  wordCard: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  wordHint: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: spacing.md,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  wordText: {
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: -1,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  wordMeaning: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  levelPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  levelPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  input: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: spacing.md,
    fontSize: 16,
    minHeight: 110,
    lineHeight: 24,
    marginBottom: spacing.md,
  },
  submitBtn: {
    borderRadius: radius.full,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  submitGradient: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  skipLink: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  skipLinkText: {
    fontSize: 14,
    fontWeight: '600',
  },
  resultCard: {
    borderRadius: radius.xl,
    borderWidth: 1.5,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  resultIcon: {
    fontSize: 32,
    textAlign: 'center',
  },
  resultFeedback: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 22,
  },
  resultTip: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  xpEarned: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    alignSelf: 'center',
  },
  xpEarnedText: {
    fontWeight: '800',
    fontSize: 14,
  },
  sentenceDisplay: {
    borderRadius: radius.md,
    padding: spacing.md,
  },
  exampleBox: {
    borderRadius: radius.md,
    padding: spacing.md,
  },
  resultActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  retryBtn: {
    flex: 1,
    height: 46,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextWordBtn: {
    flex: 1,
    height: 46,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: spacing.xxl,
  },
  backBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.full,
  },
});
