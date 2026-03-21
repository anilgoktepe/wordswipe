import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Dimensions,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useApp } from '../context/AppContext';
import { Button } from '../components/Button';
import { getLocalWords } from '../services/vocabularyService';
import { getTheme, spacing, radius, typography, shadows } from '../utils/theme';

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
  const card1Anim   = useRef(new Animated.Value(0)).current;
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
      makeAnim(card1Anim, 0),
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

  const dailyWords = getDailyWords();

  // User-facing classification: raw counts, not internal SRS flags.
  // isDifficult / isLearned continue to drive SRS scheduling internally,
  // but the UI shows what actually matches the user's expectation:
  //   difficult = wrong more than (or equal to) correct, with ≥1 wrong
  //   learned   = answered correctly at least twice
  const difficultWords = vocabulary.filter(w => {
    const wp = state.wordProgress[w.id];
    return wp ? wp.wrongCount > 0 && wp.wrongCount >= wp.correctCount : false;
  });
  const learnedWords = vocabulary.filter(w => {
    const wp = state.wordProgress[w.id];
    return wp ? wp.correctCount >= 2 : false;
  });
  // Count only words the user has actually answered at least once.
  // Words seeded into wordProgress at session start (correctCount === 0 AND
  // wrongCount === 0) are excluded — the counter only moves when the user
  // interacts with a card.
  const seenCount = vocabulary.filter(w => {
    const p = state.wordProgress[w.id];
    return p !== undefined && (p.correctCount > 0 || p.wrongCount > 0);
  }).length;
  const lessonSize = state.lessonSize ?? 20;
  const todayProgress = Math.min(state.dailyProgress, lessonSize);
  const totalToday = lessonSize;

  const LESSON_SIZES = [5, 8, 10, 15, 20];

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Günaydın 👋';
    if (h < 18) return 'İyi günler 👋';
    return 'İyi akşamlar 👋';
  };

  const handleStartLesson = () => {
    const words = getDailyWords();
    if (words.length === 0) return;
    dispatch({ type: 'SET_SESSION_WORDS', words });
    navigation.navigate('Flashcard');
  };

  const handleDifficultWords = () => {
    if (difficultWords.length === 0) return;
    dispatch({ type: 'SET_SESSION_WORDS', words: difficultWords });
    navigation.navigate('Quiz');
  };

  const handleReinforceLearnedWords = () => {
    if (learnedWords.length === 0) return;
    const shuffled = [...learnedWords].sort(() => Math.random() - 0.5).slice(0, 20);
    dispatch({ type: 'SET_SESSION_WORDS', words: shuffled });
    navigation.navigate('Quiz');
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
                <Text style={styles.logoText}>WS</Text>
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
                <Text style={[styles.wordCountText, { color: theme.primary }]}>{dailyWords.length} kelime</Text>
              </View>
            </View>
            <Text style={[styles.ctaSubtitle, { color: theme.textSecondary }]}>
              Yeni kelimeleri öğrenmek için swipe yap veya butona bas
            </Text>

            {/* Lesson size picker */}
            <View style={styles.sizePicker}>
              <Text style={[styles.sizeLabel, { color: theme.textSecondary }]}>Ders büyüklüğü:</Text>
              <View style={styles.sizeOptions}>
                {LESSON_SIZES.map(size => (
                  <TouchableOpacity
                    key={size}
                    onPress={() => dispatch({ type: 'SET_LESSON_SIZE', size })}
                    style={[
                      styles.sizeOption,
                      {
                        backgroundColor: lessonSize === size ? theme.primary : theme.surfaceSecondary,
                        borderColor: lessonSize === size ? theme.primary : theme.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.sizeOptionText,
                        { color: lessonSize === size ? '#fff' : theme.textSecondary },
                      ]}
                    >
                      {size}
                    </Text>
                  </TouchableOpacity>
                ))}
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
          </View>
          </Animated.View>

          {/* ── Öğrendiklerim ── */}
          {learnedWords.length > 0 && (
            <Animated.View style={slideStyle(card1Anim)}>
            <TouchableOpacity
              onPress={handleReinforceLearnedWords}
              activeOpacity={0.9}
              style={[styles.learnedCard, { backgroundColor: theme.surface, borderColor: theme.cardBorder, ...shadows.sm }]}
            >
              <View style={styles.learnedHeader}>
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <MaterialCommunityIcons name="book-open" size={18} color={theme.text} />
                    <Text style={[styles.learnedTitle, { color: theme.text }]}>Öğrendiklerim</Text>
                  </View>
                  <Text style={[styles.learnedSubtitle, { color: theme.textSecondary }]}>
                    {learnedWords.length} kelime · Pekiştirmek için dokun
                  </Text>
                </View>
                <View style={[styles.reinforceBadge, { backgroundColor: '#43D99D22' }]}>
                  <Text style={{ color: '#43D99D', fontSize: 11, fontWeight: '700', fontFamily: 'Inter_700Bold' }}>
                    TEKRAR ET
                  </Text>
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {learnedWords.slice(-8).reverse().map(word => (
                  <View key={word.id} style={[styles.wordChip, { backgroundColor: theme.primaryLight }]}>
                    <Text style={[styles.wordChipText, { color: theme.primary }]}>{word.word}</Text>
                    <Text style={[styles.wordChipMeaning, { color: theme.textSecondary }]}>{word.translation}</Text>
                  </View>
                ))}
                {learnedWords.length > 8 && (
                  <View style={[styles.wordChip, { backgroundColor: theme.surfaceSecondary }]}>
                    <Text style={[styles.wordChipText, { color: theme.textSecondary }]}>+{learnedWords.length - 8}</Text>
                  </View>
                )}
              </ScrollView>
            </TouchableOpacity>
            </Animated.View>
          )}

          {/* ── Sentence Builder ── */}
          {learnedWords.length > 0 && (
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
                  Öğrendiğin kelimelerle cümle yaz ve XP kazan
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.textTertiary} />
            </TouchableOpacity>
            </Animated.View>
          )}

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
              <Text style={[styles.actionTitle, { color: theme.text }]}>Kelime Yönetimi</Text>
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
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
    fontFamily: 'Inter_800ExtraBold',
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
  sizeLabel: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    marginBottom: spacing.xs,
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
  },
  sizeOptionText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
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
