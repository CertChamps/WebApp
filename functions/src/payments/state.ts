import * as admin from "firebase-admin";
import { BillingState, Provider, summarizeBilling } from "./policy";

/** Read before fetching current provider state. A concurrent provider write retries
 * the transaction AND the provider read, avoiding stale webhook snapshots. */
export async function reconcileBilling(
    uid: string,
    provider: Provider,
    load: () => Promise<{ state: BillingState; fields?: Record<string, unknown> }>,
): Promise<BillingState | null> {
    const ref = admin.firestore().doc(`user-data/${uid}`);
    return admin.firestore().runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) return null; // Never recreate deleted accounts from late webhooks.
        const data = snap.data()!;
        const states = { ...(data.billingSubscriptions ?? {}) };
        // Preserve the other provider's pre-migration entitlement until it reconciles.
        const legacy = data.paymentProvider ?? (data.stripeCustomerId ? "stripe" : data.appleOriginalTransactionId ? "apple" : null);
        if (legacy && legacy !== provider && !states[legacy] && data.isPro) {
            states[legacy] = {
                active: true, plan: data.subscriptionPlan ?? null,
                periodEnd: data.subscriptionPeriodEnd ?? null,
                cancelAtPeriodEnd: data.subscriptionCancelAtPeriodEnd === true, status: "active",
            };
        }
        const { state, fields } = await load();
        states[provider] = state;
        tx.set(ref, { ...fields, billingSubscriptions: states, ...summarizeBilling(states, provider) }, { merge: true });
        return state;
    });
}
