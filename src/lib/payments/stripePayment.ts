/**
 * Stripe payment provider — used on the web and on non-iOS Capacitor
 * builds. This is a thin wrapper around the existing Firebase Functions
 * `createProCheckout` and `createBillingPortalSession`.
 *
 * The actual unlock of `isPro` still happens server-side via the
 * `stripeWebhook` function on `checkout.session.completed`. Nothing about
 * that flow changes — this file just exposes it through the unified
 * `PaymentProvider` interface so the UI doesn't care which provider is
 * active.
 */

import { auth } from "../../../firebase";
import type { PaymentProvider, PriceDetails, PurchaseResult } from "./types";

const CREATE_PRO_CHECKOUT_URL =
    "https://us-central1-certchamps-a7527.cloudfunctions.net/createProCheckout";
const CREATE_BILLING_PORTAL_URL =
    "https://us-central1-certchamps-a7527.cloudfunctions.net/createBillingPortalSession";

/** Static price shown on the Stripe upgrade card. Mirrors
 *  `PRO_YEARLY_PRICE_EUR_CENTS` in `functions/src/index.ts`. */
const STRIPE_PRICE: PriceDetails = {
    formatted: "€30",
    period: "year",
    currencyCode: "EUR",
};

export const stripeProvider: PaymentProvider = {
    name: "stripe",

    async isReady() {
        return !!auth.currentUser;
    },

    async getPrice() {
        return STRIPE_PRICE;
    },

    async purchase(): Promise<PurchaseResult> {
        const currentUser = auth.currentUser;
        if (!currentUser) {
            return { success: false, error: "You must be signed in to subscribe." };
        }
        try {
            const idToken = await currentUser.getIdToken();
            const res = await fetch(CREATE_PRO_CHECKOUT_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ idToken }),
            });
            const data = (await res.json().catch(() => ({}))) as {
                url?: string;
                error?: string;
            };
            if (!res.ok) {
                return { success: false, error: data.error || "Failed to start checkout" };
            }
            if (!data.url) {
                return { success: false, error: "Invalid response from server" };
            }
            // Redirect off-app to Stripe Checkout. The promise effectively
            // never resolves from the user's perspective; the success/cancel
            // URL handlers on manage-account pick the flow back up.
            window.location.href = data.url;
            return { success: true };
        } catch (err) {
            return {
                success: false,
                error: err instanceof Error ? err.message : "Something went wrong.",
            };
        }
    },

    async openManagement() {
        const currentUser = auth.currentUser;
        if (!currentUser) throw new Error("Sign in required.");
        const idToken = await currentUser.getIdToken();
        const res = await fetch(CREATE_BILLING_PORTAL_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken }),
        });
        const data = (await res.json().catch(() => ({}))) as {
            url?: string;
            error?: string;
        };
        if (!res.ok || !data.url) {
            throw new Error(data.error || "Failed to open billing portal");
        }
        window.location.href = data.url;
    },

    async restore(): Promise<PurchaseResult> {
        // Stripe state is the server's source of truth — there is no
        // "restore" concept. We treat it as a no-op success.
        return { success: true };
    },
};
