import { useEffect, useRef } from "react";
import { doc, addDoc, updateDoc, collection } from "firebase/firestore";
import { increment } from "firebase/firestore";
import { db } from "../../firebase";

/**
 * Tracks study sessions: records start time when user is active, and writes
 * session duration to Firestore when they leave (tab hidden or page unload).
 * Updates totalStudySeconds on the user doc.
 * When subject is provided, also increments subjectStudySeconds.{subject}.
 *
 * The effect re-runs when uid or subject changes, ending the previous session
 * (with the previous subject) and starting a fresh one.
 */
export function useSessionTracking(uid: string | undefined, subject?: string | undefined) {
  const sessionStartRef = useRef<number | null>(null);
  const hasRecordedRef = useRef(false);

  const normalizedSubject = subject?.toLowerCase() || undefined;

  useEffect(() => {
    if (!uid) return;

    const sessionSubject = normalizedSubject || null;

    const recordSessionEnd = () => {
      if (!sessionStartRef.current || hasRecordedRef.current) return;
      hasRecordedRef.current = true;

      const now = Date.now();
      const durationSeconds = Math.floor((now - sessionStartRef.current) / 1000);

      if (durationSeconds < 3) return;

      const userRef = doc(db, "user-data", uid);
      const sessionsRef = collection(db, "user-data", uid, "sessions");

      addDoc(sessionsRef, {
        startTime: new Date(sessionStartRef.current),
        endTime: new Date(now),
        durationSeconds,
        subject: sessionSubject,
      }).catch((err) => console.warn("Failed to write session:", err));

      const updates: Record<string, ReturnType<typeof increment>> = {
        totalStudySeconds: increment(durationSeconds),
      };
      if (sessionSubject) {
        updates[`subjectStudySeconds.${sessionSubject}`] = increment(durationSeconds);
      }

      updateDoc(userRef, updates).catch((err) =>
        console.warn("Failed to update study seconds:", err)
      );
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        recordSessionEnd();
      } else {
        sessionStartRef.current = Date.now();
        hasRecordedRef.current = false;
      }
    };

    const handlePageHide = () => {
      recordSessionEnd();
    };

    sessionStartRef.current = Date.now();
    hasRecordedRef.current = false;

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      recordSessionEnd();
    };
  }, [uid, normalizedSubject]);
}
