import { PRACTICE_HUB_SUBJECTS } from "../../data/practiceHubSubjects";

/** Subjects with Firestore PDF past papers (Paper 1 / Paper 2). */
export const PAST_PAPER_PREDICTION_SUBJECTS = new Set([
  "maths",
  "applied-maths",
  "physics",
  "irish",
]);

/** All Practice Hub subjects that use image-based question banks in Storage. */
export const IMAGE_PREDICTION_SUBJECTS = PRACTICE_HUB_SUBJECTS.filter(
  (s) => !PAST_PAPER_PREDICTION_SUBJECTS.has(s.id) && s.id !== "mathematics" && s.id !== "applied-mathematics"
);

export function subjectUsesPastPaperPredictions(subjectId: string): boolean {
  if (PAST_PAPER_PREDICTION_SUBJECTS.has(subjectId)) return true;
  if (subjectId === "mathematics" || subjectId === "applied-mathematics") return true;
  return false;
}
