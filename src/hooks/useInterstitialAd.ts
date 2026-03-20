/**
 * useInterstitialAd.ts  (web fallback)
 *
 * Metro picks useInterstitialAd.native.ts on iOS/Android (real interstitial).
 * This file is used by the web bundle where react-native-google-mobile-ads
 * is unavailable. It exports a safe no-op so web dev / web preview keep working.
 */

export function useInterstitialAd() {
  return {
    /** No-op on web — interstitial ads are native-only. */
    showInterstitial: () => {},
  };
}
