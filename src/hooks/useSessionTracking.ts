import { useEffect, useRef } from "react";
import { doc, addDoc, updateDoc, collection } from "firebase/firestore";
import { increment } from "firebase/firestore";
import { db } from "../../firebase";

/**
 * Tracks study sessions: records start time when user is active, and writes
 * session duration to Firestore when they leave (tab hidden or page unload).
 * Updates totalStudySeconds on the user doc.
 */
export function useSessionTracking(uid: string | undefined) {
  const sessionStartRef = useRef<number | null>(null);
  const hasRecordedRef = useRef(false);

  useEffect(() => {
    if (!uid) return;

    const recordSessionEnd = () => {
      if (!sessionStartRef.current || hasRecordedRef.current) return;
      hasRecordedRef.current = true;

      const now = Date.now();
      const durationSeconds = Math.floor((now - sessionStartRef.current) / 1000);

      // Ignore very short sessions (e.g. accidental tab switch)
      if (durationSeconds < 10) return;

      const userRef = doc(db, "user-data", uid);
      const sessionsRef = collection(db, "user-data", uid, "sessions");

      addDoc(sessionsRef, {
        startTime: new Date(sessionStartRef.current),
        endTime: new Date(now),
        durationSeconds,
      }).catch((err) => console.warn("Failed to write session:", err));

      updateDoc(userRef, {
        totalStudySeconds: increment(durationSeconds),
      }).catch((err) => console.warn("Failed to update totalStudySeconds:", err));
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        recordSessionEnd();
      } else {
        // New session when tab becomes visible again
        sessionStartRef.current = Date.now();
        hasRecordedRef.current = false;
      }
    };

    const handlePageHide = () => {
      recordSessionEnd();
    };

    // Start first session
    sessionStartRef.current = Date.now();
    hasRecordedRef.current = false;

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      recordSessionEnd();
    };
  }, [uid]);
}
