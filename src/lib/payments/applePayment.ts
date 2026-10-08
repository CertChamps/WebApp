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

import { Browser } from "@capacitor/browser";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { Purchases } from "@revenuecat/purchases-capacitor";
import type {
    PurchasesOffering,
    PurchasesOfferings,
    PurchasesPackage,
} from "@revenuecat/purchases-capacitor";
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
    SubscriptionPlan,
} from "./types";

/** RevenueCat entitlement identifier that gates ACE. */
export const ACE_ENTITLEMENT_ID = "CertChamps ACE";

/** App Store / RevenueCat product identifier for the yearly ACE subscription. */
export const ACE_PRODUCT_IDENTIFIER = "CertChamps_ACE";

/** RevenueCat offering identifier. */
const ACE_OFFERING_IDENTIFIER = "CertChamps_ACE";

/** RevenueCat package identifiers for the two billing periods. */
const ACE_PACKAGE_IDENTIFIERS = { monthly: "$rc_monthly", annual: "$rc_annual" };
const ACE_PRODUCT_IDENTIFIERS = {
    monthly: "CertChamps_ACE_Monthly",
    annual: ACE_PRODUCT_IDENTIFIER,
} as const;

/** Generic timeout for native bridge calls. purchasePackage is excluded —
 *  it intentionally blocks until the user interacts with the StoreKit
 *  sheet, which can take arbitrarily long. */
const SubscriptionManagement = registerPlugin<{ open(): Promise<void> }>("SubscriptionManagement");

const NATIVE_TIMEOUT_MS = 15_000;
const OFFERINGS_TIMEOUT_MS = 20_000;

function resolveAcePackage(
    offering: PurchasesOffering | null | undefined,
    plan: SubscriptionPlan,
): PurchasesPackage | null {
    if (!offering) return null;

    const productId = ACE_PRODUCT_IDENTIFIERS[plan];
    const typedPackage = plan === "monthly" ? offering.monthly : offering.annual;
    const candidates = [
        typedPackage,
        offering.availablePackages.find(p => p.identifier === ACE_PACKAGE_IDENTIFIERS[plan]),
        offering.availablePackages.find(p => p.product.identifier === productId),
    ];

    // The App Store product ID is the source of truth for which plan the
    // customer is buying. Do not reject a valid product just because the
    // RevenueCat package name or StoreKit period metadata changed.
    return candidates.find(p => p?.product.identifier === productId) ?? null;
}

function resolveAcePurchase(
    offerings: PurchasesOfferings,
    plan: SubscriptionPlan,
): { offering: PurchasesOffering; pkg: PurchasesPackage } | null {
    const candidates = [
        offerings.all[ACE_OFFERING_IDENTIFIER],
        offerings.current,
        ...Object.values(offerings.all),
    ].filter((offering): offering is PurchasesOffering => !!offering);
    const seen = new Set<string>();

    for (const offering of candidates) {
        if (seen.has(offering.identifier)) continue;
        seen.add(offering.identifier);
        const pkg = resolveAcePackage(offering, plan);
        if (pkg) return { offering, pkg };
    }
    return null;
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
            signal: AbortSignal.timeout(15_000),
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

    async getPrice(plan): Promise<PriceDetails | null> {
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
            const resolved = resolveAcePurchase(offerings, plan);
            if (!resolved) {
                iapDebugWarn("appleProvider.getPrice:noPackage", {
                    offeringId: ACE_OFFERING_IDENTIFIER,
                    packageId: ACE_PACKAGE_IDENTIFIERS[plan],
                    productId: ACE_PRODUCT_IDENTIFIERS[plan],
                    availablePackages: Object.values(offerings.all ?? {}).flatMap(
                        offering => offering.availablePackages.map(pkg => ({
                            offeringId: offering.identifier,
                            packageId: pkg.identifier,
                            productId: pkg.product.identifier,
                        }))
                    ),
                });
                console.warn("[applePayment] no ACE package available in offering", {
                    offeringId: ACE_OFFERING_IDENTIFIER,
                    packageId: ACE_PACKAGE_IDENTIFIERS[plan],
                    offerings: Object.keys(offerings.all ?? {}),
                });
                return null;
            }
            const { offering, pkg } = resolved;
            iapDebug("appleProvider.getPrice:resolved", {
                offeringId: offering.identifier,
                packageId: pkg.identifier,
                productId: pkg.product.identifier,
                priceString: pkg.product.priceString,
            });
            return {
                formatted: pkg.product.priceString,
                period: plan === "monthly" ? "month" : "year",
                currencyCode: pkg.product.currencyCode ?? null,
            };
        } catch (err) {
            iapDebugError("appleProvider.getPrice:failed", err);
            console.warn("[applePayment] getPrice failed", err);
            return null;
        }
    },

    async purchase(plan): Promise<PurchaseResult> {
        iapDebug("appleProvider.purchase:start");
        if (!isAppleIapAvailable()) {
            iapDebugWarn("appleProvider.purchase:unavailable");
            return { success: false, error: "Apple IAP is unavailable on this device." };
        }
        if (!auth.currentUser) return { success: false, error: "Sign in before subscribing." };
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
            if (!isConfigured) {
                return {
                    success: false,
                    error: "Apple payments are still starting. Please try again.",
                };
            }
            if (appUserID !== auth.currentUser.uid) throw new Error("Please sign in again before subscribing.");
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
            const resolved = resolveAcePurchase(offerings, plan);
            if (!resolved) {
                iapDebugWarn("appleProvider.purchase:noPackage", {
                    productId: ACE_PRODUCT_IDENTIFIERS[plan],
                    availablePackages: Object.values(offerings.all ?? {}).flatMap(
                        offering => offering.availablePackages.map(pkg => ({
                            offeringId: offering.identifier,
                            packageId: pkg.identifier,
                            productId: pkg.product.identifier,
                        }))
                    ),
                });
                return {
                    success: false,
                    error: "Subscription is not available right now. Please try again later.",
                };
            }
            const { offering, pkg } = resolved;

            iapDebug("appleProvider.purchase:calling purchasePackage", {
                offeringId: offering.identifier,
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
                await notifyBackendOfPurchase();
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
        const url = "https://apps.apple.com/account/subscriptions";
        if (isAppleIapAvailable() && Capacitor.isPluginAvailable("SubscriptionManagement")) {
            await SubscriptionManagement.open();
            await notifyBackendOfPurchase();
        } else if (Capacitor.isNativePlatform()) await Browser.open({ url });
        else window.location.assign(url);
    },

    async restore(): Promise<PurchaseResult> {
        iapDebug("appleProvider.restore:start");
        if (!isAppleIapAvailable()) {
            return { success: false, error: "Apple IAP is unavailable on this device." };
        }
        try {
            if (!auth.currentUser) throw new Error("Sign in before restoring purchases.");
            if (!await ensureConfigured(auth.currentUser.uid)) throw new Error("Payments are unavailable. Try again.");
            const { appUserID } = await Purchases.getAppUserID();
            if (appUserID !== auth.currentUser.uid) throw new Error("Please sign in again before restoring.");
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
                await notifyBackendOfPurchase();
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
