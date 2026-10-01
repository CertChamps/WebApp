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
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../../firebase";
import { UserContext } from "../context/UserContext";
import {
    getActiveProviderName,
    getManagementProvider,
    getPaymentProvider,
    type PaymentProviderName,
    type PriceDetails,
    type SubscriptionPlan,
} from "../lib/payments";
import { iapDebug, iapDebugError, iapDebugWarn, timed } from "../lib/payments/paymentsDebug";

interface UsePaymentsResult {
    /** Which provider will be used for a NEW purchase right now. */
    activeProvider: PaymentProviderName;
    /** Display price for the upgrade card. Null while loading or if the
     *  provider has no price configured (e.g. RevenueCat offering empty). */
    price: PriceDetails | null;
    prices: Record<SubscriptionPlan, PriceDetails | null>;
    selectedPlan: SubscriptionPlan;
    selectPlan: (plan: SubscriptionPlan) => void;
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
    openManagement: (provider?: PaymentProviderName) => Promise<void>;
    /** Restore previous purchases — only meaningful on Apple. */
    restore: () => Promise<boolean>;
}

export function usePayments(): UsePaymentsResult {
    const { user, setUser } = useContext(UserContext);
    const [activeProvider] = useState<PaymentProviderName>(() => getActiveProviderName());
    const [selectedPlan, selectPlan] = useState<SubscriptionPlan>("annual");
    const [prices, setPrices] = useState<Record<SubscriptionPlan, PriceDetails | null>>({ monthly: null, annual: null });
    const price = prices[selectedPlan];
    const [priceLoading, setPriceLoading] = useState(true);
    const [purchaseLoading, setPurchaseLoading] = useState(false);
    const [manageLoading, setManageLoading] = useState(false);
    const [restoreLoading, setRestoreLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    // Resolve the price lazily once the active provider is ready. Apple
    // returns a localized StoreKit price; Stripe returns €4/month or €40/year.
    useEffect(() => {
        let cancelled = false;
        setPriceLoading(true);
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
                const [monthly, annual] = await Promise.all([
                    provider.getPrice("monthly"), provider.getPrice("annual"),
                ]);
                if (!cancelled) setPrices({ monthly, annual });
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
    }, [activeProvider, user?.uid]);

    const clearStatus = useCallback(() => {
        setError(null);
        setSuccess(false);
    }, []);

    const purchase = useCallback(async (): Promise<boolean> => {
        setError(null);
        setSuccess(false);
        if (!price || user?.isPro) return false;
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
                provider.purchase(selectedPlan)
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
    }, [activeProvider, selectedPlan, price, user?.isPro]);

    const openManagement = useCallback(async (requestedProvider?: PaymentProviderName): Promise<void> => {
        setError(null);
        setManageLoading(true);
        try {
            // Route to wherever the user actually pays today, not
            // wherever this device would charge a NEW purchase.
            const storedProvider = requestedProvider ?? user?.paymentProvider ??
                (user?.stripeCustomerId ? "stripe" : user?.appleOriginalTransactionId ? "apple" : null);
            const provider = getManagementProvider(storedProvider);

            await provider.openManagement();
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to open subscription management.";
            setError(message);
        } finally {
            setManageLoading(false);
        }
    }, [user?.paymentProvider, user?.stripeCustomerId, user?.appleOriginalTransactionId]);

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
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not restore purchases.");
            return false;
        } finally {
            setRestoreLoading(false);
        }
    }, []);

    // Keep webhooks and portal changes visible without a sign-out/sign-in.
    useEffect(() => {
        if (!user?.uid) return;
        return onSnapshot(doc(db, "user-data", user.uid), snap => {
            if (snap.exists()) setUser((prev: any) => prev?.uid === snap.id
                ? { ...prev, ...subscriptionFields(snap.data()) } : prev);
        }, err => console.warn("Subscription updates unavailable", err));
    }, [user?.uid, setUser]);

    return {
        activeProvider,
        price,
        prices,
        selectedPlan,
        selectPlan,
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
        setUser((prev: any) => prev?.uid === currentUser.uid
            ? { ...prev, ...subscriptionFields(data) } : prev);
    } catch (err) {
        console.warn("[usePayments] refetchSubscriptionState failed", err);
    }
}

function subscriptionFields(data: Record<string, any>) {
    return {
        isPro: data.isPro === true,
        subscriptionPeriodEnd: data.subscriptionPeriodEnd ?? undefined,
        subscriptionPlan: data.subscriptionPlan ?? undefined,
        subscriptionCancelAtPeriodEnd: data.subscriptionCancelAtPeriodEnd === true,
        paymentProvider: data.paymentProvider ?? undefined,
        stripeCustomerId: data.stripeCustomerId ?? undefined,
        appleOriginalTransactionId: data.appleOriginalTransactionId ?? undefined,
        billingSubscriptions: data.billingSubscriptions ?? {},
    };
}
