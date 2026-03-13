import React, { useContext, useEffect, useMemo, useState } from "react";
import { LuX } from "react-icons/lu";
import { doc, getDoc, getDocs, collection } from "firebase/firestore";
import ScaleToFit from "./ScaleToFit";
import { db } from "../../../firebase";
import { UserContext } from "../../context/UserContext";
import type { PaperProgressEntry } from "../../hooks/usePaperProgress";
import type { ProgressModuleConfig } from "../../hooks/useProgressModules";

type PaperQuestion = { id: string; name: string };

type PaperInfo = {
  id: string;
  label: string;
  year: number;
  paperNum: number | null;
  questions: PaperQuestion[];
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

type Props = {
  config: ProgressModuleConfig;
  entries: PaperProgressEntry[];
  onRemove: () => void;
  editing?: boolean;
};

export default function QuestionHeatmapModule({ config, entries, onRemove, editing }: Props) {
  const { user } = useContext(UserContext);
  const [papers, setPapers] = useState<PaperInfo[]>([]);
  const [drawnSet, setDrawnSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

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
          if (!cancelled) { setPapers([]); setLoading(false); }
          return;
        }

        const papersRef = collection(
          db, "questions", "leavingcert", "subjects", config.subject, "levels", config.level, "papers"
        );
        const papersSnap = await getDocs(papersRef);
        if (cancelled) return;

        const list: PaperInfo[] = [];
        for (const d of papersSnap.docs) {
          if (cancelled) return;
          const data = d.data();
          const year = typeof data.year === "number" ? data.year : 0;
          const label = typeof data.label === "string" && data.label.trim() ? data.label.trim() : d.id;

          const questionsRef = collection(
            db, "questions", "leavingcert", "subjects", config.subject, "levels", config.level, "papers", d.id, "questions"
          );
          const qSnap = await getDocs(questionsRef);
          if (cancelled) return;
          const questions: PaperQuestion[] = qSnap.docs
            .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
            .map((q) => {
              const qData = q.data();
              const name = typeof qData.questionName === "string" ? qData.questionName : q.id;
              return { id: q.id, name };
            });

          list.push({ id: d.id, label, year, paperNum: getPaperNumber(d.id, label), questions });
        }

        list.sort((a, b) => {
          if (a.year !== b.year) return b.year - a.year;
          return (a.paperNum ?? 99) - (b.paperNum ?? 99);
        });

        if (!cancelled) setPapers(list);

        const qdRef = collection(db, "user-data", user.uid, "question-data");
        const qdSnap = await getDocs(qdRef);
        if (cancelled) return;
        const drawn = new Set<string>();
        qdSnap.docs.forEach((d) => {
          const data = d.data();
          if (typeof data.strokeCount === "number" && data.strokeCount > 0) {
            drawn.add(d.id);
          }
        });
        if (!cancelled) setDrawnSet(drawn);
      } catch {
        if (!cancelled) setPapers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [config.subject, config.level, user?.uid]);

  const progressMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const e of entries) {
      if (
        e.subject.toLowerCase() === config.subject.toLowerCase() &&
        e.level.toLowerCase() === config.level.toLowerCase()
      ) {
        map.set(e.paperId, new Set(e.completedQuestions));
      }
    }
    return map;
  }, [entries, config.subject, config.level]);

  const papersByYear = useMemo(() => {
    const map = new Map<number, PaperInfo[]>();
    for (const p of papers) {
      const list = map.get(p.year) ?? [];
      list.push(p);
      map.set(p.year, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.paperNum ?? 99) - (b.paperNum ?? 99));
    }
    return Array.from(map.entries()).sort((a, b) => b[0] - a[0]);
  }, [papers]);

  function getHeat(paperId: string, questionId: string): number {
    const completed = progressMap.get(paperId);
    if (completed?.has(questionId)) return 1;
    if (drawnSet.has(`${paperId}_${questionId}`)) return 0.35;
    return 0;
  }

  function renderPaperCells(paper: PaperInfo) {
    return paper.questions.map((q) => {
      const heat = getHeat(paper.id, q.id);
      return (
        <div
          key={q.id}
          className="qheatmap-cell"
          title={`${q.name} — ${heat >= 1 ? "Completed" : heat > 0 ? "Drawn on" : "Not started"}`}
        >
          <div
            className="qheatmap-cell__fill"
            style={{ "--heatmap-opacity": heat } as React.CSSProperties}
          />
        </div>
      );
    });
  }

  return (
    <div className="progress-module">
      <div className="progress-module__header">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-bold color-txt-main truncate">
            {formatSubject(config.subject)}
          </span>
          <span className="h-3 w-px color-bg-grey-10 shrink-0" aria-hidden />
          <span className="text-xs color-txt-sub shrink-0">
            {formatLevel(config.level)}
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

      {loading ? (
        <div className="flex gap-3 py-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className="w-10 h-3 rounded color-bg-grey-10 animate-pulse" />
              {[1, 2, 3].map((j) => (
                <div key={j} className="w-5 h-5 rounded color-bg-grey-10 animate-pulse" />
              ))}
            </div>
          ))}
        </div>
      ) : papers.length === 0 ? (
        <p className="text-xs color-txt-sub py-4 text-center">No papers found.</p>
      ) : (
        <ScaleToFit
          contentKey={`${papersByYear.length}-${papersByYear.map(([y, ps]) => `${y}:${ps.map((p) => p.id).join(",")}`).join(";")}`}
        >
          <div className="qheatmap-columns">
            {papersByYear.map(([year, papersInYear], i) => (
              <React.Fragment key={year}>
                {i > 0 && <div className="qheatmap-col-divider" aria-hidden="true" />}
                <div className="qheatmap-col">
                  <span className="qheatmap-col-header">
                    {year > 0 ? String(year) : "?"}
                  </span>
                  {papersInYear.length > 1 ? (
                    <div className="qheatmap-year-split">
                      {papersInYear.map((p) => (
                        <div key={p.id} className="qheatmap-col qheatmap-col--half">
                          <div className="qheatmap-boxes">{renderPaperCells(p)}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="qheatmap-boxes">
                      {renderPaperCells(papersInYear[0])}
                    </div>
                  )}
                </div>
              </React.Fragment>
            ))}
          </div>
        </ScaleToFit>
      )}
    </div>
  );
}
