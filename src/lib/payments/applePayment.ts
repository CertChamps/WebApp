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
 *
 * NOTE: We use a STATIC import of `@revenuecat/purchases-capacitor` to
 * avoid a WKWebView dynamic-import hang that was observed at boot.
 */

import { Capacitor } from "@capacitor/core";
import { Purchases } from "@revenuecat/purchases-capacitor";
import type { PurchasesPackage } from "@revenuecat/purchases-capacitor";
import { auth } from "../../../firebase";
import { ensureConfigured } from "./initPayments";
import {
    iapDebug,
    iapDebugError,
    iapDebugWarn,
    timed,
    withTimeout,
} from "./paymentsDebug";
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

/** Generic timeout for native bridge calls. purchasePackage is excluded —
 *  it intentionally blocks until the user interacts with the StoreKit
 *  sheet, which can take arbitrarily long. */
const NATIVE_TIMEOUT_MS = 15_000;
const OFFERINGS_TIMEOUT_MS = 20_000;

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

iapDebug("applePayment:module:loaded", {
    hasPurchases: typeof Purchases !== "undefined",
    hasConfigure: typeof Purchases?.configure === "function",
    hasGetOfferings: typeof Purchases?.getOfferings === "function",
    hasPurchasePackage: typeof Purchases?.purchasePackage === "function",
});

/** Whether the current platform supports Apple IAP at all. */
export function isAppleIapAvailable(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

/** Quietly poke Firebase so it can immediately persist `isPro: true`
 *  without waiting for the webhook. Failures are swallowed — the
 *  webhook is the durable source of truth and will catch up. */
async function notifyBackendOfPurchase(): Promise<void> {
    iapDebug("notifyBackendOfPurchase:start");
    try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
            iapDebugWarn("notifyBackendOfPurchase:skipped", { reason: "no auth.currentUser" });
            return;
        }
        const idToken = await currentUser.getIdToken();
        iapDebug("notifyBackendOfPurchase:fetch", {
            url: VERIFY_APPLE_ENTITLEMENT_URL,
            uid: currentUser.uid,
        });
        const res = await fetch(VERIFY_APPLE_ENTITLEMENT_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken }),
        });
        iapDebug("notifyBackendOfPurchase:response", {
            status: res.status,
            ok: res.ok,
        });
    } catch (err) {
        iapDebugError("notifyBackendOfPurchase:failed", err);
        console.warn("[applePayment] verifyAppleEntitlement notify failed", err);
    }
}

export const appleProvider: PaymentProvider = {
    name: "apple",

    async isReady() {
        iapDebug("appleProvider.isReady:start");
        if (!isAppleIapAvailable()) {
            iapDebug("appleProvider.isReady:unavailable");
            return false;
        }
        try {
            // Self-init: if boot configure hung or never ran, kick it
            // off now. This makes the purchase flow independent of the
            // boot lifecycle.
            const ok = await ensureConfigured(auth.currentUser?.uid ?? null);
            iapDebug("appleProvider.isReady:ensureConfigured result", { ok });
            return ok;
        } catch (err) {
            iapDebugError("appleProvider.isReady:failed", err);
            console.warn("[applePayment] isReady check failed", err);
            return false;
        }
    },

    async getPrice(): Promise<PriceDetails | null> {
        iapDebug("appleProvider.getPrice:start");
        if (!isAppleIapAvailable()) return null;
        try {
            const ok = await ensureConfigured(auth.currentUser?.uid ?? null);
            if (!ok) {
                iapDebugWarn("appleProvider.getPrice:notConfigured");
                return null;
            }
            const offerings = await timed(
                "appleProvider.getPrice:Purchases.getOfferings",
                () =>
                    withTimeout("getPrice.getOfferings", OFFERINGS_TIMEOUT_MS, () =>
                        Purchases.getOfferings()
                    )
            );
            iapDebug("appleProvider.getPrice:offerings", {
                currentOfferingId: offerings.current?.identifier ?? null,
                allOfferingIds: Object.keys(offerings.all ?? {}),
                targetOfferingId: ACE_OFFERING_IDENTIFIER,
            });
            const offering =
                offerings.all[ACE_OFFERING_IDENTIFIER] ?? offerings.current;
            const pkg = resolveAcePackage(offering);
            if (!pkg) {
                iapDebugWarn("appleProvider.getPrice:noPackage", {
                    offeringId: ACE_OFFERING_IDENTIFIER,
                    packageId: ACE_PACKAGE_IDENTIFIER,
                    resolvedOfferingId: offering?.identifier ?? null,
                    availablePackageIds: offering?.availablePackages?.map((p) => p.identifier) ?? [],
                });
                console.warn("[applePayment] no ACE package available in offering", {
                    offeringId: ACE_OFFERING_IDENTIFIER,
                    packageId: ACE_PACKAGE_IDENTIFIER,
                    offerings: Object.keys(offerings.all ?? {}),
                });
                return null;
            }
            iapDebug("appleProvider.getPrice:resolved", {
                packageId: pkg.identifier,
                productId: pkg.product.identifier,
                priceString: pkg.product.priceString,
            });
            return {
                formatted: pkg.product.priceString,
                period: "year",
                currencyCode: pkg.product.currencyCode ?? null,
            };
        } catch (err) {
            iapDebugError("appleProvider.getPrice:failed", err);
            console.warn("[applePayment] getPrice failed", err);
            return null;
        }
    },

    async purchase(): Promise<PurchaseResult> {
        iapDebug("appleProvider.purchase:start");
        if (!isAppleIapAvailable()) {
            iapDebugWarn("appleProvider.purchase:unavailable");
            return { success: false, error: "Apple IAP is unavailable on this device." };
        }
        try {
            // Self-init: don't rely on the boot configure having
            // completed — kick it off here if needed.
            const ok = await ensureConfigured(auth.currentUser?.uid ?? null);
            iapDebug("appleProvider.purchase:ensureConfigured result", { ok });
            if (!ok) {
                iapDebugWarn("appleProvider.purchase:notConfigured");
                return {
                    success: false,
                    error:
                        "Payments are not configured. Please check your connection and try again.",
                };
            }

            const { isConfigured } = await timed(
                "appleProvider.purchase:Purchases.isConfigured",
                () =>
                    withTimeout("purchase.isConfigured", NATIVE_TIMEOUT_MS, () =>
                        Purchases.isConfigured()
                    )
            );
            const { appUserID } = await timed(
                "appleProvider.purchase:Purchases.getAppUserID",
                () =>
                    withTimeout("purchase.getAppUserID", NATIVE_TIMEOUT_MS, () =>
                        Purchases.getAppUserID()
                    )
            );
            iapDebug("appleProvider.purchase:pre-flight", {
                isConfigured,
                appUserID: appUserID ?? null,
                firebaseUid: auth.currentUser?.uid ?? null,
            });

            const offerings = await timed(
                "appleProvider.purchase:Purchases.getOfferings",
                () =>
                    withTimeout("purchase.getOfferings", OFFERINGS_TIMEOUT_MS, () =>
                        Purchases.getOfferings()
                    )
            );
            iapDebug("appleProvider.purchase:offerings", {
                currentOfferingId: offerings.current?.identifier ?? null,
                allOfferingIds: Object.keys(offerings.all ?? {}),
                targetOfferingId: ACE_OFFERING_IDENTIFIER,
            });
            const offering =
                offerings.all[ACE_OFFERING_IDENTIFIER] ?? offerings.current;
            const pkg = resolveAcePackage(offering);
            if (!pkg) {
                iapDebugWarn("appleProvider.purchase:noPackage", {
                    resolvedOfferingId: offering?.identifier ?? null,
                    availablePackageIds: offering?.availablePackages?.map((p) => p.identifier) ?? [],
                });
                return {
                    success: false,
                    error: "Subscription is not available right now. Please try again later.",
                };
            }

            iapDebug("appleProvider.purchase:calling purchasePackage", {
                offeringId: ACE_OFFERING_IDENTIFIER,
                packageId: pkg.identifier,
                productId: pkg.product.identifier,
                entitlementId: ACE_ENTITLEMENT_ID,
                productPriceString: pkg.product.priceString,
            });
            // Intentionally no timeout — StoreKit blocks until the user
            // interacts with the sheet, which can be minutes.
            const result = await timed(
                "appleProvider.purchase:Purchases.purchasePackage",
                () => Purchases.purchasePackage({ aPackage: pkg })
            );
            iapDebug("appleProvider.purchase:purchasePackage returned", {
                activeEntitlementIds: Object.keys(result.customerInfo.entitlements.active ?? {}),
                allPurchasedProductIds: result.customerInfo.allPurchasedProductIdentifiers ?? [],
            });
            const entitlement =
                result.customerInfo.entitlements.active[ACE_ENTITLEMENT_ID];
            const active = !!entitlement?.isActive;
            iapDebug("appleProvider.purchase:entitlement check", {
                entitlementId: ACE_ENTITLEMENT_ID,
                active,
                expirationDate: entitlement?.expirationDate ?? null,
            });

            if (active) {
                iapDebug("appleProvider.purchase:success");
                // Don't await — the user gets immediate UI feedback; the
                // backend sync runs in the background.
                void notifyBackendOfPurchase();
                return { success: true };
            }
            iapDebugWarn("appleProvider.purchase:entitlementInactive");
            return {
                success: false,
                error:
                    "Purchase completed but the ACE entitlement did not activate. Please try Restore Purchases.",
            };
        } catch (err) {
            const anyErr = err as { userCancelled?: boolean; message?: string; code?: string | number };
            if (anyErr?.userCancelled) {
                iapDebug("appleProvider.purchase:userCancelled");
                return { success: false, cancelled: true };
            }
            const message = anyErr?.message || String(err);
            iapDebugError("appleProvider.purchase:failed", err, { code: anyErr?.code });
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
            await ensureConfigured(auth.currentUser?.uid ?? null);
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
        iapDebug("appleProvider.restore:start");
        if (!isAppleIapAvailable()) {
            return { success: false, error: "Apple IAP is unavailable on this device." };
        }
        try {
            await ensureConfigured(auth.currentUser?.uid ?? null);
            iapDebug("appleProvider.restore:calling restorePurchases");
            const { customerInfo } = await timed(
                "appleProvider.restore:Purchases.restorePurchases",
                () => Purchases.restorePurchases()
            );
            iapDebug("appleProvider.restore:result", {
                activeEntitlementIds: Object.keys(customerInfo.entitlements.active ?? {}),
            });
            const entitlement = customerInfo.entitlements.active[ACE_ENTITLEMENT_ID];
            if (entitlement?.isActive) {
                iapDebug("appleProvider.restore:success");
                void notifyBackendOfPurchase();
                return { success: true };
            }
            iapDebugWarn("appleProvider.restore:noActiveEntitlement", {
                entitlementId: ACE_ENTITLEMENT_ID,
            });
            return { success: false, error: "No active ACE subscription found on this Apple ID." };
        } catch (err) {
            iapDebugError("appleProvider.restore:failed", err);
            const message = err instanceof Error ? err.message : String(err);
            return { success: false, error: message };
        }
    },
};
