/**
 * Shared haptic feedback utility.
 * All calls are no-ops on web (expo-haptics is native-only).
 */
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

function run(fn: () => void) {
  if (Platform.OS === 'web') return;
  try { fn(); } catch (_) {}
}

/** Subtle tap — button press, card tap */
export const hapticLight = () =>
  run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));

/** Medium thud — swipe commit, selection */
export const hapticMedium = () =>
  run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));

/** Heavy punch — major action */
export const hapticHeavy = () =>
  run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));

/** Success notification — correct answer, lesson complete */
export const hapticSuccess = () =>
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));

/** Error notification — wrong answer */
export const hapticError = () =>
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));

/** Warning notification — swipe "don't know" */
export const hapticWarning = () =>
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
