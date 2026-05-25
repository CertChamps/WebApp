import { collection, doc, type CollectionReference, type DocumentReference } from "firebase/firestore";
import { db } from "../../../firebase";

/** Top-level collection for generated prediction papers (separate from real exam papers). */
export const PREDICTIONS_ROOT = ["questions", "leavingcert", "predictions"] as const;

export function predictionsCollectionRef(): CollectionReference {
  return collection(db, ...PREDICTIONS_ROOT);
}

export function predictionDocRef(predictionId: string): DocumentReference {
  return doc(db, ...PREDICTIONS_ROOT, predictionId);
}

export function predictionQuestionsRef(predictionId: string): CollectionReference {
  return collection(db, ...PREDICTIONS_ROOT, predictionId, "questions");
}
