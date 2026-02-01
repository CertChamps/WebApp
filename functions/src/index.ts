import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";
import cors from "cors";
import fetch from "node-fetch";
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText, convertToModelMessages } from 'ai';
admin.initializeApp();

const corsMiddleware = cors({ origin: true });

export const verifyCaptcha = functions.https.onRequest(
    {
        secrets: ["RECAPTCHA_SECRET_KEY"] // Add this!
    },
    async (req, res) => {
        corsMiddleware(req, res, async () => {
            try {
                const { token } = req.body;
                const secretKey = process.env.RECAPTCHA_SECRET_KEY;

                if (!secretKey) {
                    console.error("Missing RECAPTCHA_SECRET_KEY");
                    return res.status(500).json({ success: false, error: "Server configuration error" });
                }

                const verificationUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${token}`;
                
                const response = await fetch(verificationUrl, { method: "POST" });
                const data = await response.json();

                if (data.success) {
                    return res.json({ success: true });
                } else {
                    console.error("reCAPTCHA validation failed:", data["error-codes"]);
                    return res.json({ success: false, errors: data["error-codes"] });
                }
            } catch (err) {
                console.error("Function Error:", err);
                return res.status(500).json({ success: false, error: String(err) });
            }
        });
    }
);


export const aiChat = functions.https.onRequest(
    { secrets: ['OPENROUTER_API_KEY'] },
    async (req, res) => {
        corsMiddleware(req, res, async () => {
            try {
                if (req.method !== 'POST') {
                    res.status(405).json({ error: 'Method not allowed' });
                    return;
                }

                const apiKey = process.env.OPENROUTER_API_KEY;
                if (!apiKey) {
                    res.status(500).json({ error: 'Server configuration error' });
                    return;
                }

                // Step 4: Parse JSON body - Firebase parses application/json into req.body
                const parsed = (req.body || {}) as Record<string, unknown>;
                const { messages, ...context } = parsed;

                if (!messages || !Array.isArray(messages)) {
                    res.status(400).json({ error: 'Messages required' });
                    return;
                }

                const openrouter = createOpenRouter({ apiKey });
                const modelId = 'deepseek/deepseek-r1:free';

                const systemContent = buildSystemPrompt(context);

                const result = streamText({
                    model: openrouter(modelId),
                    system: systemContent,
                    messages: await convertToModelMessages(messages),
                    maxOutputTokens: 2048,
                });

                const stream = result.toUIMessageStreamResponse();
                const webStream = stream.body;
                if (!webStream) {
                    res.status(500).json({ error: 'No stream' });
                    return;
                }

                res.setHeader('Content-Type', stream.headers.get('Content-Type') || 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');
                res.setHeader('X-Vercel-AI-Data-Stream', 'v1');

                const { Readable } = await import('stream');
                const nodeStream = Readable.fromWeb(webStream as import('stream/web').ReadableStream);
                nodeStream.pipe(res);
            } catch (err) {
                console.error('AI Chat Error:', err);
                res.status(500).json({ error: 'AI service error' });
            }
        });
    }
);
  
function buildSystemPrompt(body?: Record<string, unknown>): string {
  const base = `You are a helpful Irish Leaving Cert maths tutor. Use LaTeX for math: $x^2 + 1$.`;
  if (!body?.questionContext) return base;
  return `${base}\n\nCurrent question context:\n${JSON.stringify(body.questionContext)}`;
}