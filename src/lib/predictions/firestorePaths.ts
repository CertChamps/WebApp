import { collection, doc, type CollectionReference, type DocumentReference } from "firebase/firestore";
import { db } from "../../../firebase";

/** Per-user prediction collection: predictions are personal to the signed-in user. */
const PREDICTIONS_SEGMENT = "predictions";

function assertUid(uid: string | null | undefined): string {
  if (!uid) {
    throw new Error("A signed-in user is required for prediction storage.");
  }
  return uid;
}

export function predictionsCollectionRef(uid: string): CollectionReference {
  return collection(db, "user-data", assertUid(uid), PREDICTIONS_SEGMENT);
}

export function predictionDocRef(uid: string, predictionId: string): DocumentReference {
  return doc(db, "user-data", assertUid(uid), PREDICTIONS_SEGMENT, predictionId);
}

export function predictionQuestionsRef(uid: string, predictionId: string): CollectionReference {
  return collection(db, "user-data", assertUid(uid), PREDICTIONS_SEGMENT, predictionId, "questions");
}
