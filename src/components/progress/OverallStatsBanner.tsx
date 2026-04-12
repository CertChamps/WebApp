import { useContext, useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../../firebase";
import { UserContext } from "../../context/UserContext";
import type { PaperProgressEntry } from "../../hooks/usePaperProgress";

function formatStudyTime(seconds?: number): string {
  if (seconds == null || seconds < 0) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

type Props = {
  entries: PaperProgressEntry[];
  subject?: string;
  level?: string;
};

export default function OverallStatsBanner({ entries, subject, level }: Props) {
  const { user } = useContext(UserContext);
  const [studySeconds, setStudySeconds] = useState<number>(0);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(doc(db, "user-data", user.uid), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (subject) {
        const map = data?.subjectStudySeconds as Record<string, number> | undefined;
        setStudySeconds(map?.[subject.toLowerCase()] ?? 0);
      } else {
        setStudySeconds((data?.totalStudySeconds as number) ?? 0);
      }
    });
    return unsub;
  }, [user?.uid, subject]);

  const filtered = useMemo(() => {
    if (!subject) return entries;
    return entries.filter(
      (e) =>
        e.subject.toLowerCase() === subject.toLowerCase() &&
        (!level || e.level.toLowerCase() === level.toLowerCase())
    );
  }, [entries, subject, level]);

  const { totalCorrect, pct } = useMemo(() => {
    const correct = filtered.reduce((s, e) => s + e.completedQuestions.length, 0);
    const total = filtered.reduce((s, e) => s + e.totalQuestions, 0);
    return { totalCorrect: correct, pct: total > 0 ? correct / total : 0 };
  }, [filtered]);

  const gaugeRadius = 60;
  const gaugeStroke = 12;
  const gaugeCx = 80;
  const gaugeCy = 70;
  const halfCircumference = Math.PI * gaugeRadius;
  const gaugeOffset = halfCircumference * (1 - pct);

  return (
    <div className="stats-banner">
      <div className="stats-banner__card stats-banner__card--left">
        <div className="stats-banner__gauge-section">
          <span className="stats-banner__card-title">Overall completion</span>
          <svg viewBox="0 0 160 90" className="stats-banner__gauge-svg">
            <path
              d={`M ${gaugeCx - gaugeRadius} ${gaugeCy} A ${gaugeRadius} ${gaugeRadius} 0 0 1 ${gaugeCx + gaugeRadius} ${gaugeCy}`}
              fill="none"
              strokeWidth={gaugeStroke}
              strokeLinecap="round"
              className="stroke-current color-txt-sub opacity-15"
            />
            <path
              d={`M ${gaugeCx - gaugeRadius} ${gaugeCy} A ${gaugeRadius} ${gaugeRadius} 0 0 1 ${gaugeCx + gaugeRadius} ${gaugeCy}`}
              fill="none"
              strokeWidth={gaugeStroke}
              strokeLinecap="round"
              strokeDasharray={halfCircumference}
              strokeDashoffset={gaugeOffset}
              className={`transition-all duration-700 ease-out ${pct >= 1 ? "text-green-500" : "color-txt-accent"}`}
              style={{ stroke: "currentColor" }}
            />
          </svg>
        </div>
        <div className="stats-banner__stats-col">
          <div className="stats-banner__stat">
            <span className="stats-banner__stat-label">Total correct</span>
            <span className="stats-banner__stat-value">{totalCorrect}</span>
          </div>
          <div className="stats-banner__stat">
            <span className="stats-banner__stat-label">Placeholder 1</span>
            <span className="stats-banner__stat-value stats-banner__stat-value--muted">—</span>
          </div>
          <div className="stats-banner__stat">
            <span className="stats-banner__stat-label">Placeholder 2</span>
            <span className="stats-banner__stat-value stats-banner__stat-value--muted">—</span>
          </div>
        </div>
      </div>

      <div className="stats-banner__card stats-banner__card--right">
        <span className="stats-banner__card-title">Total time studying</span>
        <span className="stats-banner__time">{formatStudyTime(studySeconds)}</span>
      </div>
    </div>
  );
}
