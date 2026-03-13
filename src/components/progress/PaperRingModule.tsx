import { useMemo } from "react";
import { LuX } from "react-icons/lu";
import type { PaperProgressEntry } from "../../hooks/usePaperProgress";
import type { ProgressModuleConfig } from "../../hooks/useProgressModules";

function formatSubject(s: string): string {
  return s.replace(/-/g, " ").replace(/\b(\w)/g, (c) => c.toUpperCase());
}

function formatLevel(l: string): string {
  return l.charAt(0).toUpperCase() + l.slice(1);
}

type Props = {
  config: ProgressModuleConfig;
  entries: PaperProgressEntry[];
  onRemove: () => void;
  editing?: boolean;
};

export default function PaperRingModule({ config, entries, onRemove, editing }: Props) {
  const filtered = useMemo(
    () =>
      entries.filter(
        (e) =>
          e.subject.toLowerCase() === config.subject.toLowerCase() &&
          e.level.toLowerCase() === config.level.toLowerCase()
      ),
    [entries, config.subject, config.level]
  );

  const completed = filtered.reduce((s, e) => s + e.completedQuestions.length, 0);
  const total = filtered.reduce((s, e) => s + e.totalQuestions, 0);
  const pct = total > 0 ? completed / total : 0;

  const vb = 100;
  const strokeWidth = 12;
  const radius = (vb - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);

  return (
    <div className="progress-module progress-module--ring">
      {editing && (
        <button
          type="button"
          onClick={onRemove}
          className="progress-module__remove progress-module__remove--visible progress-ring__remove"
          aria-label="Remove module"
        >
          <LuX size={12} />
        </button>
      )}

      <svg viewBox={`0 0 ${vb} ${vb}`} className="progress-ring__svg">
        <circle
          cx={vb / 2}
          cy={vb / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-current color-txt-sub opacity-10"
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
          className={`transition-all duration-700 ease-out ${pct >= 1 ? "text-green-500" : "color-txt-accent"}`}
          style={{ stroke: "currentColor" }}
        />
      </svg>

      <div className="progress-ring__label">
        <span className="text-sm font-bold color-txt-main truncate">
          {formatSubject(config.subject)}
        </span>
        <span className="text-xs color-txt-sub">
          {formatLevel(config.level)}
        </span>
      </div>
    </div>
  );
}
