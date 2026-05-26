import { getDocs, query, where } from "firebase/firestore";
import type { ExamPaper } from "../../hooks/useExamPapers";
import type { PredictionContentType } from "./types";
import { predictionsCollectionRef } from "./firestorePaths";

function deriveLabel(docId: string, year?: number, label?: string): string {
  if (label?.trim()) return label.trim();
  const part = docId
    .replace(/^\d+-/, "")
    .replace(/-/g, " ")
    .replace(/\b(\w)/g, (c) => c.toUpperCase());
  if (year != null) return `${year} ${part || "Prediction"}`.trim();
  return part || docId;
}

/** Load prediction papers from the user's personal Firestore collection. */
export async function loadPredictionPapers(
  uid: string | null | undefined,
  subjectFilter?: string | null
): Promise<ExamPaper[]> {
  if (!uid) return [];
  const col = predictionsCollectionRef(uid);
  const snap = subjectFilter
    ? await getDocs(query(col, where("subject", "==", subjectFilter)))
    : await getDocs(col);

  const papers: ExamPaper[] = [];
  snap.docs.forEach((d) => {
    const data = d.data();
    const subject = typeof data.subject === "string" ? data.subject : undefined;
    const level = typeof data.level === "string" ? data.level : undefined;
    const year = typeof data.year === "number" ? data.year : undefined;
    const label = deriveLabel(
      d.id,
      year,
      typeof data.label === "string" ? data.label : undefined
    );

    const contentType =
      data.contentType === "image" || data.contentType === "pastpaper"
        ? (data.contentType as PredictionContentType)
        : "pastpaper";
    const thumbnailStoragePath =
      typeof data.thumbnailStoragePath === "string" ? data.thumbnailStoragePath : undefined;

    papers.push({
      id: d.id,
      label,
      storagePath: thumbnailStoragePath ?? "",
      year,
      subject,
      level,
      isPrediction: true,
      isComposite: contentType === "pastpaper",
      contentType,
    });
  });

  papers.sort((a, b) => {
    const yearA = a.year ?? 0;
    const yearB = b.year ?? 0;
    if (yearA !== yearB) return yearB - yearA;
    return (a.label ?? "").localeCompare(b.label ?? "");
  });

  return papers;
}
