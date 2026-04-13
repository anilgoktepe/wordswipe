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
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { getLocalWords, Word } from '../services/vocabularyService';
import { analyzeSentenceLocal, LocalAnalysisResult, validateCorrectedSentence } from '../services/sentenceAnalysisService';
import {
  analyzeSentenceDetailed,
  DetailedAnalysisResult,
  LocalAnalysisSummary,
  ConfidenceLevel,
} from '../services/detailedAnalysisService';
import { getTheme, spacing, radius, typography, shadows } from '../utils/theme';
import {
  FREE_SENTENCE_SESSION_CAP,
  FREE_DAILY_AI_ANALYSES,
  showRewardedAd,
  isRewardedAdReady,
} from '../utils/monetization';
import { AiAnalysisGateModal } from '../components/MonetizationModals';

const vocabulary = getLocalWords();

// Premium users get the entire learned-word pool — no cap applied.

interface Props {
  navigation: any;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Builds a shuffled queue of up to `max` learned words for the session. */
function buildQueue(learnedIds: number[], max: number): Word[] {
  const pool = vocabulary.filter(w => learnedIds.includes(w.id));
  return [...pool].sort(() => Math.random() - 0.5).slice(0, max);
}

// ─── Screen ────────────────────────────────────────────────────────────────────

export const SentenceBuilderScreen: React.FC<Props> = ({ navigation }) => {
  const { state, dispatch } = useApp();
  const theme = getTheme(state.darkMode);

  const learnedIds = state.learnedWordIds;
  const isPremium  = state.isPremium;

  // Free users: 5-word queue.  Premium users: full learned-word pool (unlimited).
  const sessionMax = isPremium ? learnedIds.length : FREE_SENTENCE_SESSION_CAP;

  // One-time queue built at mount — does not rebuild on re-render.
  const [queue]               = useState<Word[]>(() => buildQueue(learnedIds, sessionMax));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sentence, setSentence]         = useState('');
  const [result, setResult]             = useState<LocalAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing]   = useState(false);
  const [totalXp, setTotalXp]           = useState(0);
  const [completed, setCompleted]       = useState(0); // words answered (valid)

  // ── Premium AI layer ─────────────────────────────────────────────────────────
  // Layer 1 (local) always runs first. Premium is opt-in, user-triggered.
  const [detailedResult, setDetailedResult]       = useState<DetailedAnalysisResult | null>(null);
  const [isDetailedAnalyzing, setIsDetailedAnalyzing] = useState(false);

  // ── AI analysis gate (free users) ────────────────────────────────────────────
  // Free users see a modal with two paths: watch a rewarded ad (1/day) or
  // upgrade.  Premium users bypass the gate entirely.
  const [aiGateVisible,  setAiGateVisible]  = useState(false);
  const [isWatchingAd,   setIsWatchingAd]   = useState(false);
  // Has the daily free rewarded analysis already been used?
  const aiLimitReached =
    !isPremium &&
    state.dailyAiAnalysesUsed >= FREE_DAILY_AI_ANALYSES;
  const analysesRemaining = Math.max(0, FREE_DAILY_AI_ANALYSES - state.dailyAiAnalysesUsed);

  const currentWord = queue[currentIndex] ?? null;
  const isFinished  = currentIndex >= queue.length;

  // ── Effective result status ───────────────────────────────────────────────
  // Single source of truth for the entire result UI.
  //
  // Design contract:
  //   • Without detailed analysis: local result is authoritative.
  //   • With detailed analysis: take the WORSE of the two verdicts.
  //     – Detailed AI can downgrade (find errors local missed) → partial/fail.
  //     – Detailed AI can NOT upgrade a locally-detected grammar error to perfect.
  //     – Exception: if local failed only because the target word was absent and
  //       detailed confirms the word IS present, trust detailed's verdict.
  //
  //   perfect → green  (10 XP) — word used AND no structural errors
  //   partial → amber  ( 5 XP) — word used, verdict ACCEPTABLE (surface issues only: typo/punctuation)
  //           → red    ( 0 XP) — word used, verdict FLAWED (structural grammar/preposition error)
  //   fail    → red    ( 0 XP) — word missing / local grammar rule fired
  const effectiveStatus: 'perfect' | 'partial' | 'fail' = (() => {
    if (!result) return 'fail'; // result card not shown yet — value unused
    if (!detailedResult) return result.status;

    // If local didn't detect the target word at all, trust the AI's verdict —
    // it may use better lemmatisation / word-family matching.
    if (!result.usedTargetWord) return detailedResult.status;

    // Word was found locally: take the WORSE of the two statuses.
    // This prevents the AI from silencing an error the local engine caught.
    const rank = (s: 'perfect' | 'partial' | 'fail') =>
      s === 'perfect' ? 2 : s === 'partial' ? 1 : 0;
    const worse = Math.min(rank(result.status), rank(detailedResult.status));
    return (['fail', 'partial', 'perfect'] as const)[worse];
  })();

  // ── Display feedback ──────────────────────────────────────────────────────
  // Full feedback string — used by the AI panel's issue deduplication logic
  // (iss.messageTr !== displayFeedback) and as source for AI panel heading.
  // NOT shown directly in the local result card — see localVerdictText below.
  const displayFeedback: string = (() => {
    if (!result) return '';
    if (effectiveStatus === 'partial') {
      return detailedResult?.shortFeedbackTr
        ?? 'Kelimeyi doğru kullandın ama cümlede düzeltilmesi gereken bir nokta var.';
    }
    if (effectiveStatus === 'fail') {
      if (result.status === 'fail') return result.feedbackTr;
      return detailedResult?.shortFeedbackTr ?? result.feedbackTr;
    }
    return result.feedbackTr;
  })();

  // ── Local verdict text ────────────────────────────────────────────────────
  // Short, category-level message shown in the local result card.
  // Intentionally less detailed than displayFeedback so that the AI panel
  // provides clear additional value (full explanation, score, multi-issue list).
  const localVerdictText: string = (() => {
    if (!result) return '';
    if (effectiveStatus === 'perfect') return result.feedbackTr; // success — full msg ok
    if (effectiveStatus === 'partial') return 'Kelimeyi kullandın ama düzeltilmesi gereken bir nokta var.';
    // fail — short category summary, no full rule explanation
    if (!result.usedTargetWord) return 'Hedef kelimeyi cümlende kullanmadın.';
    return 'Cümlede dilbilgisi hatası var.';
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

  const handleSubmit = useCallback(() => {
    if (!sentence.trim() || isAnalyzing || !currentWord) return;

    setIsAnalyzing(true);
    const analysis = analyzeSentenceLocal({ targetWord: currentWord.word, sentence });
    setResult(analysis);
    // XP is NOT awarded here. It is deferred to handleNext so that the detailed
    // analysis (if the user triggers it) can influence the final grade first.
    setIsAnalyzing(false);
  }, [sentence, currentWord, isAnalyzing]);

  const handleDetailedAnalysis = useCallback(async () => {
    if (!currentWord || isDetailedAnalyzing || !result) return;
    setIsDetailedAnalyzing(true);

    // Convert the numeric confidence from Layer 1 (0–1) to the enum the
    // request contract requires.
    const toConfidenceLevel = (c: number): ConfidenceLevel =>
      c >= 0.7 ? 'high' : c >= 0.4 ? 'medium' : 'low';

    // Build the Layer-1 summary forwarded to the backend so it does not have
    // to re-run basic grammar checks.
    const localAnalysis: LocalAnalysisSummary = {
      status:         result.status,
      usedTargetWord: result.usedTargetWord,
      targetWordMode: result.targetWordMode,
      score:          result.score,
      confidence:     toConfidenceLevel(result.confidence),
      issues: result.issues.map(i => ({
        type:     'grammar',
        severity: i.severity === 'error' ? ('error' as const) : ('suggestion' as const),
        messageTr: i.messageTr,
      })),
    };

    const analysis = await analyzeSentenceDetailed({
      targetWord:    currentWord.word,
      sentence,
      userLevel:     currentWord.level,
      localAnalysis,
    });
    setDetailedResult(analysis);
    setIsDetailedAnalyzing(false);
  }, [currentWord, sentence, result, isDetailedAnalyzing]);

  // ── "Detaylı AI Analizi Al" tap handler ──────────────────────────────────
  // Premium: run analysis directly.
  // Free + limit not reached: open gate modal (ad or upgrade).
  // Free + limit reached: open gate modal (upgrade only).
  const handleAiAnalysisTap = useCallback(() => {
    if (isPremium) {
      handleDetailedAnalysis();
    } else {
      setAiGateVisible(true);
    }
  }, [isPremium, handleDetailedAnalysis]);

  // Called from the gate modal when user opts to watch an ad.
  const handleWatchAdForAi = useCallback(() => {
    // Guard: check readiness before entering the spinner state.
    // Without this, an unavailable ad would cause an instant false result
    // and the modal would flicker back to its normal state with no feedback.
    if (!isRewardedAdReady()) {
      Alert.alert(
        'Reklam Hazır Değil',
        'Reklam henüz yüklenmedi. Birkaç saniye bekleyip tekrar dene.',
        [{ text: 'Tamam' }],
      );
      return;
    }

    setIsWatchingAd(true);
    showRewardedAd((rewarded) => {
      setIsWatchingAd(false);
      if (rewarded) {
        dispatch({ type: 'RECORD_AD_SHOWN' });
        dispatch({ type: 'RECORD_AI_ANALYSIS_USED' });
        setAiGateVisible(false);
        // Slight delay so the modal closes before analysis spinner appears
        setTimeout(() => handleDetailedAnalysis(), 100);
      }
      // rewarded = false: user dismissed without watching full ad.
      // The modal stays open — user can try again or choose to upgrade.
    });
  }, [dispatch, handleDetailedAnalysis]);

  const handleNext = useCallback(() => {
    // ── Award XP based on the FINAL evaluated verdict ────────────────────────
    // This is the single XP award point for a word attempt.  Deferring to here
    // means detailed analysis always has a chance to run before XP is committed.
    //
    //   PERFECT    → 10 XP, SRS advances   (no errors at all)
    //   ACCEPTABLE →  5 XP, SRS advances   (surface issues only: typo/punctuation)
    //   FLAWED     →  0 XP, SRS blocked    (ANY structural grammar/preposition error)
    //   REJECTED   →  0 XP, SRS blocked    (target word missing)
    //   no verdict →  local fallback only: perfect→10, partial/fail→0
    if (result) {
      let xpEarned = 0;
      let countAsCompleted = false;

      // XP uses the same "worse-of-two" merge as the render-time effectiveStatus.
      const _rank = (s: 'perfect' | 'partial' | 'fail') =>
        s === 'perfect' ? 2 : s === 'partial' ? 1 : 0;
      const _finalStatus: 'perfect' | 'partial' | 'fail' = (() => {
        if (!detailedResult) return result.status;
        if (!result.usedTargetWord) return detailedResult.status;
        const worse = Math.min(_rank(result.status), _rank(detailedResult.status));
        return (['fail', 'partial', 'perfect'] as const)[worse];
      })();

      // ── Verdict-based XP and SRS gating ──────────────────────────────────
      //
      //   The 4-way EvaluationVerdict (from the backend normalizer) is the
      //   single authority for XP and SRS decisions.  The 3-way _finalStatus
      //   is only used as a fallback when no detailed analysis has run yet.
      //
      //   PERFECT    → 10 XP  • SRS advances   (structurally correct, natural)
      //   ACCEPTABLE →  5 XP  • SRS advances   (surface issues only: typo/punctuation)
      //   FLAWED     →  0 XP  • SRS blocked    (structural grammar/preposition error —
      //                                          ANY structural error, no score threshold)
      //   REJECTED   →  0 XP  • SRS blocked    (target word missing / incoherent)
      //   no verdict →  local 3-way fallback   (no detailed analysis ran)
      //
      const _detailedVerdict = detailedResult?.verdict ?? null;

      if (_detailedVerdict !== null) {
        // Detailed analysis ran — verdict is authoritative.
        if (_detailedVerdict === 'PERFECT' || _detailedVerdict === 'ACCEPTABLE') {
          xpEarned         = _detailedVerdict === 'PERFECT' ? 10 : 5;
          countAsCompleted = true;  // advances SRS
        }
        // FLAWED and REJECTED: xpEarned stays 0, countAsCompleted stays false.
        // No score threshold — ANY FLAWED verdict is 0 XP.
      } else {
        // No detailed analysis — fall back to local 3-way status.
        if (_finalStatus === 'perfect') {
          xpEarned         = 10;
          countAsCompleted = true;
        }
        // partial / fail without detailed: 0 XP (conservative — we don't know
        // whether the partial is structural or surface-level).
      }
      // fail → 0 XP, countAsCompleted stays false

      if (xpEarned > 0) {
        dispatch({ type: 'ADD_XP', amount: xpEarned });
        setTotalXp(prev => prev + xpEarned);
      }
      if (countAsCompleted) {
        setCompleted(prev => prev + 1);
        // Advance SRS for the word: updates nextReviewAt, correctCount,
        // isDifficult auto-clear, and dailyProgress.
        if (currentWord) {
          dispatch({ type: 'MARK_WORD_LEARNED', wordId: currentWord.id });
        }
      }
    }

    setSentence('');
    setResult(null);
    setDetailedResult(null);
    setCurrentIndex(prev => prev + 1);
  }, [result, detailedResult, currentWord, dispatch]);

  const handleSkip = useCallback(() => {
    setSentence('');
    setResult(null);
    setDetailedResult(null);
    setCurrentIndex(prev => prev + 1);
  }, []);

  const handleRetry = useCallback(() => {
    setSentence('');
    setResult(null);
    setDetailedResult(null);
    setAiGateVisible(false);
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

          {/* XP running total — hidden while a result is on screen to avoid
              confusion with the current word's inline XP badge */}
          {totalXp > 0 && !result && (
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

                  {/* Short local verdict — category-level only.
                      Full explanation is in the AI panel (displayFeedback). */}
                  <Text style={[styles.resultFeedback, { color: statusColor }]}>
                    {localVerdictText}
                  </Text>

                  {/* XP preview — shown once a result is available.
                      PERFECT     → +10 XP green badge
                      ACCEPTABLE  → +5 XP  amber badge  (surface issues only)
                      FLAWED      → no badge (structural grammar error → 0 XP)
                      REJECTED    → no badge (0 XP)
                      no verdict  → mirrors effectiveStatus (local only, no detailed) */}
                  {(effectiveStatus === 'perfect' &&
                    detailedResult?.verdict !== 'FLAWED' &&
                    detailedResult?.verdict !== 'REJECTED') && (
                    <View style={[styles.xpEarned, { backgroundColor: theme.correct + '20' }]}>
                      <Ionicons name="star" size={14} color={theme.correct} style={{ marginRight: 4 }} />
                      <Text style={[styles.xpEarnedText, { color: theme.correct }]}>+10 XP kazandın!</Text>
                    </View>
                  )}
                  {/* +5 XP only when verdict is explicitly ACCEPTABLE (surface issue, no structural error) */}
                  {detailedResult?.verdict === 'ACCEPTABLE' && (
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

                  {/* Corrected version — prefer local's grammar-fix sentence when
                      local caught an error; suppress if detailed panel shows its own.
                      CORRECTION RELIABILITY GATE: before displaying a corrected
                      sentence, validate that it is itself free of grammar errors.
                      A wrong correction is worse than no correction — if the local
                      rule only partially fixed the sentence (e.g. removed "to" but
                      did not convert the following bare verb to -ing), suppress the
                      correction and fall back to the word's example sentence. */}
                  {(() => {
                    // Validate the correction candidate once (used in both branches below).
                    const correctionIsValid =
                      !!result.correctedSentence &&
                      validateCorrectedSentence(result.correctedSentence);

                    // When local detected a grammar error, show the corrected sentence
                    // if one is available and valid; otherwise fall back to the word's
                    // example sentence. The outer condition no longer requires a
                    // correctedSentence — it may have been suppressed (e.g. ambiguous
                    // be-agreement fix) and the example fallback should still trigger.
                    if (result.status === 'fail') {
                      if (correctionIsValid) {
                        return (
                          <View style={[styles.correctedBox, { backgroundColor: theme.primaryLight, borderColor: theme.primary + '40' }]}>
                            <Text style={[styles.boxLabel, { color: theme.primary }]}>✏️ Düzeltilmiş hali:</Text>
                            <Text style={{ color: theme.text, fontSize: 15 }}>{result.correctedSentence}</Text>
                          </View>
                        );
                      }
                      // No safe correction available — no fallback example here.
                      // Example usage belongs to the AI panel (higher-value layer).
                      return null;
                    }
                    // Local was fine (cosmetic only) — only show if detailed hasn't run
                    // (detailed panel will render its own corrected sentence if it has one).
                    if (!detailedResult && result.correctedSentence && correctionIsValid) {
                      return (
                        <View style={[styles.correctedBox, { backgroundColor: theme.primaryLight, borderColor: theme.primary + '40' }]}>
                          <Text style={[styles.boxLabel, { color: theme.primary }]}>✏️ Düzeltilmiş hali:</Text>
                          <Text style={{ color: theme.text, fontSize: 15 }}>{result.correctedSentence}</Text>
                        </View>
                      );
                    }
                    return null;
                  })()}

                  {/* ── Premium AI analysis panel ── */}
                  {!detailedResult && !isDetailedAnalyzing && (
                    <TouchableOpacity
                      onPress={handleAiAnalysisTap}
                      style={[
                        styles.premiumBtn,
                        {
                          borderColor: aiLimitReached ? '#9CA3AF' : '#7C3AED',
                          backgroundColor: aiLimitReached ? '#F9FAFB' : '#EDE9FE',
                        },
                      ]}
                    >
                      <Ionicons
                        name={aiLimitReached ? 'lock-closed-outline' : 'sparkles'}
                        size={15}
                        color={aiLimitReached ? '#9CA3AF' : '#7C3AED'}
                      />
                      <Text style={[
                        styles.premiumBtnText,
                        { color: aiLimitReached ? '#9CA3AF' : '#7C3AED' },
                      ]}>
                        {aiLimitReached
                          ? 'AI Analizi — Günlük limit doldu'
                          : 'Detaylı AI Analizi Al'}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {isDetailedAnalyzing && (
                    <View style={styles.premiumLoading}>
                      <ActivityIndicator size="small" color="#7C3AED" />
                      <Text style={{ color: '#7C3AED', fontSize: 13, fontWeight: '600', marginLeft: 8 }}>
                        Analiz ediliyor…
                      </Text>
                    </View>
                  )}

                  {detailedResult && (
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
                              detailedResult.score >= 85 ? theme.correct  + '25' :
                              detailedResult.score >= 65 ? '#F59E0B25' : theme.incorrect + '25',
                          },
                        ]}>
                          <Text style={[
                            styles.scoreBadgeText,
                            {
                              color:
                                detailedResult.score >= 85 ? theme.correct :
                                detailedResult.score >= 65 ? '#B45309'  : theme.incorrect,
                            },
                          ]}>
                            {detailedResult.score}/100
                          </Text>
                        </View>
                      </View>

                      {/* Turkish feedback — with false-praise guard:
                          never show positive message when the verdict is bad. */}
                      <Text style={[styles.premiumFeedback, { color: theme.text }]}>
                        {(() => {
                          const fb = detailedResult.shortFeedbackTr;
                          const isDowngraded = effectiveStatus === 'partial' || effectiveStatus === 'fail';
                          if (isDowngraded && /great|perfect|excellent|awesome|well done|harika|mükemmel/i.test(fb)) {
                            return effectiveStatus === 'partial'
                              ? 'Cümlende yapısal sorun var. Aşağıdaki geri bildirimi kontrol et.'
                              : 'Cümle önemli değişiklikler gerektiriyor. Tekrar dene.';
                          }
                          return fb;
                        })()}
                      </Text>

                      {/* AI / LT corrected sentence — shown BEFORE the issue list
                          so the user sees "what's correct" before "why it's wrong".
                          CORRECTION RELIABILITY GATE: validate before display. */}
                      {detailedResult.correctedSentence &&
                       validateCorrectedSentence(detailedResult.correctedSentence) && (
                        <View style={[styles.premiumBox, { backgroundColor: theme.primaryLight, borderColor: theme.primary + '30' }]}>
                          <Text style={[styles.boxLabel, { color: theme.primary }]}>
                            {detailedResult.correctionType === 'rewrite'
                              ? '🔄 Doğru bir yol:'
                              : detailedResult.correctionType === 'minor_fix'
                              ? '✏️ Küçük düzeltme:'
                              : '✏️ Düzeltilmiş hali:'}
                          </Text>
                          <Text style={{ color: theme.text, fontSize: 14 }}>{detailedResult.correctedSentence}</Text>
                        </View>
                      )}

                      {/* More natural alternative — shown before issues so the
                          user sees the better phrasing before the explanation. */}
                      {detailedResult.naturalAlternative && (
                        <View style={[styles.premiumBox, { backgroundColor: '#FEF3C720', borderColor: '#F59E0B40' }]}>
                          <Text style={[styles.boxLabel, { color: '#B45309' }]}>💡 Daha doğal bir ifade:</Text>
                          <Text style={{ color: theme.text, fontSize: 14, fontStyle: 'italic' }}>
                            {detailedResult.naturalAlternative}
                          </Text>
                        </View>
                      )}

                      {/* Example sentences — shown when verdict is REJECTED and
                          no corrected sentence is available (real AI backend only) */}
                      {detailedResult.verdict === 'REJECTED' &&
                       !detailedResult.correctedSentence &&
                       detailedResult.exampleSentences &&
                       detailedResult.exampleSentences.length > 0 && (
                        <View style={[styles.premiumBox, { backgroundColor: '#FEF3C720', borderColor: '#F59E0B40' }]}>
                          <Text style={[styles.boxLabel, { color: '#B45309' }]}>💡 Bu kelime nasıl kullanılır:</Text>
                          {detailedResult.exampleSentences.map((ex, i) => (
                            <Text key={i} style={{ color: theme.text, fontSize: 14, fontStyle: 'italic' }}>• {ex}</Text>
                          ))}
                        </View>
                      )}

                      {/* Grammar issues — sorted by severity (error → warning → suggestion)
                          so structural errors always appear before punctuation hints.
                          Deduplicated: skip issues whose text matches displayFeedback
                          or is an exact duplicate within the list. */}
                      {(() => {
                        const SEVERITY_RANK: Record<string, number> = { error: 0, warning: 1, suggestion: 2 };
                        const visibleIssues = detailedResult.issues
                          .filter((iss, idx, arr) =>
                            arr.findIndex(o => o.messageTr === iss.messageTr) === idx &&
                            iss.messageTr !== displayFeedback
                          )
                          .sort((a, b) =>
                            (SEVERITY_RANK[a.severity] ?? 2) - (SEVERITY_RANK[b.severity] ?? 2)
                          );
                        if (visibleIssues.length === 0) return null;
                        return (
                          <View style={styles.issueList}>
                            {visibleIssues.map((issue, i) => (
                              <View key={i} style={styles.issueRow}>
                                <Ionicons
                                  name={
                                    issue.severity === 'error'   ? 'close-circle' :
                                    issue.severity === 'warning' ? 'warning'      : 'bulb-outline'
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
                                  {issue.messageTr}
                                </Text>
                              </View>
                            ))}
                          </View>
                        );
                      })()}
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

        {/* ── AI analysis gate modal (free users) ── */}
        <AiAnalysisGateModal
          visible={aiGateVisible}
          isLimitReached={aiLimitReached}
          isWatchingAd={isWatchingAd}
          analysesRemaining={analysesRemaining}
          theme={theme}
          onClose={() => { if (!isWatchingAd) setAiGateVisible(false); }}
          onWatchAd={handleWatchAdForAi}
          onUpgrade={() => {
            setAiGateVisible(false);
            navigation.navigate('Premium');
          }}
        />
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
