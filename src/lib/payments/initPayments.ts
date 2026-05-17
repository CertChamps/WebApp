/**
 * RevenueCat SDK lifecycle.
 *
 * Call `initPayments()` exactly once on app boot. Then call
 * `setPaymentsUser(uid)` whenever the user signs in (so RevenueCat's
 * webhook can carry our Firebase UID in `app_user_id`), and
 * `clearPaymentsUser()` on sign-out.
 *
 * All calls are safe no-ops on non-iOS-native platforms, so the rest of
 * the app can wire these up unconditionally.
 */

import { Capacitor } from "@capacitor/core";
import { isAppleIapAvailable } from "./applePayment";

const REVENUECAT_IOS_API_KEY = import.meta.env.VITE_REVENUECAT_IOS_API_KEY as
    | string
    | undefined;

let configurePromise: Promise<void> | null = null;

async function loadPurchases() {
    const mod = await import("@revenuecat/purchases-capacitor");
    return mod.Purchases;
}

/**
 * Initialize the RevenueCat SDK. Safe to call multiple times — only the
 * first call actually configures.
 *
 * If `uid` is provided, we configure the SDK already-logged-in as that
 * user. Otherwise we configure anonymously and the caller is expected
 * to call `setPaymentsUser(uid)` later once they know who the user is.
 */
export async function initPayments(uid?: string | null): Promise<void> {
    if (!isAppleIapAvailable()) return;
    if (!REVENUECAT_IOS_API_KEY) {
        console.warn(
            "[initPayments] VITE_REVENUECAT_IOS_API_KEY missing — Apple IAP disabled."
        );
        return;
    }
    if (configurePromise) {
        await configurePromise;
        return;
    }
    configurePromise = (async () => {
        try {
            const Purchases = await loadPurchases();
            await Purchases.configure({
                apiKey: REVENUECAT_IOS_API_KEY,
                appUserID: uid ?? null,
            });
            console.log("[initPayments] RevenueCat configured", {
                platform: Capacitor.getPlatform(),
                hasUid: !!uid,
            });
        } catch (err) {
            console.error("[initPayments] RevenueCat configure failed", err);
            // Reset so a later call can try again.
            configurePromise = null;
            throw err;
        }
    })();
    await configurePromise;
}

/**
 * Identify the current user to RevenueCat. Call right after a Firebase
 * sign-in so subsequent purchases carry the Firebase UID into the
 * RevenueCat webhook payload.
 *
 * If `initPayments()` hasn't been called yet, this triggers it with the
 * provided UID. Safe no-op on non-iOS platforms.
 */
export async function setPaymentsUser(uid: string): Promise<void> {
    if (!isAppleIapAvailable() || !REVENUECAT_IOS_API_KEY) return;
    if (!uid) return;
    try {
        await initPayments(uid);
        const Purchases = await loadPurchases();
        const { isConfigured } = await Purchases.isConfigured();
        if (!isConfigured) return;
        const { appUserID } = await Purchases.getAppUserID();
        if (appUserID === uid) return;
        await Purchases.logIn({ appUserID: uid });
        console.log("[initPayments] RevenueCat logIn", { uid });
    } catch (err) {
        console.warn("[initPayments] setPaymentsUser failed", err);
    }
}

/** Clear the user from RevenueCat on sign-out so subsequent purchases
 *  start from an anonymous identity. */
export async function clearPaymentsUser(): Promise<void> {
    if (!isAppleIapAvailable() || !REVENUECAT_IOS_API_KEY) return;
    try {
        const Purchases = await loadPurchases();
        const { isConfigured } = await Purchases.isConfigured();
        if (!isConfigured) return;
        await Purchases.logOut();
        console.log("[initPayments] RevenueCat logOut");
    } catch (err) {
        console.warn("[initPayments] clearPaymentsUser failed", err);
    }
}
