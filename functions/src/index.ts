import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";
import cors from "cors";
import fetch from "node-fetch";
import Stripe from "stripe";

admin.initializeApp();

const corsMiddleware = cors({ origin: true });

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "google/gemini-2.5-flash-lite";

export const verifyCaptcha = functions.https.onRequest(
    {
        secrets: ["RECAPTCHA_SECRET_KEY"] // Add this!
    },
    (req, res) => {
        corsMiddleware(req, res, () => {
            (async () => {
                try {
                    const { token } = req.body;
                    const secretKey = process.env.RECAPTCHA_SECRET_KEY;

                    if (!secretKey) {
                        console.error("Missing RECAPTCHA_SECRET_KEY");
                        res.status(500).json({ success: false, error: "Server configuration error" });
                        return;
                    }

                    const verificationUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${token}`;

                    const response = await fetch(verificationUrl, { method: "POST" });
                    const data = await response.json();

                    if (data.success) {
                        res.json({ success: true });
                    } else {
                        console.error("reCAPTCHA validation failed:", data["error-codes"]);
                        res.json({ success: false, errors: data["error-codes"] });
                    }
                } catch (err) {
                    console.error("Function Error:", err);
                    res.status(500).json({ success: false, error: String(err) });
                }
            })();
        });
    }
);

export const chat = functions.https.onRequest({
    cors: true,
    secrets: ["OPENROUTER_API_KEY"]
}, async (req, res) => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        console.error("Missing OPENROUTER_API_KEY");
        res.status(500).json({ error: "Server configuration error" });
        return;
    }

    const { messages, context } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: "messages array is required" });
        return;
    }

    const systemMessage = typeof context === "string" && context.trim()
        ? {
            role: "system",
            content: `The user is working on the following math question. Use this as context when answering. Do not give away the final answer unless they ask—prefer hints, explanations, and step-by-step guidance.\n\n---\n${context}\n---`
        }
        : null;

    // Normalize messages: support multimodal content (text + image_url for vision)
    const apiMessages = (systemMessage ? [systemMessage, ...messages] : messages).map((m: { role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }) => {
        if (typeof m.content === "string") return m;
        if (Array.isArray(m.content)) {
            return {
                role: m.role,
                content: m.content.map((part: any) => {
                    if (part.type === "text" && typeof part.text === "string") return { type: "text", text: part.text };
                    if (part.type === "image_url" && part.image_url?.url) return { type: "image_url", image_url: { url: part.image_url.url } };
                    return part;
                }).filter(Boolean),
            };
        }
        return m;
    });

    try {
        const response = await fetch(OPENROUTER_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
                "HTTP-Referer": "https://certchamps.com"
            },
            body: JSON.stringify({
                model: OPENROUTER_MODEL,
                messages: apiMessages,
                max_tokens: 1000,
                stream: true
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error("OpenRouter API error:", response.status, errText);
            res.status(response.status).json({
                error: "OpenRouter API failed",
                details: errText
            });
            return;
        }

        // Stream the SSE response to the client
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders();

        const body = response.body as NodeJS.ReadableStream;
        body.pipe(res);
    } catch (error) {
        console.error("AI Error:", error);
        res.status(500).json({ error: "Failed to generate text" });
    }
});

// ======================== STRIPE PRO CHECKOUT ======================== //

const PRO_PRICE_EUR_CENTS = 2000; // €20.00

/** Create a Stripe Checkout Session for one-time Pro upgrade (€20). Expects POST with JSON body: { idToken, successUrl?, cancelUrl? } */
export const createProCheckout = functions.https.onRequest(
    {
        cors: true,
        secrets: ["STRIPE_SECRET_KEY"],
    },
    (req, res) => {
        corsMiddleware(req, res, async () => {
            if (req.method !== "POST") {
                res.status(405).json({ error: "Method not allowed" });
                return;
            }
            try {
                const stripeKey = process.env.STRIPE_SECRET_KEY;
                if (!stripeKey) {
                    console.error("Missing STRIPE_SECRET_KEY");
                    res.status(500).json({ error: "Server configuration error" });
                    return;
                }
                const { idToken, successUrl, cancelUrl } = req.body || {};
                if (!idToken) {
                    res.status(400).json({ error: "idToken is required" });
                    return;
                }
                let uid: string;
                try {
                    const decoded = await admin.auth().verifyIdToken(idToken);
                    uid = decoded.uid;
                } catch (e) {
                    console.error("Invalid idToken:", e);
                    res.status(401).json({ error: "Invalid or expired token" });
                    return;
                }
                const origin = req.headers.origin || "https://certchamps-a7527.web.app";
                const base = origin.replace(/\/$/, "");
                const success = successUrl || `${base}/#/user/manage-account?success=pro`;
                const cancel = cancelUrl || `${base}/#/user/manage-account?cancel=pro`;

                const stripe = new Stripe(stripeKey, { apiVersion: "2025-02-24.acacia" });
                const session = await stripe.checkout.sessions.create({
                    mode: "payment",
                    payment_method_types: ["card"],
                    line_items: [
                        {
                            quantity: 1,
                            price_data: {
                                currency: "eur",
                                unit_amount: PRO_PRICE_EUR_CENTS,
                                product_data: {
                                    name: "CertChamps Pro",
                                    description: "One-time upgrade to Pro account",
                                },
                            },
                        },
                    ],
                    client_reference_id: uid,
                    success_url: success,
                    cancel_url: cancel,
                });

                res.status(200).json({ url: session.url });
            } catch (err) {
                console.error("createProCheckout error:", err);
                res.status(500).json({ error: "Failed to create checkout session" });
            }
        });
    }
);

/** Stripe webhook: on checkout.session.completed, set user isPro in Firestore. Requires rawBody for signature verification (Cloud Functions may expose it as req.rawBody). */
export const stripeWebhook = functions.https.onRequest(
    {
        cors: false,
        secrets: ["STRIPE_WEBHOOK_SECRET", "STRIPE_SECRET_KEY"],
    },
    async (req, res) => {
        const stripeKey = process.env.STRIPE_SECRET_KEY;
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!webhookSecret || !stripeKey) {
            console.error("Missing STRIPE_WEBHOOK_SECRET or STRIPE_SECRET_KEY");
            res.status(500).end();
            return;
        }
        const sig = req.headers["stripe-signature"];
        if (!sig) {
            res.status(400).send("Missing stripe-signature");
            return;
        }
        const rawBody = (req as { rawBody?: Buffer }).rawBody ?? (typeof req.body === "string" ? Buffer.from(req.body) : Buffer.from(JSON.stringify(req.body || {})));
        let event: Stripe.Event;
        try {
            event = Stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
        } catch (e) {
            console.error("Stripe webhook signature verification failed:", e);
            res.status(400).send("Invalid signature");
            return;
        }
        if (event.type !== "checkout.session.completed") {
            res.status(200).send("OK");
            return;
        }
        const session = event.data.object as Stripe.Checkout.Session;
        const uid = session.client_reference_id;
        if (!uid) {
            console.error("checkout.session.completed missing client_reference_id");
            res.status(200).send("OK");
            return;
        }
        try {
            await admin.firestore().doc(`user-data/${uid}`).set({ isPro: true }, { merge: true });
        } catch (e) {
            console.error("Failed to update user isPro:", e);
            res.status(500).end();
            return;
        }
        res.status(200).send("OK");
    }
);