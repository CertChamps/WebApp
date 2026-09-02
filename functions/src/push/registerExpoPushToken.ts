import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";
import cors from "cors";

const corsMiddleware = cors({ origin: true });

/**
 * Authenticated users register their Expo push token so they can receive
 * Discover engagement alerts (and admins also receive moderation alerts).
 * Uses Admin SDK so client Firestore rules cannot block the write.
 */
export const registerExpoPushToken = functions.https.onRequest(
    { cors: true },
    (req, res) => {
        corsMiddleware(req, res, async () => {
            if (req.method !== "POST") {
                res.status(405).json({ error: "Method not allowed" });
                return;
            }

            try {
                const authHeader = req.headers.authorization;
                const match = typeof authHeader === "string"
                    ? authHeader.match(/^Bearer\s+(.+)$/i)
                    : null;
                const idToken = match?.[1]?.trim();
                if (!idToken) {
                    res.status(401).json({ error: "AUTH_REQUIRED" });
                    return;
                }

                const decoded = await admin.auth().verifyIdToken(idToken);
                const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
                if (!token || !token.startsWith("ExponentPushToken")) {
                    res.status(400).json({ error: "INVALID_TOKEN" });
                    return;
                }

                const platform = typeof req.body?.platform === "string" ? req.body.platform : null;

                await admin.firestore().doc(`user-data/${decoded.uid}`).set(
                    {
                        expoPushTokens: admin.firestore.FieldValue.arrayUnion(token),
                        expoPushTokenUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
                        ...(platform ? { expoPushPlatform: platform } : {}),
                    },
                    { merge: true }
                );

                res.status(200).json({ ok: true });
            } catch (error) {
                console.error("registerExpoPushToken failed", error);
                res.status(500).json({ error: "REGISTER_FAILED" });
            }
        });
    }
);

/** @deprecated Prefer registerExpoPushToken — kept so older app builds keep working. */
export const registerAdminPushToken = registerExpoPushToken;
