import { doc, writeBatch } from "firebase/firestore";
import { auth, db } from "../../../firebase";
import { buildPredictionSavePayload } from "./buildPredictionSavePayload";
import { predictionDocRef, predictionQuestionsRef } from "./firestorePaths";
import { getCurrentPredictionOwner } from "./predictionOwner";
import type { PredictedPaperBlueprint } from "./types";

const SAVE_PREDICTION_URL =
  "https://us-central1-certchamps-a7527.cloudfunctions.net/savePredictedPaper";

function isPermissionError(err: unknown): boolean {
  const code = (err as { code?: string })?.code ?? "";
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    code === "permission-denied" ||
    msg.includes("permission") ||
    msg.includes("insufficient permissions")
  );
}

function isFetchError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return msg.includes("failed to fetch") || msg.includes("network");
}

async function saveViaCloudFunction(
  payload: Awaited<ReturnType<typeof buildPredictionSavePayload>>,
  subject: string,
  level: string
): Promise<string> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("You must be signed in to save a prediction.");
  }

  const idToken = await currentUser.getIdToken();
  const response = await fetch(SAVE_PREDICTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      idToken,
      subject,
      level,
      ...payload,
    }),
  });

  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
    predictionId?: string;
  };

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        "Save service is not deployed yet. Ask an admin to run: firebase deploy --only functions:savePredictedPaper — or add Firestore rules for questions/leavingcert/predictions (see FIRESTORE_PREDICTIONS_RULES.md)."
      );
    }
    throw new Error(data.error || `Failed to save prediction (${response.status}).`);
  }

  if (!data.predictionId) {
    throw new Error("Save succeeded but no prediction id was returned.");
  }

  return data.predictionId;
}

async function saveViaFirestore(
  payload: Awaited<ReturnType<typeof buildPredictionSavePayload>>
): Promise<string> {
  const batch = writeBatch(db);
  batch.set(predictionDocRef(payload.predictionId), payload.predictionDoc);
  for (const question of payload.questions) {
    batch.set(doc(predictionQuestionsRef(payload.predictionId), question.id), question.data);
  }
  await batch.commit();
  return payload.predictionId;
}

export async function savePredictedPaperToFirestore(
  subject: string,
  level: string,
  blueprint: PredictedPaperBlueprint
): Promise<string> {
  const owner = await getCurrentPredictionOwner();
  if (!owner) {
    throw new Error("You must be signed in to save a prediction.");
  }

  const payload = await buildPredictionSavePayload(subject, level, blueprint);
  payload.predictionDoc.generatedBy = owner.uid;
  payload.predictionDoc.generatedByName = owner.name;

  try {
    return await saveViaFirestore(payload);
  } catch (err) {
    if (!isPermissionError(err)) {
      if (isFetchError(err)) {
        throw new Error("Network error while saving. Check your connection and try again.");
      }
      throw err;
    }

    try {
      return await saveViaCloudFunction(payload, subject, level);
    } catch (cloudErr) {
      if (isFetchError(cloudErr)) {
        throw new Error(
          "Could not save: Firestore denied the write and the cloud save service is unreachable. Add admin write rules for questions/leavingcert/predictions in Firebase (see FIRESTORE_PREDICTIONS_RULES.md), or deploy functions:savePredictedPaper."
        );
      }
      throw cloudErr;
    }
  }
}
