import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from '@react-navigation/native';
import { useApp } from '../context/AppContext';
import { Button } from '../components/Button';
import { vocabulary } from '../data/vocabulary';
import { getTheme, spacing, radius, typography, shadows } from '../utils/theme';

const { width } = Dimensions.get('window');

const levelLabels = {
  easy: 'Başlangıç (A1-A2)',
  medium: 'Orta (B1-B2)',
  hard: 'İleri (C1-C2)',
};

interface Props {
  navigation: any;
}

export const HomeScreen: React.FC<Props> = ({ navigation }) => {
  // useIsFocused changes false→true when the screen regains focus after being
  // in the background (frozen by react-freeze). The boolean change triggers a
  // re-render, ensuring all derived values below re-read the latest context state.
  useIsFocused();

  const { state, dispatch, getDailyWords } = useApp();
  const theme = getTheme(state.darkMode);

  const dailyWords = getDailyWords();
  // Derive directly from wordProgress (source of truth) so the section
  // always reflects the latest reducer state, even when the screen is
  // re-focused after being frozen by react-freeze.
  const difficultWords = vocabulary.filter(w => state.wordProgress[w.id]?.isDifficult === true);
  const learnedWords   = vocabulary.filter(w => state.wordProgress[w.id]?.isLearned   === true);
  const lessonSize = state.lessonSize ?? 20;
  const todayProgress = Math.min(learnedWords.length % lessonSize, lessonSize);
  const totalToday = lessonSize;

  const LESSON_SIZES = [5, 8, 10, 15, 20];

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Günaydın';
    if (h < 18) return 'İyi günler';
    return 'İyi akşamlar';
  };

  const handleStartLesson = () => {
    const words = getDailyWords();
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

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          {/* Header */}
          <LinearGradient
            colors={['#6C63FF', '#9B5CF6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerGradient}
          >
            <View style={styles.headerTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.greeting}>{greeting()} 👋</Text>
                <Text style={styles.levelBadgeText}>
                  {state.level ? levelLabels[state.level] : ''}
                </Text>
              </View>
              {/* WordSwipe logo badge */}
              <View style={styles.logoBadge}>
                <Text style={styles.logoText}>WS</Text>
              </View>
            </View>

            {/* Stats Row */}
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statIcon}>🔥</Text>
                <Text style={styles.statValue}>{state.streak}</Text>
                <Text style={styles.statLabel}>Gün serisi</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statCard}>
                <Text style={styles.statIcon}>⭐</Text>
                <Text style={styles.statValue}>{state.xp}</Text>
                <Text style={styles.statLabel}>XP puanı</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statCard}>
                <Text style={styles.statIcon}>📚</Text>
                <Text style={styles.statValue}>{learnedWords.length}</Text>
                <Text style={styles.statLabel}>Kelime</Text>
              </View>
            </View>

            {/* Progress Bar */}
            <View style={styles.progressContainer}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressLabel}>Günlük hedef</Text>
                <Text style={styles.progressValue}>
                  {todayProgress} / {totalToday}
                </Text>
              </View>
              <View style={styles.progressBarBg}>
                <View
                  style={[
                    styles.progressBarFill,
                    { width: `${(todayProgress / totalToday) * 100}%` },
                  ]}
                />
              </View>
            </View>
          </LinearGradient>

          {/* Main CTA */}
          <View style={[styles.ctaCard, { backgroundColor: theme.surface, ...shadows.lg }]}>
            <View style={styles.ctaHeader}>
              <Text style={[styles.ctaTitle, { color: theme.text }]}>
                Bugünün dersi hazır!
              </Text>
              <View style={[styles.wordCountBadge, { backgroundColor: theme.primaryLight }]}>
                <Text style={[styles.wordCountText, { color: theme.primary }]}>
                  {dailyWords.length} kelime
                </Text>
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
              style={{ marginTop: spacing.md }}
              icon="▶"
            />
          </View>

          {/* Öğrendiklerim — All learned words, tappable for reinforcement */}
          {learnedWords.length > 0 && (
            <TouchableOpacity
              onPress={handleReinforceLearnedWords}
              activeOpacity={0.9}
              style={[styles.learnedCard, { backgroundColor: theme.surface, ...shadows.md }]}
            >
              <View style={styles.learnedHeader}>
                <View>
                  <Text style={[styles.learnedTitle, { color: theme.text }]}>
                    📖 Öğrendiklerim
                  </Text>
                  <Text style={[styles.learnedSubtitle, { color: theme.textSecondary }]}>
                    {learnedWords.length} kelime · Pekiştirmek için dokun
                  </Text>
                </View>
                <View style={[styles.reinforceBadge, { backgroundColor: '#43D99D20' }]}>
                  <Text style={{ color: '#43D99D', fontSize: 11, fontWeight: '700' }}>
                    TEKRAR ET
                  </Text>
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {learnedWords.slice(-8).reverse().map(word => (
                  <View
                    key={word.id}
                    style={[styles.wordChip, { backgroundColor: theme.primaryLight }]}
                  >
                    <Text style={[styles.wordChipText, { color: theme.primary }]}>
                      {word.word}
                    </Text>
                    <Text style={[styles.wordChipMeaning, { color: theme.textSecondary }]}>
                      {word.translation}
                    </Text>
                  </View>
                ))}
                {learnedWords.length > 8 && (
                  <View style={[styles.wordChip, { backgroundColor: theme.surfaceSecondary }]}>
                    <Text style={[styles.wordChipText, { color: theme.textSecondary }]}>
                      +{learnedWords.length - 8}
                    </Text>
                  </View>
                )}
              </ScrollView>
            </TouchableOpacity>
          )}

          {/* Sentence Builder */}
          {learnedWords.length > 0 && (
            <TouchableOpacity
              onPress={() => navigation.navigate('SentenceBuilder')}
              activeOpacity={0.85}
              style={[
                styles.actionCard,
                { backgroundColor: theme.surface, borderColor: '#C4B5FD', ...shadows.sm },
              ]}
            >
              <View style={[styles.actionIcon, { backgroundColor: '#EDE9FE' }]}>
                <Text style={{ fontSize: 22 }}>✍️</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.actionTitle, { color: theme.text }]}>Cümle Kur</Text>
                <Text style={[styles.actionSub, { color: theme.textSecondary }]}>
                  Öğrendiğin kelimelerle cümle yaz ve XP kazan
                </Text>
              </View>
              <Text style={{ color: theme.textTertiary, fontSize: 20 }}>›</Text>
            </TouchableOpacity>
          )}

          {/* Difficult Words */}
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
            <View style={[styles.actionIcon, { backgroundColor: '#FEE2E2' }]}>
              <Text style={{ fontSize: 22 }}>💪</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionTitle, { color: theme.text }]}>
                Zorlandıklarım
              </Text>
              <Text style={[styles.actionSub, { color: theme.textSecondary }]}>
                {difficultWords.length > 0
                  ? `${difficultWords.length} kelime tekrar bekliyor`
                  : 'Henüz zor kelimen yok'}
              </Text>
              {difficultWords.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScrollInline}>
                  {difficultWords.slice(0, 4).map(word => (
                    <View
                      key={word.id}
                      style={[styles.miniChip, { backgroundColor: '#FEE2E2' }]}
                    >
                      <Text style={{ color: '#DC2626', fontSize: 11, fontWeight: '600' }}>
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
            <Text style={{ color: theme.textTertiary, fontSize: 20 }}>›</Text>
          </TouchableOpacity>

          {/* DifficultWords Screen link */}
          <TouchableOpacity
            onPress={() => navigation.navigate('DifficultWords')}
            activeOpacity={0.85}
            style={[
              styles.actionCard,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                ...shadows.sm,
              },
            ]}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#E8E6FF' }]}>
              <Text style={{ fontSize: 22 }}>📋</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionTitle, { color: theme.text }]}>
                Kelime Listesi
              </Text>
              <Text style={[styles.actionSub, { color: theme.textSecondary }]}>
                Zor kelimeleri gözden geçir ve yönet
              </Text>
            </View>
            <Text style={{ color: theme.textTertiary, fontSize: 20 }}>›</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingBottom: spacing.xxl },
  headerGradient: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
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
  },
  levelBadgeText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
    fontWeight: '600',
  },
  logoBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statIcon: { fontSize: 20 },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
  },
  statLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '600',
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginVertical: 4,
  },
  progressContainer: {},
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  progressLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
  },
  progressValue: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '700',
  },
  progressBarBg: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: radius.full,
  },
  ctaCard: {
    margin: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: radius.xl,
    padding: spacing.lg,
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
  },
  ctaSubtitle: {
    ...typography.caption,
    lineHeight: 18,
  },
  learnedCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: radius.xl,
    padding: spacing.md,
  },
  learnedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  learnedTitle: {
    ...typography.bodyBold,
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
  },
  wordChipMeaning: {
    fontSize: 10,
    marginTop: 2,
  },
  actionCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  actionTitle: {
    ...typography.bodyBold,
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
  sizePicker: {
    marginTop: spacing.md,
  },
  sizeLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  sizeOptions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  sizeOption: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  sizeOptionText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
