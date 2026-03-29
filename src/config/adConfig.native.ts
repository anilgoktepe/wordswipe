/**
 * adConfig.native.ts  (iOS + Android)
 *
 * Central source of truth for all AdMob unit IDs and ad frequency limits.
 * Metro automatically picks this file over adConfig.ts on native targets.
 *
 * ─── How to go to production ──────────────────────────────────────────────────
 *
 * 1. Banner unit IDs  → replace PRODUCTION_BANNER_IDS strings below
 * 2. Interstitial IDs → replace PRODUCTION_INTERSTITIAL_IDS strings below
 * 3. Rewarded IDs     → replace PRODUCTION_REWARDED_IDS strings below
 * 4. App IDs          → set via env vars in app.config.js (never commit):
 *      ADMOB_APP_ID_IOS      → ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX
 *      ADMOB_APP_ID_ANDROID  → ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX
 *
 * Get unit IDs from: https://apps.admob.com → Apps → Ad units → Create ad unit
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Platform } from 'react-native';
import { TestIds } from 'react-native-google-mobile-ads';

// ─── Banner unit IDs ──────────────────────────────────────────────────────────

const PRODUCTION_BANNER_IDS = {
  ios: 'ca-app-pub-XXXXXXXXXXXX/XXXXXXXX',
  android: 'ca-app-pub-6314763035298663/3330758658',
} as const;

/**
 * Active banner unit ID.
 * __DEV__ = true in Expo Go / dev-client → test ID used automatically.
 * __DEV__ = false in production builds   → real unit ID used automatically.
 */
export const BANNER_UNIT_ID: string = __DEV__
  ? TestIds.BANNER
  : Platform.OS === 'ios'
    ? PRODUCTION_BANNER_IDS.ios
    : PRODUCTION_BANNER_IDS.android;

// ─── Interstitial unit IDs ────────────────────────────────────────────────────

const PRODUCTION_INTERSTITIAL_IDS = {
  ios: 'ca-app-pub-XXXXXXXXXXXX/XXXXXXXX', //
  android: 'ca-app-pub-6314763035298663/6332060589',
} as const;

/**
 * Active interstitial unit ID.
 * Same __DEV__ auto-switch as the banner — no manual toggle needed.
 */
export const INTERSTITIAL_UNIT_ID: string = __DEV__
  ? TestIds.INTERSTITIAL
  : Platform.OS === 'ios'
    ? PRODUCTION_INTERSTITIAL_IDS.ios
    : PRODUCTION_INTERSTITIAL_IDS.android;

// ─── Rewarded unit IDs ────────────────────────────────────────────────────────

const PRODUCTION_REWARDED_IDS = {
  ios:     'ca-app-pub-XXXXXXXXXXXX/XXXXXXXX',
  android: 'ca-app-pub-XXXXXXXXXXXX/XXXXXXXX',
} as const;

/**
 * Active rewarded ad unit ID.
 * __DEV__ → Google's official test ID (never charges real money, always fills).
 * Production → real unit ID registered in AdMob.
 */
export const REWARDED_UNIT_ID: string = __DEV__
  ? TestIds.REWARDED
  : Platform.OS === 'ios'
    ? PRODUCTION_REWARDED_IDS.ios
    : PRODUCTION_REWARDED_IDS.android;

// ─── Frequency caps ───────────────────────────────────────────────────────────

/** Total ads (banner + interstitial combined) shown per calendar day per free user. */
export const MAX_DAILY_ADS = 2;

/**
 * Maximum interstitial ads shown per app session.
 * Prevents the interstitial from firing on every lesson completion
 * even when the daily cap hasn't been reached yet.
 */
export const MAX_SESSION_INTERSTITIALS = 1;
