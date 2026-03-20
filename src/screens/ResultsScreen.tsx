import React, { useRef, useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
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
import { MAX_DAILY_ADS } from '../config/adConfig';
import { ConfettiEffect } from '../components/ConfettiEffect';
import { hapticSuccess } from '../utils/haptics';

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

  // Drives the integer count-up inside the circle
  const [displayPercent, setDisplayPercent] = useState(0);
  const [confettiVisible, setConfettiVisible] = useState(false);

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

    const listener = countAnim.addListener(({ value }) => {
      setDisplayPercent(Math.round(value));
    });

    Animated.timing(countAnim, {
      toValue: successRate,
      duration: 1200,
      useNativeDriver: false,
    }).start();

    // Fire confetti + haptic once entrance animation settles (~900 ms)
    let confettiTimer: ReturnType<typeof setTimeout> | null = null;
    if (successRate >= 50) {
      confettiTimer = setTimeout(() => {
        setConfettiVisible(true);
        hapticSuccess();
      }, 750);
    }

    return () => {
      countAnim.removeListener(listener);
      if (confettiTimer) clearTimeout(confettiTimer);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      results?.wrongWordIds?.includes(w.id)
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
                {displayPercent}%
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
              <Ionicons name="checkmark-circle" size={24} color={theme.correct} />
              <Text style={[styles.statValue, { color: theme.correct }]}>{correct}</Text>
              <Text style={[styles.statLabel, { color: theme.correct }]}>Doğru</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: theme.incorrectLight, ...shadows.sm }]}>
              <Ionicons name="close-circle" size={24} color={theme.incorrect} />
              <Text style={[styles.statValue, { color: theme.incorrect }]}>{incorrect}</Text>
              <Text style={[styles.statLabel, { color: theme.incorrect }]}>Yanlış</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: theme.primaryLight, ...shadows.sm }]}>
              <Ionicons name="star" size={24} color={theme.primary} />
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
              icon={<Ionicons name="home" size={18} color="#fff" />}
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

      {/* Confetti burst — shown once after entrance on good scores (≥50%) */}
      <ConfettiEffect visible={confettiVisible} />
    </LinearGradient>
  );
};

const CIRCLE_SIZE = 200;

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    alignItems: 'center',
  },
  circleContainer: {
    marginBottom: spacing.xl,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 32,
    elevation: 16,
  },
  circle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circlePercent: {
    fontSize: 52,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -1,
    fontFamily: 'Inter_800ExtraBold',
  },
  circleLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.88)',
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
  messageArea: {
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  message: {
    ...typography.h3,
    textAlign: 'center',
    lineHeight: 34,
    fontFamily: 'Inter_700Bold',
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
    width: '100%',
  },
  statCard: {
    flex: 1,
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs,
  },
  statValue: {
    fontSize: 32,
    fontWeight: '900',
    fontFamily: 'Inter_800ExtraBold',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
  buttons: {
    width: '100%',
    gap: spacing.sm,
    alignItems: 'stretch',
  },
  btn: { width: '100%' },
});
