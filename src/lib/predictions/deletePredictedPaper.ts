import { getDocs, writeBatch } from "firebase/firestore";
import { db } from "../../../firebase";
import { predictionDocRef, predictionQuestionsRef } from "./firestorePaths";

/** Delete a prediction paper and all its question docs (subcollection is not auto-deleted). */
export async function deletePredictedPaper(predictionId: string): Promise<void> {
  const questionsSnap = await getDocs(predictionQuestionsRef(predictionId));
  const batch = writeBatch(db);

  questionsSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(predictionDocRef(predictionId));

  await batch.commit();
}

/** Delete every prediction in the collection (e.g. reset all generated papers). */
export async function deleteAllPredictedPapers(): Promise<number> {
  const { loadPredictionPapers } = await import("./loadPredictions");
  const papers = await loadPredictionPapers();
  for (const paper of papers) {
    await deletePredictedPaper(paper.id);
  }
  return papers.length;
}
