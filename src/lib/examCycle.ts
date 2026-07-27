/** Exam cycle roots under Firestore `questions/{root}` and Storage image prefixes. */

export type ExamCycleId = "leaving" | "junior";

export type ExamCycleConfig = {
  id: ExamCycleId;
  label: string;
  /** Firestore document id under `questions/` */
  firestoreRoot: string;
  /** Storage prefix for images (legacy / marking schemes) */
  storagePrefix: string;
};

export const EXAM_CYCLES: Record<ExamCycleId, ExamCycleConfig> = {
  leaving: {
    id: "leaving",
    label: "Leaving Cert",
    firestoreRoot: "leavingcert",
    storagePrefix: "temp_images/leaving-cert",
  },
  junior: {
    id: "junior",
    label: "Junior Cycle",
    firestoreRoot: "juniorcert",
    storagePrefix: "temp_images/junior-cycle",
  },
};

export const DEFAULT_EXAM_CYCLE: ExamCycleId = "leaving";

export function parseExamCycle(raw: string | null | undefined): ExamCycleId {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "junior" || v === "juniorcert" || v === "junior-cycle" || v === "jc") {
    return "junior";
  }
  return "leaving";
}

export function getExamCycleConfig(cycle: ExamCycleId = DEFAULT_EXAM_CYCLE): ExamCycleConfig {
  return EXAM_CYCLES[cycle] ?? EXAM_CYCLES.leaving;
}
