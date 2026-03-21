import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useApp } from '../context/AppContext';
import { getLocalWords } from '../services/vocabularyService';
import { getTheme, spacing, radius, typography, shadows } from '../utils/theme';

const vocabulary = getLocalWords();

interface Props {
  navigation?: any;
}

/** Animated horizontal progress bar — animates width from 0 on first layout. */
const AnimatedProgressBar: React.FC<{
  progress: number;   // 0–1
  color: string | string[];  // single color or gradient colors array
  trackColor: string;
  height: number;
  delay?: number;
}> = ({ progress, color, trackColor, height, delay = 0 }) => {
  const [barWidth, setBarWidth] = useState(0);
  const anim = useRef(new Animated.Value(0)).current;
  const started = useRef(false);

  useEffect(() => {
    if (barWidth === 0 || started.current) return;
    started.current = true;
    Animated.timing(anim, {
      toValue: barWidth * Math.min(progress, 1),
      duration: 900,
      delay,
      useNativeDriver: false,
    }).start();
  }, [barWidth, progress]);

  const isGradient = Array.isArray(color);

  return (
    <View
      style={{ height, backgroundColor: trackColor, borderRadius: height / 2, overflow: 'hidden' }}
      onLayout={e => setBarWidth(e.nativeEvent.layout.width)}
    >
      <Animated.View style={{ width: anim, height: '100%', borderRadius: height / 2, overflow: 'hidden' }}>
        {isGradient ? (
          <LinearGradient
            colors={color as string[]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ flex: 1 }}
          />
        ) : (
          <View style={{ flex: 1, backgroundColor: color as string }} />
        )}
      </Animated.View>
    </View>
  );
};

const StatCard: React.FC<{
  icon: React.ReactNode;
  value: string | number;
  label: string;
  color: string;
  bgColor: string;
  theme: ReturnType<typeof getTheme>;
}> = ({ icon, value, label, color, bgColor, theme }) => (
  <View
    style={[
      styles.statCard,
      { backgroundColor: theme.surface, ...shadows.md },
    ]}
  >
    <View style={[styles.statIconBg, { backgroundColor: bgColor }]}>
      {icon}
    </View>
    <Text style={[styles.statValue, { color }]}>{value}</Text>
    <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{label}</Text>
  </View>
);

export const StatsScreen: React.FC<Props> = () => {
  // useIsFocused triggers a re-render when this tab regains focus after being
  // frozen by react-freeze, ensuring counts reflect the latest quiz results.
  useIsFocused();

  const { state } = useApp();
  const theme = getTheme(state.darkMode);

  // Derive directly from wordProgress (source of truth) so stats are never stale.
  // Use raw counts for user-facing display so words never mysteriously disappear
  // as the internal SRS flags are cleared during mastery progression.
  const learnedWords = vocabulary.filter(w => {
    const wp = state.wordProgress[w.id];
    return wp ? wp.correctCount >= 2 : false;
  });
  const difficultWords = vocabulary.filter(w => {
    const wp = state.wordProgress[w.id];
    return wp ? wp.wrongCount > 0 && wp.wrongCount >= wp.correctCount : false;
  });

  const easyLearned = learnedWords.filter(w => w.level === 'easy').length;
  const mediumLearned = learnedWords.filter(w => w.level === 'medium').length;
  const hardLearned = learnedWords.filter(w => w.level === 'hard').length;

  const totalByLevel = {
    easy: vocabulary.filter(w => w.level === 'easy').length,
    medium: vocabulary.filter(w => w.level === 'medium').length,
    hard: vocabulary.filter(w => w.level === 'hard').length,
  };

  const totalWords = vocabulary.length;
  const overallProgress = Math.round((learnedWords.length / totalWords) * 100);

  const xpLevel = Math.floor(state.xp / 100) + 1;
  const xpToNextLevel = (xpLevel * 100) - state.xp;
  const xpProgress = ((state.xp % 100) / 100) * 100;

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
            style={styles.header}
          >
            <Text style={styles.headerTitle}>İstatistikler</Text>
            <Text style={styles.headerSub}>Öğrenme yolculuğun</Text>

            {/* XP Level Ring */}
            <View style={styles.xpCard}>
              <View style={styles.xpLeft}>
                <Text style={styles.xpLevelNum}>Seviye {xpLevel}</Text>
                <Text style={styles.xpTotal}>{state.xp} XP toplam</Text>
                <AnimatedProgressBar
                  progress={xpProgress / 100}
                  color="#fff"
                  trackColor="rgba(255,255,255,0.25)"
                  height={8}
                  delay={200}
                />
                <Text style={styles.xpNextLabel}>
                  Sonraki seviyeye {xpToNextLevel} XP
                </Text>
              </View>
              <View style={styles.xpRight}>
                <MaterialCommunityIcons name="star" size={40} color="#F59E0B" />
                <Text style={styles.xpBig}>{state.xp}</Text>
              </View>
            </View>
          </LinearGradient>

          {/* Core Stats Grid */}
          <View style={styles.statsGrid}>
            <StatCard
              icon={<MaterialCommunityIcons name="fire" size={26} color="#FF6B35" />}
              value={state.streak}
              label="Günlük seri"
              color={theme.streak}
              bgColor="#FF6B3520"
              theme={theme}
            />
            <StatCard
              icon={<MaterialCommunityIcons name="book-open-variant" size={26} color={theme.correct} />}
              value={learnedWords.length}
              label="Öğrenilen"
              color={theme.correct}
              bgColor={theme.correctLight}
              theme={theme}
            />
            <StatCard
              icon={<MaterialCommunityIcons name="dumbbell" size={26} color={theme.incorrect} />}
              value={difficultWords.length}
              label="Zor kelime"
              color={theme.incorrect}
              bgColor={theme.incorrectLight}
              theme={theme}
            />
            <StatCard
              icon={<MaterialCommunityIcons name="target" size={26} color={theme.primary} />}
              value={`%${overallProgress}`}
              label="Genel ilerleme"
              color={theme.primary}
              bgColor={theme.primaryLight}
              theme={theme}
            />
          </View>

          {/* Overall Progress Bar */}
          <View style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.border, ...shadows.md }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                Toplam Kelime İlerlemesi
              </Text>
              <Text style={[styles.sectionValue, { color: theme.primary }]}>
                {learnedWords.length} / {totalWords}
              </Text>
            </View>
            <AnimatedProgressBar
              progress={overallProgress / 100}
              color={['#6C63FF', '#43D99D']}
              trackColor={theme.surfaceSecondary}
              height={14}
              delay={100}
            />
            <Text style={[styles.progressCaption, { color: theme.textSecondary }]}>
              {totalWords - learnedWords.length} kelime kaldı
            </Text>
          </View>

          {/* Level Breakdown */}
          <View style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.border, ...shadows.md }]}>
            <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: spacing.md }]}>
              Seviyeye Göre İlerleme
            </Text>

            {/* Easy */}
            <View style={styles.levelRow}>
              <View style={styles.levelInfo}>
                <MaterialCommunityIcons name="sprout" size={20} color="#43D99D" />
                <View style={{ flex: 1, marginLeft: spacing.sm }}>
                  <Text style={[styles.levelName, { color: theme.text }]}>Başlangıç</Text>
                  <AnimatedProgressBar
                    progress={easyLearned / totalByLevel.easy}
                    color="#43D99D"
                    trackColor={theme.surfaceSecondary}
                    height={10}
                    delay={150}
                  />
                </View>
                <Text style={[styles.levelCount, { color: theme.textSecondary }]}>
                  {easyLearned}/{totalByLevel.easy}
                </Text>
              </View>
            </View>

            {/* Medium */}
            <View style={[styles.levelRow, { marginTop: spacing.md }]}>
              <View style={styles.levelInfo}>
                <MaterialCommunityIcons name="rocket" size={20} color="#F59E0B" />
                <View style={{ flex: 1, marginLeft: spacing.sm }}>
                  <Text style={[styles.levelName, { color: theme.text }]}>Orta</Text>
                  <AnimatedProgressBar
                    progress={mediumLearned / totalByLevel.medium}
                    color="#F59E0B"
                    trackColor={theme.surfaceSecondary}
                    height={10}
                    delay={250}
                  />
                </View>
                <Text style={[styles.levelCount, { color: theme.textSecondary }]}>
                  {mediumLearned}/{totalByLevel.medium}
                </Text>
              </View>
            </View>

            {/* Hard */}
            <View style={[styles.levelRow, { marginTop: spacing.md }]}>
              <View style={styles.levelInfo}>
                <MaterialCommunityIcons name="fire" size={20} color="#EF4444" />
                <View style={{ flex: 1, marginLeft: spacing.sm }}>
                  <Text style={[styles.levelName, { color: theme.text }]}>İleri</Text>
                  <AnimatedProgressBar
                    progress={hardLearned / totalByLevel.hard}
                    color="#EF4444"
                    trackColor={theme.surfaceSecondary}
                    height={10}
                    delay={350}
                  />
                </View>
                <Text style={[styles.levelCount, { color: theme.textSecondary }]}>
                  {hardLearned}/{totalByLevel.hard}
                </Text>
              </View>
            </View>
          </View>

          {/* Recently Learned */}
          {learnedWords.length > 0 && (
            <View style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.border, ...shadows.md }]}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  Son Öğrenilenler
                </Text>
                <Text style={[styles.sectionBadge, { backgroundColor: theme.primaryLight, color: theme.primary }]}>
                  {learnedWords.length} kelime
                </Text>
              </View>
              {learnedWords.slice(-6).reverse().map(word => (
                <View
                  key={word.id}
                  style={[styles.wordRow, { borderBottomColor: theme.border }]}
                >
                  <View style={[styles.wordRowDot, { backgroundColor: theme.correct }]} />
                  <Text style={[styles.wordEn, { color: theme.text }]}>
                    {word.word}
                  </Text>
                  <Text style={[styles.wordTr, { color: theme.textSecondary }]}>
                    {word.translation}
                  </Text>
                  <View
                    style={[
                      styles.wordLevel,
                      {
                        backgroundColor:
                          word.level === 'easy'
                            ? '#43D99D20'
                            : word.level === 'medium'
                            ? '#F59E0B20'
                            : '#EF444420',
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: '700',
                        color:
                          word.level === 'easy'
                            ? '#43D99D'
                            : word.level === 'medium'
                            ? '#F59E0B'
                            : '#EF4444',
                      }}
                    >
                      {word.level === 'easy' ? 'A' : word.level === 'medium' ? 'B' : 'C'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Difficult Words List */}
          {difficultWords.length > 0 && (
            <View style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.border, ...shadows.md }]}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  Zorlandıklarım
                </Text>
                <Text style={[styles.sectionBadge, { backgroundColor: '#FEE2E2', color: '#DC2626' }]}>
                  {difficultWords.length} kelime
                </Text>
              </View>
              {difficultWords.slice(0, 6).map(word => (
                <View
                  key={word.id}
                  style={[styles.wordRow, { borderBottomColor: theme.border }]}
                >
                  <View style={[styles.wordRowDot, { backgroundColor: theme.incorrect }]} />
                  <Text style={[styles.wordEn, { color: theme.text }]}>
                    {word.word}
                  </Text>
                  <Text style={[styles.wordTr, { color: theme.textSecondary }]}>
                    {word.translation}
                  </Text>
                </View>
              ))}
              {difficultWords.length > 6 && (
                <Text style={[styles.moreLabel, { color: theme.textTertiary }]}>
                  +{difficultWords.length - 6} kelime daha
                </Text>
              )}
            </View>
          )}

          {/* Empty State */}
          {learnedWords.length === 0 && difficultWords.length === 0 && (
            <View style={[styles.emptyCard, { backgroundColor: theme.surface, ...shadows.sm }]}>
              <MaterialCommunityIcons name="book-open" size={48} color={theme.textTertiary} style={{ marginBottom: spacing.md }} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>
                Henüz istatistik yok
              </Text>
              <Text style={[styles.emptySub, { color: theme.textSecondary }]}>
                İlk dersi tamamla ve buraya istatistiklerin gelmeye başlasın!
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingBottom: spacing.xxl, flexGrow: 1 },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    fontFamily: 'Inter_800ExtraBold',
  },
  headerSub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.78)',
    fontWeight: '500',
    fontFamily: 'Inter_500Medium',
    marginTop: 2,
    marginBottom: spacing.lg,
  },
  xpCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  xpLeft: { flex: 1 },
  xpLevelNum: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    fontFamily: 'Inter_800ExtraBold',
  },
  xpTotal: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  xpNextLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.65)',
    marginTop: spacing.xs,
  },
  xpRight: {
    alignItems: 'center',
    marginLeft: spacing.lg,
  },
  xpBig: {
    fontSize: 26,
    fontWeight: '900',
    color: '#fff',
    marginTop: 4,
    fontFamily: 'Inter_800ExtraBold',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    minWidth: '44%',
    minHeight: 110,
    borderRadius: radius.xl,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  statIconBg: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 26,
    fontWeight: '800',
    fontFamily: 'Inter_800ExtraBold',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  sectionCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.bodyBold,
  },
  sectionValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  sectionBadge: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  bigProgressBg: {
    height: 14,
    borderRadius: radius.full,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  progressCaption: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: spacing.xs,
  },
  levelRow: {},
  levelInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  levelName: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  levelCount: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: spacing.sm,
    minWidth: 40,
    textAlign: 'right',
  },
  wordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    gap: spacing.sm,
  },
  wordRowDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  wordEn: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  wordTr: {
    fontSize: 13,
    flex: 1,
  },
  wordLevel: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreLabel: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '500',
    marginTop: spacing.sm,
  },
  emptyCard: {
    margin: spacing.lg,
    borderRadius: radius.xl,
    padding: spacing.xxl,
    alignItems: 'center',
  },
  emptyTitle: {
    ...typography.h4,
    textAlign: 'center',
  },
  emptySub: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 20,
  },
});
