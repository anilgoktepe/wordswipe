import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Dimensions,
  Animated,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useApp } from '../context/AppContext';
import { Button } from '../components/Button';
import { getLocalWords } from '../services/vocabularyService';
import { getTheme, spacing, radius, typography, shadows } from '../utils/theme';
import {
  ALL_LESSON_SIZES,
  FREE_SESSION_CAP,
  DEBUG_BYPASS_DAILY_LESSON_GATE,
  showRewardedAd,
  isRewardedAdReady,
} from '../utils/monetization';
import { PremiumGateModal } from '../components/MonetizationModals';

const { width } = Dimensions.get('window');
const vocabulary = getLocalWords();

const levelLabels = {
  easy: 'Başlangıç (A1-A2)',
  medium: 'Orta (B1-B2)',
  hard: 'İleri (C1-C2)',
};

interface Props {
  navigation: any;
}

export const HomeScreen: React.FC<Props> = ({ navigation }) => {
  useIsFocused();

  const { state, dispatch, getDailyWords, getDifficultWordObjects } = useApp();
  // Entrance animations — staggered fade + slide-up for each card
  const headerAnim  = useRef(new Animated.Value(0)).current;
  const ctaAnim     = useRef(new Animated.Value(0)).current;
  const card2Anim   = useRef(new Animated.Value(0)).current;
  const card3Anim   = useRef(new Animated.Value(0)).current;
  const card4Anim   = useRef(new Animated.Value(0)).current;

  // Streak fire pulse — loops when streak >= 3
  const streakPulse = useRef(new Animated.Value(1)).current;
  const streakLoop  = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    const makeAnim = (val: Animated.Value, delay: number) =>
      Animated.timing(val, {
        toValue: 1,
        duration: 340,
        delay,
        useNativeDriver: true,
      });
    Animated.stagger(60, [
      makeAnim(headerAnim, 0),
      makeAnim(ctaAnim, 0),
      makeAnim(card2Anim, 0),
      makeAnim(card3Anim, 0),
      makeAnim(card4Anim, 0),
    ]).start();
  }, []);

  useEffect(() => {
    // Stop any previous loop
    streakLoop.current?.stop();
    streakPulse.setValue(1);

    if (state.streak >= 3) {
      streakLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(streakPulse, { toValue: 1.30, duration: 600, useNativeDriver: true }),
          Animated.timing(streakPulse, { toValue: 1,    duration: 600, useNativeDriver: true }),
        ]),
      );
      streakLoop.current.start();
    }
    return () => { streakLoop.current?.stop(); };
  }, [state.streak]); // eslint-disable-line react-hooks/exhaustive-deps

  const slideStyle = (anim: Animated.Value) => ({
    opacity: anim,
    transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
  });
  const theme = getTheme(state.darkMode);

  // ── Monetization local state — must be before session-size derivations ───
  const isPremium = state.isPremium;

  // ── Free-tier daily lesson bonus ─────────────────────────────────────────
  // The rewarded +5 is a one-time daily extension, not a repeatable reset.
  // All ad-offer UI, tap-handler guards, and reward-callback checks must
  // derive from a single computed truth so they can never drift apart.

  // bonusWordsActive — the rewarded bonus was claimed today and the bonus
  //   session has not yet been dispatched.  Drives effectiveCap (+5 words)
  //   and the handleStartLesson gate bypass.
  //
  //   Intentionally has NO dailyProgress check: eligibility is based solely
  //   on whether the session was started, not on how many words were answered
  //   correctly.  A user who answered all 5 base words wrong still has a valid
  //   base session behind them and can use their bonus.
  const bonusWordsActive = !isPremium
    && state.dailyLessonBonusClaimed
    && !state.dailyBonusSessionStarted;

  // canOfferLessonBonusAd — the ONLY condition under which it is valid to
  //   show and play the rewarded lesson-bonus ad.  Both checks must pass:
  //
  //   (1) !dailyLessonBonusClaimed  — bonus not yet claimed today
  //   (2) dailyBaseSessionStarted   — base session has been started (something
  //                                   to extend); replaces the old
  //                                   dailyProgress >= FREE_SESSION_CAP check
  //                                   so that eligibility is not tied to how
  //                                   many words the user got right first-attempt.
  const canOfferLessonBonusAd = !isPremium
    && !state.dailyLessonBonusClaimed
    && state.dailyBaseSessionStarted;

  const [bonusAdLoading, setBonusAdLoading] = useState(false);

  // Premium gate modal
  const [premiumModal, setPremiumModal] = useState<{
    visible: boolean;
    featureTitle: string;
    featureDescription: string;
  }>({ visible: false, featureTitle: '', featureDescription: '' });

  const showPremiumModal = useCallback((title: string, desc: string) => {
    setPremiumModal({ visible: true, featureTitle: title, featureDescription: desc });
  }, []);

  // ── Auto-correct saved lessonSize for free users ─────────────────────────
  // If the user was previously premium (or has a stale default of 20), and
  // is now free, quietly reset their lesson size to the free base of 5.
  const lessonSize = state.lessonSize ?? 20;
  const reviewCap  = isPremium ? lessonSize : FREE_SESSION_CAP;
  useEffect(() => {
    if (!isPremium && lessonSize > FREE_SESSION_CAP) {
      dispatch({ type: 'SET_LESSON_SIZE', size: FREE_SESSION_CAP });
    }
  }, [isPremium, lessonSize, dispatch]);

  // ── Session word counts ──────────────────────────────────────────────────
  // Effective cap: premium = unlimited; bonus active = 10; free base = 5.
  const effectiveCap = isPremium
    ? Infinity
    : bonusWordsActive ? FREE_SESSION_CAP + 5 : FREE_SESSION_CAP;

  // The session size shown in the progress bar.
  // For premium users: their chosen lessonSize.
  // For free users: 10 if the bonus has been claimed (shows accurate progress
  //   toward the full 10-word daily cap), 5 otherwise.
  //   Intentionally uses dailyLessonBonusClaimed rather than bonusWordsActive
  //   so the bar stays at /10 even after the bonus session is started
  //   (bonusWordsActive becomes false then, but the cap is still 10 for the day).
  const effectiveLessonSize = isPremium
    ? lessonSize
    : (state.dailyLessonBonusClaimed ? FREE_SESSION_CAP + 5 : FREE_SESSION_CAP);
  const todayProgress = Math.min(state.dailyProgress, effectiveLessonSize);
  const totalToday    = effectiveLessonSize;

  // Compute the display word count for the CTA badge, respecting the cap.
  const rawDailyWords = getDailyWords();
  const cappedDailyWords = isPremium
    ? rawDailyWords
    : rawDailyWords.slice(0, effectiveCap);

  // ── User-facing word classifications (raw counts, not internal SRS flags) ─
  // difficult = words the user has not yet recovered from:
  //             • isDifficult flag still set (in active recovery: got some right
  //               but hasn't cleared 3 consecutive yet), OR
  //             • wrongCount > 0 AND correctCount === 0 (wrong, never correct)
  // seenCount = words answered at least once (not just seeded at session start)
  const difficultWords = getDifficultWordObjects();
  // learnedReviewWords = all words with at least one correct answer, sorted by
  // smart review priority so the most urgent words surface first in a session:
  //   1. SRS-due words (nextReviewAt <= now)
  //   2. Difficult / in-recovery learned words (isDifficult === true)
  //   3. Least-practiced words (lowest correctCount)
  //   4. Most-overdue by date (tiebreak within same group)
  // Tekrar Et is available anytime there is at least one learned word — no gate
  // on nextReviewAt. The SRS schedule still governs what appears *first*, not
  // whether the card is enabled.
  const now = Date.now();
  const learnedReviewWords = vocabulary
    .filter(w => {
      const wp = state.wordProgress[w.id];
      return wp && wp.correctCount > 0;
    })
    .sort((a, b) => {
      const wpA = state.wordProgress[a.id];
      const wpB = state.wordProgress[b.id];
      const aDue = wpA.nextReviewAt <= now;
      const bDue = wpB.nextReviewAt <= now;
      if (aDue !== bDue) return aDue ? -1 : 1;
      if (wpA.isDifficult !== wpB.isDifficult) return wpA.isDifficult ? -1 : 1;
      if (wpA.correctCount !== wpB.correctCount) return wpA.correctCount - wpB.correctCount;
      return wpA.nextReviewAt - wpB.nextReviewAt;
    });
  const lastReviewSet = new Set(state.lastReviewWordIds);
  const freshReviewWords = learnedReviewWords.filter(w => !lastReviewSet.has(w.id));
  const reviewSessionSize = Math.min(freshReviewWords.length, reviewCap);

  const seenCount = vocabulary.filter(w => {
    const p = state.wordProgress[w.id];
    return p !== undefined && (p.correctCount > 0 || p.wrongCount > 0);
  }).length;

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Günaydın 👋';
    if (h < 18) return 'İyi günler 👋';
    return 'İyi akşamlar 👋';
  };

  // ── Session handlers with free-tier caps ─────────────────────────────────

  const handleStartLesson = () => {
    // Free-user daily cap: 5 base + optional rewarded +5 = 10 max per day.
    // Block when dailyProgress has reached or passed the base cap AND the
    // bonus bypass is no longer active.
    // bonusWordsActive is false when: bonus not claimed, OR bonus session
    // already started, OR dailyProgress >= 10 — all three cases should block.
    // TODO: restore gate (remove DEBUG_BYPASS_DAILY_LESSON_GATE) before production
    if (!isPremium && state.dailyBaseSessionStarted && !bonusWordsActive && !DEBUG_BYPASS_DAILY_LESSON_GATE) {
      showPremiumModal(
        'Günlük Limit Doldu',
        'Bugünkü ücretsiz dersini tamamladın. Yarın yeni kelimeler seni bekliyor ya da Premium\'a geçerek sınırsız öğren.',
      );
      return;
    }
    const words = cappedDailyWords;
    if (words.length === 0) return;
    if (!isPremium && bonusWordsActive) {
      // Mark the bonus session as started the moment it is dispatched.
      // This closes the re-entry window: once fired, bonusWordsActive becomes
      // false on the next render and the gate blocks all subsequent starts,
      // even if dailyProgress has not yet reached FREE_SESSION_CAP + 5.
      dispatch({ type: 'MARK_BONUS_SESSION_STARTED' });
    } else if (!isPremium && !state.dailyBaseSessionStarted) {
      // Mark the base session as started. This is the reliable gate sentinel:
      // dailyProgress alone cannot be trusted because it only increments on
      // first-attempt-correct answers, so a session with any wrong answer
      // would leave dailyProgress < FREE_SESSION_CAP and allow re-entry.
      dispatch({ type: 'MARK_BASE_SESSION_STARTED' });
    }
    dispatch({ type: 'SET_SESSION_WORDS', words });
    navigation.navigate('Flashcard');
  };

  const handleDifficultWords = () => {
    if (difficultWords.length === 0) return;
    // Free users: cap difficult-word review at FREE_SESSION_CAP
    const words = isPremium
      ? difficultWords
      : difficultWords.slice(0, FREE_SESSION_CAP);
    dispatch({ type: 'SET_SESSION_WORDS', words });
    navigation.navigate('Quiz');
  };

  const handleReviewWords = () => {
    if (freshReviewWords.length === 0) return;
    const cap = isPremium ? (state.lessonSize ?? 20) : FREE_SESSION_CAP;
    const words = freshReviewWords.slice(0, cap);
    dispatch({ type: 'SET_LAST_REVIEW_WORDS', wordIds: words.map(w => w.id) });
    dispatch({ type: 'SET_SESSION_WORDS', words });
    navigation.navigate('Flashcard');
  };

  // ── Bonus words rewarded ad ───────────────────────────────────────────────
  // Extends the very next free lesson by +5 words (5 → 10).
  //
  // Three layers of eligibility enforcement — all derived from canOfferLessonBonusAd:
  //
  //   Layer 1 (UI)      — button only renders when canOfferLessonBonusAd is true.
  //   Layer 2 (tap)     — guard at the top of this handler; handles stale renders.
  //   Layer 3 (reward)  — re-check at the moment the reward callback fires so that
  //                       even a race (e.g. progress changed while ad was playing)
  //                       cannot produce a valueless claim.
  //
  // Not wrapped in useCallback so the closure always captures the latest state,
  // preventing stale reads of dailyProgress / dailyLessonBonusClaimed.
  const handleBonusWordsAd = () => {
    // Layer 2: tap-time guard — must be eligible at the moment of the tap.
    if (!canOfferLessonBonusAd) {
      // Ineligible (e.g. stale render): show the gate instead of the ad.
      showPremiumModal(
        'Günlük Limit Doldu',
        'Bugünkü ücretsiz dersini tamamladın. Yarın yeni kelimeler seni bekliyor ya da Premium\'a geçerek sınırsız öğren.',
      );
      return;
    }
    if (!isRewardedAdReady()) {
      Alert.alert(
        'Reklam Hazır Değil',
        'Reklam henüz yüklenmedi. Birkaç saniye bekleyip tekrar dene.',
        [{ text: 'Tamam' }],
      );
      return;
    }
    setBonusAdLoading(true);
    showRewardedAd((rewarded) => {
      setBonusAdLoading(false);
      if (rewarded) {
        // Layer 3: reward-time re-verification.
        // Confirm the bonus can still be honored before dispatching.
        // No game interactions are possible while a full-screen ad is shown,
        // but this guard ensures correctness even in unexpected edge cases.
        // Uses session flags only — not dailyProgress — so eligibility is
        // never affected by first-attempt-correct counts.
        if (!state.dailyLessonBonusClaimed && state.dailyBaseSessionStarted) {
          dispatch({ type: 'RECORD_AD_SHOWN' });
          dispatch({ type: 'CLAIM_LESSON_BONUS' });
        } else {
          // Eligibility was lost while the ad played — show the premium gate
          // rather than silently doing nothing after the user watched an ad.
          showPremiumModal(
            'Günlük Limit Doldu',
            'Reklam oynarken günlük limite ulaşıldı. Premium\'a geçerek sınırsız öğren.',
          );
        }
      }
    });
  };

  const progressPct  = totalToday > 0 ? (todayProgress / totalToday) * 100 : 0;
  const goalComplete = progressPct >= 100;

  // Learned word count for Cümle Kur badge
  const learnedCount = vocabulary.filter(w => {
    const wp = state.wordProgress[w.id];
    return wp ? wp.correctCount >= 1 : false;
  }).length;

  // Goal-complete bar animation: fades between purple → green
  const goalAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(goalAnim, {
      toValue: goalComplete ? 1 : 0,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [goalComplete]); // eslint-disable-line react-hooks/exhaustive-deps

  const barColor = goalAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: ['#ffffff', '#ffffff'],
  });

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          {/* ── Header gradient ── */}
          <Animated.View style={slideStyle(headerAnim)}>
          <LinearGradient
            colors={['#5B52F0', '#8B5CF6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerGradient}
          >
            {/* Decorative circles */}
            <View style={styles.decorCircle1} />
            <View style={styles.decorCircle2} />

            <View style={styles.headerTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.greeting}>{greeting()}</Text>
                {state.level ? (
                  <Text style={styles.levelBadgeText}>{levelLabels[state.level]}</Text>
                ) : null}
              </View>
              <View style={styles.logoBadge}>
                <Image
                  source={require('../../assets/header-logo.png')}
                  style={styles.logoImage}
                />
              </View>
            </View>

            {/* Stats Row */}
            <View style={styles.statsRow}>
              {/* Streak — öne çıkarılmış, milestone'a göre renk */}
              <View style={styles.statCard}>
                <Animated.View style={{ transform: [{ scale: streakPulse }] }}>
                  <MaterialCommunityIcons
                    name="fire"
                    size={state.streak >= 7 ? 30 : 24}
                    color={state.streak >= 7 ? '#FF6B35' : 'rgba(255,255,255,0.95)'}
                  />
                </Animated.View>
                <Text style={[
                  styles.statValue,
                  state.streak >= 14 && { color: '#FF6B35', fontSize: 28 },
                  state.streak >= 7  && state.streak < 14 && { color: '#FFD700', fontSize: 26 },
                  state.streak >= 3  && state.streak < 7  && { color: '#FDE68A' },
                ]}>
                  {state.streak}
                </Text>
                <Text style={[
                  styles.statLabel,
                  state.streak >= 3 && { color: 'rgba(255,255,255,0.9)', fontWeight: '700' },
                ]}>
                  {state.streak >= 14 ? '🔥 Seri' : state.streak >= 7 ? '⚡ Seri' : 'Seri'}
                </Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statCard}>
                <MaterialCommunityIcons name="star" size={24} color="rgba(255,255,255,0.95)" />
                <Text style={styles.statValue}>{state.xp}</Text>
                <Text style={styles.statLabel}>Puan</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statCard}>
                <MaterialCommunityIcons name="book-open-variant" size={24} color="rgba(255,255,255,0.95)" />
                <Text style={styles.statValue}>{seenCount}</Text>
                <Text style={styles.statLabel}>Çalışılan</Text>
              </View>
            </View>

            {/* Progress Bar */}
            <View style={styles.progressContainer}>
              <View style={styles.progressHeader}>
                {goalComplete ? (
                  <View style={styles.goalCompleteRow}>
                    <MaterialCommunityIcons name="check-circle" size={16} color="#ffffff" />
                    <Text style={[styles.progressLabel, { color: '#ffffff' }]}>Günlük hedef tamamlandı!</Text>
                  </View>
                ) : (
                  <Text style={styles.progressLabel}>Günlük hedef</Text>
                )}
                <Text style={[styles.progressValue, goalComplete && { color: '#ffffff' }]}>
                  {todayProgress}/{totalToday}
                </Text>
              </View>
              <View style={styles.progressBarBg}>
                <Animated.View style={[
                  styles.progressBarFill,
                  { width: `${progressPct}%`, backgroundColor: barColor },
                ]} />
              </View>
            </View>
          </LinearGradient>
          </Animated.View>

          {/* ── Main CTA ── */}
          <Animated.View style={slideStyle(ctaAnim)}>
          <View style={[styles.ctaCard, { backgroundColor: theme.surface, borderColor: theme.cardBorder, ...shadows.lg }]}>
            <View style={styles.ctaHeader}>
              <Text style={[styles.ctaTitle, { color: theme.text }]}>
                {cappedDailyWords.length > 0 ? 'Bugünün dersi hazır!' : 'Yeni kelime kalmadı'}
              </Text>
              {cappedDailyWords.length > 0 ? (
                <View style={[styles.wordCountBadge, { backgroundColor: theme.primaryLight }]}>
                  <Text style={[styles.wordCountText, { color: theme.primary }]}>{cappedDailyWords.length} kelime</Text>
                </View>
              ) : null}
            </View>
            {cappedDailyWords.length === 0 && (
              <Text style={[styles.ctaSubtitle, { color: theme.textSecondary, marginBottom: spacing.sm }]}>
                Bu seviyedeki tüm kelimeleri gördün. Tekrar Et ile pekiştir!
              </Text>
            )}
            {/* Lesson size picker — hidden when no new words remain */}
            <View style={[styles.sizePicker, cappedDailyWords.length === 0 && { display: 'none' }]}>
              <Text style={[styles.sizeLabel, { color: theme.textSecondary, marginBottom: spacing.xs }]}>
                Ders büyüklüğü:
              </Text>

              <View style={styles.sizeOptions}>
                {ALL_LESSON_SIZES.map(size => {
                  const isLocked   = !isPremium && size > FREE_SESSION_CAP;
                  const isSelected = lessonSize === size && !isLocked;
                  return (
                    <TouchableOpacity
                      key={size}
                      onPress={() => {
                        if (isLocked) {
                          showPremiumModal(
                            'Daha Uzun Dersler',
                            '8, 10, 15 ve 20 kelimelik dersler Premium üyeler için açık. Daha uzun oturumlarla çok daha hızlı ilerle.',
                          );
                          return;
                        }
                        dispatch({ type: 'SET_LESSON_SIZE', size });
                      }}
                      style={[
                        styles.sizeOption,
                        {
                          backgroundColor: isSelected ? theme.primary : theme.surfaceSecondary,
                          borderColor:     isSelected ? theme.primary : theme.border,
                          opacity:         isLocked ? 0.45 : 1,
                        },
                      ]}
                    >
                      <Text style={[styles.sizeOptionText, { color: isSelected ? '#fff' : theme.textSecondary }]}>
                        {size}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {!isPremium && (
                <TouchableOpacity
                  onPress={() => showPremiumModal(
                    'Daha Uzun Dersler',
                    '8, 10, 15 ve 20 kelimelik dersler Premium üyeler için açık. Daha uzun oturumlarla çok daha hızlı ilerle.',
                  )}
                  style={styles.premiumSizeLink}
                >
                  <Ionicons name="lock-closed" size={11} color="#7C3AED" />
                  <Text style={styles.premiumSizeLinkText}>8, 10, 15 ve 20 — Premium ile aç</Text>
                </TouchableOpacity>
              )}
            </View>

            <Button
              title="Derse Başla"
              onPress={handleStartLesson}
              theme={theme}
              size="lg"
              style={{ marginTop: spacing.lg }}
              icon={<Ionicons name="play" size={20} color="#fff" />}
              disabled={cappedDailyWords.length === 0}
            />

            {/* ── Bonus +5 words rewarded ad (free users, after base session) ── */}
            {/* Offer: shown only when base 5 are done and bonus not yet claimed  */}
            {canOfferLessonBonusAd && !bonusAdLoading && (
              <TouchableOpacity onPress={handleBonusWordsAd} style={styles.bonusAdLink}>
                <Ionicons name="play-circle-outline" size={15} color="#7C3AED" />
                <Text style={[styles.bonusAdLinkText, { color: '#7C3AED' }]}>
                  +5 Bonus Kelime — Reklam İzle
                </Text>
              </TouchableOpacity>
            )}
            {/* Loading: shown while the ad is fetching/playing */}
            {!isPremium && bonusAdLoading && (
              <View style={styles.bonusAdLoading}>
                <ActivityIndicator size="small" color="#7C3AED" />
                <Text style={[styles.bonusAdLinkText, { color: '#7C3AED' }]}>Reklam yükleniyor…</Text>
              </View>
            )}
            {/* Active badge: bonus claimed, extra words not yet played */}
            {bonusWordsActive && (
              <View style={[styles.bonusActiveBadge, { backgroundColor: '#EDE9FE' }]}>
                <Ionicons name="checkmark-circle" size={14} color="#7C3AED" />
                <Text style={[styles.bonusAdLinkText, { color: '#7C3AED' }]}>+5 bonus kelime aktif!</Text>
              </View>
            )}
          </View>
          </Animated.View>

          {/* ── Öğrendiklerim ── */}
          {/* ── Difficult Words Quick Quiz ── */}
          <Animated.View style={slideStyle(card3Anim)}>
          <TouchableOpacity
            onPress={handleDifficultWords}
            activeOpacity={difficultWords.length > 0 ? 0.85 : 1}
            style={[
              styles.actionCard,
              {
                backgroundColor: theme.surface,
                borderColor: difficultWords.length > 0 ? '#FCA5A5' : theme.border,
                opacity: difficultWords.length === 0 ? 0.55 : 1,
                ...shadows.sm,
              },
            ]}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#FEE2E2', borderWidth: 1.5, borderColor: '#DC26264D' }]}>
              <MaterialCommunityIcons name="dumbbell" size={24} color="#DC2626" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionTitle, { color: theme.text }]}>Zorlandıklarım</Text>
              <Text style={[styles.actionSub, { color: theme.textSecondary }]}>
                {difficultWords.length > 0
                  ? `${difficultWords.length} kelime · Hemen teste gir`
                  : 'Henüz zor kelimen yok'}
              </Text>
              {difficultWords.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScrollInline}>
                  {difficultWords.slice(0, 4).map(word => (
                    <View key={word.id} style={[styles.miniChip, { backgroundColor: '#FEE2E2' }]}>
                      <Text style={{ color: '#DC2626', fontSize: 11, fontWeight: '600', fontFamily: 'Inter_600SemiBold' }}>
                        {word.word}
                      </Text>
                    </View>
                  ))}
                  {difficultWords.length > 4 && (
                    <View style={[styles.miniChip, { backgroundColor: theme.surfaceSecondary }]}>
                      <Text style={{ color: theme.textSecondary, fontSize: 11, fontWeight: '600' }}>
                        +{difficultWords.length - 4}
                      </Text>
                    </View>
                  )}
                </ScrollView>
              )}
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.textTertiary} />
          </TouchableOpacity>
          </Animated.View>

          {/* ── Sentence Builder ── */}
          <Animated.View style={slideStyle(card2Anim)}>
          <TouchableOpacity
            onPress={() => navigation.navigate('SentenceBuilder')}
            activeOpacity={0.85}
            style={[styles.actionCard, { backgroundColor: theme.surface, borderColor: '#C4B5FD', ...shadows.sm }]}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#EDE9FE', borderWidth: 1.5, borderColor: '#7C3AED4D' }]}>
              <MaterialCommunityIcons name="pencil" size={24} color="#7C3AED" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.actionTitleRow}>
                <Text style={[styles.actionTitle, { color: theme.text }]}>Cümle Kur</Text>
                {learnedCount > 0 && (
                  <View style={styles.learnedBadge}>
                    <Text style={styles.learnedBadgeText}>{learnedCount} kelime hazır</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.actionSub, { color: theme.textSecondary }]}>
                {learnedCount > 0
                  ? 'AI ile cümle kur, puan kazan ve İngilizceni geliştir'
                  : 'Önce birkaç kelime öğren, sonra cümle kur'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.textTertiary} />
          </TouchableOpacity>
          </Animated.View>

          {/* ── Tekrar Et (voluntary review) ── */}
          <Animated.View style={slideStyle(card4Anim)}>
          <TouchableOpacity
            onPress={handleReviewWords}
            activeOpacity={freshReviewWords.length > 0 ? 0.85 : 1}
            style={[
              styles.actionCard,
              {
                backgroundColor: theme.surface,
                borderColor: freshReviewWords.length > 0 ? '#93C5FD' : theme.border,
                opacity: freshReviewWords.length === 0 ? 0.55 : 1,
                ...shadows.sm,
              },
            ]}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#DBEAFE', borderWidth: 1.5, borderColor: '#2563EB4D' }]}>
              <MaterialCommunityIcons name="refresh" size={24} color="#2563EB" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.actionTitleRow}>
                <Text style={[styles.actionTitle, { color: theme.text }]}>Tekrar Et</Text>
                {freshReviewWords.length > 0 && (
                  <View style={styles.reviewCapBadge}>
                    <Text style={styles.reviewCapBadgeText}>{reviewSessionSize} kelime</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.actionSub, { color: theme.textSecondary }]}>
                {freshReviewWords.length > 0
                  ? 'Öğrendiğin kelimeleri pekiştir'
                  : learnedReviewWords.length > 0
                    ? 'Bu kelimeleri az önce tekrar ettin'
                    : 'Önce birkaç kelime öğren'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.textTertiary} />
          </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>

      {/* ── Premium gate modal ── */}
      <PremiumGateModal
        visible={premiumModal.visible}
        featureTitle={premiumModal.featureTitle}
        featureDescription={premiumModal.featureDescription}
        theme={theme}
        onClose={() => setPremiumModal(m => ({ ...m, visible: false }))}
        onUpgrade={() => {
          setPremiumModal(m => ({ ...m, visible: false }));
          navigation.navigate('Premium');
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingBottom: spacing.xxl, flexGrow: 1 },

  /* Header */
  headerGradient: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    overflow: 'hidden',
  },
  decorCircle1: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.07)',
    top: -60,
    left: -60,
  },
  decorCircle2: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.05)',
    bottom: -30,
    left: -30,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  greeting: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    fontFamily: 'Inter_800ExtraBold',
  },
  levelBadgeText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.78)',
    marginTop: 3,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
  },
  logoBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    overflow: 'hidden',
  },
  logoImage: {
    width: 44,
    height: 44,
  },

  /* Stats row */
  statsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    fontFamily: 'Inter_800ExtraBold',
  },
  statLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginVertical: 4,
  },

  /* Progress */
  progressContainer: {},
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs + 2,
  },
  progressLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.82)',
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
  },
  progressValue: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
  progressBarBg: {
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: radius.full,
  },

  /* CTA Card */
  ctaCard: {
    margin: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1.5,
  },
  ctaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  ctaTitle: {
    ...typography.h3,
    flex: 1,
    fontFamily: 'Inter_800ExtraBold',
  },
  wordCountBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    marginLeft: spacing.sm,
  },
  wordCountText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
  ctaSubtitle: {
    ...typography.caption,
    lineHeight: 18,
  },

  /* Lesson size picker */
  sizePicker: {
    marginTop: spacing.md,
  },
  sizeLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  sizeLabel: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
  },
  freeCapBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: 'transparent',
  },
  freeCapText: {
    fontSize: 10,
    fontWeight: '600',
  },
  sizeOptions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  sizeOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    gap: 2,
  },
  sizeOptionText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },

  /* Bonus words ad row */
  bonusAdLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  bonusAdLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  bonusActiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    marginTop: spacing.xs,
    alignSelf: 'center',
  },
  bonusAdLinkText: {
    fontSize: 13,
    fontWeight: '600',
  },

  /* Learned card */
  learnedCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: 1.5,
  },
  learnedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  learnedTitle: {
    ...typography.bodyBold,
    fontFamily: 'Inter_700Bold',
  },
  learnedSubtitle: {
    ...typography.caption,
    marginTop: 2,
  },
  reinforceBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  chipScroll: {
    marginTop: spacing.xs,
  },
  chipScrollInline: {
    marginTop: spacing.xs,
    flexGrow: 0,
  },
  wordChip: {
    borderRadius: radius.md,
    padding: spacing.sm,
    marginRight: spacing.sm,
    minWidth: 80,
    alignItems: 'center',
  },
  wordChipText: {
    fontWeight: '700',
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
  },
  wordChipMeaning: {
    fontSize: 10,
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
  },

  /* Goal complete row */
  goalCompleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },

  premiumSizeLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
  },
  premiumSizeLinkText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7C3AED',
    fontFamily: 'Inter_600SemiBold',
  },

  /* Sentence builder card badge */
  actionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  learnedBadge: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  learnedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#7C3AED',
    fontFamily: 'Inter_700Bold',
  },

  /* Tekrar Et session-size badge */
  reviewCapBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  reviewCapBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2563EB',
    fontFamily: 'Inter_700Bold',
  },

  /* Action cards */
  actionCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  actionIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  actionTitle: {
    ...typography.bodyBold,
    fontFamily: 'Inter_700Bold',
  },
  actionSub: {
    ...typography.caption,
    marginTop: 2,
  },
  miniChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    marginRight: spacing.xs,
  },
});
