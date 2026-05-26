import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";
import cors from "cors";

const corsMiddleware = cors({ origin: true });

type SaveQuestion = { id: string; data: Record<string, unknown> };

type SaveBody = {
  idToken?: string;
  predictionId?: string;
  predictionDoc?: Record<string, unknown>;
  questions?: SaveQuestion[];
};

export const savePredictedPaper = functions.https.onRequest(
  { cors: true, memory: "256MiB" },
  (req, res) => {
    corsMiddleware(req, res, async () => {
      if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
        return;
      }

      try {
        const { idToken, predictionId, predictionDoc, questions } = (req.body || {}) as SaveBody;

        if (!idToken) {
          res.status(400).json({ error: "idToken is required" });
          return;
        }
        if (!predictionId || !predictionDoc || !Array.isArray(questions) || questions.length === 0) {
          res.status(400).json({ error: "predictionId, predictionDoc, and questions are required" });
          return;
        }

        let decoded: admin.auth.DecodedIdToken;
        try {
          decoded = await admin.auth().verifyIdToken(idToken);
        } catch {
          res.status(401).json({ error: "Invalid or expired session. Sign in again and retry." });
          return;
        }

        for (const question of questions) {
          if (!question.id || typeof question.data !== "object" || question.data === null) {
            res.status(400).json({ error: "Each question must have an id and data object" });
            return;
          }
        }

        const db = admin.firestore();

        let generatedByName =
          typeof predictionDoc.generatedByName === "string"
            ? predictionDoc.generatedByName.trim()
            : "";
        if (!generatedByName) {
          const userSnap = await db.doc(`user-data/${decoded.uid}`).get();
          const username = userSnap.data()?.username;
          if (typeof username === "string" && username.trim()) {
            generatedByName = username.trim();
          }
        }

        const paperRef = db.doc(`user-data/${decoded.uid}/predictions/${predictionId}`);
        const batch = db.batch();
        batch.set(paperRef, {
          ...predictionDoc,
          generatedBy: decoded.uid,
          ...(generatedByName ? { generatedByName } : {}),
        });

        for (const question of questions) {
          batch.set(paperRef.collection("questions").doc(question.id), question.data);
        }

        await batch.commit();
        res.status(200).json({ predictionId });
      } catch (err) {
        console.error("savePredictedPaper error:", err);
        const message = err instanceof Error ? err.message : "Failed to save prediction";
        res.status(500).json({ error: message });
      }
    });
  }
);
