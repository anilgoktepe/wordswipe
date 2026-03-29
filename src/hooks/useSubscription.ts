/**
 * src/hooks/useSubscription.ts
 *
 * React hook that bridges subscriptionService (IAP singleton) with the
 * AppContext premium state.
 *
 * ─── Responsibilities ──────────────────────────────────────────────────────────
 *
 *   • Initialize the IAP connection once on first render
 *   • Fetch real store prices from the App Store
 *   • Expose purchase() and restorePurchases() actions
 *   • Dispatch SET_PREMIUM to AppContext on every confirmed entitlement
 *   • Expose UI-friendly loading / error / message state
 *
 * ─── Usage ─────────────────────────────────────────────────────────────────────
 *
 *   const {
 *     products,           // SubscriptionProduct[] from the store
 *     isLoadingProducts,  // true while fetchProducts is in flight
 *     isPurchasing,       // true while StoreKit sheet is open
 *     isRestoring,        // true while getAvailablePurchases is in flight
 *     purchaseError,      // string | null — last purchase/restore error
 *     restoreMessage,     // string | null — success/failure after restore
 *     purchase,           // (sku: string) => Promise<void>
 *     restorePurchases,   // () => Promise<void>
 *   } = useSubscription();
 *
 * ─── Thread-safety ─────────────────────────────────────────────────────────────
 *
 *   isPurchasing / isRestoring guard against concurrent calls.
 *   subscriptionService itself also guards at the module level.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  initSubscriptions,
  loadSubscriptionProducts,
  purchaseSubscription,
  restoreSubscriptions,
  type SubscriptionProduct,
} from '../services/subscriptionService';
import { useApp } from '../context/AppContext';

// ─── Hook return type ──────────────────────────────────────────────────────────

export interface UseSubscriptionReturn {
  /** Store-localized product metadata.  Empty array while loading or on error. */
  products: SubscriptionProduct[];
  /** True while the initial fetchProducts call is in flight. */
  isLoadingProducts: boolean;
  /**
   * True while the StoreKit sheet is open / a purchase request is in flight.
   * Disable the CTA button and show a spinner when true.
   */
  isPurchasing: boolean;
  /**
   * True while restorePurchases() is in flight.
   * Disable the restore button when true.
   */
  isRestoring: boolean;
  /**
   * Non-null when the most recent purchase attempt failed (excluding user
   * cancellations — those are silently ignored in the UI).
   * Cleared automatically when a new purchase or restore is started.
   */
  purchaseError: string | null;
  /**
   * Non-null after restorePurchases() completes.
   * Contains a success or "not found" message for display in a toast/alert.
   * Cleared automatically when a new purchase or restore is started.
   */
  restoreMessage: string | null;
  /**
   * Initiate a purchase for the given SKU.
   * Grants entitlement via AppContext on success.
   * Sets purchaseError on failure (not on user cancellation).
   */
  purchase: (sku: string) => Promise<void>;
  /**
   * Restore previously purchased subscriptions.
   * Grants entitlement via AppContext if a matching active subscription is found.
   * Sets restoreMessage with an appropriate success or failure string.
   */
  restorePurchases: () => Promise<void>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSubscription(): UseSubscriptionReturn {
  const { dispatch } = useApp();

  const [products,          setProducts]          = useState<SubscriptionProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [isPurchasing,      setIsPurchasing]      = useState(false);
  const [isRestoring,       setIsRestoring]       = useState(false);
  const [purchaseError,     setPurchaseError]     = useState<string | null>(null);
  const [restoreMessage,    setRestoreMessage]    = useState<string | null>(null);

  // Guard against state updates after unmount (navigating away mid-purchase)
  const _mounted = useRef(true);

  useEffect(() => {
    _mounted.current = true;
    return () => { _mounted.current = false; };
  }, []);

  // ── Initialize IAP + load products ─────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // The entitlement callback is called by the service whenever a purchase
      // or a pending transaction (from a previous session) is confirmed by
      // StoreKit.  We dispatch here so the context stays updated even for
      // transactions delivered outside of an active purchase flow.
      const ok = await initSubscriptions((productId) => {
        if (!cancelled) {
          dispatch({ type: 'SET_PREMIUM', isPremium: true });
        }
      });

      if (cancelled) return;

      if (ok) {
        const storeProducts = await loadSubscriptionProducts();
        if (!cancelled && _mounted.current) {
          setProducts(storeProducts);
        }
      }

      if (!cancelled && _mounted.current) {
        setIsLoadingProducts(false);
      }
    }

    init();
    return () => { cancelled = true; };
  }, [dispatch]);

  // ── purchase ────────────────────────────────────────────────────────────────

  const purchase = useCallback(async (sku: string) => {
    if (isPurchasing || isRestoring) return;

    setPurchaseError(null);
    setRestoreMessage(null);
    setIsPurchasing(true);

    try {
      const result = await purchaseSubscription(sku);

      if (!_mounted.current) return;

      if (result.success) {
        // Entitlement is already granted via the onEntitlementGranted callback
        // fired inside the service's purchaseUpdatedListener.  Dispatching here
        // again is a no-op (idempotent SET_PREMIUM) and ensures correctness even
        // if the callback fires after component unmount.
        dispatch({ type: 'SET_PREMIUM', isPremium: true });
      } else if (!result.userCancelled && result.error) {
        // User cancellations are silent — no error message shown.
        setPurchaseError(result.error);
      }
    } finally {
      if (_mounted.current) {
        setIsPurchasing(false);
      }
    }
  }, [isPurchasing, isRestoring, dispatch]);

  // ── restorePurchases ────────────────────────────────────────────────────────

  const restorePurchases = useCallback(async () => {
    if (isPurchasing || isRestoring) return;

    setPurchaseError(null);
    setRestoreMessage(null);
    setIsRestoring(true);

    try {
      const result = await restoreSubscriptions();

      if (!_mounted.current) return;

      if (result.found) {
        dispatch({ type: 'SET_PREMIUM', isPremium: true });
        setRestoreMessage('Aboneliğiniz başarıyla geri yüklendi!');
      } else if (result.error) {
        setRestoreMessage(`Geri yükleme başarısız: ${result.error}`);
      } else {
        setRestoreMessage('Aktif abonelik bulunamadı.');
      }
    } finally {
      if (_mounted.current) {
        setIsRestoring(false);
      }
    }
  }, [isPurchasing, isRestoring, dispatch]);

  return {
    products,
    isLoadingProducts,
    isPurchasing,
    isRestoring,
    purchaseError,
    restoreMessage,
    purchase,
    restorePurchases,
  };
}
