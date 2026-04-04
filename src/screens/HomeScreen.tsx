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

  const { state, dispatch, getDailyWords } = useApp();

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
  // difficult = wrong at least once AND never yet answered correctly.
  //             Matches isDisplayDifficult() in DifficultWordsScreen: the first
  //             correct answer immediately exits the word from the difficult pool.
  // seenCount = words answered at least once (not just seeded at session start)
  const difficultWords = vocabulary.filter(w => {
    const wp = state.wordProgress[w.id];
    return wp ? wp.wrongCount > 0 && wp.correctCount === 0 : false;
  });
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
    if (!isPremium && state.dailyBaseSessionStarted && !bonusWordsActive) {
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

  const progressPct = totalToday > 0 ? (todayProgress / totalToday) * 100 : 0;

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
              <View style={styles.statCard}>
                <Animated.View style={{ transform: [{ scale: streakPulse }] }}>
                  <MaterialCommunityIcons name="fire" size={24} color="rgba(255,255,255,0.95)" />
                </Animated.View>
                <Text style={[
                  styles.statValue,
                  state.streak >= 10 && { color: '#FFD700' },
                ]}>{state.streak}</Text>
                <Text style={styles.statLabel}>Seri</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statCard}>
                <MaterialCommunityIcons name="star" size={24} color="rgba(255,255,255,0.95)" />
                <Text style={styles.statValue}>{state.xp}</Text>
                <Text style={styles.statLabel}>XP</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statCard}>
                <MaterialCommunityIcons name="book-open-variant" size={24} color="rgba(255,255,255,0.95)" />
                <Text style={styles.statValue}>{seenCount}</Text>
                <Text style={styles.statLabel}>Kelime</Text>
              </View>
            </View>

            {/* Progress Bar */}
            <View style={styles.progressContainer}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressLabel}>Günlük hedef</Text>
                <Text style={styles.progressValue}>{todayProgress}/{totalToday}</Text>
              </View>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${progressPct}%` }]} />
              </View>
            </View>
          </LinearGradient>
          </Animated.View>

          {/* ── Main CTA ── */}
          <Animated.View style={slideStyle(ctaAnim)}>
          <View style={[styles.ctaCard, { backgroundColor: theme.surface, borderColor: theme.cardBorder, ...shadows.lg }]}>
            <View style={styles.ctaHeader}>
              <Text style={[styles.ctaTitle, { color: theme.text }]}>Bugünün dersi hazır!</Text>
              <View style={[styles.wordCountBadge, { backgroundColor: theme.primaryLight }]}>
                <Text style={[styles.wordCountText, { color: theme.primary }]}>{cappedDailyWords.length} kelime</Text>
              </View>
            </View>
            <Text style={[styles.ctaSubtitle, { color: theme.textSecondary }]}>
              Yeni kelimeleri öğrenmek için swipe yap veya butona bas
            </Text>

            {/* Lesson size picker — 15 / 20 are premium-gated for free users */}
            <View style={styles.sizePicker}>
              <View style={styles.sizeLabelRow}>
                <Text style={[styles.sizeLabel, { color: theme.textSecondary }]}>Ders büyüklüğü:</Text>
                {!isPremium && (
                  <View style={styles.freeCapBadge}>
                    <Text style={[styles.freeCapText, { color: theme.textTertiary }]}>Ücretsiz: maks {FREE_SESSION_CAP}</Text>
                  </View>
                )}
              </View>
              <View style={styles.sizeOptions}>
                {ALL_LESSON_SIZES.map(size => {
                  const isLocked  = !isPremium && size > FREE_SESSION_CAP;
                  const isSelected = lessonSize === size && !isLocked;
                  return (
                    <TouchableOpacity
                      key={size}
                      onPress={() => {
                        if (isLocked) {
                          showPremiumModal(
                            `${size} Kelimelik Ders`,
                            `8, 10, 15 ve 20 kelimelik dersler Premium üyeler için açık. Premium'a geçerek daha uzun oturumlarla daha hızlı ilerle.`,
                          );
                          return;
                        }
                        dispatch({ type: 'SET_LESSON_SIZE', size });
                      }}
                      style={[
                        styles.sizeOption,
                        {
                          backgroundColor: isSelected
                            ? theme.primary
                            : isLocked
                              ? theme.surfaceSecondary
                              : theme.surfaceSecondary,
                          borderColor: isSelected
                            ? theme.primary
                            : isLocked ? theme.border : theme.border,
                          opacity: isLocked ? 0.65 : 1,
                        },
                      ]}
                    >
                      <Text style={[styles.sizeOptionText, {
                        color: isSelected ? '#fff' : theme.textSecondary,
                      }]}>
                        {size}
                      </Text>
                      {isLocked && (
                        <Ionicons name="lock-closed" size={9} color={theme.textTertiary} style={{ marginTop: 1 }} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <Button
              title="Derse Başla"
              onPress={handleStartLesson}
              theme={theme}
              size="lg"
              style={{ marginTop: spacing.lg }}
              icon={<Ionicons name="play" size={20} color="#fff" />}
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
              <Text style={[styles.actionTitle, { color: theme.text }]}>Cümle Kur</Text>
              <Text style={[styles.actionSub, { color: theme.textSecondary }]}>
                Öğrendiğin kelimelerle cümle oluştur
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.textTertiary} />
          </TouchableOpacity>
          </Animated.View>

          {/* ── Word Management ── */}
          <Animated.View style={slideStyle(card4Anim)}>
          <TouchableOpacity
            onPress={() => navigation.navigate('DifficultWords')}
            activeOpacity={0.85}
            style={[styles.actionCard, { backgroundColor: theme.surface, borderColor: theme.border, ...shadows.sm }]}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#E8E6FF', borderWidth: 1.5, borderColor: '#6C63FF4D' }]}>
              <MaterialCommunityIcons name="format-list-bulleted" size={24} color="#6C63FF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionTitle, { color: theme.text }]}>Kelime Havuzu</Text>
              <Text style={[styles.actionSub, { color: theme.textSecondary }]}>
                {seenCount > 0
                  ? `${seenCount} kelime görüldü · ${difficultWords.length > 0 ? `${difficultWords.length} zorlu` : 'Zor yok'}`
                  : 'Henüz kelime yok · Derse başla'}
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
    right: -60,
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
