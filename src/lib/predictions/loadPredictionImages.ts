import { getDocs } from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";
import { storage } from "../../../firebase";
import {
  groupImageQuestions,
  listQuestionsForTopic,
  type GroupedImageQuestion,
} from "../../hooks/useImageQuestions";
import { getStorageFolderName } from "../../data/practiceHubSubjects";
import { loadImageQuestionCatalog } from "./buildImagePrediction";
import { predictionQuestionsRef } from "./firestorePaths";
import type { PredictedQuestionSelection } from "./types";

export type StoredImagePredictionQuestion = {
  id: string;
  imageKey: string;
  displayName: string;
  sourceTopic: string;
  imageStoragePaths: string[];
  predictionReason?: string;
};

/** Resolve grouped image questions saved on a prediction doc. */
export async function loadStoredImagePredictionQuestions(
  uid: string,
  predictionId: string
): Promise<StoredImagePredictionQuestion[]> {
  const snap = await getDocs(predictionQuestionsRef(uid, predictionId));
  return snap.docs
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
    .map((d) => {
      const data = d.data();
      const paths = Array.isArray(data.imageStoragePaths)
        ? (data.imageStoragePaths as unknown[]).filter((p): p is string => typeof p === "string")
        : [];
      return {
        id: d.id,
        imageKey: typeof data.imageKey === "string" ? data.imageKey : d.id,
        displayName:
          typeof data.displayName === "string"
            ? data.displayName
            : typeof data.questionName === "string"
              ? data.questionName
              : d.id,
        sourceTopic: typeof data.sourceTopic === "string" ? data.sourceTopic : "",
        imageStoragePaths: paths,
        predictionReason:
          typeof data.predictionReason === "string" ? data.predictionReason : undefined,
      };
    });
}

export async function storedImageQuestionsToGrouped(
  stored: StoredImagePredictionQuestion[]
): Promise<GroupedImageQuestion[]> {
  return Promise.all(
    stored.map(async (q) => ({
      key: q.imageKey,
      displayName: q.displayName.replace(/^\[Prediction\]\s*/, ""),
      images: await Promise.all(
        q.imageStoragePaths.map(async (path) => {
          const downloadUrl = await getDownloadURL(ref(storage, path));
          const name = path.split("/").pop() ?? q.imageKey;
          return {
            name,
            displayName: name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "),
            storagePath: path,
            downloadUrl,
          };
        })
      ),
    }))
  );
}

export async function loadPredictionImageSession(
  uid: string,
  predictionId: string
): Promise<GroupedImageQuestion[]> {
  const stored = await loadStoredImagePredictionQuestions(uid, predictionId);
  return storedImageQuestionsToGrouped(stored);
}

/** Look up image paths when saving an image prediction selection. */
export async function resolveImageSelectionPaths(
  subjectSlug: string,
  level: string,
  selection: PredictedQuestionSelection
): Promise<{ displayName: string; imageStoragePaths: string[] }> {
  if (!selection.sourceTopic || !selection.imageKey) {
    throw new Error("Invalid image selection");
  }

  const storageSubject = getStorageFolderName(subjectSlug);
  const flat = await listQuestionsForTopic(storageSubject, level, selection.sourceTopic);
  const grouped = groupImageQuestions(flat);
  const match = grouped.find((g) => g.key === selection.imageKey);
  if (!match) {
    const catalog = await loadImageQuestionCatalog(subjectSlug, level);
    const fallback = catalog.find(
      (c) => c.topic === selection.sourceTopic && c.imageKey === selection.imageKey
    );
    if (!fallback) {
      throw new Error(`Image question not found: ${selection.sourceTopic}/${selection.imageKey}`);
    }
    return { displayName: fallback.displayName, imageStoragePaths: fallback.imagePaths };
  }

  return {
    displayName: match.displayName,
    imageStoragePaths: match.images.map((i) => i.storagePath),
  };
}
