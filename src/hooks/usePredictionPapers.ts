import { useEffect, useState } from "react";
import type { ExamPaper } from "./useExamPapers";
import { loadPredictionPapers } from "../lib/predictions/loadPredictions";

type Options = {
  /** Bump to re-fetch (e.g. after saving a new prediction). */
  reloadKey?: number;
};

/** Load exam prediction papers from the signed-in user's personal Firestore collection. */
export function usePredictionPapers(
  uid: string | null | undefined,
  subjectId: string | null,
  options: Options = {}
) {
  const { reloadKey = 0 } = options;
  const [predictions, setPredictions] = useState<ExamPaper[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      setPredictions([]);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    loadPredictionPapers(uid, subjectId)
      .then((papers) => {
        if (!cancelled) {
          setPredictions(papers);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Failed to load prediction papers:", err);
          setError(err instanceof Error ? err.message : "Failed to load predictions");
          setPredictions([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [uid, subjectId, reloadKey]);

  return { predictions, loading, error };
}
