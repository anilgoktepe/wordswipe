/**
 * src/services/rewardedAdService.ts  (web / non-native fallback)
 *
 * Metro picks rewardedAdService.native.ts for iOS/Android (real AdMob).
 * This file is used by the web bundle where react-native-google-mobile-ads
 * is unavailable.
 *
 * Both functions are safe no-ops:
 *   isRewardedAdReady() → always false  (no ad available on web)
 *   showRewardedAd()    → calls onResult(false) synchronously (no reward granted)
 *
 * They are exported only so TypeScript is satisfied when type-checking files
 * that import from this module path — no runtime ad behavior occurs on web.
 */

export type RewardedAdCallback = (rewarded: boolean) => void;

/** Always false on web — rewarded ads are native-only. */
export function isRewardedAdReady(): boolean {
  return false;
}

/**
 * No-op on web.  Immediately calls onResult(false) so callers handle the
 * "no reward" path and the UI is never left in a loading state.
 */
export function showRewardedAd(onResult: RewardedAdCallback): void {
  onResult(false);
}
