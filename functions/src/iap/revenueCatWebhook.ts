/**
 * RevenueCat integration for the CertChamps ACE Apple IAP path.
 *
 * Two HTTPS functions live here:
 *
 *   - `revenueCatWebhook` (POST)
 *       Configured in the RevenueCat dashboard under
 *       Project → Integrations → Webhooks. Receives every subscription
 *       lifecycle event (purchase, renewal, cancellation, expiration,
 *       billing issue, …) for ALL stores, but in practice we expect
 *       only `APP_STORE` events because Stripe goes through its own
 *       webhook. Writes the canonical `isPro` / `subscriptionPeriodEnd`
 *       /`paymentProvider` fields into `user-data/{uid}` and maintains
 *       an `apple_subscriptions/{originalTransactionId}` map so events
 *       that don't carry `app_user_id` (rare, on transfer/refund) can
 *       still find the right user.
 *
 *       Authentication: the dashboard lets you set an arbitrary
 *       `Authorization` header; we set
 *       `Bearer ${process.env.REVENUECAT_WEBHOOK_AUTH}` and verify it
 *       here with a timing-safe compare.
 *
 *   - `verifyAppleEntitlement` (POST, callable-style)
 *       Called by the iOS client immediately after a successful
 *       StoreKit purchase, so the user's `isPro` flag flips in
 *       Firestore without waiting for the webhook to race in. Hits
 *       RevenueCat's REST `/subscribers/{appUserID}` endpoint (which
 *       is authoritative — RC verifies receipts with Apple) and
 *       mirrors the same Firestore write the webhook would have done.
 *
 *       Both functions converge on the same Firestore schema the
 *       existing Stripe webhook writes, so the rest of the app
 *       (UserContext, manageAccount UI, isPro gates) needs no changes
 *       to support either provider.
 *
 * Required Firebase secrets (set via `firebase functions:secrets:set`):
 *
 *   REVENUECAT_WEBHOOK_AUTH   The shared bearer token the dashboard
 *                             will send in the Authorization header.
 *   REVENUECAT_REST_API_KEY   RevenueCat REST API v2 secret key
 *                             (project-scoped, "sk_..."). Used only by
 *                             `verifyAppleEntitlement`; the webhook
 *                             doesn't need it.
 */

import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";
import fetch from "node-fetch";

/** RevenueCat entitlement that grants ACE — must match the dashboard
 *  entitlement identifier exactly (including the space). */
const ACE_ENTITLEMENT_ID = "CertChamps ACE";

/** Firestore mirror of the App Store originalTransactionId → Firebase
 *  uid mapping. Mirrors the existing `stripe_subscriptions` collection. */
const APPLE_SUBSCRIPTION_MAP_COLLECTION = "apple_subscriptions";

/** Webhook event types that should grant / refresh access. */
const ACTIVATION_EVENTS = new Set([
    "INITIAL_PURCHASE",
    "RENEWAL",
    "UNCANCELLATION",
    "PRODUCT_CHANGE",
    "TRANSFER",
    "NON_RENEWING_PURCHASE",
    "SUBSCRIPTION_EXTENDED",
]);

/** Event types that should revoke access immediately. CANCELLATION is
 *  intentionally NOT here — it just means auto-renew was turned off;
 *  the user retains access until EXPIRATION fires. */
const REVOCATION_EVENTS = new Set([
    "EXPIRATION",
]);

/**
 * RevenueCat webhook payload shape (subset we use). The full schema is
 * documented at https://www.revenuecat.com/docs/webhooks.
 */
interface RcWebhookEvent {
    type?: string;
    app_user_id?: string | null;
    original_app_user_id?: string | null;
    aliases?: string[];
    product_id?: string;
    entitlement_ids?: string[] | null;
    entitlement_id?: string | null;
    expiration_at_ms?: number | null;
    purchased_at_ms?: number | null;
    original_transaction_id?: string | null;
    transaction_id?: string | null;
    store?: string;
    environment?: string;
}

interface RcWebhookBody {
    api_version?: string;
    event?: RcWebhookEvent;
}

/** Constant-time string compare to dodge timing attacks on the auth header. */
function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
}

/** Pull the bearer token out of an Authorization header. */
function extractBearer(header: string | string[] | undefined): string | null {
    const raw = Array.isArray(header) ? header[0] : header;
    if (!raw) return null;
    const m = raw.match(/^Bearer\s+(.+)$/i);
    return m ? m[1].trim() : raw.trim();
}

/** Look up the Firebase uid for this RevenueCat event. We trust
 *  `app_user_id` first (this is what we set via `Purchases.logIn(uid)`
 *  on the client), then fall back to `original_app_user_id`, then any
 *  alias, then a stored mapping by originalTransactionId. */
async function resolveUidForEvent(event: RcWebhookEvent): Promise<string | null> {
    const candidates: (string | null | undefined)[] = [
        event.app_user_id,
        event.original_app_user_id,
        ...(Array.isArray(event.aliases) ? event.aliases : []),
    ];
    for (const c of candidates) {
        if (typeof c === "string" && c && !c.startsWith("$RCAnonymousID:")) {
            return c;
        }
    }
    // Fall back to our mapping collection if we have a stored uid for
    // this Apple transaction (e.g. user signed out before a renewal).
    const txId = event.original_transaction_id;
    if (typeof txId === "string" && txId) {
        const mapDoc = await admin
            .firestore()
            .doc(`${APPLE_SUBSCRIPTION_MAP_COLLECTION}/${txId}`)
            .get();
        if (mapDoc.exists) {
            const uid = mapDoc.data()?.uid;
            if (typeof uid === "string") return uid;
        }
    }
    return null;
}

/** Apply an "active subscription" write for the given user, mirroring
 *  the fields the Stripe webhook writes for parity. */
async function writeActiveSubscription(args: {
    uid: string;
    productId: string | null;
    originalTransactionId: string | null;
    expirationAtMs: number | null;
}): Promise<void> {
    const { uid, productId, originalTransactionId, expirationAtMs } = args;
    const update: Record<string, unknown> = {
        isPro: true,
        paymentProvider: "apple",
    };
    if (typeof expirationAtMs === "number" && expirationAtMs > 0) {
        update.subscriptionPeriodEnd = Math.floor(expirationAtMs / 1000);
    }
    if (originalTransactionId) {
        update.appleOriginalTransactionId = originalTransactionId;
    }
    if (productId) {
        update.appleProductId = productId;
    }
    await admin.firestore().doc(`user-data/${uid}`).set(update, { merge: true });

    if (originalTransactionId) {
        await admin
            .firestore()
            .doc(`${APPLE_SUBSCRIPTION_MAP_COLLECTION}/${originalTransactionId}`)
            .set({ uid, productId: productId ?? null }, { merge: true });
    }
}

/** Revoke access for the given user. */
async function writeRevokedSubscription(args: {
    uid: string;
    originalTransactionId: string | null;
}): Promise<void> {
    await admin.firestore().doc(`user-data/${args.uid}`).set(
        {
            isPro: false,
            subscriptionPeriodEnd: null,
        },
        { merge: true }
    );
    if (args.originalTransactionId) {
        await admin
            .firestore()
            .doc(`${APPLE_SUBSCRIPTION_MAP_COLLECTION}/${args.originalTransactionId}`)
            .delete()
            .catch(() => undefined);
    }
}

export const revenueCatWebhook = functions.https.onRequest(
    {
        cors: false,
        secrets: ["REVENUECAT_WEBHOOK_AUTH"],
    },
    async (req, res) => {
        const expected = process.env.REVENUECAT_WEBHOOK_AUTH;
        if (!expected) {
            console.error("[revenueCatWebhook] REVENUECAT_WEBHOOK_AUTH not configured");
            res.status(500).send("server_misconfigured");
            return;
        }
        if (req.method !== "POST") {
            res.status(405).send("method_not_allowed");
            return;
        }
        const provided = extractBearer(req.headers["authorization"]);
        if (!provided || !timingSafeEqual(provided, expected)) {
            console.warn("[revenueCatWebhook] auth rejected");
            res.status(401).send("unauthorized");
            return;
        }

        const body = (req.body || {}) as RcWebhookBody;
        const event = body.event;
        if (!event || typeof event.type !== "string") {
            console.warn("[revenueCatWebhook] missing event");
            res.status(200).send("ok"); // ack so RC doesn't retry forever
            return;
        }

        // We only care about App Store events. The same webhook would
        // fire for any store RC is integrated with, but we route Stripe
        // through its own webhook to keep the two paths independent.
        if (event.store && event.store !== "APP_STORE" && event.store !== "MAC_APP_STORE") {
            res.status(200).send("ok"); // ignore but ack
            return;
        }

        // Confirm the event mentions our entitlement (or no entitlement
        // list — defensive default).
        const ents = event.entitlement_ids ?? (event.entitlement_id ? [event.entitlement_id] : null);
        if (Array.isArray(ents) && !ents.includes(ACE_ENTITLEMENT_ID)) {
            res.status(200).send("ok");
            return;
        }

        try {
            const uid = await resolveUidForEvent(event);
            if (!uid) {
                console.warn("[revenueCatWebhook] no uid resolvable for event", {
                    type: event.type,
                    app_user_id: event.app_user_id,
                });
                res.status(200).send("ok"); // ack — nothing we can do
                return;
            }

            if (ACTIVATION_EVENTS.has(event.type)) {
                await writeActiveSubscription({
                    uid,
                    productId: event.product_id ?? null,
                    originalTransactionId: event.original_transaction_id ?? null,
                    expirationAtMs: event.expiration_at_ms ?? null,
                });
            } else if (REVOCATION_EVENTS.has(event.type)) {
                await writeRevokedSubscription({
                    uid,
                    originalTransactionId: event.original_transaction_id ?? null,
                });
            } else if (event.type === "CANCELLATION") {
                // Auto-renew turned off but user keeps access until
                // expiration_at_ms. Just refresh the period end so the
                // UI shows the correct "Renews on" / "Ends on" date.
                if (typeof event.expiration_at_ms === "number") {
                    await admin.firestore().doc(`user-data/${uid}`).set(
                        { subscriptionPeriodEnd: Math.floor(event.expiration_at_ms / 1000) },
                        { merge: true }
                    );
                }
            }
            // BILLING_ISSUE, SUBSCRIBER_ALIAS, etc. → log only, no schema change.

            res.status(200).send("ok");
        } catch (err) {
            console.error("[revenueCatWebhook] failed to apply event", err);
            res.status(500).send("internal_error"); // RC will retry
        }
    }
);

/* ============================== verifyAppleEntitlement ============================== */

interface RcSubscriberResponse {
    subscriber?: {
        original_app_user_id?: string;
        entitlements?: Record<string, {
            expires_date?: string | null;
            product_identifier?: string | null;
        }>;
        subscriptions?: Record<string, {
            expires_date?: string | null;
            store?: string;
            original_purchase_date?: string | null;
        }>;
    };
}

/** Resolve an entitlement's expiration to a unix millisecond timestamp. */
function toMillis(iso: string | null | undefined): number | null {
    if (!iso) return null;
    const t = Date.parse(iso);
    return Number.isFinite(t) ? t : null;
}

export const verifyAppleEntitlement = functions.https.onRequest(
    {
        cors: true,
        secrets: ["REVENUECAT_REST_API_KEY"],
    },
    async (req, res) => {
        const apiKey = process.env.REVENUECAT_REST_API_KEY;
        if (!apiKey) {
            console.error("[verifyAppleEntitlement] REVENUECAT_REST_API_KEY missing");
            res.status(500).json({ error: "server_misconfigured" });
            return;
        }
        if (req.method !== "POST") {
            res.status(405).json({ error: "method_not_allowed" });
            return;
        }

        const { idToken } = (req.body || {}) as { idToken?: string };
        if (!idToken) {
            res.status(400).json({ error: "idToken required" });
            return;
        }

        let uid: string;
        try {
            const decoded = await admin.auth().verifyIdToken(idToken);
            uid = decoded.uid;
        } catch (err) {
            console.warn("[verifyAppleEntitlement] invalid id token", err);
            res.status(401).json({ error: "invalid_token" });
            return;
        }

        try {
            const url = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`;
            const rcRes = await fetch(url, {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    Accept: "application/json",
                    "X-Platform": "ios",
                },
            });
            if (!rcRes.ok) {
                const text = await rcRes.text();
                console.error("[verifyAppleEntitlement] RC API error", rcRes.status, text);
                res.status(502).json({ error: "revenuecat_error", details: text });
                return;
            }
            const data = (await rcRes.json()) as RcSubscriberResponse;
            const ent = data.subscriber?.entitlements?.[ACE_ENTITLEMENT_ID];
            const expiresMs = toMillis(ent?.expires_date ?? null);
            const isActive = !!ent && (expiresMs == null || expiresMs > Date.now());

            if (isActive) {
                // Pull the originalTransactionId out of the matching
                // subscription record. RC keys subscriptions by product
                // identifier; we just take the one whose expires_date
                // matches the entitlement's.
                const productId = ent?.product_identifier ?? null;
                const sub =
                    (productId && data.subscriber?.subscriptions?.[productId]) ||
                    Object.values(data.subscriber?.subscriptions ?? {}).find(
                        (s) => toMillis(s.expires_date ?? null) === expiresMs
                    );
                // RC's subscriptions blob doesn't expose Apple's
                // originalTransactionId on the free tier; we can still
                // write the product id + expiry. The webhook will fill
                // in the transaction id when it eventually fires.
                await writeActiveSubscription({
                    uid,
                    productId,
                    originalTransactionId:
                        // try common field names from richer plans
                        ((sub as { original_transaction_id?: string } | undefined)?.original_transaction_id) ??
                        null,
                    expirationAtMs: expiresMs,
                });
                res.status(200).json({ isPro: true, subscriptionPeriodEnd: expiresMs ? Math.floor(expiresMs / 1000) : null });
                return;
            }

            // No active ACE entitlement — don't *revoke* here, because
            // a network blip on RC's side could nuke a paying user.
            // Revocation is the webhook's job.
            res.status(200).json({ isPro: false });
        } catch (err) {
            console.error("[verifyAppleEntitlement] failed", err);
            res.status(500).json({ error: "internal_error" });
        }
    }
);
