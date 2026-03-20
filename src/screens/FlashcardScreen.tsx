import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Animated,
  Dimensions,
  PanResponder,
  Platform,
  Pressable,
} from 'react-native';
import * as Speech from 'expo-speech';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useApp } from '../context/AppContext';
import { useInterstitialAd } from '../hooks/useInterstitialAd';
import { Word } from '../data/vocabulary';
import { getTheme, spacing, radius, typography, shadows } from '../utils/theme';
import { prefetchEnrichments } from '../services/wordEnrichment';
import { SoundService } from '../utils/sound';

function haptic(type: 'light' | 'medium' | 'success' | 'warning') {
  if (Platform.OS === 'web') return;
  try {
    if (type === 'success') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (type === 'warning') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else if (type === 'medium') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  } catch (_) {}
}

const { width, height } = Dimensions.get('window');
const CARD_WIDTH = width - spacing.lg * 2;
const SWIPE_THRESHOLD = width * 0.25;

// ─── SpeakButton ─────────────────────────────────────────────────────────────

const SpeakButton: React.FC<{ word: string; theme: ReturnType<typeof getTheme> }> = ({ word, theme }) => {
  const [speaking, setSpeaking] = useState(false);
  const scaleAnim  = useRef(new Animated.Value(1)).current;
  const pulseAnim  = useRef(new Animated.Value(1)).current;
  const pulseLoop  = useRef<Animated.CompositeAnimation | null>(null);
  const cooldown   = useRef(false);

  // Cleanup on unmount or word change
  useEffect(() => {
    return () => {
      Speech.stop();
      pulseLoop.current?.stop();
    };
  }, [word]);

  const startPulse = () => {
    pulseLoop.current?.stop();
    pulseAnim.setValue(1);
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.22, duration: 520, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.00, duration: 520, useNativeDriver: true }),
      ]),
    );
    pulseLoop.current.start();
  };

  const stopPulse = () => {
    pulseLoop.current?.stop();
    pulseLoop.current = null;
    Animated.spring(pulseAnim, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 0 }).start();
  };

  const handlePress = () => {
    if (cooldown.current) return;
    cooldown.current = true;
    setTimeout(() => { cooldown.current = false; }, 400);

    // Press-down scale
    Animated.sequence([
      Animated.spring(scaleAnim, { toValue: 0.82, useNativeDriver: true, speed: 60, bounciness: 0 }),
      Animated.spring(scaleAnim, { toValue: 1,    useNativeDriver: true, speed: 40, bounciness: 8 }),
    ]).start();

    if (speaking) {
      Speech.stop();
      setSpeaking(false);
      stopPulse();
      return;
    }

    // Stop any previous speech, then speak
    Speech.stop();
    setSpeaking(true);
    startPulse();
    haptic('light');

    Speech.speak(word, {
      language: 'en-US',
      rate: 0.85,
      pitch: 1.0,
      onDone:  () => { setSpeaking(false); stopPulse(); },
      onError: () => { setSpeaking(false); stopPulse(); },
      onStopped: () => { setSpeaking(false); stopPulse(); },
    });
  };

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={12}
      style={styles.speakHitArea}
    >
      {/* Outer pulse ring — only visible while speaking */}
      <Animated.View
        style={[
          styles.speakRing,
          {
            backgroundColor: speaking ? theme.primary + '22' : 'transparent',
            transform: [{ scale: speaking ? pulseAnim : 1 }],
          },
        ]}
      />
      {/* Icon button */}
      <Animated.View
        style={[
          styles.speakBtn,
          {
            backgroundColor: speaking ? theme.primary : theme.surfaceSecondary,
            transform: [{ scale: scaleAnim }],
            shadowColor: speaking ? theme.primary : 'transparent',
            shadowOpacity: speaking ? 0.45 : 0,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
            elevation: speaking ? 6 : 0,
          },
        ]}
      >
        <Ionicons
          name={speaking ? 'volume-high' : 'volume-medium-outline'}
          size={20}
          color={speaking ? '#fff' : theme.textSecondary}
        />
      </Animated.View>
    </Pressable>
  );
};

interface Props {
  navigation: any;
}

const FlashCard: React.FC<{
  word: Word;
  theme: ReturnType<typeof getTheme>;
  isTop: boolean;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  swipeCommand: 'left' | 'right' | null;
  onSwipeCommandDone: () => void;
}> = ({ word, theme, isTop, onSwipeLeft, onSwipeRight, swipeCommand, onSwipeCommandDone }) => {
  const [flipped, setFlipped] = useState(false);
  const flipAnim = useRef(new Animated.Value(0)).current;
  const pan = useRef(new Animated.ValueXY()).current;

  useEffect(() => {
    if (!swipeCommand || !isTop) return;
    const toX = swipeCommand === 'left' ? -width * 1.5 : width * 1.5;
    Animated.timing(pan, {
      toValue: { x: toX, y: 0 },
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      onSwipeCommandDone();
      if (swipeCommand === 'left') onSwipeLeft();
      else onSwipeRight();
    });
  }, [swipeCommand, isTop, pan, onSwipeCommandDone, onSwipeLeft, onSwipeRight]);

  const flipCard = () => {
    if (!isTop) return;
    SoundService.playFlip();
    Speech.stop();
    Animated.spring(flipAnim, {
      toValue: flipped ? 0 : 1,
      useNativeDriver: true,
      tension: 80,
      friction: 8,
    }).start();
    setFlipped(!flipped);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => isTop,
      onMoveShouldSetPanResponder: (_, gs) => isTop && Math.abs(gs.dx) > 5,
      onPanResponderMove: (_, gs) => {
        pan.setValue({ x: gs.dx, y: gs.dy * 0.2 });
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dx > SWIPE_THRESHOLD) {
          Speech.stop();
          haptic('success');
          SoundService.playCorrect();
          Animated.timing(pan, {
            toValue: { x: width * 1.5, y: gs.dy },
            duration: 280,
            useNativeDriver: true,
          }).start(onSwipeRight);
        } else if (gs.dx < -SWIPE_THRESHOLD) {
          Speech.stop();
          haptic('warning');
          SoundService.playWrong();
          Animated.timing(pan, {
            toValue: { x: -width * 1.5, y: gs.dy },
            duration: 280,
            useNativeDriver: true,
          }).start(onSwipeLeft);
        } else {
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: true,
            tension: 100,
            friction: 8,
          }).start();
        }
      },
    })
  ).current;

  const rotate = pan.x.interpolate({
    inputRange: [-width / 2, 0, width / 2],
    outputRange: ['-10deg', '0deg', '10deg'],
  });

  const frontOpacity = flipAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0, 0],
  });
  const backOpacity = flipAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0, 1],
  });
  const frontRotate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });
  const backRotate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['180deg', '360deg'],
  });

  const leftIndicatorOpacity = pan.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const rightIndicatorOpacity = pan.x.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View
      {...(isTop ? panResponder.panHandlers : {})}
      style={[
        styles.cardWrapper,
        isTop && {
          transform: [
            { translateX: pan.x },
            { translateY: pan.y },
            { rotate },
          ],
        },
      ]}
    >
      {isTop && (
        <>
          <Animated.View style={[styles.swipeLabel, styles.swipeLabelLeft, { opacity: leftIndicatorOpacity }]}>
            <Text style={styles.swipeLabelText}>Bilmiyorum</Text>
          </Animated.View>
          <Animated.View style={[styles.swipeLabel, styles.swipeLabelRight, { opacity: rightIndicatorOpacity }]}>
            <Text style={styles.swipeLabelText}>Biliyorum</Text>
          </Animated.View>
        </>
      )}

      <TouchableOpacity activeOpacity={1} onPress={flipCard} style={{ flex: 1 }}>
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: theme.card,
              opacity: frontOpacity,
              transform: [{ rotateY: frontRotate }],
              backfaceVisibility: 'hidden',
            },
            shadows.lg,
          ]}
        >
          <LinearGradient colors={['#6C63FF22', '#9B5CF622']} style={styles.cardDecor} />
          <LinearGradient colors={['#9B5CF614', '#6C63FF14']} style={styles.cardDecor2} />
          <Text style={[styles.tapHint, { color: theme.textTertiary }]}>
            Çevirmek için dokun 👆
          </Text>
          <Text style={[styles.wordText, { color: theme.text }]}>{word.word}</Text>
          <SpeakButton word={word.word} theme={theme} />
          <View style={[
            styles.levelDot,
            {
              backgroundColor:
                word.level === 'easy' ? '#D1FAE5' :
                word.level === 'medium' ? theme.primaryLight : '#FEE2E2',
            },
          ]}>
            <Text style={[styles.levelDotText, {
              color:
                word.level === 'easy' ? '#10B981' :
                word.level === 'medium' ? theme.primary : '#EF4444',
            }]}>
              {word.level === 'easy' ? 'Kolay' : word.level === 'medium' ? 'Orta' : 'Zor'}
            </Text>
          </View>
        </Animated.View>

        <Animated.View
          style={[
            styles.card,
            styles.cardBack,
            {
              opacity: backOpacity,
              transform: [{ rotateY: backRotate }],
              backfaceVisibility: 'hidden',
            },
            shadows.lg,
          ]}
        >
          <LinearGradient
            colors={['#6C63FF', '#9B5CF6']}
            style={StyleSheet.absoluteFillObject}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
          <Text style={styles.meaningText}>{word.translation}</Text>
          <View style={styles.sentenceBg}>
            <Text style={styles.sentenceText}>"{word.example}"</Text>
          </View>
        </Animated.View>
      </TouchableOpacity>
    </Animated.View>
  );
};

export const FlashcardScreen: React.FC<Props> = ({ navigation }) => {
  const { state, dispatch, getDailyWords } = useApp();
  const theme = getTheme(state.darkMode);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [swipeCommand, setSwipeCommand] = useState<'left' | 'right' | null>(null);
  const { showInterstitial } = useInterstitialAd();

  const words = state.sessionWords.length > 0 ? state.sessionWords : getDailyWords();

  useEffect(() => {
    if (words.length > 0) {
      prefetchEnrichments(words.map(w => w.word));
    }
  }, [words.length, words]);

  const finishLesson = useCallback((seenUpToIndex: number) => {
    const seenWords = words.slice(0, seenUpToIndex + 1);
    dispatch({ type: 'SET_LAST_LESSON_WORDS', wordIds: seenWords.map(w => w.id) });
    dispatch({ type: 'ADD_XP', amount: 20 });
    dispatch({ type: 'UPDATE_STREAK' });
    navigation.navigate('Quiz');
  }, [words, dispatch, navigation]);

  const handleNext = useCallback(() => {
    if (currentIndex < words.length - 1) {
      dispatch({ type: 'ADD_XP', amount: 1 });
      setCurrentIndex(prev => prev + 1);
    } else {
      finishLesson(currentIndex);
    }
  }, [currentIndex, words.length, finishLesson, dispatch]);

  const handleFinish = useCallback(async () => {
    await showInterstitial();
    finishLesson(currentIndex);
  }, [currentIndex, finishLesson, showInterstitial]);

  const handleKnow = () => {
    if (swipeCommand) return;
    haptic('success');
    setSwipeCommand('right');
  };

  const handleDontKnow = () => {
    if (swipeCommand) return;
    haptic('warning');
    setSwipeCommand('left');
  };

  const handleSwipeCommandDone = () => {
    setSwipeCommand(null);
  };

  const progress = words.length > 0 ? (currentIndex / words.length) * 100 : 0;

  if (words.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: theme.text, fontSize: 18, textAlign: 'center', padding: spacing.lg }}>
          Bugün tüm kelimeleri tamamladın! 🎉
        </Text>
        <TouchableOpacity onPress={() => navigation.navigate('Main')} style={{ marginTop: spacing.lg }}>
          <Text style={{ color: theme.primary, fontSize: 16, fontWeight: '600' }}>Ana Sayfaya Dön</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.navigate('Main')} style={styles.backBtn}>
            <Ionicons name="close" size={22} color={theme.textSecondary} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginHorizontal: spacing.md }}>
            <View style={[styles.progressBg, { backgroundColor: theme.surfaceSecondary }]}>
              <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: theme.primary }]} />
            </View>
            <Text style={[styles.progressCount, { color: theme.textSecondary }]}>
              {currentIndex + 1} / {words.length}
            </Text>
          </View>
          <TouchableOpacity onPress={handleFinish}>
            <Text style={[styles.skipText, { color: theme.primary }]}>Atla</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.cardArea}>
          {[2, 1].map(offset => {
            const idx = currentIndex + offset;
            if (idx >= words.length) return null;
            return (
              <View
                key={idx}
                style={[
                  styles.cardWrapper,
                  { transform: [{ scale: 1 - offset * 0.04 }, { translateY: offset * 12 }], zIndex: -offset },
                ]}
              >
                <View style={[styles.card, { backgroundColor: theme.card }, shadows.sm]} />
              </View>
            );
          })}

          {currentIndex < words.length && (
            <FlashCard
              key={currentIndex}
              word={words[currentIndex]}
              theme={theme}
              isTop={true}
              onSwipeLeft={handleNext}
              onSwipeRight={handleNext}
              swipeCommand={swipeCommand}
              onSwipeCommandDone={handleSwipeCommandDone}
            />
          )}
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            onPress={handleDontKnow}
            activeOpacity={0.85}
            style={[styles.actionBtn, styles.actionBtnLeft, { backgroundColor: theme.incorrectLight, borderColor: theme.incorrect }]}
          >
            <Ionicons name="close" size={20} color={theme.incorrect} />
            <Text style={[styles.actionBtnText, { color: theme.incorrect }]}>Bilmiyorum</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleKnow}
            activeOpacity={0.85}
            style={[styles.actionBtn, styles.actionBtnRight, { backgroundColor: theme.correctLight, borderColor: theme.correct }]}
          >
            <Ionicons name="checkmark" size={20} color={theme.correct} />
            <Text style={[styles.actionBtnText, { color: theme.correct }]}>Biliyorum</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity onPress={handleFinish} style={styles.finishBtn}>
            <LinearGradient
              colors={['#6C63FF', '#9B5CF6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.finishGradient}
            >
              <Text style={styles.finishText}>Bitir ve Teste Geç</Text>
              <Ionicons name="chevron-forward" size={18} color="#fff" style={{ marginLeft: 6 }} />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
};

const CARD_HEIGHT = height * 0.44;

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  progressBg: { height: 8, borderRadius: radius.full, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radius.full },
  progressCount: { fontSize: 12, fontWeight: '600', marginTop: 4, textAlign: 'center' },
  skipText: { fontWeight: '600', fontSize: 14 },
  cardArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  cardWrapper: {
    position: 'absolute',
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  },
  card: {
    flex: 1,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    overflow: 'hidden',
  },
  cardBack: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    overflow: 'hidden',
  },
  cardDecor: {
    position: 'absolute',
    top: -80, right: -80,
    width: 200, height: 200,
    borderRadius: 100,
  },
  cardDecor2: {
    position: 'absolute',
    bottom: -60, left: -60,
    width: 160, height: 160,
    borderRadius: 80,
  },
  tapHint: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    marginBottom: spacing.xl,
    letterSpacing: 0.3,
  },
  wordText: {
    ...typography.word,
    textAlign: 'center',
    marginBottom: spacing.md,
    fontFamily: 'Inter_800ExtraBold',
  },
  levelDot: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    marginTop: spacing.md,
  },
  levelDotText: { fontSize: 12, fontWeight: '700', fontFamily: 'Inter_700Bold' },
  meaningText: {
    fontSize: 36,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    marginBottom: spacing.lg,
    fontFamily: 'Inter_800ExtraBold',
  },
  sentenceBg: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: radius.lg,
    padding: spacing.md,
    maxWidth: '92%',
  },
  sentenceText: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 15,
    fontStyle: 'italic',
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 22,
  },
  speakHitArea: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  speakRing: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  speakBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeLabel: {
    position: 'absolute',
    top: 20,
    zIndex: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radius.full,
  },
  swipeLabelLeft: { left: 16, backgroundColor: 'rgba(239,68,68,0.90)' },
  swipeLabelRight: { right: 16, backgroundColor: 'rgba(16,185,129,0.90)' },
  swipeLabelText: { color: '#fff', fontWeight: '700', fontSize: 13, fontFamily: 'Inter_700Bold' },
  actionRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md + 2,
    borderRadius: radius.lg,
    borderWidth: 2,
    gap: spacing.xs,
  },
  actionBtnLeft: {},
  actionBtnRight: {},
  actionBtnText: { fontSize: 16, fontWeight: '700', fontFamily: 'Inter_700Bold' },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    paddingTop: spacing.xs,
  },
  finishBtn: { borderRadius: radius.full, overflow: 'hidden' },
  finishGradient: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  finishText: { color: '#fff', fontSize: 16, fontWeight: '700', fontFamily: 'Inter_700Bold' },
});