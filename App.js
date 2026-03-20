import 'react-native-gesture-handler';
import React, { useEffect, useCallback, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Platform } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import { AppProvider } from './src/context/AppContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { SoundService } from './src/utils/sound';

// Keep the splash screen visible while we load resources
SplashScreen.preventAutoHideAsync().catch(() => {
  // Fails gracefully on web
});

// Schedule daily streak reminder notification (native only)
async function scheduleDailyStreakReminder() {
  if (Platform.OS === 'web') return;
  try {
    const Notifications = await import('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    // Check existing permission before prompting to avoid repeated iOS dialogs.
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let status = existingStatus;
    if (existingStatus !== 'granted') {
      const { status: askedStatus } = await Notifications.requestPermissionsAsync();
      status = askedStatus;
    }
    if (status !== 'granted') return;
    await Notifications.cancelAllScheduledNotificationsAsync();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🔥 Serini koru!',
        body: 'Bugün henüz ders çalışmadın. Serini kırmayalım, hadi devam edelim!',
        sound: true,
      },
      trigger: { hour: 20, minute: 0, repeats: true },
    });
  } catch (e) {
    // Notifications not available in this environment
  }
}

export default function App() {
  const [appReady, setAppReady] = useState(false);

  // Load all Inter weights used across the typography system.
  // useFonts returns [loaded, error]; splash stays visible until loaded = true.
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  useEffect(() => {
    async function prepare() {
      try {
        // Schedule notifications in background
        scheduleDailyStreakReminder();
        // Preload native sounds (no-op on web)
        SoundService.init();
        // Small delay to ensure AppContext hydrates before showing UI
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (e) {
        console.warn('App prepare error:', e);
      } finally {
        setAppReady(true);
      }
    }
    prepare();
  }, []);

  // Hide splash only when BOTH fonts are loaded AND app state is ready.
  const onLayoutRootView = useCallback(async () => {
    if (appReady && fontsLoaded) {
      await SplashScreen.hideAsync().catch(() => {});
    }
  }, [appReady, fontsLoaded]);

  // Keep splash visible until everything is ready — no flash of unstyled text.
  if (!appReady || !fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={styles.container} onLayout={onLayoutRootView}>
      <AppProvider>
        <AppNavigator />
        <StatusBar style="auto" />
      </AppProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
