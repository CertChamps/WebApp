import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";

export type SubjectLevel = { subject: string; level: string };

/** Load all subject+level pairs from Firestore (leavingcert sections). */
export function useSubjectLevels() {
  const [pairs, setPairs] = useState<SubjectLevel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const lcRef = doc(db, "questions", "leavingcert");
        const lcSnap = await getDoc(lcRef);
        const subjects: string[] = Array.isArray(lcSnap.data()?.sections)
          ? lcSnap.data()!.sections
          : [];

        const result: SubjectLevel[] = [];
        for (const subId of subjects) {
          if (cancelled) return;
          const subjRef = doc(db, "questions", "leavingcert", "subjects", subId);
          const subjSnap = await getDoc(subjRef);
          let levelIds = (subjSnap.data()?.sections as string[] | undefined) ?? [];
          if (levelIds.length === 0 && (subId === "maths" || subId === "applied-maths")) {
            levelIds = ["higher", "ordinary"];
          }
          for (const level of levelIds) {
            result.push({ subject: subId, level });
          }
        }
        if (!cancelled) setPairs(result);
      } catch {
        if (!cancelled) setPairs([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return { pairs, loading };
}
