import { useCallback, useEffect, useMemo, useState } from "react";
import { LuPlus, LuLayoutGrid, LuPencil, LuCheck } from "react-icons/lu";
import { default as ReactGridLayout } from "react-grid-layout/legacy";
import type { Layout, LayoutItem } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { useProgressModules, getModuleSize } from "../../hooks/useProgressModules";
import { useAllPaperProgress } from "../../hooks/usePaperProgress";
import { useSubjectLevels } from "../../hooks/useSubjectLevels";
import { useExamPapers, normalizePaperLevel } from "../../hooks/useExamPapers";
import PaperRingModule from "../../components/progress/PaperRingModule";
import PaperBarModule from "../../components/progress/PaperBarModule";
import QuestionHeatmapModule from "../../components/progress/QuestionHeatmapModule";
import TextModule from "../../components/progress/TextModule";
import DrawingModule from "../../components/progress/DrawingModule";
import AddModuleModal from "../../components/progress/AddModuleModal";
import SubjectProgressCard from "../../components/progress/SubjectProgressCard";
import { paperProgressEntryMatchesSubjectLevel } from "../../lib/matchPaperProgressEntry";
import {
  progressSubjectLevelKey,
  useProgressHiddenSubjectLevelKeys,
} from "../../hooks/useProgressHiddenSubjectLevels";
import "../../styles/progress.css";

const GRID_COLS = 12;
const GRID_MARGIN: [number, number] = [2, 2];

const QUOTES: [string, string][] = [
  ["You don't have to be great to start, but you have to start to be great.", "Zig Ziglar"],
  ["The expert in anything was once a beginner.", "Helen Hayes"],
  ["Believe you can and you're halfway there.", "Theodore Roosevelt"],
  ["Success is the sum of small efforts repeated daily.", "Robert Collier"],
  ["Don't watch the clock; do what it does — keep going.", "Sam Levenson"],
  ["It always seems impossible until it's done.", "Nelson Mandela"],
  ["Hard work beats talent when talent doesn't work hard.", "Tim Notke"],
  ["The only way to do great work is to love what you do.", "Steve Jobs"],
  ["Dream big. Start small. Act now.", "Robin Sharma"],
  ["Discipline is choosing between what you want now and what you want most.", "Abraham Lincoln"],
  ["The journey of a thousand miles begins with one step.", "Lao Tzu"],
  ["Whether you think you can or you think you can't, you're right.", "Henry Ford"],
  ["I have not failed. I've just found 10,000 ways that won't work.", "Thomas A. Edison"],
  ["You miss 100% of the shots you don't take.", "Wayne Gretzky"],
  ["Do, or do not. There is no try.", "Yoda"],
  ["Success is not final, failure is not fatal: it is the courage to continue that counts.", "Winston Churchill"],
  ["The future belongs to those who believe in the beauty of their dreams.", "Eleanor Roosevelt"],
  ["The only limit to our realization of tomorrow is our doubts of today.", "Franklin D. Roosevelt"],
  ["In the middle of every difficulty lies opportunity.", "Albert Einstein"],
  ["Fall seven times and stand up eight.", "Japanese Proverb"],
  ["The best time to plant a tree was 20 years ago. The second best time is now.", "Chinese Proverb"],
  ["Everything you've ever wanted is on the other side of fear.", "George Addair"],
  ["If you are going through hell, keep going.", "Winston Churchill"],
  ["We are what we repeatedly do. Excellence, then, is not an act, but a habit.", "Will Durant"],
  ["What you get by achieving your goals is not as important as what you become by achieving your goals.", "Zig Ziglar"],
  ["I attribute my success to this: I never gave or took any excuse.", "Florence Nightingale"],
  ["Definiteness of purpose is the starting point of all achievement.", "W. Clement Stone"],
  ["Twenty years from now you will be more disappointed by the things that you didn't do than by the ones you did do.", "Mark Twain"],
  ["Eighty percent of success is showing up.", "Woody Allen"],
  ["Your time is limited, so don't waste it living someone else's life.", "Steve Jobs"],
  ["Winning isn't everything, but wanting to win is.", "Vince Lombardi"],
  ["I am not a product of my circumstances. I am a product of my decisions.", "Stephen Covey"],
  ["Every strike brings me closer to the next home run.", "Babe Ruth"],
  ["The two most important days in your life are the day you are born and the day you find out why.", "Mark Twain"],
  ["There is only one way to avoid criticism: do nothing, say nothing, and be nothing.", "Aristotle"]
];

const Progress = () => {
  const { modules, loading: modulesLoading, addModule, removeModule, updateLayouts, updateModuleText, updateModuleDrawing } =
    useProgressModules();
  const { entries: progressEntries, loading: progressLoading } = useAllPaperProgress();
  const { pairs: subjectLevels, loading: subjectLevelsLoading } = useSubjectLevels();
  const hiddenSubjectLevelKeys = useProgressHiddenSubjectLevelKeys(progressEntries);
  const {
    papers: leavingCertPapers,
    loading: leavingCertPapersLoading,
    error: leavingCertPapersError,
  } = useExamPapers(null, { loadAllWhenNull: true });

  const visibleSubjectLevels = useMemo(() => {
    if (leavingCertPapersError) return subjectLevels;

    const normLevel = (l: string) => normalizePaperLevel(l) || l.trim().toLowerCase();

    const fromCurriculum =
      subjectLevels.length === 0
        ? []
        : subjectLevels.filter(({ subject, level }) => {
            const hasExamPapers = leavingCertPapers.some(
              (p) =>
                (p.subject ?? "").toLowerCase() === subject.toLowerCase() &&
                normalizePaperLevel(p.level) === normalizePaperLevel(level)
            );
            if (hasExamPapers) return true;

            return progressEntries.some((e) =>
              paperProgressEntryMatchesSubjectLevel(e, subject, level)
            );
          });

    const keys = new Set(
      fromCurriculum.map((p) => `${p.subject.toLowerCase()}||${normLevel(p.level)}`)
    );

    const extras: { subject: string; level: string }[] = [];
    for (const e of progressEntries) {
      const sub = e.subject.trim().toLowerCase();
      const lvl = normLevel(e.level);
      const key = `${sub}||${lvl}`;
      if (keys.has(key)) continue;

      const matchesCurriculumRow = subjectLevels.some((sl) =>
        paperProgressEntryMatchesSubjectLevel(e, sl.subject, sl.level)
      );
      if (matchesCurriculumRow) continue;

      keys.add(key);
      extras.push({ subject: sub, level: lvl });
    }

    return [...fromCurriculum, ...extras].filter(
      (p) => !hiddenSubjectLevelKeys.has(progressSubjectLevelKey(p.subject, p.level))
    );
  }, [
    subjectLevels,
    leavingCertPapers,
    progressEntries,
    leavingCertPapersError,
    hiddenSubjectLevelKeys,
  ]);

  const subjectGridLoading = subjectLevelsLoading || leavingCertPapersLoading || progressLoading;
  const [showAddModal, setShowAddModal] = useState(false);
  const [editing, setEditing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [quote] = useState(() => {
    const q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    return q;
  });

  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  const containerRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerSize({ w: width, h: height });
      }
    });
    ro.observe(el);
  }, []);

  const rowHeight = useMemo(() => {
    const { w } = containerSize;
    if (w <= 0) return 80;
    return (w - GRID_MARGIN[0] * (GRID_COLS - 1)) / GRID_COLS;
  }, [containerSize]);

  const maxRows = useMemo(() => {
    const { w, h } = containerSize;
    if (w <= 0 || h <= 0) return 6;
    const cell = (w - GRID_MARGIN[0] * (GRID_COLS - 1)) / GRID_COLS;
    return Math.max(1, Math.floor((h + GRID_MARGIN[1]) / (cell + GRID_MARGIN[1])));
  }, [containerSize]);

  const RESIZABLE_TYPES = new Set(["text", "drawing"]);

  const layout: Layout = useMemo(
    () =>
      modules.map((m): LayoutItem => {
        const size = getModuleSize(m);
        const maxY = Math.max(0, maxRows - size.h);
        return {
          i: m.id,
          x: m.x,
          y: Math.min(m.y, maxY),
          w: size.w,
          h: size.h,
          static: !editing,
          isResizable: editing && RESIZABLE_TYPES.has(m.type),
          minW: 1,
          minH: 1,
        };
      }),
    [modules, editing, maxRows]
  );

  const onLayoutChange = useCallback(
    (newLayout: Layout) => {
      if (!editing) return;
      const clamped = newLayout.map((l) => {
        const maxY = Math.max(0, maxRows - l.h);
        return { i: l.i, x: l.x, y: Math.min(l.y, maxY), w: l.w, h: l.h };
      });
      updateLayouts(clamped);
    },
    [editing, updateLayouts, maxRows]
  );

  useEffect(() => {
    if (!isDragging) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [isDragging]);

  const loading = modulesLoading || progressLoading;

  if (loading) {
    return (
      <div className="progress-dashboard">
        <div className="p-6 md:p-10 flex flex-wrap gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="progress-module animate-pulse" style={{ width: 220, height: 220 }}>
              <div className="h-4 w-28 rounded color-bg-grey-10 mb-4" />
              <div className="w-24 h-24 mx-auto rounded-full color-bg-grey-10" />
              <div className="h-4 w-20 mx-auto rounded color-bg-grey-10 mt-4" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`progress-dashboard${isDragging ? " progress-dashboard--dragging" : ""}`}>
      <div className="progress-by-subject p-6 md:p-10 pb-0 flex flex-col gap-4 shrink-0">
        <div className="flex items-baseline gap-4 min-w-0">
          <h2 className="text-3xl font-black color-txt-main shrink-0">Progress by Subject</h2>
          <span className="text-sm color-txt-sub italic truncate">&ldquo;{quote[0]}&rdquo; ~ {quote[1]}</span>
        </div>
        {subjectGridLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="rounded-2xl color-bg-grey-5 p-4 animate-pulse flex items-center justify-between gap-4"
              >
                <div className="h-4 w-24 rounded color-bg-grey-10" />
                <div className="w-12 h-12 rounded-full color-bg-grey-10" />
              </div>
            ))}
          </div>
        ) : visibleSubjectLevels.length === 0 ? (
          <p className="text-sm color-txt-sub">
            No subject progress yet. Open a subject in Practice Hub to get started.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleSubjectLevels.map(({ subject, level }) => (
              <SubjectProgressCard
                key={`${subject}-${level}`}
                subject={subject}
                level={level}
                entries={progressEntries}
              />
            ))}
          </div>
        )}
      </div>

      <div className="p-6 md:p-10 pb-0 flex flex-col gap-6 shrink-0">
        <div className="progress-dashboard__header">
          <h1 className="text-3xl font-black color-txt-main shrink-0">Canvas</h1>
          <div className="flex items-center gap-2">
          {editing && (
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="progress-dashboard__add-btn"
              aria-label="Add module"
            >
              <LuPlus size={18} strokeWidth={2.5} />
              <span>Add Module</span>
            </button>
          )}
          {modules.length > 0 && (
            <button
              type="button"
              onClick={() => setEditing((e) => !e)}
              className="progress-dashboard__edit-btn"
              aria-label={editing ? "Done editing" : "Edit dashboard"}
            >
              {editing ? (
                <>
                  <LuCheck size={18} strokeWidth={2.5} />
                  <span>Done</span>
                </>
              ) : (
                <>
                  <LuPencil size={16} strokeWidth={2.5} />
                  <span>Edit</span>
                </>
              )}
            </button>
          )}
          </div>
        </div>

      {modules.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-20 min-h-[300px]">
          <LuLayoutGrid size={48} className="color-txt-sub opacity-20" />
          <h2 className="text-lg font-bold color-txt-main">Your Dashboard is Empty</h2>
          <p className="color-txt-sub text-sm text-center max-w-xs">
            Add a module to start tracking your progress. Pick a module type and a subject to get started.
          </p>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="mt-2 px-5 py-2.5 rounded-xl text-sm font-semibold color-bg-accent color-txt-accent hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-2"
          >
            <LuPlus size={16} strokeWidth={2.5} />
            Add Your First Module
          </button>
        </div>
      ) : (
        <div
          ref={containerRef}
          className={`progress-grid-area${editing ? " progress-grid-area--editing" : ""}${isDragging ? " progress-grid-area--dragging" : ""}`}
        >
          {containerSize.w > 0 && containerSize.h > 0 && (
            <ReactGridLayout
              className="progress-grid-layout"
              layout={layout}
              cols={GRID_COLS}
              rowHeight={rowHeight}
              maxRows={maxRows}
              width={containerSize.w}
              margin={GRID_MARGIN}
              isDraggable={editing}
              isResizable={editing}
              draggableHandle={editing ? ".progress-module__drag-handle" : undefined}
              compactType={null}
              preventCollision
              onLayoutChange={onLayoutChange}
              onDragStart={() => setIsDragging(true)}
              onDragStop={() => setIsDragging(false)}
              onResizeStart={() => setIsDragging(true)}
              onResizeStop={() => setIsDragging(false)}
            >
              {modules.map((mod) => {
                const sharedProps = {
                  config: mod,
                  entries: progressEntries,
                  onRemove: () => removeModule(mod.id),
                  editing,
                };

                let inner;
                switch (mod.type) {
                  case "paper-ring":
                    inner = <PaperRingModule {...sharedProps} />;
                    break;
                  case "paper-bar":
                    inner = <PaperBarModule {...sharedProps} />;
                    break;
                  case "question-heatmap":
                    inner = <QuestionHeatmapModule {...sharedProps} />;
                    break;
                  case "text":
                    inner = (
                      <TextModule
                        config={mod}
                        onRemove={() => removeModule(mod.id)}
                        onTextChange={(t) => updateModuleText(mod.id, t)}
                        editing={editing}
                      />
                    );
                    break;
                  case "drawing":
                    inner = (
                      <DrawingModule
                        config={mod}
                        onRemove={() => removeModule(mod.id)}
                        onDrawingChange={(d) => updateModuleDrawing(mod.id, d)}
                        editing={editing}
                      />
                    );
                    break;
                  default:
                    inner = null;
                }

                return (
                  <div key={mod.id} className={`progress-grid-item flex flex-col min-h-0 ${editing ? "rounded-2xl" : ""}`}>
                    <div className={`flex-1 min-h-0 overflow-hidden relative ${editing ? "rounded-2xl" : "rounded-2xl"}`}>
                      {inner}
                      {editing && (
                        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10">
                          <div
                            className="progress-module__drag-handle w-3 h-1 rounded-full color-bg-grey-10 hover:color-bg-grey-20 cursor-grab active:cursor-grabbing"
                            title="Drag to move"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </ReactGridLayout>
          )}
        </div>
      )}
      </div>

      {showAddModal && (
        <AddModuleModal
          onAdd={(type, subject, level, customSize) => addModule(type, subject, level, customSize, maxRows)}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
};

export default Progress;
