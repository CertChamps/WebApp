/** App Store purchases are verified by RevenueCat. Every notification reads the
 * current subscriber, so retries, out-of-order events, refunds and transfers
 * converge on current access rather than replaying stale event payloads. */
import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { timingSafeEqual } from "node:crypto";
import fetch from "node-fetch";
import { appleBillingState, RcSubscriber } from "../payments/policy";
import { reconcileBilling } from "../payments/state";

function validUid(value: unknown): value is string {
    return typeof value === "string" && value.length > 0 && value.length <= 128 &&
        !value.includes("/") && !value.startsWith("$RCAnonymousID:");
}

async function syncApple(uid: string) {
    return reconcileBilling(uid, "apple", async () => {
        const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
            headers: { Authorization: `Bearer ${process.env.REVENUECAT_REST_API_KEY}`, Accept: "application/json" },
            timeout: 15_000,
        });
        if (!response.ok) throw new Error(`RevenueCat subscriber request failed: ${response.status}`);
        const data = await response.json() as { subscriber?: RcSubscriber };
        if (!data.subscriber) throw new Error("Invalid RevenueCat subscriber response");
        const state = appleBillingState(data.subscriber);
        return { state, fields: { appleProductId: state.productId ?? null } };
    });
}

export const revenueCatWebhook = functions.https.onRequest(
    { cors: false, secrets: ["REVENUECAT_WEBHOOK_AUTH", "REVENUECAT_REST_API_KEY"] },
    async (req, res) => {
        if (req.method !== "POST") { res.status(405).end(); return; }
        const secret = process.env.REVENUECAT_WEBHOOK_AUTH;
        if (!secret) { res.status(500).send("Missing configuration"); return; }
        const expected = Buffer.from(`Bearer ${secret}`);
        const actual = Buffer.from(req.headers.authorization ?? "");
        if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
            res.status(401).send("Unauthorized"); return;
        }
        const event = req.body?.event;
        if (!event || typeof event.type !== "string") { res.status(400).send("Invalid event"); return; }
        if (event.type === "TEST") { res.send("ok"); return; }
        if (event.store && !["APP_STORE", "MAC_APP_STORE"].includes(event.store)) { res.send("ok"); return; }
        try {
            // Transfers have transferred_from/to instead of app_user_id.
            const ids: unknown[] = event.type === "TRANSFER"
                ? [...(event.transferred_from ?? []), ...(event.transferred_to ?? [])]
                : [event.app_user_id];
            if (!ids.some(validUid)) ids.push(event.original_app_user_id, ...(event.aliases ?? []));
            if (!ids.some(validUid) && typeof event.original_transaction_id === "string" && !event.original_transaction_id.includes("/")) {
                ids.push((await admin.firestore().doc(`apple_subscriptions/${event.original_transaction_id}`).get()).data()?.uid);
            }
            for (const uid of [...new Set(ids.filter(validUid))]) {
                const state = await syncApple(uid);
                if (state?.active && typeof event.original_transaction_id === "string" && !event.original_transaction_id.includes("/")) {
                    await admin.firestore().doc(`apple_subscriptions/${event.original_transaction_id}`).set({ uid });
                    await admin.firestore().doc(`user-data/${uid}`).update({ appleOriginalTransactionId: event.original_transaction_id });
                }
            }
            res.send("ok");
        } catch (err) { console.error("RevenueCat reconciliation failed", err); res.status(500).send("Retry"); }
    },
);

export const verifyAppleEntitlement = functions.https.onRequest(
    { cors: true, secrets: ["REVENUECAT_REST_API_KEY"] },
    async (req, res) => {
        if (req.method !== "POST") { res.status(405).end(); return; }
        let uid: string;
        try {
            if (typeof req.body?.idToken !== "string") throw new Error("Missing token");
            uid = (await admin.auth().verifyIdToken(req.body.idToken)).uid;
        } catch { res.status(401).json({ error: "Sign in again to verify your purchase." }); return; }
        try {
            const state = await syncApple(uid);
            res.json({ isPro: state?.active === true, subscriptionPeriodEnd: state?.periodEnd ?? null });
        } catch (err) {
            console.error("Apple entitlement verification failed", err);
            res.status(502).json({ error: "Your purchase is still being verified. Try Restore purchases shortly." });
        }
    },
);
