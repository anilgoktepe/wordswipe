/**
 * AdBanner.native.tsx  (iOS + Android only)
 *
 * Metro automatically picks this file over AdBanner.tsx on all native targets.
 * The web bundle keeps using AdBanner.tsx (the placeholder), so react-native-
 * google-mobile-ads is never imported by the web bundler.
 *
 * ─── Before going to production ───────────────────────────────────────────────
 * 1. Replace the placeholder unit IDs below with your real AdMob banner unit
 *    IDs from https://apps.admob.com → Apps → Ad units.
 * 2. Replace the App IDs in app.json (androidAppId / iosAppId) with your real
 *    AdMob App IDs. The current values are Google's official test App IDs.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import { spacing } from '../utils/theme';

// ─── Ad unit IDs ──────────────────────────────────────────────────────────────
// __DEV__ is true when running via Metro (Expo Go / dev client).
// In production builds __DEV__ is false and the production IDs below are used.
const UNIT_ID = __DEV__
  ? TestIds.BANNER
  : Platform.OS === 'ios'
    ? 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX'   // ← replace with real iOS unit ID
    : 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX';  // ← replace with real Android unit ID

interface Props {
  /** Passed by ResultsScreen; unused here because BannerAd handles its own styling. */
  darkMode: boolean;
}

export const AdBanner: React.FC<Props> = () => {
  // Hide cleanly if the network request fails — no blank space left behind.
  const [adFailed, setAdFailed] = useState(false);

  if (adFailed) return null;

  return (
    <View style={styles.container}>
      <BannerAd
        unitId={UNIT_ID}
        size={BannerAdSize.BANNER}          // standard 320 × 50
        requestOptions={{
          // Request non-personalised ads to simplify GDPR compliance.
          // Remove or adjust once you add a proper consent flow.
          requestNonPersonalizedAdsOnly: true,
        }}
        onAdFailedToLoad={() => setAdFailed(true)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginTop: spacing.md,
  },
});
