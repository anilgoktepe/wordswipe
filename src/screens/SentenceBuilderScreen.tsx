import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
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
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
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

  // ── Animations ────────────────────────────────────────────────────────────
  const wordAnim   = useRef(new Animated.Value(0)).current;
  const resultAnim = useRef(new Animated.Value(0)).current;
  const submitScale = useRef(new Animated.Value(1)).current;

  // Animate word card in on mount and whenever the word changes
  useEffect(() => {
    wordAnim.setValue(0);
    Animated.spring(wordAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 60,
      friction: 7,
    }).start();
  }, [word]);

  // Animate result card in when a result appears
  useEffect(() => {
    if (!result) return;
    resultAnim.setValue(0);
    Animated.spring(resultAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 55,
      friction: 7,
    }).start();
  }, [result]);

  const onSubmitPressIn  = () => Animated.spring(submitScale, { toValue: 0.96, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  const onSubmitPressOut = () => Animated.spring(submitScale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 6 }).start();

  const cardSlide = (anim: Animated.Value) => ({
    opacity: anim,
    transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
  });

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
        <MaterialCommunityIcons name="book-open-variant" size={48} color={theme.textTertiary} style={{ marginBottom: spacing.md }} />
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
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.headerTitle}>Cümle Kur</Text>
                <MaterialCommunityIcons name="pencil" size={16} color="rgba(255,255,255,0.9)" style={{ marginLeft: 6 }} />
              </View>
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
                <Animated.View style={cardSlide(wordAnim)}>
                <View style={[styles.wordCard, { backgroundColor: theme.surface, ...shadows.lg }]}>
                  <LinearGradient
                    colors={['#6C63FF18', '#9B5CF618']}
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
                </Animated.View>

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
                    <Animated.View style={[styles.submitBtn, { transform: [{ scale: submitScale }], opacity: sentence.trim().length === 0 ? 0.5 : 1 }]}>
                    <TouchableOpacity
                      onPress={handleSubmit}
                      onPressIn={onSubmitPressIn}
                      onPressOut={onSubmitPressOut}
                      disabled={sentence.trim().length === 0}
                      activeOpacity={1}
                      style={{ borderRadius: radius.full, overflow: 'hidden' }}
                    >
                      <LinearGradient
                        colors={['#6C63FF', '#9B5CF6']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.submitGradient}
                      >
                        <Text style={styles.submitText}>Gönder</Text>
                        <Ionicons name="send" size={16} color="#fff" style={{ marginLeft: 8 }} />
                      </LinearGradient>
                    </TouchableOpacity>
                    </Animated.View>
                  </>
                )}

                {/* Result */}
                {result && (
                  <Animated.View style={cardSlide(resultAnim)}>
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
                        style={styles.nextWordBtn}
                      >
                        <LinearGradient
                          colors={['#6C63FF', '#9B5CF6']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={StyleSheet.absoluteFillObject}
                        />
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14, fontFamily: 'Inter_700Bold' }}>
                          Yeni Kelime
                        </Text>
                        <Ionicons name="chevron-forward" size={16} color="#fff" style={{ marginLeft: 4 }} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  </Animated.View>
                )}

                {/* Skip button */}
                {!result && (
                  <TouchableOpacity onPress={handleNextWord} style={styles.skipLink}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={[styles.skipLinkText, { color: theme.textTertiary }]}>
                        Bu kelimeyi geç
                      </Text>
                      <Ionicons name="chevron-forward" size={14} color={theme.textTertiary} />
                    </View>
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
    fontFamily: 'Inter_600SemiBold',
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
    fontFamily: 'Inter_800ExtraBold',
  },
  wordMeaning: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: spacing.md,
    fontFamily: 'Inter_600SemiBold',
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
    borderRadius: radius.xl,
    borderWidth: 2,
    padding: spacing.md,
    fontSize: 16,
    minHeight: 120,
    lineHeight: 24,
    marginBottom: spacing.md,
    fontFamily: 'Inter_400Regular',
  },
  submitBtn: {
    marginBottom: spacing.sm,
  },
  submitGradient: {
    height: 52,
    flexDirection: 'row',
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
    fontFamily: 'Inter_700Bold',
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
    height: 52,
    borderRadius: radius.full,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextWordBtn: {
    flex: 1,
    height: 52,
    borderRadius: radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
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
