/**
 * Public entry point for the payments layer. Picks the right provider
 * for the current platform and re-exports lifecycle helpers.
 *
 * Routing:
 *   - Capacitor iOS native (iPad / iPhone)  → Apple IAP (RevenueCat)
 *   - Everything else (web, Capacitor Android, desktop) → Stripe
 *
 * NOTE on Android: Google Play also requires that subscriptions sold
 * inside a native Play Store build go through Play Billing. If/when
 * you ship the Android Capacitor build to the Play Store, swap the
 * dispatcher below so `getPlatform() === "android"` also routes to
 * RevenueCat. The RevenueCat SDK already covers Play Billing — only
 * the routing decision changes.
 */

import { Capacitor } from "@capacitor/core";
import type { PaymentProvider, PaymentProviderName } from "./types";
import { stripeProvider } from "./stripePayment";
import { appleProvider } from "./applePayment";
import { iapDebug } from "./paymentsDebug";

export type { PaymentProvider, PaymentProviderName, PriceDetails, PurchaseResult } from "./types";
export { ACE_ENTITLEMENT_ID, ACE_PRODUCT_IDENTIFIER, isAppleIapAvailable } from "./applePayment";
export { initPayments, setPaymentsUser, clearPaymentsUser } from "./initPayments";

/**
 * Pick the payment provider for the current platform.
 *
 * The decision is made fresh each call so a Capacitor reload (or hot
 * test of the web bundle inside an Apple device emulator) always sees
 * the up-to-date answer.
 */
export function getPaymentProvider(): PaymentProvider {
    const useApple =
        Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
    const provider = useApple ? appleProvider : stripeProvider;
    iapDebug("getPaymentProvider", {
        provider: provider.name,
        isNativePlatform: Capacitor.isNativePlatform(),
        platform: Capacitor.getPlatform(),
    });
    return provider;
}

/** Provider name that's currently active. Handy for analytics / debug. */
export function getActiveProviderName(): PaymentProviderName {
    return getPaymentProvider().name;
}

/**
 * Which provider should we route the "Manage subscription" button to
 * for a given user? This is NOT the same as `getPaymentProvider()` —
 * a user might be on iPad now (active provider = apple) but have
 * subscribed long ago on the web with Stripe; in that case management
 * MUST go through Stripe because that's where the billing relationship
 * lives. `paymentProvider` comes from Firestore and reflects whoever
 * actually charges the user today.
 */
export function getManagementProvider(
    storedProvider: PaymentProviderName | undefined | null
): PaymentProvider {
    if (storedProvider === "apple") return appleProvider;
    if (storedProvider === "stripe") return stripeProvider;
    return getPaymentProvider();
}
