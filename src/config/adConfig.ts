/**
 * adConfig.ts  (web fallback)
 *
 * Metro picks adConfig.native.ts for iOS/Android (real AdMob constants).
 * This file is used by the web bundle where react-native-google-mobile-ads
 * is unavailable. It exports only the values that are safe on all platforms.
 *
 * BANNER_UNIT_ID is not exported here — it is native-only and only used by
 * AdBanner.native.tsx which the web bundler never imports.
 */

/** Maximum number of ads shown per calendar day to a free user. */
export const MAX_DAILY_ADS = 2;
