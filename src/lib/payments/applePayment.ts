/**
 * Apple In-App Purchase provider for the Capacitor iOS / iPad build.
 *
 * Why RevenueCat?
 *   Apple requires digital subscriptions sold inside an iOS app to go
 *   through StoreKit, and Apple wants server-side receipt verification.
 *   Implementing that from scratch means signing ES256 JWTs with a
 *   `.p8` key, parsing App Store Server Notifications V2 (JWS payloads),
 *   handling dozens of notification types, refunds, family sharing, etc.
 *
 *   RevenueCat does all of that for us. We use:
 *     - `@revenuecat/purchases-capacitor` (this file) on-device for the
 *       StoreKit-backed purchase sheet + entitlement checks.
 *     - A RevenueCat → Firebase Function webhook (see `revenueCatWebhook`
 *       in `functions/src/index.ts`) to write the canonical `isPro` /
 *       `subscriptionPeriodEnd` fields into Firestore.
 *
 * Entitlement, offering, package, and product IDs must match the
 * RevenueCat dashboard exactly (see constants below).
 */

import { Capacitor } from "@capacitor/core";
import type { PurchasesPackage } from "@revenuecat/purchases-capacitor";
import { auth } from "../../../firebase";
import type {
    PaymentProvider,
    PriceDetails,
    PurchaseResult,
} from "./types";

/** RevenueCat entitlement identifier that gates ACE. */
export const ACE_ENTITLEMENT_ID = "CertChamps ACE";

/** App Store / RevenueCat product identifier for the yearly ACE subscription. */
export const ACE_PRODUCT_IDENTIFIER = "CertChamps_ACE";

/** RevenueCat offering identifier. */
const ACE_OFFERING_IDENTIFIER = "CertChamps_ACE";

/** RevenueCat package identifier (annual). */
const ACE_PACKAGE_IDENTIFIER = "$rc_annual";

function resolveAcePackage(
    offering: { annual?: PurchasesPackage | null; availablePackages?: PurchasesPackage[] } | null | undefined
): PurchasesPackage | null | undefined {
    if (!offering) return null;
    return (
        offering.annual ??
        offering.availablePackages?.find((p) => p.identifier === ACE_PACKAGE_IDENTIFIER) ??
        offering.availablePackages?.[0]
    );
}

/** Firebase Function that hits the RevenueCat REST API server-side and
 *  reconciles the user's entitlement into Firestore immediately, so the
 *  UI doesn't have to race the webhook for an `isPro: true` write. */
const VERIFY_APPLE_ENTITLEMENT_URL =
    "https://us-central1-certchamps-a7527.cloudfunctions.net/verifyAppleEntitlement";

/**
 * Lazy-load the SDK only when actually running natively. Static imports
 * would crash the web bundle because the plugin's `web` impl throws
 * "not implemented" on non-native platforms.
 */
async function loadPurchases() {
    const mod = await import("@revenuecat/purchases-capacitor");
    return mod.Purchases;
}

/** Whether the current platform supports Apple IAP at all. */
export function isAppleIapAvailable(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

/** Quietly poke Firebase so it can immediately persist `isPro: true`
 *  without waiting for the webhook. Failures are swallowed — the
 *  webhook is the durable source of truth and will catch up. */
async function notifyBackendOfPurchase(): Promise<void> {
    try {
        const currentUser = auth.currentUser;
        if (!currentUser) return;
        const idToken = await currentUser.getIdToken();
        await fetch(VERIFY_APPLE_ENTITLEMENT_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken }),
        });
    } catch (err) {
        console.warn("[applePayment] verifyAppleEntitlement notify failed", err);
    }
}

export const appleProvider: PaymentProvider = {
    name: "apple",

    async isReady() {
        if (!isAppleIapAvailable()) return false;
        try {
            const Purchases = await loadPurchases();
            const { isConfigured } = await Purchases.isConfigured();
            return isConfigured;
        } catch (err) {
            console.warn("[applePayment] isReady check failed", err);
            return false;
        }
    },

    async getPrice(): Promise<PriceDetails | null> {
        if (!isAppleIapAvailable()) return null;
        try {
            const Purchases = await loadPurchases();
            const offerings = await Purchases.getOfferings();
            const offering =
                offerings.all[ACE_OFFERING_IDENTIFIER] ?? offerings.current;
            const pkg = resolveAcePackage(offering);
            if (!pkg) {
                console.warn("[applePayment] no ACE package available in offering", {
                    offeringId: ACE_OFFERING_IDENTIFIER,
                    packageId: ACE_PACKAGE_IDENTIFIER,
                    offerings: Object.keys(offerings.all ?? {}),
                });
                return null;
            }
            return {
                formatted: pkg.product.priceString,
                period: "year",
                currencyCode: pkg.product.currencyCode ?? null,
            };
        } catch (err) {
            console.warn("[applePayment] getPrice failed", err);
            return null;
        }
    },

    async purchase(): Promise<PurchaseResult> {
        if (!isAppleIapAvailable()) {
            return { success: false, error: "Apple IAP is unavailable on this device." };
        }
        try {
            const Purchases = await loadPurchases();
            const offerings = await Purchases.getOfferings();
            const offering =
                offerings.all[ACE_OFFERING_IDENTIFIER] ?? offerings.current;
            const pkg = resolveAcePackage(offering);
            if (!pkg) {
                return {
                    success: false,
                    error: "Subscription is not available right now. Please try again later.",
                };
            }

            console.log("[applePayment] purchasing package", {
                offeringId: ACE_OFFERING_IDENTIFIER,
                packageId: pkg.identifier,
                productId: pkg.product.identifier,
            });
            const result = await Purchases.purchasePackage({ aPackage: pkg });
            const entitlement =
                result.customerInfo.entitlements.active[ACE_ENTITLEMENT_ID];
            const active = !!entitlement?.isActive;

            if (active) {
                // Don't await — the user gets immediate UI feedback; the
                // backend sync runs in the background.
                void notifyBackendOfPurchase();
                return { success: true };
            }
            return {
                success: false,
                error:
                    "Purchase completed but the ACE entitlement did not activate. Please try Restore Purchases.",
            };
        } catch (err) {
            const anyErr = err as { userCancelled?: boolean; message?: string; code?: string | number };
            if (anyErr?.userCancelled) {
                return { success: false, cancelled: true };
            }
            const message = anyErr?.message || String(err);
            console.error("[applePayment] purchase failed", err);
            return { success: false, error: message };
        }
    },

    async openManagement() {
        // RevenueCat's customerInfo carries a deep link to the App Store
        // subscription management page when an active sub exists. Fall
        // back to the generic Apple subscriptions URL otherwise.
        let url = "https://apps.apple.com/account/subscriptions";
        try {
            const Purchases = await loadPurchases();
            const { customerInfo } = await Purchases.getCustomerInfo();
            if (customerInfo.managementURL) {
                url = customerInfo.managementURL;
            }
        } catch (err) {
            console.warn("[applePayment] managementURL lookup failed", err);
        }
        window.open(url, "_blank");
    },

    async restore(): Promise<PurchaseResult> {
        if (!isAppleIapAvailable()) {
            return { success: false, error: "Apple IAP is unavailable on this device." };
        }
        try {
            const Purchases = await loadPurchases();
            const { customerInfo } = await Purchases.restorePurchases();
            const entitlement = customerInfo.entitlements.active[ACE_ENTITLEMENT_ID];
            if (entitlement?.isActive) {
                void notifyBackendOfPurchase();
                return { success: true };
            }
            return { success: false, error: "No active ACE subscription found on this Apple ID." };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { success: false, error: message };
        }
    },
};
