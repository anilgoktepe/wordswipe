/**
 * adConfig.ts  (web fallback)
 *
 * Metro picks adConfig.native.ts for iOS/Android (real AdMob constants).
 * This file is used by the web bundle where react-native-google-mobile-ads
 * is unavailable.
 *
 * BANNER_UNIT_ID and INTERSTITIAL_UNIT_ID are empty strings here — they are
 * never called on web (AdBanner.native.tsx and useInterstitialAd.native.ts
 * are both excluded from the web bundle by Metro's platform extension rules).
 * They are exported only so TypeScript is satisfied when type-checking
 * files that import from this module path.
 */

/** Never used on web; exists for TypeScript type parity with adConfig.native.ts. */
export const BANNER_UNIT_ID = '';

/** Never used on web; exists for TypeScript type parity with adConfig.native.ts. */
export const INTERSTITIAL_UNIT_ID = '';

/** Total ads (banner + interstitial combined) shown per calendar day per free user. */
export const MAX_DAILY_ADS = 2;

/** Maximum interstitial ads shown per app session. */
export const MAX_SESSION_INTERSTITIALS = 1;
