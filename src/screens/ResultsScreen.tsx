import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Animated,
  Dimensions,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { Button } from '../components/Button';
import { AdBanner } from '../components/AdBanner';
import { getTheme, spacing, radius, typography, shadows } from '../utils/theme';

const MAX_DAILY_ADS = 2;

const { width } = Dimensions.get('window');

const motivationalMessages = [
  { min: 90, text: '🏆 Muhteşem! Gerçek bir kelime ustasısın!' },
  { min: 70, text: '🚀 Harika gidiyorsun! Böyle devam et!' },
  { min: 50, text: '💪 İyi iş! Her gün biraz daha iyisin.' },
  { min: 0, text: '🌱 Güzel başlangıç! Pratik seni güçlendirir.' },
];

interface Props {
  navigation: any;
}

export const ResultsScreen: React.FC<Props> = ({ navigation }) => {
  const { state, dispatch, getDifficultWordObjects } = useApp();
  const theme = getTheme(state.darkMode);

  const results = state.sessionResults;
  const correct = results?.correct ?? 0;
  const incorrect = results?.incorrect ?? 0;
  const total = correct + incorrect;
  const successRate = total > 0 ? Math.round((correct / total) * 100) : 0;

  const message =
    motivationalMessages.find(m => successRate >= m.min)?.text ??
    motivationalMessages[motivationalMessages.length - 1].text;

  // ── Ad eligibility ──────────────────────────────────────────────────────────
  // Frozen in a ref at mount so the banner stays visible for the entire screen
  // visit even after RECORD_AD_SHOWN increments dailyAdsShown and triggers a
  // re-render (which would otherwise recompute the condition to false, causing
  // the banner to flash and disappear on the 2nd eligible visit of the day).
  const shouldShowAd = useRef(
    !state.isPremium && state.dailyAdsShown < MAX_DAILY_ADS,
  ).current;

  const adRecorded = useRef(false);

  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const countAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 60,
        friction: 6,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.timing(countAnim, {
      toValue: successRate,
      duration: 1200,
      useNativeDriver: false,
    }).start();
  }, []);

  // Record the ad impression exactly once per screen visit
  useEffect(() => {
    if (shouldShowAd && !adRecorded.current) {
      adRecorded.current = true;
      dispatch({ type: 'RECORD_AD_SHOWN' });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRetry = () => {
    const words = state.sessionWords;
    dispatch({ type: 'SET_SESSION_WORDS', words });
    dispatch({ type: 'SET_SESSION_RESULTS', results: null });
    navigation.replace('Flashcard');
  };

  const handleNewLesson = () => {
    dispatch({ type: 'SET_SESSION_RESULTS', results: null });
    navigation.replace('Main');
  };

  const handleRetryWrong = () => {
    const wrongWords = getDifficultWordObjects().filter(w =>
      results?.wrongWordIds.includes(w.id)
    );
    if (wrongWords.length === 0) return;
    dispatch({ type: 'SET_SESSION_WORDS', words: wrongWords });
    dispatch({ type: 'SET_SESSION_RESULTS', results: null });
    navigation.replace('Flashcard');
  };

  const getCircleColor = (): [string, string] => {
    if (successRate >= 90) return ['#10B981', '#34D399'];
    if (successRate >= 70) return ['#6C63FF', '#9B5CF6'];
    if (successRate >= 50) return ['#F59E0B', '#FBBF24'];
    return ['#EF4444', '#F87171'];
  };

  return (
    <LinearGradient
      colors={[theme.background, theme.surfaceSecondary]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Success Circle */}
          <Animated.View style={[styles.circleContainer, { transform: [{ scale: scaleAnim }] }]}>
            <LinearGradient
              colors={getCircleColor()}
              style={styles.circle}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Animated.Text style={styles.circlePercent}>
                {successRate}%
              </Animated.Text>
              <Text style={styles.circleLabel}>Başarı</Text>
            </LinearGradient>
          </Animated.View>

          {/* Message */}
          <Animated.View style={[styles.messageArea, { opacity: fadeAnim }]}>
            <Text style={[styles.message, { color: theme.text }]}>{message}</Text>
          </Animated.View>

          {/* Stats Cards */}
          <Animated.View style={[styles.statsRow, { opacity: fadeAnim }]}>
            <View style={[styles.statCard, { backgroundColor: theme.correctLight, ...shadows.sm }]}>
              <Text style={styles.statIcon}>✓</Text>
              <Text style={[styles.statValue, { color: theme.correct }]}>{correct}</Text>
              <Text style={[styles.statLabel, { color: theme.correct }]}>Doğru</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: theme.incorrectLight, ...shadows.sm }]}>
              <Text style={styles.statIcon}>✕</Text>
              <Text style={[styles.statValue, { color: theme.incorrect }]}>{incorrect}</Text>
              <Text style={[styles.statLabel, { color: theme.incorrect }]}>Yanlış</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: theme.primaryLight, ...shadows.sm }]}>
              <Text style={styles.statIcon}>⭐</Text>
              <Text style={[styles.statValue, { color: theme.primary }]}>{state.xp}</Text>
              <Text style={[styles.statLabel, { color: theme.primary }]}>XP</Text>
            </View>
          </Animated.View>

          {/* Ad banner — free users only, max 2 per day */}
          {shouldShowAd && <AdBanner darkMode={state.darkMode} />}

          {/* Buttons */}
          <Animated.View style={[styles.buttons, { opacity: fadeAnim }]}>
            {/* Fix 5: prominent home button */}
            <Button
              title="Ana Sayfaya Dön"
              onPress={handleNewLesson}
              theme={theme}
              size="lg"
              style={styles.btn}
              icon="🏠"
            />
            <Button
              title="Tekrar Çalış"
              onPress={handleRetry}
              variant="secondary"
              theme={theme}
              size="lg"
              style={styles.btn}
            />
            {(results?.wrongWordIds.length ?? 0) > 0 && (
              <Button
                title={`Yanlış Kelimeleri Tekrar Et (${results?.wrongWordIds.length})`}
                onPress={handleRetryWrong}
                variant="outline"
                theme={theme}
                size="md"
                style={styles.btn}
              />
            )}
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const CIRCLE_SIZE = 180;

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    alignItems: 'center',
  },
  circleContainer: {
    marginBottom: spacing.xl,
    ...shadows.lg,
  },
  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circlePercent: {
    fontSize: 48,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -1,
  },
  circleLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '700',
  },
  messageArea: {
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  message: {
    ...typography.h3,
    textAlign: 'center',
    lineHeight: 32,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
    width: '100%',
  },
  statCard: {
    flex: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  statIcon: { fontSize: 22 },
  statValue: {
    fontSize: 28,
    fontWeight: '900',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  buttons: {
    width: '100%',
    gap: spacing.sm,
    alignItems: 'stretch',
  },
  btn: { width: '100%' },
});
