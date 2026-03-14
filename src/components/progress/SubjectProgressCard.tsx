import { useNavigate } from "react-router-dom";
import type { PaperProgressEntry } from "../../hooks/usePaperProgress";

function formatSubject(s: string): string {
  return s.replace(/-/g, " ").replace(/\b(\w)/g, (c) => c.toUpperCase());
}

function formatLevel(l: string): string {
  return l.charAt(0).toUpperCase() + l.slice(1);
}

type Props = {
  subject: string;
  level: string;
  entries: PaperProgressEntry[];
};

export default function SubjectProgressCard({ subject, level, entries }: Props) {
  const navigate = useNavigate();

  const filtered = entries.filter(
    (e) =>
      e.subject.toLowerCase() === subject.toLowerCase() &&
      e.level.toLowerCase() === level.toLowerCase()
  );
  const completed = filtered.reduce((s, e) => s + e.completedQuestions.length, 0);
  const total = filtered.reduce((s, e) => s + e.totalQuestions, 0);
  const pct = total > 0 ? completed / total : 0;

  const vb = 100;
  const strokeWidth = 10;
  const radius = (vb - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);

  const handleClick = () => {
    navigate(`/progress/subject/${encodeURIComponent(subject)}/${encodeURIComponent(level)}`);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="progress-subject-card w-full flex items-center justify-between gap-4 p-4 rounded-2xl color-bg-grey-5 hover:color-bg-grey-10 transition-colors text-left cursor-pointer border border-transparent hover:border-[var(--grey-10,rgba(128,128,128,0.2))]"
    >
      <div className="min-w-0 flex-1">
        <span className="text-sm font-semibold color-txt-main block truncate">
          {formatSubject(subject)}
        </span>
        <span className="text-xs color-txt-sub">{formatLevel(level)}</span>
      </div>
      <div className="shrink-0 w-12 h-12 flex items-center justify-center">
        <svg viewBox={`0 0 ${vb} ${vb}`} className="w-12 h-12 -rotate-90">
          <circle
            cx={vb / 2}
            cy={vb / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            className="stroke-current color-txt-sub opacity-20"
          />
          <circle
            cx={vb / 2}
            cy={vb / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={`transition-all duration-500 ${pct >= 1 ? "text-green-500" : "color-txt-accent"}`}
            style={{ stroke: "currentColor" }}
          />
        </svg>
      </div>
    </button>
  );
}
