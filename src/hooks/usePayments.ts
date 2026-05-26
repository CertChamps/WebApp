/**
 * usePayments — the only thing UI code should touch to start a
 * subscription, manage one, or read the displayed price. It hides:
 *   - which provider runs on this platform (Stripe vs Apple IAP)
 *   - which provider runs the user's *existing* subscription (for the
 *     "Manage" button, which has to route to wherever they actually pay)
 *   - lazy provider initialization
 *   - error / loading state for the UI
 */

import { useCallback, useContext, useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../../firebase";
import { UserContext } from "../context/UserContext";
import {
    getActiveProviderName,
    getManagementProvider,
    getPaymentProvider,
    type PaymentProviderName,
    type PriceDetails,
} from "../lib/payments";
import { iapDebug, iapDebugError, iapDebugWarn, timed } from "../lib/payments/paymentsDebug";

interface UsePaymentsResult {
    /** Which provider will be used for a NEW purchase right now. */
    activeProvider: PaymentProviderName;
    /** Display price for the upgrade card. Null while loading or if the
     *  provider has no price configured (e.g. RevenueCat offering empty). */
    price: PriceDetails | null;
    priceLoading: boolean;
    /** True while a purchase / management action is in flight. */
    purchaseLoading: boolean;
    manageLoading: boolean;
    restoreLoading: boolean;
    /** Most recent error from any of the actions. */
    error: string | null;
    /** True for one tick after a successful purchase so UIs can show a
     *  celebration banner. */
    success: boolean;
    /** Reset success/error banners. */
    clearStatus: () => void;
    /** Kick off a purchase. Updates `success`/`error`. Returns true on
     *  unlock so callers can refetch the user doc immediately. */
    purchase: () => Promise<boolean>;
    /** Open management (Stripe Billing Portal or iOS Subscriptions). */
    openManagement: () => Promise<void>;
    /** Restore previous purchases — only meaningful on Apple. */
    restore: () => Promise<boolean>;
}

export function usePayments(): UsePaymentsResult {
    const { user } = useContext(UserContext);
    const [activeProvider] = useState<PaymentProviderName>(() => getActiveProviderName());
    const [price, setPrice] = useState<PriceDetails | null>(null);
    const [priceLoading, setPriceLoading] = useState(true);
    const [purchaseLoading, setPurchaseLoading] = useState(false);
    const [manageLoading, setManageLoading] = useState(false);
    const [restoreLoading, setRestoreLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    // Resolve the price lazily once the active provider is ready. Apple
    // returns a localized StoreKit price; Stripe returns the static €30.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            iapDebug("usePayments:loadPrice:start", { activeProvider });
            try {
                const provider = getPaymentProvider();
                const ready = await timed("usePayments:loadPrice:isReady", () =>
                    provider.isReady()
                );
                iapDebug("usePayments:loadPrice:providerReady", {
                    provider: provider.name,
                    ready,
                });
                const p = await timed("usePayments:loadPrice:getPrice", () =>
                    provider.getPrice()
                );
                iapDebug("usePayments:loadPrice:done", {
                    provider: provider.name,
                    hasPrice: !!p,
                    formatted: p?.formatted ?? null,
                });
                if (!cancelled) setPrice(p);
            } catch (err) {
                iapDebugError("usePayments:loadPrice:failed", err);
                console.warn("[usePayments] getPrice failed", err);
            } finally {
                if (!cancelled) setPriceLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [activeProvider]);

    const clearStatus = useCallback(() => {
        setError(null);
        setSuccess(false);
    }, []);

    const purchase = useCallback(async (): Promise<boolean> => {
        setError(null);
        setSuccess(false);
        setPurchaseLoading(true);
        iapDebug("usePayments.purchase:start", { activeProvider });
        try {
            const provider = getPaymentProvider();
            const ready = await timed("usePayments.purchase:isReady", () =>
                provider.isReady()
            );
            iapDebug("usePayments.purchase:pre-flight", {
                provider: provider.name,
                ready,
            });
            if (!ready) {
                iapDebugWarn("usePayments.purchase:providerNotReady", {
                    provider: provider.name,
                });
            }
            iapDebug("usePayments.purchase:calling provider.purchase");
            const result = await timed("usePayments.purchase:provider.purchase", () =>
                provider.purchase()
            );
            iapDebug("usePayments.purchase:result", {
                provider: provider.name,
                success: result.success,
                cancelled: result.cancelled ?? false,
                error: result.error ?? null,
            });
            if (result.cancelled) {
                return false;
            }
            if (!result.success) {
                setError(result.error || "Purchase failed.");
                return false;
            }
            // Stripe redirects off-app, so this branch only flips for
            // Apple. We mark success and let the caller refetch the user.
            setSuccess(true);
            return true;
        } catch (err) {
            iapDebugError("usePayments.purchase:threw", err);
            setError(err instanceof Error ? err.message : "Purchase failed.");
            return false;
        } finally {
            setPurchaseLoading(false);
        }
    }, [activeProvider]);

    const openManagement = useCallback(async (): Promise<void> => {
        setError(null);
        setManageLoading(true);
        try {
            // Route to wherever the user actually pays today, not
            // wherever this device would charge a NEW purchase.
            const storedProvider = (user?.paymentProvider as PaymentProviderName | undefined) ?? null;
            const provider = getManagementProvider(storedProvider);

            // Stripe management requires we actually have a Stripe
            // customer id on record. If we don't, fall back to whichever
            // surface we *can* open.
            if (provider.name === "stripe" && !user?.stripeCustomerId) {
                const fallback = getPaymentProvider();
                if (fallback.name !== "stripe") {
                    await fallback.openManagement();
                    return;
                }
                throw new Error(
                    "No subscription to manage. Cancel is only available for subscriptions started from this account."
                );
            }

            await provider.openManagement();
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to open subscription management.";
            setError(message);
        } finally {
            setManageLoading(false);
        }
    }, [user?.paymentProvider, user?.stripeCustomerId]);

    const restore = useCallback(async (): Promise<boolean> => {
        setError(null);
        setRestoreLoading(true);
        try {
            const provider = getPaymentProvider();
            const result = await provider.restore();
            if (!result.success) {
                if (result.error) setError(result.error);
                return false;
            }
            setSuccess(true);
            return true;
        } finally {
            setRestoreLoading(false);
        }
    }, []);

    return {
        activeProvider,
        price,
        priceLoading,
        purchaseLoading,
        manageLoading,
        restoreLoading,
        error,
        success,
        clearStatus,
        purchase,
        openManagement,
        restore,
    };
}

/**
 * Refetch the live user-data document from Firestore and apply
 * subscription-related fields back into UserContext. Use this right
 * after a successful purchase so the rest of the app reflects the new
 * `isPro` state without waiting for an auth refresh.
 */
export async function refetchSubscriptionState(
    setUser: React.Dispatch<React.SetStateAction<any>>
): Promise<void> {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    try {
        const snap = await getDoc(doc(db, "user-data", currentUser.uid));
        if (!snap.exists()) return;
        const data = snap.data();
        setUser((prev: any) => ({
            ...prev,
            isPro: data.isPro === true,
            subscriptionPeriodEnd:
                typeof data.subscriptionPeriodEnd === "number"
                    ? data.subscriptionPeriodEnd
                    : undefined,
            paymentProvider:
                typeof data.paymentProvider === "string" ? data.paymentProvider : undefined,
            stripeCustomerId:
                typeof data.stripeCustomerId === "string" ? data.stripeCustomerId : prev?.stripeCustomerId,
            appleOriginalTransactionId:
                typeof data.appleOriginalTransactionId === "string"
                    ? data.appleOriginalTransactionId
                    : undefined,
        }));
    } catch (err) {
        console.warn("[usePayments] refetchSubscriptionState failed", err);
    }
}
