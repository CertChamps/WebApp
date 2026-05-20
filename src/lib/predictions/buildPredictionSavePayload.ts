import { doc, getDoc } from "firebase/firestore";
import { db } from "../../../firebase";
import { getFirestoreSubjectIds } from "../../data/practiceHubSubjects";
import { resolveImageSelectionPaths } from "./loadPredictionImages";
import type { PredictedPaperBlueprint } from "./types";

type SourceQuestionData = Record<string, unknown>;

export type PredictionSavePayload = {
  predictionId: string;
  predictionDoc: Record<string, unknown>;
  questions: Array<{ id: string; data: Record<string, unknown> }>;
};

async function loadSourceQuestion(
  subject: string,
  level: string,
  sourcePaperId: string,
  sourceQuestionId: string
): Promise<{ data: SourceQuestionData; storagePath: string; sourceYear?: number }> {
  const paperRef = doc(
    db,
    "questions",
    "leavingcert",
    "subjects",
    subject,
    "levels",
    level,
    "papers",
    sourcePaperId
  );
  const paperSnap = await getDoc(paperRef);
  if (!paperSnap.exists()) {
    throw new Error(`Source paper not found: ${sourcePaperId}`);
  }
  const paperData = paperSnap.data();
  const storagePath = typeof paperData.storagePath === "string" ? paperData.storagePath : "";
  const sourceYear = typeof paperData.year === "number" ? paperData.year : undefined;

  const questionRef = doc(
    db,
    "questions",
    "leavingcert",
    "subjects",
    subject,
    "levels",
    level,
    "papers",
    sourcePaperId,
    "questions",
    sourceQuestionId
  );
  const questionSnap = await getDoc(questionRef);
  if (!questionSnap.exists()) {
    throw new Error(`Source question not found: ${sourcePaperId}/${sourceQuestionId}`);
  }

  return { data: questionSnap.data() as SourceQuestionData, storagePath, sourceYear };
}

/** Build the Firestore payload for a prediction (reads only — safe for client-side). */
export async function buildPredictionSavePayload(
  subject: string,
  level: string,
  blueprint: PredictedPaperBlueprint
): Promise<PredictionSavePayload> {
  const suffix =
    blueprint.contentType === "image"
      ? "image-prediction"
      : `p${blueprint.paperNumber ?? 1}-prediction`;
  const predictionId = `${blueprint.year}-${suffix}-${Date.now()}`;

  let thumbnailStoragePath = "";
  if (blueprint.contentType === "image" && blueprint.selections[0]) {
    const first = await resolveImageSelectionPaths(subject, level, blueprint.selections[0]);
    thumbnailStoragePath = first.imageStoragePaths[0] ?? "";
  }

  const firestoreSubject = getFirestoreSubjectIds(subject)[0] ?? subject;
  const questions: PredictionSavePayload["questions"] = [];

  for (let i = 0; i < blueprint.selections.length; i++) {
    const sel = blueprint.selections[i];
    const questionId = `q${i + 1}`;

    if (blueprint.contentType === "image") {
      const { displayName, imageStoragePaths } = await resolveImageSelectionPaths(
        subject,
        level,
        sel
      );
      questions.push({
        id: questionId,
        data: {
          questionName: `[Prediction] ${displayName}`,
          displayName,
          sourceTopic: sel.sourceTopic ?? "",
          imageKey: sel.imageKey ?? questionId,
          imageStoragePaths,
          predictionReason: sel.reason,
          predictionSlot: sel.slot,
        },
      });
      continue;
    }

    if (!sel.sourcePaperId || !sel.sourceQuestionId) {
      throw new Error(`Invalid past-paper selection at slot ${sel.slot}`);
    }

    const { data, storagePath, sourceYear } = await loadSourceQuestion(
      firestoreSubject,
      level,
      sel.sourcePaperId,
      sel.sourceQuestionId
    );

    questions.push({
      id: questionId,
      data: {
        ...data,
        questionName:
          typeof data.questionName === "string"
            ? `[Prediction] ${data.questionName}`
            : `[Prediction] Question ${i + 1}`,
        sourcePaperId: sel.sourcePaperId,
        sourceQuestionId: sel.sourceQuestionId,
        sourceSubject: firestoreSubject,
        sourceLevel: level,
        sourceStoragePath: storagePath,
        sourceYear: sourceYear ?? null,
        predictionReason: sel.reason,
        predictionSlot: sel.slot,
      },
    });
  }

  return {
    predictionId,
    predictionDoc: {
      contentType: blueprint.contentType,
      subject,
      level,
      year: blueprint.year,
      label: blueprint.label,
      predictionSummary: blueprint.summary,
      topicForecast: blueprint.topicForecast,
      generatedAt: Date.now(),
      ...(blueprint.contentType === "pastpaper"
        ? { paperNumber: blueprint.paperNumber ?? 1 }
        : { thumbnailStoragePath }),
    },
    questions,
  };
}
