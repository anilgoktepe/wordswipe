/**
 * useInterstitialAd.native.ts  (iOS + Android)
 *
 * Hook that loads and shows an interstitial ad in a controlled way:
 *   - respects the shared daily cap (MAX_DAILY_ADS)
 *   - caps at MAX_SESSION_INTERSTITIALS per app session
 *   - never shown to premium users
 *   - dispatches RECORD_AD_SHOWN so the daily counter stays accurate
 *   - silently no-ops if the ad fails to load
 *
 * Usage (inside any screen component):
 *   const { showInterstitial } = useInterstitialAd();
 *   // call showInterstitial() at a natural break point, e.g. after a lesson
 *
 * Metro picks this file on native; useInterstitialAd.ts is the web no-op.
 */

import { useEffect, useRef } from 'react';
import {
  InterstitialAd,
  AdEventType,
} from 'react-native-google-mobile-ads';
import { useApp } from '../context/AppContext';
import {
  INTERSTITIAL_UNIT_ID,
  MAX_DAILY_ADS,
  MAX_SESSION_INTERSTITIALS,
} from '../config/adConfig';

// Module-level counter — resets to 0 each time the JS bundle is loaded
// (i.e. each cold start), which is exactly the "per session" scope we want.
let sessionInterstitialsShown = 0;

export function useInterstitialAd() {
  const { state, dispatch } = useApp();
  const adRef = useRef<InterstitialAd | null>(null);
  const loadedRef = useRef(false);

  // Pre-load the interstitial as soon as the hook mounts, but only if it
  // will potentially be eligible to show (skip the network request for
  // premium users or when both caps are already reached).
  useEffect(() => {
    const dailyCapReached = state.dailyAdsShown >= MAX_DAILY_ADS;
    const sessionCapReached = sessionInterstitialsShown >= MAX_SESSION_INTERSTITIALS;

    if (state.isPremium || dailyCapReached || sessionCapReached) return;

    const ad = InterstitialAd.createForAdRequest(INTERSTITIAL_UNIT_ID, {
      requestNonPersonalizedAdsOnly: true,
    });

    const unsubLoaded = ad.addAdEventListener(AdEventType.LOADED, () => {
      loadedRef.current = true;
    });

    const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
      // Count the impression only after the user dismisses — this matches
      // when the user has actually seen the ad.
      sessionInterstitialsShown += 1;
      dispatch({ type: 'RECORD_AD_SHOWN' });
      loadedRef.current = false;
    });

    ad.load();
    adRef.current = ad;

    return () => {
      unsubLoaded();
      unsubClosed();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Call this at a natural break point (e.g. after finishing a lesson).
   * It is safe to call even if the ad hasn't loaded yet — it will simply
   * no-op rather than throw.
   */
  function showInterstitial() {
    if (state.isPremium) return;
    if (state.dailyAdsShown >= MAX_DAILY_ADS) return;
    if (sessionInterstitialsShown >= MAX_SESSION_INTERSTITIALS) return;
    if (!loadedRef.current || !adRef.current) return;

    adRef.current.show();
  }

  return { showInterstitial };
}
