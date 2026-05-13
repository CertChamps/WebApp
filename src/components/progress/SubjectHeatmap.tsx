import React, { useContext, useEffect, useMemo, useState } from "react";
import { doc, getDoc, getDocs, collection } from "firebase/firestore";
import { db } from "../../../firebase";
import { UserContext } from "../../context/UserContext";
import type { PaperProgressEntry } from "../../hooks/usePaperProgress";
import { groupImageQuestions, listQuestionsForTopic } from "../../hooks/useImageQuestions";
import {
  buildImageHeatmapYearColumnsFromTopicColumns,
  imageCanvasQuestionId,
  isImageTopicPaperProgressEntry,
  loadImageHeatmapColumnsData,
} from "../../lib/imageTopicProgress";
import { paperProgressEntryMatchesSubjectLevel } from "../../lib/matchPaperProgressEntry";

type PaperQuestion = { id: string; name: string };

type PaperInfo = {
  id: string;
  label: string;
  year: number;
  paperNum: number | null;
  questions: PaperQuestion[];
};

type ImageHeatmapColumn = {
  paperId: string;
  /** Storage folder name (matches canvas + progress ids). */
  topicLabel: string;
  /** Shown in column header when available. */
  topicTitle?: string;
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

function formatImageYearHeatmapHeader(yc: { year: number; deferred: boolean }): string {
  if (yc.year <= 0) return "—";
  const yy = String(yc.year).slice(-2);
  return yc.deferred ? `${yy}D` : yy;
}

/** Cell text: year is the column; strip deferred markers from the prettified filename label. */
function stripYearAndDeferredFromImageLabel(s: string): string {
  let t = s.trim();
  t = t.replace(/\(\s*DEFERRED\s*\)/gi, "");
  t = t.replace(/\[\s*DEFERRED\s*\]/gi, "");
  t = t.replace(/\bDEFERRED\b/gi, "");
  t = t.replace(/\s+/g, " ").trim();
  t = t.replace(/^(?:19|20)\d{2}\s*[_\-.,\s]*/, "").trim();
  return t;
}

function imageHeatmapCellDisplayLabel(displayName: string): string {
  const stripped = stripYearAndDeferredFromImageLabel(displayName);
  const base = stripped.length > 0 ? stripped : displayName.trim();
  return shortLabel(base);
}

type Props = {
  subject: string;
  level: string;
  entries: PaperProgressEntry[];
};

export default function SubjectHeatmap({ subject, level, entries }: Props) {
  const { user } = useContext(UserContext);
  const [papers, setPapers] = useState<PaperInfo[]>([]);
  const [imageColumns, setImageColumns] = useState<ImageHeatmapColumn[]>([]);
  const [heatmapMode, setHeatmapMode] = useState<"papers" | "image" | "none">("none");
  const [drawnSet, setDrawnSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      setHeatmapMode("none");
      setPapers([]);
      setImageColumns([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setHeatmapMode("none");
    setPapers([]);
    setImageColumns([]);

    (async () => {
      const loadDrawn = async () => {
        try {
          const qdSnap = await getDocs(collection(db, "user-data", user.uid, "question-data"));
          if (cancelled) return;
          const drawn = new Set<string>();
          qdSnap.docs.forEach((d) => {
            const data = d.data();
            if (typeof data.strokeCount === "number" && data.strokeCount > 0) drawn.add(d.id);
          });
          if (!cancelled) setDrawnSet(drawn);
        } catch {
          if (!cancelled) setDrawnSet(new Set());
        }
      };

      try {
        const levelRef = doc(
          db,
          "questions",
          "leavingcert",
          "subjects",
          subject.toLowerCase(),
          "levels",
          level.toLowerCase()
        );
        const levelSnap = await getDoc(levelRef);
        const sections = (levelSnap.data()?.sections as string[] | undefined) ?? [];
        const hasPapers =
          sections.includes("papers") ||
          subject.toLowerCase() === "maths" ||
          subject.toLowerCase() === "applied-maths";

        let paperList: PaperInfo[] = [];
        if (hasPapers) {
          const papersSnap = await getDocs(
            collection(
              db,
              "questions",
              "leavingcert",
              "subjects",
              subject.toLowerCase(),
              "levels",
              level.toLowerCase(),
              "papers"
            )
          );
          if (cancelled) return;

          for (const d of papersSnap.docs) {
            if (cancelled) return;
            const data = d.data();
            const year = typeof data.year === "number" ? data.year : 0;
            const lbl =
              typeof data.label === "string" && data.label.trim() ? data.label.trim() : d.id;

            const qSnap = await getDocs(
              collection(
                db,
                "questions",
                "leavingcert",
                "subjects",
                subject.toLowerCase(),
                "levels",
                level.toLowerCase(),
                "papers",
                d.id,
                "questions"
              )
            );
            if (cancelled) return;
            const questions: PaperQuestion[] = qSnap.docs
              .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
              .map((q) => {
                const qData = q.data();
                const name =
                  typeof qData.questionName === "string" ? qData.questionName : q.id;
                return { id: q.id, name };
              });

            paperList.push({
              id: d.id,
              label: lbl,
              year,
              paperNum: getPaperNumber(d.id, lbl),
              questions,
            });
          }

          paperList.sort((a, b) => {
            if (a.year !== b.year) return b.year - a.year;
            return (a.paperNum ?? 99) - (b.paperNum ?? 99);
          });
        }

        if (!cancelled && paperList.length > 0) {
          setPapers(paperList);
          setHeatmapMode("papers");
          await loadDrawn();
          if (!cancelled) setLoading(false);
          return;
        }

        const storageCols = await loadImageHeatmapColumnsData(subject, level);
        if (!cancelled && storageCols.length > 0) {
          setImageColumns(
            storageCols.map((c) => ({
              paperId: c.paperId,
              topicLabel: c.topicFolderName,
              topicTitle: c.topicDisplayName,
              questions: c.questions,
            }))
          );
          setHeatmapMode("image");
          await loadDrawn();
          if (!cancelled) setLoading(false);
          return;
        }

        const imageEntries = entries.filter(
          (e) =>
            paperProgressEntryMatchesSubjectLevel(e, subject, level) &&
            isImageTopicPaperProgressEntry(e)
        );
        if (imageEntries.length === 0) {
          if (!cancelled) {
            setHeatmapMode("none");
            setLoading(false);
          }
          await loadDrawn();
          return;
        }

        const uniqueByPaperId = new Map<string, PaperProgressEntry>();
        for (const e of imageEntries) {
          uniqueByPaperId.set(e.paperId, e);
        }
        const sorted = [...uniqueByPaperId.values()].sort((a, b) =>
          (a.paperLabel ?? "").localeCompare(b.paperLabel ?? "", undefined, {
            sensitivity: "base",
          })
        );

        const cols: ImageHeatmapColumn[] = [];
        for (const e of sorted) {
          if (cancelled) return;
          const topicLabel = (e.paperLabel ?? "").trim();
          if (!topicLabel) continue;
          try {
            const flat = await listQuestionsForTopic(subject, level, topicLabel);
            if (cancelled) return;
            const grouped = groupImageQuestions(flat);
            cols.push({
              paperId: e.paperId,
              topicLabel,
              topicTitle: topicLabel,
              questions: grouped.map((g) => ({ id: g.key, name: g.displayName })),
            });
          } catch {
            cols.push({
              paperId: e.paperId,
              topicLabel,
              topicTitle: topicLabel,
              questions: [],
            });
          }
        }

        cols.sort((a, b) =>
          (a.topicTitle ?? a.topicLabel).localeCompare(b.topicTitle ?? b.topicLabel, undefined, {
            sensitivity: "base",
          })
        );

        if (!cancelled) {
          setImageColumns(cols);
          setHeatmapMode("image");
        }
        await loadDrawn();
      } catch {
        if (!cancelled) {
          setPapers([]);
          setImageColumns([]);
          setHeatmapMode("none");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [subject, level, user?.uid, entries]);

  const progressMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const e of entries) {
      if (paperProgressEntryMatchesSubjectLevel(e, subject, level)) {
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

  const imageYearColumns = useMemo(
    () =>
      buildImageHeatmapYearColumnsFromTopicColumns(
        imageColumns.map((c) => ({
          paperId: c.paperId,
          topicLabel: c.topicLabel,
          topicTitle: c.topicTitle,
          questions: c.questions,
        }))
      ),
    [imageColumns]
  );

  const maxQuestions = useMemo(
    () => Math.max(...papers.map((p) => p.questions.length), 0),
    [papers]
  );

  const maxImageQuestions = useMemo(
    () => Math.max(0, ...imageYearColumns.map((c) => c.questions.length)),
    [imageYearColumns]
  );

  function getHeatPastPaper(paperId: string, questionId: string): number {
    const completed = progressMap.get(paperId);
    if (completed?.has(questionId)) return 1;
    if (drawnSet.has(`${paperId}_${questionId}`)) return 0.35;
    return 0;
  }

  function getHeatImageTopic(paperId: string, topicLabel: string, questionId: string): number {
    const completed = progressMap.get(paperId);
    if (completed?.has(questionId)) return 1;
    if (drawnSet.has(imageCanvasQuestionId(subject, level, topicLabel, questionId))) return 0.35;
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

  if (heatmapMode === "none") {
    return (
      <div className="rounded-2xl color-bg-grey-5 p-6 flex flex-col items-center justify-center gap-3 min-h-[200px]">
        <p className="text-base font-extrabold color-txt-main">Question Heatmap</p>
        <p className="text-xs color-txt-sub text-center max-w-xs">
          No past papers or image topics found for this subject. Open topics in Practice Hub to build
          your heatmap.
        </p>
      </div>
    );
  }

  if (heatmapMode === "image") {
    if (imageYearColumns.length === 0) {
      return (
        <div className="rounded-2xl color-bg-grey-5 p-6 flex flex-col gap-2">
          <p className="text-base font-extrabold color-txt-main">Question Heatmap</p>
          <p className="text-xs color-txt-sub">
            No grouped image questions found for this subject yet. Open topics in Practice Hub after images
            are uploaded.
          </p>
        </div>
      );
    }

    const imageColCount = imageYearColumns.length;
    return (
      <div className="rounded-2xl color-bg-grey-5 p-6">
        <p className="text-base font-extrabold color-txt-main mb-1">Question Heatmap</p>
        <p className="text-xs color-txt-sub mb-4">
          Each column is one exam year (inferred from filenames when possible). Rows list every question in
          that year across all topics.
        </p>
        <div className="subject-heatmap__scroll">
          <div
            className="subject-heatmap__grid"
            style={{
              gridTemplateColumns: `repeat(${imageColCount}, minmax(2.2rem, 1fr))`,
            }}
          >
            {imageYearColumns.map((yc) => (
              <div
                key={`img-yr-${yc.year}-${yc.deferred ? "d" : "n"}`}
                className="subject-heatmap__col-header"
                title={
                  yc.year > 0
                    ? `${yc.year}${yc.deferred ? " (deferred)" : ""} · ${yc.questions.length} questions`
                    : `Unknown year · ${yc.questions.length} questions`
                }
              >
                {formatImageYearHeatmapHeader(yc)}
              </div>
            ))}

            {Array.from({ length: maxImageQuestions }).map((_, rowIdx) => (
              <React.Fragment key={rowIdx}>
                {imageYearColumns.map((yc) => {
                  const q = yc.questions[rowIdx];
                  if (!q) {
                    return (
                      <div
                        key={`img-yr-${yc.year}-${yc.deferred ? "d" : "n"}-empty-${rowIdx}`}
                        className="subject-heatmap__cell--empty"
                      />
                    );
                  }

                  const heat = getHeatImageTopic(q.paperId, q.topicLabel, q.id);
                  const cellLabel = imageHeatmapCellDisplayLabel(q.name);
                  return (
                    <div
                      key={`${q.paperId}-${q.id}`}
                      className={`subject-heatmap__cell ${
                        heat >= 1
                          ? "subject-heatmap__cell--complete"
                          : heat > 0
                            ? "subject-heatmap__cell--partial"
                            : "subject-heatmap__cell--empty-q"
                      }`}
                      title={`${q.topicTitle}: ${cellLabel}`}
                    >
                      <span className="subject-heatmap__cell-label">{cellLabel}</span>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl color-bg-grey-5 p-6">
      <p className="text-base font-extrabold color-txt-main mb-4">Question Heatmap</p>
      <div className="subject-heatmap__scroll">
        <div
          className="subject-heatmap__grid"
          style={{ gridTemplateColumns: `repeat(${papers.length}, 2.2rem)` }}
        >
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

                  const heat = getHeatPastPaper(paper.id, q.id);
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
