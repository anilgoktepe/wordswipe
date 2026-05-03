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

// ─── Animated horizontal bar ──────────────────────────────────────────────────

const AnimatedProgressBar: React.FC<{
  progress: number;
  color: string | string[];
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
            colors={color as [string, string, ...string[]]}
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

// ─── Circular XP ring (no SVG — border clipping technique) ───────────────────
//
// Two half-circle containers, each clipping overflow.
// Right half rotates from 0→180° covering the first 50%.
// Left half rotates from 0→180° covering the second 50%.

const CircularRing: React.FC<{
  progress: number; // 0–1
  size: number;
  strokeWidth: number;
  color: string;
  trackColor: string;
  children?: React.ReactNode;
}> = ({ progress, size, strokeWidth, color, trackColor, children }) => {
  const anim = useRef(new Animated.Value(0)).current;
  const half = size / 2;
  const p = Math.min(1, Math.max(0, progress));

  useEffect(() => {
    Animated.timing(anim, {
      toValue: p,
      duration: 1000,
      delay: 200,
      useNativeDriver: false,
    }).start();
  }, [p]);

  const rightRotate = anim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['0deg', '180deg', '180deg'],
  });

  const leftRotate = anim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['-180deg', '-180deg', '0deg'],
  });

  const leftOpacity = anim.interpolate({
    inputRange: [0, 0.499, 0.5],
    outputRange: [0, 0, 1],
    extrapolate: 'clamp',
  });

  const innerSize = size - strokeWidth * 2;

  return (
    <View style={{ width: size, height: size }}>
      {/* Track */}
      <View style={{
        position: 'absolute',
        width: size, height: size,
        borderRadius: half,
        borderWidth: strokeWidth,
        borderColor: trackColor,
      }} />

      {/* Right half */}
      <View style={{
        position: 'absolute',
        width: half, height: size,
        left: half,
        overflow: 'hidden',
      }}>
        <Animated.View style={{
          position: 'absolute',
          width: size, height: size,
          left: -half,
          borderRadius: half,
          borderWidth: strokeWidth,
          borderColor: color,
          transform: [{ rotate: rightRotate }],
        }} />
      </View>

      {/* Left half */}
      <Animated.View style={{
        position: 'absolute',
        width: half, height: size,
        left: 0,
        overflow: 'hidden',
        opacity: leftOpacity,
      }}>
        <Animated.View style={{
          position: 'absolute',
          width: size, height: size,
          left: 0,
          borderRadius: half,
          borderWidth: strokeWidth,
          borderColor: color,
          transform: [{ rotate: leftRotate }],
        }} />
      </Animated.View>

      {/* Content */}
      <View style={{
        position: 'absolute',
        top: strokeWidth, left: strokeWidth,
        width: innerSize, height: innerSize,
        borderRadius: innerSize / 2,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {children}
      </View>
    </View>
  );
};

// ─── Weekly heatmap ───────────────────────────────────────────────────────────

const WeeklyHeatmap: React.FC<{
  streak: number;
  lastStudyDate: string | null;
  theme: ReturnType<typeof getTheme>;
}> = ({ streak, lastStudyDate, theme }) => {
  const days = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
  const today = new Date();

  // Build last-7-days activity from streak
  const activity: boolean[] = Array.from({ length: 7 }, (_, i) => {
    const dayOffset = 6 - i; // 0 = today, 6 = 6 days ago
    if (!lastStudyDate) return false;
    const lastStudy = new Date(lastStudyDate);
    const msPerDay = 86_400_000;
    const diffDays = Math.round((today.getTime() - lastStudy.getTime()) / msPerDay);
    // This slot is active if it falls within the streak window
    return dayOffset <= (diffDays === 0 ? streak - 1 : -1)
      ? false
      : dayOffset < streak && diffDays <= dayOffset;
  });

  // Simpler: last `streak` days up to and including lastStudyDate are active
  const lastStudyMs = lastStudyDate ? new Date(lastStudyDate).getTime() : 0;
  const todayMs = new Date(today.toDateString()).getTime();
  const msPerDay = 86_400_000;

  return (
    <View style={styles.heatmapRow}>
      {Array.from({ length: 7 }, (_, i) => {
        const dayOffset = 6 - i; // 6=6 days ago, 0=today
        const slotMs = todayMs - dayOffset * msPerDay;
        const isActive = lastStudyMs > 0 && slotMs <= lastStudyMs && slotMs > lastStudyMs - streak * msPerDay;
        const isToday = dayOffset === 0;
        const dotDate = new Date(slotMs);
        const label = days[dotDate.getDay() === 0 ? 6 : dotDate.getDay() - 1];

        return (
          <View key={i} style={styles.heatmapCell}>
            <View style={[
              styles.heatmapDot,
              {
                backgroundColor: isActive
                  ? '#6C63FF'
                  : theme.surfaceSecondary,
                borderWidth: isToday ? 2 : 0,
                borderColor: '#6C63FF',
                opacity: isActive ? 1 : 0.5,
              },
            ]} />
            <Text style={[styles.heatmapLabel, { color: theme.textTertiary, fontWeight: isToday ? '700' : '400' }]}>
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
};

// ─── Motivational message ─────────────────────────────────────────────────────

function getMotivation(overallPct: number, streak: number, learnedCount: number): string {
  if (learnedCount === 0) return 'İlk dersi tamamla ve yolculuğunu başlat!';
  if (streak >= 7)  return `${streak} günlük serin var! Harika bir alışkanlık oluşturuyorsun.`;
  if (streak >= 3)  return `${streak} gün üst üste çalıştın, ritmi koruyorsun!`;
  if (overallPct >= 50) return 'Yarıyı geçtin! Bitiş çizgisi görünüyor.';
  if (overallPct >= 25) return `${learnedCount} kelime öğrendin, çok iyi gidiyorsun!`;
  if (overallPct >= 10) return 'Güzel bir başlangıç, her gün biraz daha!';
  return `${learnedCount} kelimeyle başladın, devam et!`;
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export const StatsScreen: React.FC<{ navigation?: any }> = () => {
  useIsFocused();
  const { state } = useApp();
  const theme = getTheme(state.darkMode);

  const learnedWords = vocabulary.filter(w => {
    const wp = state.wordProgress[w.id];
    return wp ? wp.correctCount >= 2 : false;
  });
  const difficultWords = vocabulary.filter(w => {
    const wp = state.wordProgress[w.id];
    return wp ? wp.wrongCount > 0 && wp.wrongCount >= wp.correctCount : false;
  });

  const easyTotal   = vocabulary.filter(w => w.level === 'easy').length;
  const mediumTotal = vocabulary.filter(w => w.level === 'medium').length;
  const hardTotal   = vocabulary.filter(w => w.level === 'hard').length;

  const easyLearned   = learnedWords.filter(w => w.level === 'easy').length;
  const mediumLearned = learnedWords.filter(w => w.level === 'medium').length;
  const hardLearned   = learnedWords.filter(w => w.level === 'hard').length;

  const totalWords     = vocabulary.length;
  const overallPct     = Math.round((learnedWords.length / totalWords) * 100);

  const xpLevel        = Math.floor(state.xp / 100) + 1;
  const xpToNextLevel  = xpLevel * 100 - state.xp;
  const xpRingProgress = (state.xp % 100) / 100;

  const motivation = getMotivation(overallPct, state.streak, learnedWords.length);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

          {/* ── Header gradient ── */}
          <LinearGradient
            colors={['#6C63FF', '#9B5CF6']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.header}
          >
            <Text style={styles.headerTitle}>İstatistikler</Text>
            <Text style={styles.headerSub}>Öğrenme yolculuğun</Text>

            {/* ── XP Circular Ring Card ── */}
            <View style={styles.xpCard}>
              <CircularRing
                progress={xpRingProgress}
                size={96}
                strokeWidth={8}
                color="#F59E0B"
                trackColor="rgba(255,255,255,0.2)"
              >
                <Text style={styles.ringLevel}>Sv.{xpLevel}</Text>
                <Text style={styles.ringXP}>{state.xp}</Text>
              </CircularRing>

              <View style={styles.xpInfo}>
                <Text style={styles.xpTitle}>Seviye {xpLevel}</Text>
                <Text style={styles.xpSub}>{state.xp} puan toplam</Text>
                <View style={styles.xpNextRow}>
                  <MaterialCommunityIcons name="star" size={13} color="#F59E0B" />
                  <Text style={styles.xpNextLabel}> Sonraki seviyeye {xpToNextLevel} puan</Text>
                </View>
              </View>
            </View>
          </LinearGradient>

          {/* ── Motivational message ── */}
          <View style={[styles.motivationCard, { backgroundColor: theme.surface, ...shadows.sm }]}>
            <MaterialCommunityIcons name="lightning-bolt" size={18} color="#F59E0B" />
            <Text style={[styles.motivationText, { color: theme.text }]}>{motivation}</Text>
          </View>

          {/* ── Stats grid: 2 big + 2 small ── */}
          <View style={styles.gridContainer}>
            {/* Big cards row */}
            <View style={styles.bigRow}>
              <View style={[styles.bigCard, { backgroundColor: theme.surface, ...shadows.md }]}>
                <View style={[styles.bigIconBg, { backgroundColor: theme.correctLight }]}>
                  <MaterialCommunityIcons name="book-open-variant" size={28} color={theme.correct} />
                </View>
                <Text style={[styles.bigValue, { color: theme.correct }]}>{learnedWords.length}</Text>
                <Text style={[styles.bigLabel, { color: theme.textSecondary }]}>Öğrenilen kelime</Text>
              </View>

              <View style={[styles.bigCard, { backgroundColor: theme.surface, ...shadows.md }]}>
                <View style={[styles.bigIconBg, { backgroundColor: theme.primaryLight }]}>
                  <MaterialCommunityIcons name="target" size={28} color={theme.primary} />
                </View>
                <Text style={[styles.bigValue, { color: theme.primary }]}>%{overallPct}</Text>
                <Text style={[styles.bigLabel, { color: theme.textSecondary }]}>Genel ilerleme</Text>
              </View>
            </View>

            {/* Small cards row */}
            <View style={styles.smallRow}>
              <View style={[styles.smallCard, { backgroundColor: theme.surface, ...shadows.sm }]}>
                <MaterialCommunityIcons name="fire" size={20} color="#FF6B35" />
                <Text style={[styles.smallValue, { color: theme.streak }]}>{state.streak}</Text>
                <Text style={[styles.smallLabel, { color: theme.textSecondary }]}>Günlük seri</Text>
              </View>

              <View style={[styles.smallCard, { backgroundColor: theme.surface, ...shadows.sm }]}>
                <MaterialCommunityIcons name="dumbbell" size={20} color={theme.incorrect} />
                <Text style={[styles.smallValue, { color: theme.incorrect }]}>{difficultWords.length}</Text>
                <Text style={[styles.smallLabel, { color: theme.textSecondary }]}>Zor kelime</Text>
              </View>
            </View>
          </View>

          {/* ── Weekly heatmap ── */}
          <View style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.border, ...shadows.md }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Haftalık Aktivite</Text>
              <Text style={[styles.streakBadge, { backgroundColor: '#FF6B3520', color: '#FF6B35' }]}>
                🔥 {state.streak} gün
              </Text>
            </View>
            <WeeklyHeatmap
              streak={state.streak}
              lastStudyDate={state.lastStudyDate}
              theme={theme}
            />
          </View>

          {/* ── Overall progress bar ── */}
          <View style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.border, ...shadows.md }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Toplam Kelime İlerlemesi</Text>
              <Text style={[styles.sectionValue, { color: theme.primary }]}>%{overallPct}</Text>
            </View>
            <AnimatedProgressBar
              progress={overallPct / 100}
              color={['#6C63FF', '#43D99D']}
              trackColor={theme.surfaceSecondary}
              height={14}
              delay={100}
            />
          </View>

          {/* ── Level breakdown ── */}
          <View style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.border, ...shadows.md }]}>
            <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: spacing.md }]}>
              Seviyeye Göre İlerleme
            </Text>

            {[
              { icon: 'sprout',  color: '#43D99D', label: 'Başlangıç', learned: easyLearned,   total: easyTotal,   delay: 150 },
              { icon: 'rocket',  color: '#F59E0B', label: 'Orta',      learned: mediumLearned, total: mediumTotal, delay: 250 },
              { icon: 'fire',    color: '#EF4444', label: 'İleri',     learned: hardLearned,   total: hardTotal,   delay: 350 },
            ].map(({ icon, color, label, learned, total, delay }, idx) => (
              <View key={idx} style={idx > 0 ? { marginTop: spacing.md } : undefined}>
                <View style={styles.levelInfo}>
                  <MaterialCommunityIcons name={icon as any} size={20} color={color} />
                  <View style={{ flex: 1, marginLeft: spacing.sm }}>
                    <Text style={[styles.levelName, { color: theme.text }]}>{label}</Text>
                    <AnimatedProgressBar
                      progress={learned / total}
                      color={color}
                      trackColor={theme.surfaceSecondary}
                      height={10}
                      delay={delay}
                    />
                  </View>
                  <Text style={[styles.levelCount, { color: theme.textSecondary }]}>
                    %{Math.round((learned / total) * 100)}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* ── Empty state ── */}
          {learnedWords.length === 0 && (
            <View style={[styles.emptyCard, { backgroundColor: theme.surface, ...shadows.sm }]}>
              <MaterialCommunityIcons name="book-open" size={48} color={theme.textTertiary} style={{ marginBottom: spacing.md }} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>Henüz istatistik yok</Text>
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingBottom: spacing.xxl, flexGrow: 1 },

  // Header
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  headerTitle: {
    fontSize: 28, fontWeight: '800', color: '#fff',
    fontFamily: 'Inter_800ExtraBold',
  },
  headerSub: {
    fontSize: 14, color: 'rgba(255,255,255,0.78)', fontWeight: '500',
    fontFamily: 'Inter_500Medium', marginTop: 2, marginBottom: spacing.lg,
  },

  // XP Card
  xpCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.lg,
  },
  ringLevel: {
    fontSize: 10, fontWeight: '800', color: '#fff',
    fontFamily: 'Inter_800ExtraBold',
  },
  ringXP: {
    fontSize: 16, fontWeight: '900', color: '#F59E0B',
    fontFamily: 'Inter_800ExtraBold',
  },
  xpInfo: { flex: 1 },
  xpTitle: {
    fontSize: 20, fontWeight: '800', color: '#fff',
    fontFamily: 'Inter_800ExtraBold',
  },
  xpSub: {
    fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 2,
  },
  xpNextRow: {
    flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm,
  },
  xpNextLabel: {
    fontSize: 12, color: 'rgba(255,255,255,0.65)',
  },

  // Motivation
  motivationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  motivationText: {
    flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18,
  },

  // Grid
  gridContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  bigRow: { flexDirection: 'row', gap: spacing.sm },
  bigCard: {
    flex: 1, borderRadius: radius.xl,
    padding: spacing.md, alignItems: 'center', gap: 6,
  },
  bigIconBg: {
    width: 54, height: 54, borderRadius: radius.lg,
    alignItems: 'center', justifyContent: 'center',
  },
  bigValue: {
    fontSize: 30, fontWeight: '800', fontFamily: 'Inter_800ExtraBold',
  },
  bigLabel: { fontSize: 11, fontWeight: '600', textAlign: 'center' },

  smallRow: { flexDirection: 'row', gap: spacing.sm },
  smallCard: {
    flex: 1, borderRadius: radius.lg,
    paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md,
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
  },
  smallValue: { fontSize: 20, fontWeight: '800', fontFamily: 'Inter_800ExtraBold' },
  smallLabel: { fontSize: 11, fontWeight: '500' },

  // Section cards
  sectionCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
  },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: spacing.md,
  },
  sectionTitle: { ...typography.bodyBold },
  sectionValue: { fontSize: 15, fontWeight: '700' },

  streakBadge: {
    fontSize: 12, fontWeight: '700',
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: radius.full,
  },

  // Heatmap
  heatmapRow: {
    flexDirection: 'row', justifyContent: 'space-between',
  },
  heatmapCell: { alignItems: 'center', gap: 6 },
  heatmapDot: {
    width: 32, height: 32, borderRadius: 10,
  },
  heatmapLabel: { fontSize: 10 },

  // Level
  levelInfo: { flexDirection: 'row', alignItems: 'center' },
  levelName: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  levelCount: {
    fontSize: 12, fontWeight: '600',
    marginLeft: spacing.sm, minWidth: 36, textAlign: 'right',
  },

  // Empty
  emptyCard: {
    margin: spacing.lg, borderRadius: radius.xl,
    padding: spacing.xxl, alignItems: 'center',
  },
  emptyTitle: { ...typography.h4, textAlign: 'center' },
  emptySub: {
    ...typography.caption, textAlign: 'center',
    marginTop: spacing.sm, lineHeight: 20,
  },
});
