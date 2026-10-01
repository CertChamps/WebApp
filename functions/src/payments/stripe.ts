import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";
import Stripe from "stripe";
import type { Response } from "express";
import { randomUUID } from "node:crypto";
import { PLANS, validPlan } from "./policy";
import { reconcileBilling } from "./state";

const ACCOUNT_URL = "https://app.certchamps.ie/#/user/manage-account?tab=payments";
const stripeClient = () => new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-02-24.acacia" });
const customerId = (value: string | { id: string } | null) => typeof value === "string" ? value : value?.id;

async function authenticatedUid(req: functions.https.Request): Promise<string> {
    if (typeof req.body?.idToken !== "string") throw new Error("unauthenticated");
    try { return (await admin.auth().verifyIdToken(req.body.idToken)).uid; }
    catch { throw new Error("unauthenticated"); }
}
function fail(res: Response, err: unknown) {
    if (err instanceof Error && err.message === "unauthenticated") {
        res.status(401).json({ error: "Sign in again to manage your subscription." });
    } else {
        console.error("Billing request failed", err);
        res.status(500).json({ error: "Billing is unavailable. Please try again shortly." });
    }
}

async function syncStripe(stripe: Stripe, uid: string, customer: string) {
    return reconcileBilling(uid, "stripe", async () => {
        const subscriptions = [];
        for await (const sub of stripe.subscriptions.list({ customer, status: "all", limit: 100 })) {
            // Legacy checkout subscriptions have no metadata. This customer belongs to this Firebase account.
            if (!sub.metadata.firebaseUid || sub.metadata.firebaseUid === uid) subscriptions.push(sub);
        }
        const active = subscriptions.filter(s => ["active", "trialing"].includes(s.status) && s.current_period_end > Date.now() / 1000);
        const sub = (active.length ? active : subscriptions).sort((a, b) => b.current_period_end - a.current_period_end)[0];
        const interval = sub?.items.data[0]?.price.recurring?.interval;
        return {
            state: {
                active: active.length > 0,
                plan: interval === "month" ? "monthly" : interval === "year" ? "annual" : null,
                periodEnd: sub?.current_period_end ?? null,
                cancelAtPeriodEnd: !!(sub?.cancel_at_period_end || sub?.cancel_at),
                status: sub?.status ?? "none",
            },
            fields: { stripeCustomerId: customer, stripeSubscriptionId: sub?.id ?? null },
        };
    });
}

export const createProCheckout = functions.https.onRequest(
    { cors: true, secrets: ["STRIPE_SECRET_KEY"] },
    async (req, res) => {
        if (req.method !== "POST") { res.status(405).end(); return; }
        let lease: { ref: admin.firestore.DocumentReference; token: string } | undefined;
        try {
            const uid = await authenticatedUid(req);
            // Older deployed clients omitted plan; keep those on the annual path.
            const plan = req.body.plan ?? "annual";
            if (!validPlan(plan)) { res.status(400).json({ error: "Choose monthly or annual." }); return; }
            const db = admin.firestore();
            const userRef = db.doc(`user-data/${uid}`);
            const lockRef = db.doc(`billing_checkout_locks/${uid}`);
            const token = randomUUID();
            const claimed = await db.runTransaction(async tx => {
                const lock = await tx.get(lockRef);
                if ((lock.data()?.until ?? 0) > Date.now()) return false;
                tx.set(lockRef, { token, until: Date.now() + 180_000 });
                return true;
            });
            if (!claimed) { res.status(409).json({ error: "Checkout is already opening. Please wait and try again." }); return; }
            lease = { ref: lockRef, token };
            const user = (await userRef.get()).data();
            if (!user) { res.status(404).json({ error: "Account not found." }); return; }
            if (user.isPro) { res.status(409).json({ error: "You already have ACE. Use Manage subscription to change your plan." }); return; }
            const stripe = stripeClient();
            const configured = PLANS[plan];
            const priceId = process.env[configured.env];
            if (!priceId) throw new Error(`Missing ${configured.env}`);
            const price = await stripe.prices.retrieve(priceId);
            if (!price.active || price.currency !== "eur" || price.unit_amount !== configured.amount ||
                price.recurring?.interval !== configured.interval || price.recurring.interval_count !== 1 || price.recurring.usage_type !== "licensed") {
                throw new Error(`Invalid configured ${plan} price`);
            }
            let customer = user.stripeCustomerId as string | undefined;
            if (!customer) {
                const created = await stripe.customers.create({ metadata: { firebaseUid: uid } }, { idempotencyKey: `certchamps-customer-${uid}` });
                customer = created.id;
                await userRef.update({ stripeCustomerId: customer });
            }
            const existing = await stripe.subscriptions.list({ customer, status: "all", limit: 100 });
            if (existing.data.some(s => !["canceled", "incomplete_expired"].includes(s.status))) {
                await syncStripe(stripe, uid, customer);
                res.status(409).json({ error: "You already have a subscription or a payment to resolve. Use Manage subscription." });
                return;
            }
            if (user.stripeCheckoutSessionId) {
                const previous = await stripe.checkout.sessions.retrieve(user.stripeCheckoutSessionId);
                if (previous.status === "open") {
                    if (previous.metadata?.plan === plan && previous.metadata?.priceId === priceId) {
                        res.json({ url: previous.url }); return;
                    }
                    await stripe.checkout.sessions.expire(previous.id);
                }
            }
            const session = await stripe.checkout.sessions.create({
                customer, mode: "subscription", payment_method_types: ["card"],
                line_items: [{ price: priceId, quantity: 1 }],
                client_reference_id: uid,
                metadata: { firebaseUid: uid, plan, priceId },
                subscription_data: { metadata: { firebaseUid: uid, plan } },
                success_url: `${ACCOUNT_URL}&success=pro`, cancel_url: `${ACCOUNT_URL}&cancel=pro`,
            }, { idempotencyKey: `certchamps-checkout-${uid}-${token}` });
            await userRef.update({ stripeCheckoutSessionId: session.id });
            res.json({ url: session.url });
        } catch (err) { fail(res, err); }
        finally {
            if (lease) {
                const { ref, token } = lease;
                await admin.firestore().runTransaction(async tx => {
                    const snap = await tx.get(ref);
                    if (snap.data()?.token === token) tx.delete(ref);
                }).catch(err => console.error("Checkout lock release failed", err));
            }
        }
    },
);

export const createBillingPortalSession = functions.https.onRequest(
    { cors: true, secrets: ["STRIPE_SECRET_KEY"] },
    async (req, res) => {
        if (req.method !== "POST") { res.status(405).end(); return; }
        try {
            const uid = await authenticatedUid(req);
            const user = (await admin.firestore().doc(`user-data/${uid}`).get()).data();
            if (!user?.stripeCustomerId) { res.status(400).json({ error: "No website subscription found for this account." }); return; }
            const session = await stripeClient().billingPortal.sessions.create({
                customer: user.stripeCustomerId, return_url: ACCOUNT_URL,
                ...(process.env.STRIPE_PORTAL_CONFIGURATION_ID ? { configuration: process.env.STRIPE_PORTAL_CONFIGURATION_ID } : {}),
            });
            res.json({ url: session.url });
        } catch (err) { fail(res, err); }
    },
);

export const stripeWebhook = functions.https.onRequest(
    { cors: false, secrets: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] },
    async (req, res) => {
        if (req.method !== "POST") { res.status(405).end(); return; }
        const stripe = stripeClient();
        let event: Stripe.Event;
        try {
            const sig = req.headers["stripe-signature"];
            if (typeof sig !== "string") throw new Error("Missing signature");
            event = stripe.webhooks.constructEvent(req.rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!);
        } catch { res.status(400).send("Invalid signature"); return; }
        try {
            let uid: string | undefined;
            let customer: string | undefined;
            let subscription: string | undefined;
            if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
                const session = event.data.object as Stripe.Checkout.Session;
                if (session.mode !== "subscription") { res.send("ok"); return; }
                uid = session.client_reference_id ?? session.metadata?.firebaseUid;
                customer = customerId(session.customer);
                subscription = customerId(session.subscription);
            } else if (event.type.startsWith("customer.subscription.")) {
                const sub = event.data.object as Stripe.Subscription;
                uid = sub.metadata.firebaseUid;
                customer = customerId(sub.customer);
                subscription = sub.id;
            } else if (["invoice.paid", "invoice.payment_failed", "invoice.payment_action_required"].includes(event.type)) {
                const invoice = event.data.object as Stripe.Invoice;
                customer = customerId(invoice.customer);
                subscription = customerId(invoice.subscription);
            } else { res.send("ok"); return; }
            if (!uid && subscription) {
                uid = (await admin.firestore().doc(`stripe_subscriptions/${subscription}`).get()).data()?.uid;
            }
            if (!uid && customer) {
                const c = await stripe.customers.retrieve(customer);
                if (!c.deleted) uid = c.metadata.firebaseUid;
                if (!uid) uid = (await admin.firestore().collection("user-data").where("stripeCustomerId", "==", customer).limit(1).get()).docs[0]?.id;
            }
            if (uid && customer) {
                const state = await syncStripe(stripe, uid, customer);
                if (state && subscription) await admin.firestore().doc(`stripe_subscriptions/${subscription}`).set({ uid });
            }
            res.send("ok");
        } catch (err) { console.error("Stripe reconciliation failed", err); res.status(500).send("Retry"); }
    },
);
