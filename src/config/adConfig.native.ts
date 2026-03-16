/**
 * adConfig.ts
 *
 * Central source of truth for all AdMob configuration.
 *
 * ─── How to go to production ──────────────────────────────────────────────────
 *
 * Banner unit IDs (this file):
 *   Replace the PRODUCTION placeholder strings below with your real AdMob
 *   banner unit IDs from https://apps.admob.com → Apps → Ad units.
 *   One ID per platform (iOS / Android).
 *
 * App IDs (app.config.js):
 *   Set the following environment variables in your EAS build profile or
 *   CI/CD pipeline — do NOT commit real IDs to source control:
 *     ADMOB_APP_ID_IOS      → your iOS AdMob App ID
 *     ADMOB_APP_ID_ANDROID  → your Android AdMob App ID
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Platform } from 'react-native';
import { TestIds } from 'react-native-google-mobile-ads';

// ─── Banner unit IDs ──────────────────────────────────────────────────────────

/**
 * Google's official test unit IDs — safe to use in development and CI.
 * Never shown to real users in production builds.
 */
const TEST_BANNER_ID = TestIds.BANNER;

/**
 * Production unit IDs — replace with real values from AdMob before release.
 * Keep these strings in this file only; never scatter them across components.
 */
const PRODUCTION_BANNER_IDS = {
  ios:     'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX',   // ← replace before release
  android: 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX',  // ← replace before release
} as const;

/**
 * The banner unit ID to use at runtime.
 *
 * __DEV__ is true in Expo Go / dev-client and false in production builds,
 * so test IDs are automatically used during development without any manual
 * toggle — just replace the PRODUCTION_BANNER_IDS strings above when ready.
 */
export const BANNER_UNIT_ID: string = __DEV__
  ? TEST_BANNER_ID
  : Platform.OS === 'ios'
    ? PRODUCTION_BANNER_IDS.ios
    : PRODUCTION_BANNER_IDS.android;

// ─── Daily ad limits (kept here so the cap is easy to find and change) ────────

/** Maximum number of ads shown per calendar day to a free user. */
export const MAX_DAILY_ADS = 2;
