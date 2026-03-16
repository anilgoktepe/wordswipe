/**
 * curiosityNotification.ts
 *
 * Daily "do you know this word?" challenge notification.
 *
 * Responsibilities:
 *  - Pick the most useful word based on the user's state (unseen → difficult → review-due)
 *  - Build a randomised notification text for that word
 *  - Schedule a one-time notification for 9:00 AM (next available)
 *
 * This file contains only pure logic + scheduling.
 * Navigation on tap is handled in AppNavigator.tsx.
 */

import { Platform } from 'react-native';
import { Word, getWordsByLevel } from '../data/vocabulary';
import { AppState } from '../context/AppContext';

// ── Stable identifier so only one challenge notification exists at a time ──────
export const CHALLENGE_NOTIF_ID = 'ws_daily_challenge';

// ── Notification text templates ────────────────────────────────────────────────
// Each template is a function that receives the English word and returns
// title + body strings (all in Turkish, the app's UI language).
const TEMPLATES: Array<(word: string) => { title: string; body: string }> = [
  w => ({
    title: '🤔 Bu kelimeyi biliyor musun?',
    body: `"${w}" ne anlama geliyor? Test etmek için dokun!`,
  }),
  w => ({
    title: '📚 Günün Kelimesi',
    body: `"${w}" kelimesinin Türkçe karşılığını biliyor musun?`,
  }),
  w => ({
    title: '🧠 Hızlı Kelime Testi',
    body: `"${w}" — anlamını tahmin edebilir misin?`,
  }),
  w => ({
    title: '✨ Bugünün Meydan Okuması',
    body: `"${w}" kelimesini cümlede kullanabilir misin?`,
  }),
  w => ({
    title: '🎯 Hızlı Soru',
    body: `"${w}" Türkçede ne demek? Hemen öğren!`,
  }),
];

// ── Word selection ─────────────────────────────────────────────────────────────
/**
 * Pick the most pedagogically useful word to challenge the user with.
 *
 * Priority (highest → lowest):
 *  1. Unseen words   — words the user has never encountered
 *  2. Difficult words due for review (isDifficult + nextReviewAt ≤ now)
 *  3. Any word whose SRS interval has expired (nextReviewAt ≤ now)
 *  4. Random word from the level pool (all reviews still in the future)
 */
export function pickChallengeWord(state: AppState): Word | null {
  if (!state.level) return null;

  const now        = Date.now();
  const wp         = state.wordProgress;
  const levelWords = getWordsByLevel(state.level);

  if (levelWords.length === 0) return null;

  // Priority 1 — never-seen words (not present in wordProgress at all)
  const unseen = levelWords.filter(w => !wp[w.id]);
  if (unseen.length > 0) {
    return unseen[Math.floor(Math.random() * unseen.length)];
  }

  // Priority 2 — difficult words whose review is overdue
  const difficultDue = levelWords.filter(
    w => wp[w.id]?.isDifficult && wp[w.id].nextReviewAt <= now,
  );
  if (difficultDue.length > 0) {
    return difficultDue[Math.floor(Math.random() * difficultDue.length)];
  }

  // Priority 3 — any word scheduled for review today
  const reviewDue = levelWords.filter(
    w => wp[w.id] && wp[w.id].nextReviewAt <= now,
  );
  if (reviewDue.length > 0) {
    return reviewDue[Math.floor(Math.random() * reviewDue.length)];
  }

  // Priority 4 — fallback: random word from the level (all SRS intervals in the future)
  return levelWords[Math.floor(Math.random() * levelWords.length)];
}

// ── Notification content ───────────────────────────────────────────────────────
export function buildChallengeContent(word: Word): { title: string; body: string } {
  const template = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
  return template(word.word);
}

// ── Scheduling ─────────────────────────────────────────────────────────────────
/**
 * Cancel any existing challenge notification and schedule a fresh one for the
 * next 9:00 AM (if it's already past 9 AM today, schedule for tomorrow).
 *
 * The notification carries `data: { type: 'challenge', wordId: number }` so
 * AppNavigator can deep-link directly to the quiz for that word on tap.
 *
 * Safe to call on every app open — the fixed CHALLENGE_NOTIF_ID ensures at
 * most one challenge notification is queued in the system at any time.
 *
 * No-ops silently on web and when permissions are denied.
 */
export async function scheduleDailyChallengeNotification(word: Word): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const Notif = await import('expo-notifications');

    // Check permissions — don't schedule if not granted
    const { status } = await Notif.getPermissionsAsync();
    if (status !== 'granted') return;

    // Cancel the previous challenge notification (no-op if it already fired)
    await Notif.cancelScheduledNotificationAsync(CHALLENGE_NOTIF_ID).catch(() => {});

    // Find the next 9:00 AM
    const now    = new Date();
    const target = new Date();
    target.setHours(9, 0, 0, 0);
    if (now >= target) {
      // Already past 9 AM today — push to tomorrow
      target.setDate(target.getDate() + 1);
    }

    const secondsUntil = Math.max(
      Math.floor((target.getTime() - Date.now()) / 1000),
      60, // minimum 60-second buffer to avoid immediate firing
    );

    const content = buildChallengeContent(word);

    await Notif.scheduleNotificationAsync({
      identifier: CHALLENGE_NOTIF_ID,
      content: {
        title: content.title,
        body:  content.body,
        sound: true,
        data:  { type: 'challenge', wordId: word.id },
      },
      trigger: {
        type:    Notif.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: secondsUntil,
        repeats: false,
      },
    });
  } catch (_) {
    // Silently ignore: permissions denied, simulator limitations, etc.
  }
}
