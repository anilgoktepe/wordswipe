import React, { useEffect, useRef, useCallback } from 'react';
import { View, ActivityIndicator, Platform } from 'react-native';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useApp } from '../context/AppContext';
import { getLocalWords } from '../services/vocabularyService';
import { LevelSelectionScreen } from '../screens/LevelSelectionScreen';
import { FlashcardScreen } from '../screens/FlashcardScreen';
import { QuizScreen } from '../screens/QuizScreen';
import { ResultsScreen } from '../screens/ResultsScreen';
import { DifficultWordsScreen } from '../screens/DifficultWordsScreen';
import { SentenceBuilderScreen } from '../screens/SentenceBuilderScreen';
import { PremiumScreen } from '../screens/PremiumScreen';
import { TabNavigator } from './TabNavigator';
import {
  pickChallengeWord,
  scheduleDailyChallengeNotification,
} from '../services/curiosityNotification';

const vocabulary = getLocalWords();

export type RootStackParamList = {
  LevelSelection: undefined;
  Main: undefined;
  Flashcard: undefined;
  Quiz: undefined;
  Results: undefined;
  DifficultWords: undefined;
  Settings: undefined;
  SentenceBuilder: undefined;
  Premium: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export const AppNavigator: React.FC = () => {
  const { state, isLoaded, dispatch } = useApp();
  const navigationRef = useNavigationContainerRef<RootStackParamList>();

  /**
   * Stores a wordId from a tapped challenge notification.
   * Used to survive the async gap between notification tap and state/nav readiness.
   */
  const pendingChallengeWordId = useRef<number | null>(null);

  // ── Navigate to quiz for the challenge word ──────────────────────────────────
  // Wrapped in useCallback so it can be called safely from both effects.
  // dispatch and navigationRef are stable references (never change after mount).
  const navigateToChallenge = useCallback(
    (wordId: number) => {
      const word = vocabulary.find(w => w.id === wordId);
      if (!word) {
        pendingChallengeWordId.current = null;
        return;
      }

      // Set this word as the sole session word so the quiz tests only it
      dispatch({ type: 'SET_SESSION_WORDS', words: [word] });
      pendingChallengeWordId.current = null;

      // Poll until NavigationContainer is ready instead of relying on a fixed delay.
      // Retries every 50 ms for up to 2 seconds, then gives up gracefully.
      let attempts = 0;
      const tryNavigate = () => {
        try {
          if (navigationRef.isReady()) {
            navigationRef.navigate('Quiz');
            return;
          }
        } catch (_) {
          // isReady() threw — container not yet mounted
        }
        if (attempts < 40) {
          attempts++;
          setTimeout(tryNavigate, 50);
        }
      };
      tryNavigate();
    },
    [dispatch, navigationRef],
  );

  // ── Schedule today's challenge notification ──────────────────────────────────
  // Runs once after the persisted state is loaded, ensuring the word is chosen
  // from the user's actual progress (unseen → difficult → review-due → random).
  // Safe to run on every app open: scheduleDailyChallengeNotification cancels
  // and replaces the previous notification using a stable identifier.
  useEffect(() => {
    if (!isLoaded || !state.level || Platform.OS === 'web') return;
    const word = pickChallengeWord(state);
    if (word) {
      scheduleDailyChallengeNotification(word);
    }
  }, [isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps
  // Intentionally only re-run when isLoaded flips true (once per session).

  // ── Notification tap handler ─────────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS === 'web') return;

    let responseSubscription: { remove: () => void } | null = null;

    (async () => {
      try {
        const Notif = await import('expo-notifications');

        // ── Case 1: app was killed and user tapped the notification to launch it ──
        // getLastNotificationResponseAsync returns the tap that cold-started the app.
        // We guard with a 30-second freshness check to avoid stale navigation when
        // the user opens the app normally (without tapping a notification).
        const lastResponse = await Notif.getLastNotificationResponseAsync();
        if (lastResponse) {
          const data = lastResponse.notification.request.content.data;
          if (data?.type === 'challenge' && typeof data?.wordId === 'number') {
            // Normalise notification.date: iOS returns seconds, some environments ms
            const rawDate = lastResponse.notification.date;
            const notifMs = rawDate > 1e12 ? rawDate : rawDate * 1000;
            const ageMs   = Date.now() - notifMs;

            if (ageMs < 30_000) {
              // Fresh tap — store and process once state is confirmed loaded
              pendingChallengeWordId.current = data.wordId as number;
            }
          }
        }

        // ── Case 2: app is already running (background or foreground) ────────────
        // The listener fires immediately when the user taps the notification banner.
        // State is already loaded at this point, so navigate directly.
        responseSubscription = Notif.addNotificationResponseReceivedListener(response => {
          const data = response.notification.request.content.data;
          if (data?.type === 'challenge' && typeof data?.wordId === 'number') {
            navigateToChallenge(data.wordId as number);
          }
        });
      } catch (_) {
        // expo-notifications unavailable (e.g., bare workflow without permissions)
      }
    })();

    return () => {
      responseSubscription?.remove();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Process pending tap once state is loaded (killed-app path) ───────────────
  useEffect(() => {
    if (!isLoaded || pendingChallengeWordId.current === null) return;
    navigateToChallenge(pendingChallengeWordId.current);
  }, [isLoaded, navigateToChallenge]);

  // ── Loading screen ────────────────────────────────────────────────────────────
  if (!isLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F7FA' }}>
        <ActivityIndicator size="large" color="#6C63FF" />
      </View>
    );
  }

  const hasLevel = !!state.level;

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        initialRouteName={hasLevel ? 'Main' : 'LevelSelection'}
        screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
      >
        <Stack.Screen name="LevelSelection" component={LevelSelectionScreen} />
        {/* Main is the Tab Navigator */}
        <Stack.Screen name="Main" component={TabNavigator} options={{ animation: 'fade' }} />
        <Stack.Screen
          name="Flashcard"
          component={FlashcardScreen}
          options={{ animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="Quiz"
          component={QuizScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="Results"
          component={ResultsScreen}
          options={{ animation: 'fade' }}
        />
        <Stack.Screen
          name="DifficultWords"
          component={DifficultWordsScreen}
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="SentenceBuilder"
          component={SentenceBuilderScreen}
          options={{ animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="Premium"
          component={PremiumScreen}
          options={{ animation: 'slide_from_bottom' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
