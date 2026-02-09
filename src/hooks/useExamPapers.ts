import { useCallback, useEffect, useState } from "react";
import { getBlob, ref } from "firebase/storage";
import { doc, getDoc, getDocs, collection } from "firebase/firestore";
import { storage, db } from "../../firebase";

export type ExamPaper = {
  id: string;
  label: string;
  storagePath: string;
  year?: number;
  subject?: string;
  level?: string;
};

/** One question from a paper's questions subcollection (q1, q2, ...). */
export type PaperQuestion = {
  id: string;
  questionName: string;
  pageRange: [number, number];
};

function deriveLabel(docId: string, year?: number): string {
  const part = docId
    .replace(/^\d+-/, "")
    .replace(/-/g, " ")
    .replace(/\b(\w)/g, (c) => c.toUpperCase());
  if (year != null) return `${year} ${part || "Paper"}`.trim();
  return part || docId;
}

export function useExamPapers() {
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const lcRef = doc(db, "questions", "leavingcert");
        const lcSnap = await getDoc(lcRef);
        if (!lcSnap.exists()) {
          setPapers([]);
          setError(null);
          return;
        }

        const subjectIds = (lcSnap.data()?.sections as string[] | undefined) ?? [];
        const allPapers: ExamPaper[] = [];

        for (const subject of subjectIds) {
          if (cancelled) return;
          const subjRef = doc(db, "questions", "leavingcert", "subjects", subject);
          const subjSnap = await getDoc(subjRef);
          if (!subjSnap.exists()) continue;

          const levelIds = (subjSnap.data()?.sections as string[] | undefined) ?? [];

          for (const level of levelIds) {
            if (cancelled) return;
            const levelRef = doc(
              db,
              "questions",
              "leavingcert",
              "subjects",
              subject,
              "levels",
              level
            );
            const levelSnap = await getDoc(levelRef);
            if (!levelSnap.exists()) continue;

            const levelSections =
              (levelSnap.data()?.sections as string[] | undefined) ?? [];
            if (!levelSections.includes("papers")) continue;

            const papersRef = collection(
              db,
              "questions",
              "leavingcert",
              "subjects",
              subject,
              "levels",
              level,
              "papers"
            );
            const papersSnap = await getDocs(papersRef);

            papersSnap.docs.forEach((d) => {
              const data = d.data();
              const storagePath =
                typeof data.storagePath === "string" ? data.storagePath : "";
              if (!storagePath) return;

              const year =
                typeof data.year === "number" ? data.year : undefined;
              const label =
                typeof data.label === "string" && data.label.trim()
                  ? data.label.trim()
                  : deriveLabel(d.id, year);

              allPapers.push({
                id: d.id,
                label,
                storagePath,
                year,
                subject,
                level,
              });
            });
          }
        }

        if (cancelled) return;
        allPapers.sort((a, b) => {
          const yearA = a.year ?? 0;
          const yearB = b.year ?? 0;
          if (yearA !== yearB) return yearB - yearA;
          return (a.label ?? "").localeCompare(b.label ?? "");
        });
        setPapers(allPapers);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load exam papers:", err);
          setError(err instanceof Error ? err.message : "Failed to load papers");
          setPapers([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const getPaperBlob = useCallback(async (paper: ExamPaper): Promise<Blob> => {
    const pathRef = ref(storage, paper.storagePath);
    return getBlob(pathRef);
  }, []);

  const getPaperQuestions = useCallback(
    async (paper: ExamPaper): Promise<PaperQuestion[]> => {
      const subject = paper.subject ?? "maths";
      const level = paper.level ?? "higher";
      const questionsRef = collection(
        db,
        "questions",
        "leavingcert",
        "subjects",
        subject,
        "levels",
        level,
        "papers",
        paper.id,
        "questions"
      );
      const snap = await getDocs(questionsRef);
      const list: PaperQuestion[] = [];
      snap.docs
        .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
        .forEach((d) => {
          const data = d.data();
          const pr = data.pageRange;
          const pageRange: [number, number] = Array.isArray(pr)
            ? [Number(pr[0]) || 1, Number(pr[1]) || 1]
            : typeof pr === "object" && pr !== null && "start" in pr && "end" in pr
              ? [(pr as { start: number }).start, (pr as { end: number }).end]
              : [1, 1];
          list.push({
            id: d.id,
            questionName:
              typeof data.questionName === "string"
                ? data.questionName
                : data.id ?? d.id,
            pageRange,
          });
        });
      return list;
    },
    []
  );

  return { papers, loading, error, getPaperBlob, getPaperQuestions };
}
