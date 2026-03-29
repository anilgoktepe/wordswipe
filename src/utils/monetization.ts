// ─── WordSwipe Monetization Utilities ────────────────────────────────────────
// Single source of truth for all free-tier caps and rewarded-ad entry points.
//
// Rewarded ad implementation: src/services/rewardedAdService{.native}.ts
//   • Native (iOS/Android) → real AdMob RewardedAd via react-native-google-mobile-ads
//   • Web                  → safe no-op stub (always returns false)
//
// Callers (HomeScreen, SentenceBuilderScreen) import showRewardedAd and
// isRewardedAdReady from here — the platform split is invisible to them.

// ─── Free-tier caps ──────────────────────────────────────────────────────────

/** Lesson sizes available without a subscription. Only 5 for free users; 8+ require Premium. */
export const FREE_LESSON_SIZES: readonly number[] = [5];

/** Full set of lesson sizes shown in the picker (all but 5 are premium-gated for free users). */
export const ALL_LESSON_SIZES: readonly number[] = [5, 8, 10, 15, 20];

/** Max words dispatched per session for free users (lesson / review / word-mgmt).
 *  Free users get 5-word lessons. The rewarded +5 bonus raises this to 10 for one session. */
export const FREE_SESSION_CAP = 5;

/** Max words in a Sentence Builder queue for free users. */
export const FREE_SENTENCE_SESSION_CAP = 5;

/** Max rewarded detailed AI analyses a free user may unlock per calendar day. */
export const FREE_DAILY_AI_ANALYSES = 3;

// ─── Rewarded Ad ─────────────────────────────────────────────────────────────
//
// The implementation lives in src/services/rewardedAdService:
//   • rewardedAdService.native.ts  — real AdMob rewarded ad (iOS + Android)
//   • rewardedAdService.ts         — web stub (always returns false, no-op)
//
// Metro automatically selects the correct file for each platform.
// All callers import from this module — no ad SDK code scattered elsewhere.

export type {
  RewardedAdCallback,
} from '../services/rewardedAdService';

export {
  showRewardedAd,
  isRewardedAdReady,
} from '../services/rewardedAdService';
