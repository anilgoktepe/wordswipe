/**
 * src/services/rewardedAdService.native.ts  (iOS + Android)
 *
 * Production rewarded ad service using react-native-google-mobile-ads.
 * Metro automatically picks this file over rewardedAdService.ts on native targets.
 *
 * ─── Architecture ──────────────────────────────────────────────────────────────
 *
 *   Module-level singleton: one RewardedAd instance lives here.
 *   The ad is pre-loaded immediately on module initialization and reloaded
 *   automatically after each complete cycle (show → close).
 *   This means when the user taps "Watch ad", the ad is almost always ready.
 *
 * ─── State machine ─────────────────────────────────────────────────────────────
 *
 *   IDLE → load() called → LOADING
 *   LOADING → LOADED event → READY
 *   LOADING → ERROR event  → IDLE (retry after 30 s)
 *   READY   → show() called → SHOWING
 *   SHOWING → EARNED_REWARD event → sets _rewardEarned flag
 *   SHOWING → CLOSED event → resolves callback(rewardEarned), transitions to IDLE,
 *                             then immediately starts next load cycle
 *   SHOWING → ERROR event  → resolves callback(false), transitions to IDLE,
 *                             then immediately starts next load cycle
 *
 * ─── Reward safety ─────────────────────────────────────────────────────────────
 *
 *   Reward is granted ONLY when EARNED_REWARD fires.
 *   The flag is reset to false on every new show cycle.
 *   Closing the ad without watching in full fires CLOSED without EARNED_REWARD,
 *   so the callback receives false and no reward is granted.
 *
 * ─── Double-resolution guard ───────────────────────────────────────────────────
 *
 *   _pendingCallback is set to null before it is invoked.
 *   All resolution paths (CLOSED, ERROR, show() rejection) check that
 *   _pendingCallback still matches the current call before resolving,
 *   preventing any double grant from overlapping event paths.
 */

import {
  RewardedAd,
  RewardedAdEventType,
  AdEventType,
} from 'react-native-google-mobile-ads';
import { REWARDED_UNIT_ID } from '../config/adConfig';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RewardedAdCallback = (rewarded: boolean) => void;

// ─── Module-level state ───────────────────────────────────────────────────────

let _ad:             RewardedAd | null = null;
let _isLoaded:       boolean           = false;
let _isShowing:      boolean           = false;
let _rewardEarned:   boolean           = false;

/**
 * Callback for the in-flight show call.
 * Null when no show is in progress.  Set to null before invocation to
 * prevent any double-call from overlapping event/promise paths.
 */
let _pendingCallback: RewardedAdCallback | null = null;

/** Cleanup functions for the current ad's event listeners. */
let _unsubscribers: Array<() => void> = [];

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Remove all event listeners from the current ad and clear the reference. */
function _cleanup(): void {
  for (const unsub of _unsubscribers) {
    try { unsub(); } catch { /* ignore */ }
  }
  _unsubscribers = [];
  _ad       = null;
  _isLoaded = false;
}

/**
 * Resolve the pending callback exactly once.
 * Clears _pendingCallback before invoking so any re-entrant call is a no-op.
 */
function _resolve(rewarded: boolean): void {
  const cb = _pendingCallback;
  if (!cb) return; // already resolved or no show in progress
  _pendingCallback = null;
  _isShowing   = false;
  _rewardEarned = false;
  cb(rewarded);
}

/**
 * Create a new RewardedAd, attach all listeners, and start loading.
 * Called once at module init and once after each complete ad cycle.
 */
function _loadNext(): void {
  _cleanup();

  const ad = RewardedAd.createForAdRequest(REWARDED_UNIT_ID, {
    requestNonPersonalizedAdsOnly: true,
  });
  _ad = ad;

  // ── LOADED ────────────────────────────────────────────────────────────────
  _unsubscribers.push(
    ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
      _isLoaded = true;
    }),
  );

  // ── EARNED_REWARD ────────────────────────────────────────────────────────
  // Fires before CLOSED when the user watches the full ad.
  // Set the flag here; the reward is only granted when CLOSED also fires.
  _unsubscribers.push(
    ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, (_reward) => {
      _rewardEarned = true;
    }),
  );

  // ── CLOSED ────────────────────────────────────────────────────────────────
  // Terminal event for both successful and dismissed ad views.
  // _rewardEarned is true only if EARNED_REWARD already fired.
  _unsubscribers.push(
    ad.addAdEventListener(AdEventType.CLOSED, () => {
      const earned = _rewardEarned;
      _resolve(earned);
      // Pre-load the next ad immediately so it's ready for the user's next tap.
      _loadNext();
    }),
  );

  // ── ERROR ─────────────────────────────────────────────────────────────────
  // Fires on load failure OR show failure.
  _unsubscribers.push(
    ad.addAdEventListener(AdEventType.ERROR, (_error) => {
      if (_isShowing) {
        // Error during show — treat as close without reward.
        // CLOSED may still fire on some SDK versions; _resolve() guards against
        // double-resolution by checking _pendingCallback first.
        _resolve(false);
        _loadNext();
      } else {
        // Load error — ad is unavailable.  Retry after a delay.
        _isLoaded = false;
        setTimeout(_loadNext, 30_000);
      }
    }),
  );

  ad.load();
}

// ─── Kick off pre-loading on module initialization ───────────────────────────
//
// On iOS, module initialization happens when the first screen that imports
// monetization.ts mounts.  By the time the user navigates to the premium gate
// or taps the bonus-words button, the ad will almost always be ready.
_loadNext();

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns true if a rewarded ad has been loaded and is ready to show.
 * Use this before calling showRewardedAd() to decide whether to offer the
 * "Watch ad" option or show a graceful fallback message.
 */
export function isRewardedAdReady(): boolean {
  return _isLoaded && !_isShowing;
}

/**
 * Show the pre-loaded rewarded ad.
 *
 * Calls `onResult(true)` when the user earns the reward (watched full ad).
 * Calls `onResult(false)` when:
 *   - ad is not loaded / inventory unavailable
 *   - ad is already showing (concurrent call)
 *   - user closes ad before earning reward
 *   - show fails with an error
 *
 * Only ONE reward is ever granted per call: EARNED_REWARD must fire
 * before CLOSED for the result to be true.
 */
export function showRewardedAd(onResult: RewardedAdCallback): void {
  // ── Guard: already showing (concurrent tap) ──────────────────────────────
  if (_isShowing) {
    onResult(false);
    return;
  }

  // ── Guard: ad not loaded ────────────────────────────────────────────────
  if (!_isLoaded || !_ad) {
    onResult(false);
    return;
  }

  // ── Enter showing state ──────────────────────────────────────────────────
  _isShowing    = true;
  _rewardEarned = false;
  _pendingCallback = onResult;

  // Capture the reference for the show() rejection guard below.
  const showingAd = _ad;

  // show() opens the ad overlay.  On iOS, the result comes via EARNED_REWARD
  // and CLOSED events, not from this Promise.  The Promise only rejects on
  // immediate failures (e.g. ad expired between load and show).
  showingAd.show().catch(() => {
    // Only resolve if we're still the pending call.
    // If CLOSED or ERROR already resolved things, _pendingCallback is null
    // and _resolve() is a no-op.
    _resolve(false);
    // Start the next load cycle (if not already started by the ERROR listener).
    if (_ad === showingAd) {
      _loadNext();
    }
  });
}
