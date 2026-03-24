import React, { useState, useCallback, useRef, useEffect } from 'react';
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
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { getLocalWords, Word } from '../services/vocabularyService';
import { analyzeSentence, AnalysisResult } from '../services/sentenceAnalysisService';
import { callPremiumAnalysis, PremiumAnalysisResult } from '../services/premiumAnalysisService';
import { getTheme, spacing, radius, typography, shadows } from '../utils/theme';

const vocabulary = getLocalWords();

// Max words per session — keeps sessions short and focused.
const SESSION_MAX = 10;

interface Props {
  navigation: any;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Builds a shuffled queue of up to SESSION_MAX learned words for the session. */
function buildQueue(learnedIds: number[]): Word[] {
  const pool = vocabulary.filter(w => learnedIds.includes(w.id));
  return [...pool].sort(() => Math.random() - 0.5).slice(0, SESSION_MAX);
}

// ─── Screen ────────────────────────────────────────────────────────────────────

export const SentenceBuilderScreen: React.FC<Props> = ({ navigation }) => {
  const { state, dispatch } = useApp();
  const theme = getTheme(state.darkMode);

  const learnedIds = state.learnedWordIds;

  // One-time queue built at mount — does not rebuild on re-render.
  const [queue]               = useState<Word[]>(() => buildQueue(learnedIds));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sentence, setSentence]         = useState('');
  const [result, setResult]             = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing]   = useState(false);
  const [totalXp, setTotalXp]           = useState(0);
  const [completed, setCompleted]       = useState(0); // words answered (valid)

  // ── Premium AI layer ─────────────────────────────────────────────────────────
  // Layer 1 (local) always runs first. Premium is opt-in, user-triggered.
  const [premiumResult, setPremiumResult]       = useState<PremiumAnalysisResult | null>(null);
  const [isPremiumAnalyzing, setIsPremiumAnalyzing] = useState(false);

  const currentWord = queue[currentIndex] ?? null;
  const isFinished  = currentIndex >= queue.length;

  // ── Effective result status ───────────────────────────────────────────────
  // Layer 1 (local rules) may pass a sentence that Layer 2 (premium AI)
  // later flags as a grammar error.  The status drives both the visual state
  // of the result card AND the XP amount awarded when the user advances.
  // XP is NOT awarded at submit time — it is deferred to handleNext so that
  // premium analysis can influence the final grade before XP is dispatched.
  //
  //   perfect → green  (10 XP) — word used AND no grammar errors detected
  //   partial → amber  ( 5 XP) — word used BUT premium AI found a grammar error
  //   fail    → red    ( 0 XP) — word not used / sentence fundamentally invalid
  const effectiveStatus: 'perfect' | 'partial' | 'fail' = (() => {
    if (!result) return 'fail'; // result card not shown yet — value unused
    if (premiumResult) {
      if (!premiumResult.usedTargetWord) return 'fail';
      if (premiumResult.grammarIssues.some(i => i.severity === 'error')) return 'partial';
      return 'perfect';
    }
    return result.isValid ? 'perfect' : 'fail';
  })();

  // Colour tokens for the three states — used in the result card only.
  const statusColor = effectiveStatus === 'perfect' ? theme.correct
                    : effectiveStatus === 'partial'  ? '#B45309'
                    :                                  theme.incorrect;
  const statusBg    = effectiveStatus === 'perfect' ? theme.correctLight
                    : effectiveStatus === 'partial'  ? '#FEF3C7'
                    :                                  theme.incorrectLight;
  const statusBorder = effectiveStatus === 'perfect' ? theme.correct
                     : effectiveStatus === 'partial'  ? '#F59E0B'
                     :                                  theme.incorrect;
  const statusIcon   = effectiveStatus === 'perfect' ? 'checkmark-circle'
                     : effectiveStatus === 'partial'  ? 'warning'
                     :                                  'close-circle';

  // ── Animations ──────────────────────────────────────────────────────────────
  const cardAnim    = useRef(new Animated.Value(0)).current;
  const resultAnim  = useRef(new Animated.Value(0)).current;
  const submitScale = useRef(new Animated.Value(1)).current;

  const springIn = (anim: Animated.Value) =>
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 7 }).start();

  // Re-animate the word card whenever the active word changes.
  useEffect(() => { cardAnim.setValue(0); springIn(cardAnim); }, [currentIndex]);
  useEffect(() => { if (result) { resultAnim.setValue(0); springIn(resultAnim); } }, [result]);

  const cardSlide = (anim: Animated.Value) => ({
    opacity: anim,
    transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
  });

  const onPressIn  = () => Animated.spring(submitScale, { toValue: 0.96, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  const onPressOut = () => Animated.spring(submitScale, { toValue: 1,    useNativeDriver: true, speed: 40, bounciness: 6 }).start();

  // ── Actions ─────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (!sentence.trim() || isAnalyzing || !currentWord) return;

    setIsAnalyzing(true);
    // Pass the single current word as the target — the service handles arrays of any length.
    const analysis = await analyzeSentence({ selectedWords: [currentWord], sentence });
    setResult(analysis);
    // XP is NOT awarded here. It is deferred to handleNext so that the premium
    // analysis (if the user triggers it) can influence the final grade first.
    setIsAnalyzing(false);
  }, [sentence, currentWord, isAnalyzing]);

  const handlePremiumAnalysis = useCallback(async () => {
    if (!currentWord || isPremiumAnalyzing) return;
    setIsPremiumAnalyzing(true);
    const analysis = await callPremiumAnalysis({
      targetWord: currentWord.word,
      sentence,
      userLevel: currentWord.level,
    });
    setPremiumResult(analysis);
    setIsPremiumAnalyzing(false);
  }, [currentWord, sentence, isPremiumAnalyzing]);

  const handleNext = useCallback(() => {
    // ── Award XP based on the FINAL evaluated status ─────────────────────────
    // This is the single XP award point for a word attempt.  Deferring to here
    // means premium analysis always has a chance to run before XP is committed.
    //
    //   perfect (Layer-1 pass, no premium errors)  → 10 XP
    //   partial (Layer-1 pass, premium found error) →  5 XP
    //   fail    (word not used / bad sentence)      →  0 XP
    //   skipped (no result at all)                  →  0 XP
    if (result) {
      let xpEarned = 0;
      let countAsCompleted = false;

      if (premiumResult) {
        // Premium ran — use its verdict.
        if (!premiumResult.usedTargetWord) {
          // fail — word not detected by premium
          xpEarned = 0;
        } else if (premiumResult.grammarIssues.some(i => i.severity === 'error')) {
          // partial — word used but grammar error
          xpEarned = 5;
          countAsCompleted = true;
        } else {
          // perfect
          xpEarned = 10;
          countAsCompleted = true;
        }
      } else {
        // Premium not run — rely on Layer-1 result.
        if (result.isValid) {
          // perfect (no premium to say otherwise)
          xpEarned = 10;
          countAsCompleted = true;
        }
        // else fail → 0 XP
      }

      if (xpEarned > 0) {
        dispatch({ type: 'ADD_XP', amount: xpEarned });
        setTotalXp(prev => prev + xpEarned);
      }
      if (countAsCompleted) {
        setCompleted(prev => prev + 1);
      }
    }

    setSentence('');
    setResult(null);
    setPremiumResult(null);
    setCurrentIndex(prev => prev + 1);
  }, [result, premiumResult, dispatch]);

  const handleSkip = useCallback(() => {
    setSentence('');
    setResult(null);
    setPremiumResult(null);
    setCurrentIndex(prev => prev + 1);
  }, []);

  const handleRetry = useCallback(() => {
    setSentence('');
    setResult(null);
    setPremiumResult(null);
  }, []);

  const handleRestart = useCallback(() => {
    // Navigate away and back to rebuild the queue fresh.
    navigation.replace('SentenceBuilder');
  }, [navigation]);

  // ── Empty state: no learned words ───────────────────────────────────────────
  if (learnedIds.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center', padding: spacing.lg }]}>
        <MaterialCommunityIcons name="book-open-variant" size={48} color={theme.textTertiary} style={{ marginBottom: spacing.md }} />
        <Text style={[typography.h3, { color: theme.text, textAlign: 'center', marginBottom: spacing.sm }]}>
          Henüz kelime öğrenmedin
        </Text>
        <Text style={{ color: theme.textSecondary, textAlign: 'center', marginBottom: spacing.xl }}>
          Önce bir ders tamamla ve kelimeleri öğren, sonra cümle kurma pratiği yap.
        </Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.actionBtn, { backgroundColor: theme.primary }]}>
          <Text style={styles.actionBtnText}>Geri Dön</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Finished state: all words in this session done ───────────────────────────
  if (isFinished) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg }}>
          <LinearGradient colors={['#6C63FF20', '#9B5CF610']} style={StyleSheet.absoluteFillObject} />

          <Ionicons name="trophy" size={64} color="#F59E0B" style={{ marginBottom: spacing.lg }} />

          <Text style={[typography.h2, { color: theme.text, textAlign: 'center', marginBottom: spacing.sm }]}>
            Oturum Tamamlandı!
          </Text>
          <Text style={{ color: theme.textSecondary, textAlign: 'center', marginBottom: spacing.xl, fontSize: 15 }}>
            {queue.length} kelimeden {completed} tanesini başarıyla cümlede kullandın.
          </Text>

          {totalXp > 0 && (
            <View style={[styles.xpSummary, { backgroundColor: theme.primaryLight }]}>
              <Ionicons name="star" size={20} color={theme.primary} />
              <Text style={[styles.xpSummaryText, { color: theme.primary }]}>+{totalXp} XP kazandın!</Text>
            </View>
          )}

          <View style={styles.finishActions}>
            <TouchableOpacity
              onPress={handleRestart}
              style={[styles.finishBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}
            >
              <Ionicons name="refresh" size={16} color={theme.text} style={{ marginRight: 6 }} />
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>Tekrar Başla</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.finishBtnGradient, { overflow: 'hidden' }]}>
              <LinearGradient colors={['#6C63FF', '#9B5CF6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFillObject} />
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Ana Sayfa</Text>
              <Ionicons name="home" size={16} color="#fff" style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ── Main UI ─────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <SafeAreaView style={{ flex: 1 }}>

          {/* ── Header ── */}
          <LinearGradient
            colors={['#6C63FF', '#9B5CF6']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
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
              <Text style={styles.headerSub}>Kelimeyi bir cümlede kullan</Text>
            </View>
            {/* Progress counter */}
            <View style={styles.progressBadge}>
              <Text style={styles.progressBadgeText}>{currentIndex + 1} / {queue.length}</Text>
            </View>
          </LinearGradient>

          {/* XP running total */}
          {totalXp > 0 && (
            <View style={[styles.xpBar, { backgroundColor: theme.primaryLight }]}>
              <Ionicons name="star" size={13} color={theme.primary} />
              <Text style={[styles.xpBarText, { color: theme.primary }]}>+{totalXp} XP</Text>
            </View>
          )}

          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* ── Word card ── */}
            <Animated.View style={cardSlide(cardAnim)}>
              <View style={[styles.wordCard, { backgroundColor: theme.surface, ...shadows.lg }]}>
                <LinearGradient colors={['#6C63FF18', '#9B5CF618']} style={StyleSheet.absoluteFillObject} />

                <Text style={[styles.wordCardLabel, { color: theme.textTertiary }]}>
                  BU KELİMEYİ KULLAN
                </Text>

                {/* The word — large, central focus */}
                <Text style={[styles.wordText, { color: theme.text }]}>
                  {currentWord?.word}
                </Text>

                {/* Translation */}
                <View style={[styles.translationPill, { backgroundColor: theme.primaryLight }]}>
                  <Text style={[styles.translationText, { color: theme.primary }]}>
                    {currentWord?.translation}
                  </Text>
                </View>

                {/* Example sentence hint (collapsed under result) */}
                {!result && currentWord?.example ? (
                  <Text style={[styles.exampleText, { color: theme.textTertiary }]} numberOfLines={2}>
                    💡 {currentWord.example}
                  </Text>
                ) : null}
              </View>
            </Animated.View>

            {/* ── Input area (hidden once result is shown) ── */}
            {!result && (
              <>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
                  placeholder={`"${currentWord?.word ?? ''}" kelimesini kullanarak bir cümle yaz…`}
                  placeholderTextColor={theme.textTertiary}
                  value={sentence}
                  onChangeText={setSentence}
                  multiline
                  textAlignVertical="top"
                  autoCapitalize="sentences"
                  autoCorrect={false}
                />

                <Animated.View style={{ transform: [{ scale: submitScale }], opacity: sentence.trim().length === 0 ? 0.5 : 1 }}>
                  <TouchableOpacity
                    onPress={handleSubmit}
                    onPressIn={onPressIn}
                    onPressOut={onPressOut}
                    disabled={sentence.trim().length === 0 || isAnalyzing}
                    activeOpacity={1}
                    style={{ borderRadius: radius.full, overflow: 'hidden', marginBottom: spacing.sm }}
                  >
                    <LinearGradient
                      colors={['#6C63FF', '#9B5CF6']}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={styles.submitGradient}
                    >
                      {isAnalyzing ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <>
                          <Text style={styles.submitText}>Analiz Et</Text>
                          <Ionicons name="sparkles" size={16} color="#fff" style={{ marginLeft: 8 }} />
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>

                {/* Skip current word */}
                <TouchableOpacity onPress={handleSkip} style={styles.skipLink}>
                  <Text style={[styles.skipLinkText, { color: theme.textTertiary }]}>Bu kelimeyi atla</Text>
                  <Ionicons name="chevron-forward" size={14} color={theme.textTertiary} />
                </TouchableOpacity>
              </>
            )}

            {/* ── Result card ── */}
            {result && (
              <Animated.View style={cardSlide(resultAnim)}>
                <View style={[
                  styles.resultCard,
                  {
                    backgroundColor: statusBg,
                    borderColor:     statusBorder,
                  },
                ]}>
                  {/* Status icon */}
                  <Ionicons
                    name={statusIcon as any}
                    size={40}
                    color={statusColor}
                    style={{ alignSelf: 'center' }}
                  />

                  {/* Feedback — partial overrides with a fixed message so the
                      Layer-1 "Mükemmel!" is never shown when AI found an error */}
                  <Text style={[styles.resultFeedback, { color: statusColor }]}>
                    {effectiveStatus === 'partial'
                      ? 'Kelimeyi doğru kullandın ama cümlede düzeltilmesi gereken bir nokta var.'
                      : result.feedback}
                  </Text>

                  {/* XP preview — shown once a result is available so the user
                      knows the reward they will receive when advancing.
                      perfect → 10 XP (green celebration)
                      partial →  5 XP (amber, muted — grammar fix needed)
                      fail    → nothing */}
                  {effectiveStatus === 'perfect' && (
                    <View style={[styles.xpEarned, { backgroundColor: theme.correct + '20' }]}>
                      <Ionicons name="star" size={14} color={theme.correct} style={{ marginRight: 4 }} />
                      <Text style={[styles.xpEarnedText, { color: theme.correct }]}>+10 XP kazandın!</Text>
                    </View>
                  )}
                  {effectiveStatus === 'partial' && (
                    <View style={[styles.xpEarned, { backgroundColor: '#FEF3C7' }]}>
                      <Ionicons name="star-outline" size={14} color="#B45309" style={{ marginRight: 4 }} />
                      <Text style={[styles.xpEarnedText, { color: '#B45309' }]}>+5 XP (düzelt → +10 XP)</Text>
                    </View>
                  )}

                  {/* User's sentence */}
                  <View style={[styles.sentenceDisplay, { backgroundColor: theme.surface + 'CC' }]}>
                    <Text style={[styles.boxLabel, { color: theme.textSecondary }]}>Yazdığın cümle:</Text>
                    <Text style={{ color: theme.text, fontSize: 15, fontStyle: 'italic' }}>"{sentence}"</Text>
                  </View>

                  {/* Corrected version (only if different) */}
                  {result.correctedSentence && (
                    <View style={[styles.correctedBox, { backgroundColor: theme.primaryLight, borderColor: theme.primary + '40' }]}>
                      <Text style={[styles.boxLabel, { color: theme.primary }]}>✏️ Düzeltilmiş hali:</Text>
                      <Text style={{ color: theme.text, fontSize: 15 }}>{result.correctedSentence}</Text>
                    </View>
                  )}

                  {/* ── Premium AI analysis panel ── */}
                  {!premiumResult && !isPremiumAnalyzing && (
                    <TouchableOpacity
                      onPress={handlePremiumAnalysis}
                      style={[styles.premiumBtn, { borderColor: '#7C3AED', backgroundColor: '#EDE9FE' }]}
                    >
                      <Ionicons name="sparkles" size={15} color="#7C3AED" />
                      <Text style={[styles.premiumBtnText, { color: '#7C3AED' }]}>Detaylı AI Analizi Al</Text>
                    </TouchableOpacity>
                  )}

                  {isPremiumAnalyzing && (
                    <View style={styles.premiumLoading}>
                      <ActivityIndicator size="small" color="#7C3AED" />
                      <Text style={{ color: '#7C3AED', fontSize: 13, fontWeight: '600', marginLeft: 8 }}>
                        Analiz ediliyor…
                      </Text>
                    </View>
                  )}

                  {premiumResult && (
                    <View style={[styles.premiumPanel, { backgroundColor: theme.surface, borderColor: '#7C3AED40' }]}>
                      {/* Panel header + score */}
                      <View style={styles.premiumHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Ionicons name="sparkles" size={15} color="#7C3AED" />
                          <Text style={[styles.premiumHeaderTitle, { color: '#7C3AED' }]}>AI Analizi</Text>
                        </View>
                        <View style={[
                          styles.scoreBadge,
                          {
                            backgroundColor:
                              premiumResult.score >= 85 ? theme.correct  + '25' :
                              premiumResult.score >= 65 ? '#F59E0B25' : theme.incorrect + '25',
                          },
                        ]}>
                          <Text style={[
                            styles.scoreBadgeText,
                            {
                              color:
                                premiumResult.score >= 85 ? theme.correct :
                                premiumResult.score >= 65 ? '#B45309'  : theme.incorrect,
                            },
                          ]}>
                            {premiumResult.score}/100
                          </Text>
                        </View>
                      </View>

                      {/* Turkish feedback */}
                      <Text style={[styles.premiumFeedback, { color: theme.text }]}>
                        {premiumResult.feedbackTr}
                      </Text>

                      {/* Grammar issues */}
                      {premiumResult.grammarIssues.length > 0 && (
                        <View style={styles.issueList}>
                          {premiumResult.grammarIssues.map((issue, i) => (
                            <View key={i} style={styles.issueRow}>
                              <Ionicons
                                name={
                                  issue.severity === 'error'      ? 'close-circle'     :
                                  issue.severity === 'warning'    ? 'warning'           :
                                                                    'bulb-outline'
                                }
                                size={14}
                                color={
                                  issue.severity === 'error'   ? theme.incorrect :
                                  issue.severity === 'warning' ? '#B45309'       : theme.primary
                                }
                              />
                              <Text style={[styles.issueText, {
                                color: issue.severity === 'error'   ? theme.incorrect :
                                       issue.severity === 'warning' ? '#B45309'       : theme.textSecondary,
                              }]}>
                                {issue.description}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {/* AI corrected sentence (only if different from local corrected) */}
                      {premiumResult.correctedSentence && (
                        <View style={[styles.premiumBox, { backgroundColor: theme.primaryLight, borderColor: theme.primary + '30' }]}>
                          <Text style={[styles.boxLabel, { color: theme.primary }]}>✏️ Düzeltilmiş hali:</Text>
                          <Text style={{ color: theme.text, fontSize: 14 }}>{premiumResult.correctedSentence}</Text>
                        </View>
                      )}

                      {/* More natural alternative — populated by real AI backend */}
                      {premiumResult.moreNaturalSentence && (
                        <View style={[styles.premiumBox, { backgroundColor: '#FEF3C720', borderColor: '#F59E0B40' }]}>
                          <Text style={[styles.boxLabel, { color: '#B45309' }]}>💡 Daha doğal bir ifade:</Text>
                          <Text style={{ color: theme.text, fontSize: 14, fontStyle: 'italic' }}>
                            {premiumResult.moreNaturalSentence}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Actions */}
                  <View style={styles.resultActions}>
                    {effectiveStatus !== 'perfect' && (
                      <TouchableOpacity
                        onPress={handleRetry}
                        style={[styles.retryBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}
                      >
                        <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>Tekrar Dene</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={handleNext} style={[styles.nextBtn, { overflow: 'hidden' }]}>
                      <LinearGradient
                        colors={['#6C63FF', '#9B5CF6']}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        style={StyleSheet.absoluteFillObject}
                      />
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                        {currentIndex + 1 < queue.length ? 'Sonraki Kelime' : 'Bitir'}
                      </Text>
                      <Ionicons name="chevron-forward" size={16} color="#fff" style={{ marginLeft: 4 }} />
                    </TouchableOpacity>
                  </View>
                </View>
              </Animated.View>
            )}
          </ScrollView>
        </SafeAreaView>
      </View>
    </KeyboardAvoidingView>
  );
};

// ─── Styles ────────────────────────────────────────────────────────────────────

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
    width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  headerSub:   { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 1 },
  progressBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    minWidth: 52,
    alignItems: 'center',
  },
  progressBadgeText: { color: '#fff', fontWeight: '800', fontSize: 13 },

  xpBar: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: 4,
    borderRadius: radius.full,
  },
  xpBarText: { fontWeight: '800', fontSize: 13 },

  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },

  // ── Word card ──
  wordCard: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    overflow: 'hidden',
    alignItems: 'center',
    gap: spacing.sm,
  },
  wordCardLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  wordText: {
    fontSize: 40, fontWeight: '900', textAlign: 'center', letterSpacing: -0.5,
  },
  translationPill: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderRadius: radius.full,
    marginTop: spacing.xs,
  },
  translationText: { fontSize: 15, fontWeight: '700' },
  exampleText: {
    fontSize: 13, fontStyle: 'italic', textAlign: 'center',
    marginTop: spacing.sm, lineHeight: 18,
  },

  // ── Input ──
  input: {
    borderRadius: radius.xl,
    borderWidth: 2,
    padding: spacing.md,
    fontSize: 16,
    minHeight: 120,
    lineHeight: 24,
    marginBottom: spacing.md,
  },
  submitGradient: {
    height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  skipLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: spacing.md,
  },
  skipLinkText: { fontSize: 14, fontWeight: '600' },

  // ── Result ──
  resultCard: {
    borderRadius: radius.xl, borderWidth: 1.5,
    padding: spacing.lg, marginBottom: spacing.lg, gap: spacing.md,
  },
  resultFeedback: {
    fontSize: 15, fontWeight: '700', textAlign: 'center', lineHeight: 22,
  },
  xpEarned: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    alignSelf: 'center',
  },
  xpEarnedText: { fontWeight: '800', fontSize: 14 },
  sentenceDisplay: { borderRadius: radius.md, padding: spacing.md, gap: 4 },
  correctedBox: { borderRadius: radius.md, padding: spacing.md, gap: 4, borderWidth: 1 },
  boxLabel: { fontSize: 12, fontWeight: '600' },

  resultActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  retryBtn: {
    flex: 1, height: 52, borderRadius: radius.full,
    borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
  },
  nextBtn: {
    flex: 1, height: 52, borderRadius: radius.full,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },

  // ── Finish screen ──
  xpSummary: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    borderRadius: radius.full, marginBottom: spacing.xl,
  },
  xpSummaryText: { fontSize: 18, fontWeight: '800' },
  finishActions: { flexDirection: 'row', gap: spacing.md, width: '100%' },
  finishBtn: {
    flex: 1, height: 52, borderRadius: radius.full,
    borderWidth: 1.5, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center',
  },
  finishBtnGradient: {
    flex: 1, height: 52, borderRadius: radius.full,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },

  actionBtn: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.full },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // ── Premium AI panel ──
  premiumBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderRadius: radius.full, borderWidth: 1.5,
  },
  premiumBtnText: { fontSize: 13, fontWeight: '700' },
  premiumLoading: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  premiumPanel: {
    borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, gap: spacing.sm,
  },
  premiumHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  premiumHeaderTitle: { fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
  scoreBadge: {
    paddingHorizontal: spacing.sm, paddingVertical: 3,
    borderRadius: radius.full,
  },
  scoreBadgeText: { fontSize: 13, fontWeight: '800' },
  premiumFeedback: { fontSize: 14, lineHeight: 20 },
  issueList: { gap: 6 },
  issueRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  issueText: { fontSize: 13, flex: 1, lineHeight: 18 },
  premiumBox: {
    borderRadius: radius.md, borderWidth: 1, padding: spacing.sm, gap: 4,
  },
});
