import React, { useContext, useEffect, useMemo, useState } from "react";
import { doc, getDoc, getDocs, collection } from "firebase/firestore";
import { db } from "../../../firebase";
import { UserContext } from "../../context/UserContext";
import type { PaperProgressEntry } from "../../hooks/usePaperProgress";

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

function shortLabel(name: string): string {
  const qMatch = name.match(/question\s+(\d+)/i);
  if (!qMatch) return name;

  const num = qMatch[1];
  const partMatch = name.match(/part\s+([a-z0-9\s,\-()]+)/i);
  if (!partMatch) return num;

  const raw = partMatch[1]
    .trim()
    .toLowerCase()
    .replace(/[(),\s]+/g, "")
    .replace(/-+/g, "-");

  return `${num}${raw}`;
}

type Props = {
  subject: string;
  level: string;
  entries: PaperProgressEntry[];
};

export default function SubjectHeatmap({ subject, level, entries }: Props) {
  const { user } = useContext(UserContext);
  const [papers, setPapers] = useState<PaperInfo[]>([]);
  const [drawnSet, setDrawnSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const levelRef = doc(
          db, "questions", "leavingcert", "subjects", subject.toLowerCase(), "levels", level.toLowerCase()
        );
        const levelSnap = await getDoc(levelRef);
        const sections = (levelSnap.data()?.sections as string[] | undefined) ?? [];
        const hasPapers = sections.includes("papers") ||
          subject.toLowerCase() === "maths" ||
          subject.toLowerCase() === "applied-maths";

        if (!hasPapers) {
          if (!cancelled) { setPapers([]); setLoading(false); }
          return;
        }

        const papersSnap = await getDocs(collection(
          db, "questions", "leavingcert", "subjects", subject.toLowerCase(), "levels", level.toLowerCase(), "papers"
        ));
        if (cancelled) return;

        const list: PaperInfo[] = [];
        for (const d of papersSnap.docs) {
          if (cancelled) return;
          const data = d.data();
          const year = typeof data.year === "number" ? data.year : 0;
          const lbl = typeof data.label === "string" && data.label.trim() ? data.label.trim() : d.id;

          const qSnap = await getDocs(collection(
            db, "questions", "leavingcert", "subjects", subject.toLowerCase(), "levels", level.toLowerCase(), "papers", d.id, "questions"
          ));
          if (cancelled) return;
          const questions: PaperQuestion[] = qSnap.docs
            .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
            .map((q) => {
              const qData = q.data();
              const name = typeof qData.questionName === "string" ? qData.questionName : q.id;
              return { id: q.id, name };
            });

          list.push({ id: d.id, label: lbl, year, paperNum: getPaperNumber(d.id, lbl), questions });
        }

        list.sort((a, b) => {
          if (a.year !== b.year) return b.year - a.year;
          return (a.paperNum ?? 99) - (b.paperNum ?? 99);
        });

        if (!cancelled) setPapers(list);

        const qdSnap = await getDocs(collection(db, "user-data", user.uid, "question-data"));
        if (cancelled) return;
        const drawn = new Set<string>();
        qdSnap.docs.forEach((d) => {
          const data = d.data();
          if (typeof data.strokeCount === "number" && data.strokeCount > 0) drawn.add(d.id);
        });
        if (!cancelled) setDrawnSet(drawn);
      } catch {
        if (!cancelled) setPapers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [subject, level, user?.uid]);

  const progressMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const e of entries) {
      if (
        e.subject.toLowerCase() === subject.toLowerCase() &&
        e.level.toLowerCase() === level.toLowerCase()
      ) {
        map.set(e.paperId, new Set(e.completedQuestions));
      }
    }
    return map;
  }, [entries, subject, level]);

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

  const maxQuestions = useMemo(
    () => Math.max(...papers.map((p) => p.questions.length), 0),
    [papers]
  );

  function getHeat(paperId: string, questionId: string): number {
    const completed = progressMap.get(paperId);
    if (completed?.has(questionId)) return 1;
    if (drawnSet.has(`${paperId}_${questionId}`)) return 0.35;
    return 0;
  }

  if (loading) {
    return (
      <div className="rounded-2xl color-bg-grey-5 p-6 animate-pulse">
        <div className="h-4 w-40 rounded color-bg-grey-10 mb-4" />
        <div className="flex gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1.5 items-center">
              <div className="w-8 h-3 rounded color-bg-grey-10" />
              {Array.from({ length: 5 }).map((_, j) => (
                <div key={j} className="w-10 h-7 rounded-lg color-bg-grey-10" />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (papers.length === 0) {
    return (
      <div className="rounded-2xl color-bg-grey-5 p-6 flex flex-col items-center justify-center gap-3 min-h-[200px]">
        <p className="text-base font-extrabold color-txt-main">Question Heatmap</p>
        <p className="text-xs color-txt-sub text-center max-w-xs">No papers found for this subject.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl color-bg-grey-5 p-6">
      <p className="text-base font-extrabold color-txt-main mb-4">Question Heatmap</p>
      <div className="subject-heatmap__scroll">
        <div className="subject-heatmap__grid" style={{ gridTemplateColumns: `repeat(${papers.length}, 2.2rem)` }}>
          {papersByYear.map(([year, papersInYear]) =>
            papersInYear.map((paper) => (
              <div key={paper.id} className="subject-heatmap__col-header">
                {String(year).slice(-2)}
              </div>
            ))
          )}

          {Array.from({ length: maxQuestions }).map((_, rowIdx) => (
            <React.Fragment key={rowIdx}>
              {papersByYear.map(([, papersInYear]) =>
                papersInYear.map((paper) => {
                  const q = paper.questions[rowIdx];
                  if (!q) return <div key={`${paper.id}-empty-${rowIdx}`} className="subject-heatmap__cell--empty" />;

                  const heat = getHeat(paper.id, q.id);
                  return (
                    <div
                      key={`${paper.id}-${q.id}`}
                      className={`subject-heatmap__cell ${heat >= 1 ? "subject-heatmap__cell--complete" : heat > 0 ? "subject-heatmap__cell--partial" : "subject-heatmap__cell--empty-q"}`}
                    >
                      <span className="subject-heatmap__cell-label">{shortLabel(q.name)}</span>
                    </div>
                  );
                })
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
