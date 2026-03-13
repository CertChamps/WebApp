import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { doc, getDoc, setDoc, getDocs, collection } from "firebase/firestore";
import { db } from "../../firebase";
import { UserContext } from "../context/UserContext";
import type { ExamPaper } from "./useExamPapers";

export type PaperProgressEntry = {
  paperId: string;
  subject: string;
  level: string;
  paperLabel: string;
  completedQuestions: string[];
  totalQuestions: number;
  lastUpdated: number;
};

function progressDocId(paper: ExamPaper): string {
  const subject = (paper.subject ?? "unknown").toLowerCase();
  const level = (paper.level ?? "unknown").toLowerCase();
  return `${subject}_${level}_${paper.id}`;
}

export function usePaperProgress() {
  const { user } = useContext(UserContext);

  const localCacheRef = useRef<Map<string, Set<string>>>(new Map());

  const [completedForPaper, setCompletedForPaper] = useState<Set<string>>(
    new Set()
  );
  const [activePaperKey, setActivePaperKey] = useState<string | null>(null);

  const loadPaperProgress = useCallback(
    async (paper: ExamPaper) => {
      const key = progressDocId(paper);
      setActivePaperKey(key);

      const cached = localCacheRef.current.get(key);
      if (cached) {
        setCompletedForPaper(cached);
        return;
      }

      if (!user?.uid) {
        setCompletedForPaper(new Set());
        return;
      }

      try {
        const ref = doc(db, "user-data", user.uid, "paper-progress", key);
        const snap = await getDoc(ref);
        const data = snap.exists() ? snap.data() : null;
        const ids: string[] = Array.isArray(data?.completedQuestions)
          ? data.completedQuestions
          : [];
        const set = new Set(ids);
        localCacheRef.current.set(key, set);
        setCompletedForPaper(set);
      } catch {
        setCompletedForPaper(new Set());
      }
    },
    [user?.uid]
  );

  const toggleQuestion = useCallback(
    async (paper: ExamPaper, questionId: string, totalQuestions: number) => {
      if (!user?.uid) return;

      const key = progressDocId(paper);
      const current = localCacheRef.current.get(key) ?? new Set<string>();
      const next = new Set(current);

      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }

      localCacheRef.current.set(key, next);
      if (key === activePaperKey) {
        setCompletedForPaper(new Set(next));
      }

      try {
        const ref = doc(db, "user-data", user.uid, "paper-progress", key);
        await setDoc(ref, {
          paperId: paper.id,
          subject: paper.subject ?? "unknown",
          level: paper.level ?? "unknown",
          paperLabel: paper.label,
          completedQuestions: Array.from(next),
          totalQuestions,
          lastUpdated: Date.now(),
        });
      } catch (err) {
        console.error("Failed to save paper progress:", err);
      }
    },
    [user?.uid, activePaperKey]
  );

  const isQuestionCompleted = useCallback(
    (questionId: string): boolean => completedForPaper.has(questionId),
    [completedForPaper]
  );

  return {
    completedForPaper,
    loadPaperProgress,
    toggleQuestion,
    isQuestionCompleted,
  };
}

/** Standalone hook to load all paper progress entries for the progress page. */
export function useAllPaperProgress() {
  const { user } = useContext(UserContext);
  const [entries, setEntries] = useState<PaperProgressEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) {
      setEntries([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const colRef = collection(
          db,
          "user-data",
          user.uid,
          "paper-progress"
        );
        const snap = await getDocs(colRef);
        if (cancelled) return;

        const list: PaperProgressEntry[] = [];
        snap.docs.forEach((d) => {
          const data = d.data();
          list.push({
            paperId: data.paperId ?? d.id,
            subject: data.subject ?? "unknown",
            level: data.level ?? "unknown",
            paperLabel: data.paperLabel ?? d.id,
            completedQuestions: Array.isArray(data.completedQuestions)
              ? data.completedQuestions
              : [],
            totalQuestions:
              typeof data.totalQuestions === "number" ? data.totalQuestions : 0,
            lastUpdated:
              typeof data.lastUpdated === "number" ? data.lastUpdated : 0,
          });
        });

        list.sort((a, b) => b.lastUpdated - a.lastUpdated);
        setEntries(list);
      } catch (err) {
        console.error("Failed to load paper progress:", err);
        if (!cancelled) setEntries([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  return { entries, loading };
}
