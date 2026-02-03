import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";
import cors from "cors";
import fetch from "node-fetch";

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