import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";
import cors from "cors";
import fetch from "node-fetch";

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