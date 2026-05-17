/**
 * Unified payment abstraction.
 *
 * The app supports two checkout providers:
 *   - "stripe": web + non-iOS-native devices. Existing flow.
 *   - "apple":  Capacitor iOS native, sold via Apple's In-App Purchase
 *               system (StoreKit). Receipts verified through RevenueCat.
 *
 * Both providers ultimately converge on the same Firestore schema in
 * `user-data/{uid}` — `isPro`, `subscriptionPeriodEnd`, plus a
 * `paymentProvider` discriminator so management UIs can route to the
 * right cancel/portal entry point.
 */

export type PaymentProviderName = "stripe" | "apple";

/** Pricing info to display on the upgrade card. Apple gives a localized
 *  price string from StoreKit; Stripe has a single hardcoded EUR price. */
export interface PriceDetails {
    /** Pre-formatted display string, e.g. "€30.00" or "$32.99". */
    formatted: string;
    /** Cadence label, e.g. "year". */
    period: "year" | "month";
    /** ISO 4217 currency code if known. */
    currencyCode?: string | null;
}

/** Result of starting/finishing a purchase flow. */
export interface PurchaseResult {
    /** True if the user now has the ACE entitlement (or, for Stripe,
     *  the redirect has been triggered — the actual unlock happens on
     *  webhook completion). */
    success: boolean;
    /** True when the user cancelled (used to suppress error UI). */
    cancelled?: boolean;
    /** Human-readable reason for a failure (provider-specific). */
    error?: string;
}

/** The contract every provider must implement. The frontend only
 *  ever talks to this interface — it never imports Stripe / RevenueCat
 *  directly except through these adapters. */
export interface PaymentProvider {
    readonly name: PaymentProviderName;

    /** True if this provider can currently transact for the user.
     *  Apple requires the SDK to be configured first, etc. */
    isReady(): Promise<boolean>;

    /** Get the displayable subscription price. Apple returns the
     *  localized StoreKit price; Stripe returns a fixed €30/year. */
    getPrice(): Promise<PriceDetails | null>;

    /** Kick off purchase. For Apple this resolves once the StoreKit
     *  sheet closes; for Stripe it returns immediately after the
     *  browser is redirected to Checkout. */
    purchase(): Promise<PurchaseResult>;

    /** Open whatever the platform considers the "manage subscription"
     *  surface (Stripe Billing Portal for stripe, iOS Settings sheet
     *  for apple). */
    openManagement(): Promise<void>;

    /** Restore previous purchases — Apple-specific but a no-op on
     *  Stripe (Stripe state is server-authoritative). */
    restore(): Promise<PurchaseResult>;
}
