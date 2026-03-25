// ─── WordSwipe Monetization Utilities ──────────────────────────────────────
// Single source of truth for all free-tier caps and the rewarded-ad stub.
//
// When a real ad SDK is ready (e.g. Google AdMob, Unity Ads):
//   1. Remove the setTimeout mock inside showRewardedAd()
//   2. Initialise the SDK in App.tsx / app entry point
//   3. Replace the function body — the callback contract MUST stay the same so
//      every caller (HomeScreen, SentenceBuilderScreen, …) works without changes

// ─── Free-tier caps ──────────────────────────────────────────────────────────

/** Lesson sizes available without a subscription. 15 / 20 require Premium. */
export const FREE_LESSON_SIZES: readonly number[] = [5, 8, 10];

/** Full set of lesson sizes shown in the picker (last two are premium-gated). */
export const ALL_LESSON_SIZES: readonly number[] = [5, 8, 10, 15, 20];

/** Max words dispatched per session for free users (lesson / review / word-mgmt). */
export const FREE_SESSION_CAP = 10;

/** Max words in a Sentence Builder queue for free users. */
export const FREE_SENTENCE_SESSION_CAP = 5;

/** Max rewarded detailed AI analyses a free user may unlock per calendar day. */
export const FREE_DAILY_AI_ANALYSES = 1;

// ─── Mock Rewarded Ad ────────────────────────────────────────────────────────
// This function is the SINGLE integration point for a real ad SDK.
//
// Real AdMob (react-native-google-mobile-ads) integration example:
//
//   import { RewardedAd, RewardedAdEventType, AdEventType } from
//     'react-native-google-mobile-ads';
//   const AD_UNIT_ID = 'ca-app-pub-XXXXXX/YYYYYYYY';
//
//   export function showRewardedAd(onResult: RewardedAdCallback): void {
//     const ad = RewardedAd.createForAdRequest(AD_UNIT_ID, {
//       requestNonPersonalizedAdsOnly: true,
//     });
//     ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => onResult(true));
//     ad.addAdEventListener(AdEventType.CLOSED, () => onResult(false));
//     ad.addAdEventListener(AdEventType.ERROR, () => onResult(false));
//     ad.load();
//     // Auto-shows after load via the SDK's built-in listener.
//   }

export type RewardedAdCallback = (rewarded: boolean) => void;

/**
 * Show a rewarded ad. Calls `onResult(true)` when the user earns the reward,
 * `onResult(false)` when the ad is skipped or fails.
 *
 * CURRENT IMPLEMENTATION: mock — simulates a 2-second ad that always rewards.
 * Replace with the real SDK call above when integrating.
 */
export function showRewardedAd(onResult: RewardedAdCallback): void {
  // ── MOCK — replace this entire body with the real SDK call ─────────────────
  setTimeout(() => onResult(true), 2000);
}
