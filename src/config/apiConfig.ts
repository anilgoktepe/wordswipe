/**
 * src/config/apiConfig.ts
 *
 * Resolves the backend base URL for all services that call the local Express
 * backend (sentence analysis, translation, etc.).
 *
 * ─── Why localhost breaks on real devices ─────────────────────────────────────
 *
 *   "localhost" on a physical phone resolves to the phone itself — not your
 *   development machine.  The Express server lives on your Mac, so:
 *
 *   iOS Simulator      → localhost works  (shares the Mac's network stack)
 *   Android Emulator   → must use 10.0.2.2  (maps to the host machine)
 *   Real device        → must use your Mac's LAN IP (e.g. 192.168.1.42)
 *
 * ─── How the URL is resolved ──────────────────────────────────────────────────
 *
 *   Priority order:
 *
 *   1. EXPO_PUBLIC_API_URL env var — always wins.
 *      Set this in .env for dev, or inject via EAS Secrets for production.
 *      Example:  EXPO_PUBLIC_API_URL=http://192.168.1.42:8787
 *
 *   2. Platform default fallback (only used when the env var is absent):
 *      • iOS   → http://localhost:8787  (safe for Simulator)
 *      • Other → http://10.0.2.2:8787  (safe for Android Emulator)
 *
 * ─── How to test on a real device ─────────────────────────────────────────────
 *
 *   1. Find your Mac's IP:  System Settings → Wi-Fi → Details
 *   2. Add to .env:         EXPO_PUBLIC_API_URL=http://192.168.x.x:8787
 *   3. Restart the Expo dev server so the variable is picked up.
 *   4. Make sure the Express server is running and your firewall allows port 8787.
 *
 * ─── Production ───────────────────────────────────────────────────────────────
 *
 *   Set EXPO_PUBLIC_API_URL to your deployed backend domain before building:
 *     EXPO_PUBLIC_API_URL=https://api.yourapp.com
 *   via EAS Secrets (expo.dev → Project → Secrets) or your CI environment.
 */

import { Platform } from 'react-native';

// EXPO_PUBLIC_* vars are bundled at build/start time by the Expo bundler.
// Changing this value requires restarting the Expo dev server.
const _envUrl = process.env.EXPO_PUBLIC_API_URL?.trim() ?? '';

const _platformDefault =
  Platform.OS === 'ios'
    ? 'http://localhost:8787'
    : 'http://10.0.2.2:8787';

/**
 * Base URL of the Express backend — no trailing slash.
 *
 * Examples:
 *   http://localhost:8787          (iOS Simulator, default)
 *   http://10.0.2.2:8787           (Android Emulator, default)
 *   http://192.168.1.42:8787       (real device on LAN, via env var)
 *   https://api.yourapp.com        (production, via env var / EAS Secret)
 */
export const API_BASE_URL: string = _envUrl || _platformDefault;
