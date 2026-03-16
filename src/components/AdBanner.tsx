/**
 * AdBanner.tsx  (web fallback)
 *
 * Metro picks AdBanner.native.tsx for iOS/Android (real BannerAd).
 * This file is used by the web/webpack bundle where react-native-google-
 * mobile-ads is unavailable. It renders a simple visual placeholder so
 * the ResultsScreen layout looks correct during web development.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getTheme, spacing, radius } from '../utils/theme';

interface Props {
  darkMode: boolean;
}

export const AdBanner: React.FC<Props> = ({ darkMode }) => {
  const theme = getTheme(darkMode);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
      ]}
    >
      <Text style={[styles.label, { color: theme.textTertiary }]}>SPONSORED</Text>
      <Text style={[styles.placeholder, { color: theme.textSecondary }]}>
        Ad placeholder — here an ad will appear.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: radius.md,
    borderStyle: 'dashed',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: spacing.xs,
  },
  placeholder: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
});
