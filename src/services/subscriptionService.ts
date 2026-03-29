/**
 * src/services/subscriptionService.ts
 *
 * Production-ready subscription service for WordSwipe.
 * Wraps react-native-iap v14 (Nitro-based) for iOS-first in-app purchases.
 *
 * ─── Architecture ──────────────────────────────────────────────────────────────
 *
 *   This module owns the IAP connection lifecycle and all purchase/restore logic.
 *   It is intentionally NOT a React component — it's a plain async module so it
 *   can be initialized early and reused across the component tree.
 *
 *   The purchase flow is event-driven (StoreKit's model):
 *     1. Set up purchaseUpdatedListener + purchaseErrorListener at init
 *     2. Call requestPurchase() — this opens the StoreKit sheet
 *     3. When the user completes/cancels, listeners fire
 *     4. The pending Promise resolves and entitlement is granted
 *
 * ─── Security note ────────────────────────────────────────────────────────────
 *
 *   Receipt validation should be done server-side before granting entitlement
 *   in a production app with high fraud risk.  For a learning app like WordSwipe,
 *   client-side entitlement (via getAvailablePurchases / purchaseUpdatedListener)
 *   is a practical first step.  Wiring in server-side receipt validation via
 *   the existing backend (backend/analyzeSentence.ts pattern) is straightforward.
 *
 * ─── iOS setup needed ─────────────────────────────────────────────────────────
 *
 *   After `npm install react-native-iap`, run:
 *     cd ios && pod install && cd ..
 *
 *   No Podfile changes required — autolinking handles it.
 */

import {
  initConnection,
  endConnection,
  fetchProducts,
  requestPurchase,
  getAvailablePurchases,
  finishTransaction,
  purchaseUpdatedListener,
  purchaseErrorListener,
  ErrorCode,
} from 'react-native-iap';
import type { Purchase, EventSubscription } from 'react-native-iap';
import { ALL_PRODUCT_IDS } from '../config/subscriptionProducts';
import type { ProductId } from '../config/subscriptionProducts';

// ─── Public types ──────────────────────────────────────────────────────────────

/** Product metadata fetched from the store. */
export interface SubscriptionProduct {
  /** The product ID as registered in App Store Connect. */
  id: string;
  /** Localized price string from the store (e.g. "₺999.00" or "999 TL"). */
  localizedPrice: string;
  /** Localized product title from the store. */
  title: string;
}

export type PurchaseResult =
  | { success: true;  productId: string }
  | { success: false; userCancelled?: boolean; error?: string };

export type RestoreResult =
  | { found: true;  productId: string }
  | { found: false; error?: string };

// ─── Module-level state ────────────────────────────────────────────────────────
//
// A module-level singleton is appropriate here because:
//   • The IAP connection is a single OS-level resource
//   • Multiple concurrent purchases are not supported by StoreKit
//   • React's component lifecycle (mount/unmount) does not match the connection
//     lifecycle (which should persist across navigation)

let _connected = false;
let _purchaseSub:  EventSubscription | null = null;
let _errorSub:     EventSubscription | null = null;

/**
 * Resolve callback for the currently in-flight purchase.
 * Only one purchase can be pending at a time.
 */
let _pendingResolve: ((result: PurchaseResult) => void) | null = null;

/**
 * Called whenever a valid subscription purchase is confirmed.
 * Wired to `dispatch({ type: 'SET_PREMIUM', isPremium: true })` by the hook.
 */
let _onEntitlementGranted: ((productId: string) => void) | null = null;

// ─── Internal: listeners ──────────────────────────────────────────────────────

/** Set of our product IDs as strings for fast membership checks. */
const _ourProductIds = new Set<string>(ALL_PRODUCT_IDS as string[]);

function _attachListeners(): void {
  // Remove any existing listeners first (guards against double-attach).
  _purchaseSub?.remove();
  _errorSub?.remove();

  // ── Purchase success listener ──────────────────────────────────────────────
  //
  // Fires on:
  //   • Successful new purchase
  //   • Pending transactions from a previous app session (delivered on
  //     initConnection if they weren't finished last time)
  //
  _purchaseSub = purchaseUpdatedListener(async (purchase: Purchase) => {
    if (!_ourProductIds.has(purchase.productId)) return; // ignore unrelated products

    // 1. Grant entitlement immediately (before finishing transaction, so the
    //    user isn't left in a limbo state if finishTransaction throws).
    _onEntitlementGranted?.(purchase.productId);

    // 2. Resolve the pending purchase promise, if one exists.
    if (_pendingResolve) {
      const resolve = _pendingResolve;
      _pendingResolve = null;
      resolve({ success: true, productId: purchase.productId });
    }

    // 3. Acknowledge the transaction to Apple so it isn't cancelled/refunded.
    try {
      await finishTransaction({ purchase, isConsumable: false });
    } catch (err) {
      // finishTransaction failure is non-fatal — entitlement is already granted.
      // The transaction will be re-delivered by StoreKit on next launch.
      console.warn('[subscriptionService] finishTransaction error (non-fatal):', err);
    }
  });

  // ── Purchase error listener ────────────────────────────────────────────────
  //
  // Fires when the user cancels, payment is declined, or an IAP error occurs.
  //
  _errorSub = purchaseErrorListener((error) => {
    if (!_pendingResolve) return; // no purchase in flight — discard
    const resolve = _pendingResolve;
    _pendingResolve = null;

    if (error.code === ErrorCode.UserCancelled) {
      resolve({ success: false, userCancelled: true });
    } else {
      resolve({ success: false, error: error.message ?? 'Purchase failed' });
    }
  });
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Initialize the IAP connection and attach purchase listeners.
 *
 * Call once at app startup (or lazily when the Premium screen is first shown).
 * Safe to call multiple times — subsequent calls are no-ops.
 *
 * @param onEntitlementGranted - Called whenever a valid subscription is confirmed.
 *   Wire this to `dispatch({ type: 'SET_PREMIUM', isPremium: true })`.
 *
 * @returns true on success, false if the store is unavailable.
 */
export async function initSubscriptions(
  onEntitlementGranted: (productId: string) => void,
): Promise<boolean> {
  _onEntitlementGranted = onEntitlementGranted; // always update, even if already connected

  if (_connected) return true;

  try {
    // Listeners must be attached BEFORE initConnection, because iOS can deliver
    // pending transactions immediately during the connection setup call.
    _attachListeners();
    await initConnection();
    _connected = true;
    return true;
  } catch (err) {
    console.warn('[subscriptionService] initConnection failed:', err);
    _purchaseSub?.remove();
    _errorSub?.remove();
    return false;
  }
}

/**
 * Fetch subscription product metadata from the store.
 *
 * Returns store-localized prices and titles, so the paywall always shows the
 * correct currency/amount for the user's region.
 *
 * Falls back to an empty array if the store is unreachable — the UI should
 * show hardcoded fallback prices in that case.
 */
export async function loadSubscriptionProducts(): Promise<SubscriptionProduct[]> {
  try {
    const raw = await fetchProducts({
      skus:  [...ALL_PRODUCT_IDS],
      type:  'subs',
    });

    return raw.map(p => {
      const product = p as Record<string, unknown>; // v14 uses discriminated unions
      return {
        id:             String(product.id ?? ''),
        localizedPrice: String(product.displayPrice ?? product.localizedPrice ?? ''),
        title:          String(product.displayNameIOS ?? product.title ?? product.id ?? ''),
      };
    });
  } catch (err) {
    console.warn('[subscriptionService] fetchProducts failed:', err);
    return [];
  }
}

/**
 * Initiate a subscription purchase.
 *
 * Opens the native StoreKit purchase sheet for the given product ID.
 * Returns a Promise that resolves once the purchase is confirmed or fails.
 *
 * Only one purchase can be in flight at a time — concurrent calls return an
 * error immediately.
 *
 * Entitlement is granted via `onEntitlementGranted` BEFORE the Promise resolves,
 * so the UI never shows a "purchase successful" state while the user is still
 * without access.
 */
export async function purchaseSubscription(sku: string): Promise<PurchaseResult> {
  if (_pendingResolve) {
    return { success: false, error: 'A purchase is already in progress.' };
  }

  if (!_connected) {
    return { success: false, error: 'Store connection not available. Please try again.' };
  }

  return new Promise<PurchaseResult>((resolve) => {
    _pendingResolve = resolve;

    // requestPurchase opens the StoreKit sheet.  On iOS, the actual result
    // (success or error) arrives asynchronously via the listeners registered
    // above, NOT through this promise's resolution.
    requestPurchase({
      request: { apple: { sku } },
      type: 'subs',
    }).catch((err: unknown) => {
      // This catch fires on immediate/synchronous failures (e.g. invalid SKU,
      // store not available) — NOT on user cancellation via the StoreKit sheet.
      if (_pendingResolve !== resolve) return; // already resolved by listener
      _pendingResolve = null;

      const errorCode = (err as { code?: string })?.code;
      if (errorCode === ErrorCode.UserCancelled) {
        resolve({ success: false, userCancelled: true });
      } else {
        const msg = (err as { message?: string })?.message ?? 'Purchase failed';
        resolve({ success: false, error: msg });
      }
    });
  });
}

/**
 * Restore previous purchases.
 *
 * Fetches the user's currently active subscriptions from the store.
 * If a matching subscription is found, entitlement is granted and `found: true`
 * is returned.
 *
 * Use this for the "Satın alımları geri yükle" button.
 */
export async function restoreSubscriptions(): Promise<RestoreResult> {
  try {
    const purchases = await getAvailablePurchases({
      onlyIncludeActiveItemsIOS: true,
    });

    const active = purchases.find(p => _ourProductIds.has(p.productId));

    if (active) {
      _onEntitlementGranted?.(active.productId);
      // Acknowledge any unfinished restore transactions.
      try {
        await finishTransaction({ purchase: active, isConsumable: false });
      } catch { /* non-fatal */ }
      return { found: true, productId: active.productId };
    }

    return { found: false };
  } catch (err) {
    console.warn('[subscriptionService] restoreSubscriptions failed:', err);
    return {
      found:  false,
      error:  (err as { message?: string })?.message ?? 'Restore failed',
    };
  }
}

/**
 * Silently check whether the user has an active subscription.
 *
 * Used during app startup to refresh the entitlement state from the store,
 * in case it was granted on another device or after a reinstall.
 *
 * Returns false on any error (fail safe — don't revoke access on network blips).
 */
export async function checkActiveSubscription(): Promise<boolean> {
  try {
    const purchases = await getAvailablePurchases({
      onlyIncludeActiveItemsIOS: true,
    });
    return purchases.some(p => _ourProductIds.has(p.productId));
  } catch {
    return false;
  }
}

/**
 * Tear down the IAP connection and all listeners.
 *
 * Call in the root component's cleanup (useEffect return) or on logout.
 * After this, `initSubscriptions` must be called again before purchasing.
 */
export function destroySubscriptions(): void {
  _purchaseSub?.remove();
  _errorSub?.remove();
  _purchaseSub      = null;
  _errorSub         = null;
  _pendingResolve   = null;
  _onEntitlementGranted = null;

  if (_connected) {
    _connected = false;
    endConnection().catch(() => {});
  }
}
