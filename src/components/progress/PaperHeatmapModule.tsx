import { useEffect, useMemo, useState } from "react";
import { LuX } from "react-icons/lu";
import { doc, getDoc, getDocs, collection } from "firebase/firestore";
import ScaleToFit from "./ScaleToFit";
import { db } from "../../../firebase";
import type { PaperProgressEntry } from "../../hooks/usePaperProgress";
import type { ProgressModuleConfig } from "../../hooks/useProgressModules";

type PaperInfo = {
  id: string;
  label: string;
  year: number;
  paperNum: number | null;
};

function getPaperNumber(docId: string, label?: string): number | null {
  const s = `${label ?? ""} ${docId ?? ""}`.toLowerCase();
  if (/\bpaper\s*1\b|paper-1|1-paper/.test(s)) return 1;
  if (/\bpaper\s*2\b|paper-2|2-paper/.test(s)) return 2;
  return null;
}

function formatSubject(s: string): string {
  return s.replace(/-/g, " ").replace(/\b(\w)/g, (c) => c.toUpperCase());
}

function formatLevel(l: string): string {
  return l.charAt(0).toUpperCase() + l.slice(1);
}

function shortLabel(paper: PaperInfo, hasMultiple: boolean): string {
  const yr = paper.year > 0 ? String(paper.year) : "?";
  if (hasMultiple && paper.paperNum) return `${yr} P${paper.paperNum}`;
  return yr;
}

type Props = {
  config: ProgressModuleConfig;
  entries: PaperProgressEntry[];
  onRemove: () => void;
  editing?: boolean;
};

export default function PaperHeatmapModule({ config, entries, onRemove, editing }: Props) {
  const [papers, setPapers] = useState<PaperInfo[]>([]);
  const [loadingPapers, setLoadingPapers] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingPapers(true);

    (async () => {
      try {
        const levelRef = doc(
          db, "questions", "leavingcert", "subjects", config.subject, "levels", config.level
        );
        const levelSnap = await getDoc(levelRef);
        const levelSections = (levelSnap.data()?.sections as string[] | undefined) ?? [];
        const hasPapers =
          levelSections.includes("papers") ||
          config.subject === "maths" ||
          config.subject === "applied-maths";

        if (!hasPapers) {
          if (!cancelled) setPapers([]);
          return;
        }

        const papersRef = collection(
          db, "questions", "leavingcert", "subjects", config.subject, "levels", config.level, "papers"
        );
        const snap = await getDocs(papersRef);
        if (cancelled) return;

        const list: PaperInfo[] = [];
        snap.docs.forEach((d) => {
          const data = d.data();
          const year = typeof data.year === "number" ? data.year : 0;
          const label =
            typeof data.label === "string" && data.label.trim()
              ? data.label.trim()
              : d.id;
          list.push({
            id: d.id,
            label,
            year,
            paperNum: getPaperNumber(d.id, label),
          });
        });

        list.sort((a, b) => {
          if (a.year !== b.year) return b.year - a.year;
          return (a.paperNum ?? 99) - (b.paperNum ?? 99);
        });

        setPapers(list);
      } catch {
        if (!cancelled) setPapers([]);
      } finally {
        if (!cancelled) setLoadingPapers(false);
      }
    })();

    return () => { cancelled = true; };
  }, [config.subject, config.level]);

  const progressMap = useMemo(() => {
    const map = new Map<string, PaperProgressEntry>();
    for (const e of entries) {
      if (
        e.subject.toLowerCase() === config.subject.toLowerCase() &&
        e.level.toLowerCase() === config.level.toLowerCase()
      ) {
        map.set(e.paperId, e);
      }
    }
    return map;
  }, [entries, config.subject, config.level]);

  const hasMultiplePaperNums = useMemo(() => {
    const nums = new Set(papers.map((p) => p.paperNum ?? 1));
    return nums.size > 1;
  }, [papers]);

  function getPct(paperId: string): number {
    const entry = progressMap.get(paperId);
    if (!entry || entry.totalQuestions === 0) return 0;
    return entry.completedQuestions.length / entry.totalQuestions;
  }

  return (
    <div className="progress-module">
      <div className="progress-module__header">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-sm font-bold color-txt-main truncate">
            {formatSubject(config.subject)}
          </span>
          <span className="text-xs color-txt-sub">
            {formatLevel(config.level)} · Heatmap
          </span>
        </div>
        {editing && (
          <button
            type="button"
            onClick={onRemove}
            className="progress-module__remove progress-module__remove--visible"
            aria-label="Remove module"
          >
            <LuX size={14} />
          </button>
        )}
      </div>

      {loadingPapers ? (
        <div className="flex flex-wrap gap-1.5 py-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="w-10 h-10 rounded-lg color-bg-grey-10 animate-pulse" />
          ))}
        </div>
      ) : papers.length === 0 ? (
        <p className="text-xs color-txt-sub py-4 text-center">No papers found.</p>
      ) : (
        <ScaleToFit>
          <div className="heatmap-wrap">
            {papers.map((paper) => {
              const pct = getPct(paper.id);
              return (
                <div
                  key={paper.id}
                  className="heatmap-cell"
                  title={`${paper.label} — ${Math.round(pct * 100)}%`}
                >
                  <div
                    className="heatmap-cell__fill"
                    style={{ "--heatmap-opacity": pct } as React.CSSProperties}
                  />
                  <span className="heatmap-cell__label">
                    {shortLabel(paper, hasMultiplePaperNums)}
                  </span>
                </div>
              );
            })}
          </div>
        </ScaleToFit>
      )}
    </div>
  );
}
