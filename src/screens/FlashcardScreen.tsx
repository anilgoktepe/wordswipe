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
  Modal,
  BackHandler,
  Image,
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
            {word.exampleTr ? (
              <Text style={styles.exampleTrText}>"{word.exampleTr}"</Text>
            ) : null}
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
  const [showExitModal, setShowExitModal] = useState(false);
  const [showKnowHintModal, setShowKnowHintModal] = useState(false);
  const [showSwipeHint, setShowSwipeHint] = useState(!state.hasSeenSwipeHint);
  const swipeHintAnim = useRef(new Animated.Value(0)).current;
  const knowHintFromSwipeRef = useRef(false);
  const { showInterstitial } = useInterstitialAd();

  const words = state.sessionWords.length > 0 ? state.sessionWords : getDailyWords();

  // Tracks the self-rating the user gave each word during the flashcard phase.
  // Passed to QuizScreen so the SRS policy can account for (un)confidence.
  const selfRatingsRef = useRef<Record<number, 'know' | 'dont_know'>>({});

  useEffect(() => {
    if (words.length > 0) {
      prefetchEnrichments(words.map(w => w.word));
    }
  }, [words.length, words]);

  // Intercept Android hardware back button
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setShowExitModal(true);
      return true; // consume the event
    });
    return () => sub.remove();
  }, []);

  // Intercept iOS gesture / React Navigation back (beforeRemove fires before pop)
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e: any) => {
      // Only intercept default back actions (gesture / header back).
      // navigate() and replace() have their own e.data.action.type.
      if (e.data.action.type !== 'GO_BACK') return;
      e.preventDefault();
      setShowExitModal(true);
    });
    return unsub;
  }, [navigation]);

  useEffect(() => {
    if (!showSwipeHint) return;
    Animated.timing(swipeHintAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(swipeHintAnim, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => {
        setShowSwipeHint(false);
        dispatch({ type: 'MARK_SWIPE_HINT_SEEN' });
      });
    }, 3000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markKnowHintSeen = useCallback(() => {
    if (!state.hasSeenKnowHint) {
      dispatch({ type: 'MARK_KNOW_HINT_SEEN' });
    }
  }, [state.hasSeenKnowHint, dispatch]);

  const finishLesson = useCallback((seenUpToIndex: number) => {
    const seenWords = words.slice(0, seenUpToIndex + 1);
    dispatch({ type: 'SET_LAST_LESSON_WORDS', wordIds: seenWords.map(w => w.id) });
    // XP and streak are awarded in QuizScreen after validated learning — not here.
    navigation.navigate('Quiz', { selfRatings: selfRatingsRef.current });
  }, [words, dispatch, navigation]);

  const handleNext = useCallback(() => {
    if (currentIndex < words.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      finishLesson(currentIndex);
    }
  }, [currentIndex, words.length, finishLesson]);

  const handleFinish = useCallback(async () => {
    await showInterstitial();
    finishLesson(currentIndex);
  }, [currentIndex, finishLesson, showInterstitial]);

  const handleSwipeRight = useCallback(() => {
    setShowSwipeHint(false);
    selfRatingsRef.current[words[currentIndex].id] = 'know';
    if (!state.hasSeenKnowHint) {
      // Card already flew off — modal will call handleNext when user confirms
      knowHintFromSwipeRef.current = true;
      setShowKnowHintModal(true);
      return;
    }
    handleNext();
  }, [currentIndex, words, handleNext, state.hasSeenKnowHint]);

  const handleSwipeLeft = useCallback(() => {
    setShowSwipeHint(false);
    selfRatingsRef.current[words[currentIndex].id] = 'dont_know';
    handleNext();
  }, [currentIndex, words, handleNext]);

  const dismissSwipeHint = useCallback(() => {
    if (!showSwipeHint) return;
    setShowSwipeHint(false);
    dispatch({ type: 'MARK_SWIPE_HINT_SEEN' });
  }, [showSwipeHint, dispatch]);

  const handleKnow = () => {
    if (swipeCommand) return;
    dismissSwipeHint();
    if (!state.hasSeenKnowHint) {
      knowHintFromSwipeRef.current = false;
      setShowKnowHintModal(true);
      return;
    }
    haptic('success');
    setSwipeCommand('right');
  };

  const handleDontKnow = () => {
    if (swipeCommand) return;
    dismissSwipeHint();
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
          <TouchableOpacity onPress={() => setShowExitModal(true)} style={styles.backBtn}>
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
                <View style={[styles.card, { backgroundColor: theme.card }, shadows.sm]}>
                  <Text style={[styles.wordText, { color: theme.text, marginBottom: 0 }]} numberOfLines={1}>
                    {words[idx].word}
                  </Text>
                </View>
              </View>
            );
          })}

          {currentIndex < words.length && (
            <FlashCard
              key={currentIndex}
              word={words[currentIndex]}
              theme={theme}
              isTop={true}
              onSwipeLeft={handleSwipeLeft}
              onSwipeRight={handleSwipeRight}
              swipeCommand={swipeCommand}
              onSwipeCommandDone={handleSwipeCommandDone}
            />
          )}

          {showSwipeHint && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.swipeHintOverlay,
                {
                  opacity: swipeHintAnim,
                  transform: [{
                    scale: swipeHintAnim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }),
                  }],
                },
              ]}
            >
              <View style={styles.swipeHintCol}>
                <Image
                  source={require('../../assets/swipe-left.png')}
                  style={styles.swipeHintIcon}
                  resizeMode="contain"
                />
                <Text style={[styles.swipeHintLabel, styles.swipeHintLabelLeft]}>Bilmiyorsan sola</Text>
              </View>
              <View style={styles.swipeHintDivider} />
              <View style={styles.swipeHintCol}>
                <Image
                  source={require('../../assets/swipe-right.png')}
                  style={styles.swipeHintIcon}
                  resizeMode="contain"
                />
                <Text style={[styles.swipeHintLabel, styles.swipeHintLabelRight]}>Biliyorsan sağa</Text>
              </View>
            </Animated.View>
          )}
        </View>

        <Text style={styles.swipeHelperText}>Kaydır veya butonları kullan</Text>

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

      {/* ── Exit confirmation modal ──────────────────────────────────────────── */}
      <Modal
        visible={showExitModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowExitModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Ops</Text>
            <Text style={[styles.modalMessage, { color: theme.textSecondary }]}>
              Sadece {words.length - currentIndex} kelime kaldı.
            </Text>
            <TouchableOpacity
              onPress={() => setShowExitModal(false)}
              style={[styles.modalBtnPrimary, { backgroundColor: theme.primary }]}
            >
              <Text style={styles.modalBtnPrimaryText}>Öğrenmeye Devam</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setShowExitModal(false);
                navigation.navigate('Main');
              }}
              style={styles.modalBtnSecondary}
            >
              <Text style={[styles.modalBtnSecondaryText, { color: theme.textSecondary }]}>Yine de çık</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── First-time "Biliyorum" hint modal ───────────────────────────────── */}
      <Modal
        visible={showKnowHintModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowKnowHintModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Biliyor musun?</Text>
            <Text style={[styles.modalMessage, { color: theme.textSecondary }]}>
              Bu kelimeyi bildiğin için, testlerde ve tekrarlarda daha az karşına çıkaracağız.{'\n\n'}
              Pratik yapmak istiyorsan "Öğrenmeye başla" seçeneğini kullanabilirsin.
            </Text>
            <TouchableOpacity
              onPress={() => {
                setShowKnowHintModal(false);
                markKnowHintSeen();
                haptic('success');
                if (knowHintFromSwipeRef.current) {
                  knowHintFromSwipeRef.current = false;
                  handleNext(); // card already flew off; just advance
                } else {
                  setSwipeCommand('right');
                }
              }}
              style={[styles.modalBtnPrimary, { backgroundColor: theme.correct }]}
            >
              <Text style={styles.modalBtnPrimaryText}>Evet, bu kelimeyi iyi biliyorum</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setShowKnowHintModal(false);
                markKnowHintSeen();
                haptic('warning');
                if (knowHintFromSwipeRef.current) {
                  knowHintFromSwipeRef.current = false;
                  selfRatingsRef.current[words[currentIndex].id] = 'dont_know';
                  handleNext();
                } else {
                  setSwipeCommand('left');
                }
              }}
              style={[styles.modalBtnPrimary, { backgroundColor: theme.primary, marginTop: spacing.sm }]}
            >
              <Text style={styles.modalBtnPrimaryText}>Öğrenmeye başla</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setShowKnowHintModal(false);
                if (knowHintFromSwipeRef.current) {
                  // Card already gone — must advance regardless
                  knowHintFromSwipeRef.current = false;
                  handleNext();
                }
              }}
              style={styles.modalBtnSecondary}
            >
              <Text style={[styles.modalBtnSecondaryText, { color: theme.textSecondary }]}>İptal</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  exampleTrText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 13,
    fontStyle: 'italic',
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 19,
    marginTop: spacing.xs,
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
  swipeHintOverlay: {
    position: 'absolute',
    bottom: spacing.lg + 12,
    left: spacing.xl,
    right: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: radius.xl,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.lg,
    zIndex: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 8,
    elevation: 4,
  },
  swipeHintCol: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  swipeHintDivider: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(0,0,0,0.10)',
    marginHorizontal: spacing.sm,
  },
  swipeHintIcon: {
    width: 34,
    height: 34,
  },
  swipeHintLabel: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
  },
  swipeHintLabelLeft: {
    color: '#EF4444',
  },
  swipeHintLabelRight: {
    color: '#10B981',
  },
  swipeHelperText: {
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    color: 'rgba(120,120,140,0.70)',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  modalCard: {
    width: '100%',
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'stretch',
    ...shadows.lg,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: 'Inter_800ExtraBold',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  modalMessage: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  modalBtnPrimary: {
    borderRadius: radius.lg,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
  },
  modalBtnPrimaryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
  modalBtnSecondary: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  modalBtnSecondaryText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
  },
});