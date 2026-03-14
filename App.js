import 'react-native-gesture-handler';
import React, { useEffect, useCallback, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Platform } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { AppProvider } from './src/context/AppContext';
import { AppNavigator } from './src/navigation/AppNavigator';

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
    const { status } = await Notifications.requestPermissionsAsync();
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

  useEffect(() => {
    async function prepare() {
      try {
        // Schedule notifications in background
        scheduleDailyStreakReminder();
        // Add any other async setup here (font loading, etc.)
        // Small artificial delay to ensure AppContext hydrates before showing UI
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (e) {
        console.warn('App prepare error:', e);
      } finally {
        setAppReady(true);
      }
    }
    prepare();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (appReady) {
      // Hide splash screen once app is ready
      await SplashScreen.hideAsync().catch(() => {});
    }
  }, [appReady]);

  if (!appReady) {
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
