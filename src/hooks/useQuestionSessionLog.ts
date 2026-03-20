import { useEffect, useRef } from "react";
import { addDoc, collection } from "firebase/firestore";
import { db } from "../../firebase";

export type QuestionMeta = {
  questionId: string;
  questionName: string;
  paperId: string;
  paperLabel: string;
  subject: string;
  level: string;
  topics: string[];
  completed: boolean;
};

const MIN_DURATION_SECONDS = 3;

/**
 * Logs per-question study sessions to Firestore.
 *
 * Each time the active question changes (or the component unmounts / tab hides),
 * a log entry is written to `user-data/{uid}/question-log` with the duration
 * spent on that question.
 */
export function useQuestionSessionLog(
  uid: string | undefined,
  meta: QuestionMeta | null
) {
  const startRef = useRef<number | null>(null);
  const metaRef = useRef<QuestionMeta | null>(null);
  const recordedRef = useRef(false);

  const stableKey = meta
    ? `${meta.paperId}__${meta.questionId}`
    : null;

  useEffect(() => {
    metaRef.current = meta;
  }, [meta]);

  useEffect(() => {
    if (!uid || !stableKey) {
      startRef.current = null;
      recordedRef.current = false;
      return;
    }

    startRef.current = Date.now();
    recordedRef.current = false;

    const flush = () => {
      if (!startRef.current || recordedRef.current || !metaRef.current || !uid) return;
      recordedRef.current = true;

      const dur = Math.floor((Date.now() - startRef.current) / 1000);
      if (dur < MIN_DURATION_SECONDS) return;

      const m = metaRef.current;
      addDoc(collection(db, "user-data", uid, "question-log"), {
        questionId: m.questionId,
        questionName: m.questionName,
        paperId: m.paperId,
        paperLabel: m.paperLabel,
        subject: m.subject.toLowerCase(),
        level: m.level.toLowerCase(),
        topics: m.topics,
        completed: m.completed,
        durationSeconds: dur,
        timestamp: Date.now(),
      }).catch((err) => console.warn("Failed to write question log:", err));
    };

    const onVisibility = () => {
      if (document.hidden) {
        flush();
      } else {
        startRef.current = Date.now();
        recordedRef.current = false;
      }
    };

    const onPageHide = () => flush();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      flush();
    };
  }, [uid, stableKey]);
}
