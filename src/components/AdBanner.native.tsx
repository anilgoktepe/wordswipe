/**
 * AdBanner.native.tsx  (iOS + Android only)
 *
 * Metro automatically picks this file over AdBanner.tsx on all native targets.
 * The web bundle keeps using AdBanner.tsx (the placeholder), so react-native-
 * google-mobile-ads is never imported by the web bundler.
 *
 * ─── To go to production ──────────────────────────────────────────────────────
 * All ad IDs are managed centrally in src/config/adConfig.ts.
 * App IDs (for app.json / EAS) are managed via env vars in app.config.js.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { spacing } from '../utils/theme';
import { BANNER_UNIT_ID } from '../config/adConfig';

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
        unitId={BANNER_UNIT_ID}
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
