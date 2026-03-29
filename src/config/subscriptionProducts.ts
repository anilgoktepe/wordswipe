/**
 * src/config/subscriptionProducts.ts
 *
 * Single source of truth for subscription product IDs and plan metadata.
 *
 * ─── Replacing product IDs ─────────────────────────────────────────────────────
 *
 *   1. Open App Store Connect → Your App → Subscriptions
 *   2. Create a subscription group (e.g. "WordSwipe Premium")
 *   3. Add two products with the IDs below (or change the IDs to match what
 *      you registered in App Store Connect)
 *   4. Replace the strings here — no other file needs to change
 *
 * ─── Android (future) ─────────────────────────────────────────────────────────
 *
 *   When adding Android, register the same IDs in Google Play Console →
 *   Subscriptions, then add the platform-specific offer tokens to each entry.
 */

// ─── Product IDs ───────────────────────────────────────────────────────────────

export const PRODUCT_IDS = {
  /** Monthly rolling subscription. */
  MONTHLY: 'com.wordswipe.premium.monthly',
  /** Annual subscription — best value. */
  YEARLY:  'com.wordswipe.premium.yearly',
} as const;

export type ProductId = typeof PRODUCT_IDS[keyof typeof PRODUCT_IDS];

/** All active product IDs as a flat array — passed to fetchProducts(). */
export const ALL_PRODUCT_IDS: readonly ProductId[] = Object.values(PRODUCT_IDS);

// ─── Plan metadata ─────────────────────────────────────────────────────────────
//
// `fallbackPrice` is shown while store products are loading or if the store is
// unavailable.  Always keep it in sync with the prices set in App Store Connect.

export interface PlanMeta {
  /** Matches one of the PRODUCT_IDS values. */
  productId: ProductId;
  /** Key used internally and for the plan selector. */
  key: 'monthly' | 'yearly';
  /** Turkish display name shown in the plan card. */
  displayName: string;
  /** Price string shown until a real localizedPrice is fetched from the store. */
  fallbackPrice: string;
  /** Supporting note (e.g. cancellation policy). */
  note: string;
  /** Whether to show the "En Popüler" badge. */
  isPopular?: boolean;
}

export const PLAN_META: Record<ProductId, PlanMeta> = {
  [PRODUCT_IDS.YEARLY]: {
    productId: PRODUCT_IDS.YEARLY,
    key:          'yearly',
    displayName:  'Yıllık Premium',
    fallbackPrice: '999 TL / yıl',
    note:         'Uzun vadede daha avantajlı.',
    isPopular:    true,
  },
  [PRODUCT_IDS.MONTHLY]: {
    productId: PRODUCT_IDS.MONTHLY,
    key:          'monthly',
    displayName:  'Aylık Premium',
    fallbackPrice: '149 TL / ay',
    note:         'İstediğin zaman iptal et.',
  },
};

/** Ordered list for UI rendering: yearly first, then monthly. */
export const ORDERED_PLANS: PlanMeta[] = [
  PLAN_META[PRODUCT_IDS.YEARLY],
  PLAN_META[PRODUCT_IDS.MONTHLY],
];
