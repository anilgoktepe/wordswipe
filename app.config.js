/**
 * app.config.js
 *
 * Dynamic Expo config that merges with app.json.
 * Injects secrets from environment variables so production IDs are never
 * committed to source control.
 *
 * ─── How to obtain each value ─────────────────────────────────────────────────
 *
 * EXPO_PROJECT_ID
 *   1. Run `eas init` in the project root — EAS CLI creates the project on
 *      expo.dev and writes the ID here automatically, OR
 *   2. Go to https://expo.dev → your account → Projects → WordSwipe →
 *      copy the UUID shown in the project URL or dashboard.
 *
 * ADMOB_APP_ID_IOS / ADMOB_APP_ID_ANDROID
 *   https://apps.admob.com → Apps → your app → App settings → App ID
 *   Format: ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX  (note the tilde ~)
 *
 * ─── Where to set them ────────────────────────────────────────────────────────
 *
 * EAS builds (recommended):
 *   expo.dev → Project → Secrets → add each key as a secret
 *
 * Local production build:
 *   EXPO_PROJECT_ID=xxxx ADMOB_APP_ID_IOS=ca-app-pub-... eas build --platform ios
 *
 * Development (no env vars needed):
 *   Falls back to safe placeholder / test values automatically.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── EAS / Expo project ───────────────────────────────────────────────────────
// Set EXPO_PROJECT_ID via env var or EAS secret.
// Leaving it undefined is fine for local development; EAS builds require it.
const projectId = process.env.EXPO_PROJECT_ID ?? undefined;

// ─── AdMob App IDs ────────────────────────────────────────────────────────────
// Google's official test App IDs — safe fallback for dev / CI.
const TEST_APP_ID_IOS     = 'ca-app-pub-3940256099942544~1458002511';
const TEST_APP_ID_ANDROID = 'ca-app-pub-3940256099942544~3347511713';

const iosAppId     = process.env.ADMOB_APP_ID_IOS     ?? TEST_APP_ID_IOS;
const androidAppId = process.env.ADMOB_APP_ID_ANDROID ?? TEST_APP_ID_ANDROID;

// ─────────────────────────────────────────────────────────────────────────────

/** @param {{ config: import('@expo/config-types').ExpoConfig }} ctx */
module.exports = ({ config }) => {
  // Inject the EAS project ID into extra.eas.projectId.
  // This overrides the placeholder in app.json without modifying that file.
  const extra = {
    ...config.extra,
    eas: {
      ...config.extra?.eas,
      ...(projectId ? { projectId } : {}),
    },
  };

  // Replace only the react-native-google-mobile-ads plugin entry with
  // environment-driven App IDs; all other plugins stay as defined in app.json.
  const plugins = (config.plugins ?? []).map(plugin => {
    if (Array.isArray(plugin) && plugin[0] === 'react-native-google-mobile-ads') {
      return ['react-native-google-mobile-ads', { androidAppId, iosAppId }];
    }
    return plugin;
  });

  return { ...config, extra, plugins };
};
