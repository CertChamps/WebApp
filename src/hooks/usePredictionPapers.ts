import { useEffect, useState } from "react";
import type { ExamPaper } from "./useExamPapers";
import { loadPredictionPapers } from "../lib/predictions/loadPredictions";

type Options = {
  /** Bump to re-fetch (e.g. after saving a new prediction). */
  reloadKey?: number;
};

/** Load exam prediction papers from the dedicated Firestore collection. */
export function usePredictionPapers(subjectId: string | null, options: Options = {}) {
  const { reloadKey = 0 } = options;
  const [predictions, setPredictions] = useState<ExamPaper[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    loadPredictionPapers(subjectId)
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
  }, [subjectId, reloadKey]);

  return { predictions, loading, error };
}
