import { useMemo } from "react";
import { LuX } from "react-icons/lu";
import type { PaperProgressEntry } from "../../hooks/usePaperProgress";
import type { ProgressModuleConfig } from "../../hooks/useProgressModules";
import { paperProgressEntryMatchesSubjectLevel } from "../../lib/matchPaperProgressEntry";

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

export default function PaperBarModule({ config, entries, onRemove, editing }: Props) {
  const filtered = useMemo(
    () =>
      entries.filter((e) => paperProgressEntryMatchesSubjectLevel(e, config.subject, config.level)),
    [entries, config.subject, config.level]
  );

  const completed = filtered.reduce((s, e) => s + e.completedQuestions.length, 0);
  const total = filtered.reduce((s, e) => s + e.totalQuestions, 0);
  const pct = total > 0 ? completed / total : 0;

  return (
    <div className="progress-module progress-module--bar">
      {editing && (
        <button
          type="button"
          onClick={onRemove}
          className="progress-module__remove progress-module__remove--visible progress-bar__remove"
          aria-label="Remove module"
        >
          <LuX size={12} />
        </button>
      )}

      <div className="progress-bar__label">
        <span className="text-xs font-bold color-txt-main truncate">
          {formatSubject(config.subject)}
        </span>
        <span className="text-[10px] color-txt-sub truncate">
          {formatLevel(config.level)}
        </span>
      </div>
      <div className="progress-bar__track">
        <div
          className={`progress-bar__fill ${pct >= 1 ? "progress-bar__fill--complete" : ""}`}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </div>
  );
}
