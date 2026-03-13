import { useCallback, useMemo, useState } from "react";
import { LuPlus, LuLayoutGrid, LuPencil, LuCheck } from "react-icons/lu";
import { default as ReactGridLayout } from "react-grid-layout/legacy";
import type { Layout, LayoutItem } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { useProgressModules, MODULE_SIZES } from "../../hooks/useProgressModules";
import { useAllPaperProgress } from "../../hooks/usePaperProgress";
import PaperRingModule from "../../components/progress/PaperRingModule";
import PaperHeatmapModule from "../../components/progress/PaperHeatmapModule";
import QuestionHeatmapModule from "../../components/progress/QuestionHeatmapModule";
import AddModuleModal from "../../components/progress/AddModuleModal";
import "../../styles/progress.css";

const GRID_COLS = 12;
const GRID_MARGIN: [number, number] = [16, 16];

const Progress = () => {
  const { modules, loading: modulesLoading, addModule, removeModule, updateLayouts } =
    useProgressModules();
  const { entries: progressEntries, loading: progressLoading } = useAllPaperProgress();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editing, setEditing] = useState(false);

  const [containerWidth, setContainerWidth] = useState(0);

  const containerRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    setContainerWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
  }, []);

  const rowHeight = useMemo(() => {
    if (containerWidth <= 0) return 80;
    return (containerWidth - GRID_MARGIN[0] * (GRID_COLS - 1)) / GRID_COLS;
  }, [containerWidth]);

  const layout: Layout = useMemo(
    () =>
      modules.map((m): LayoutItem => ({
        i: m.id,
        x: m.x,
        y: m.y,
        w: MODULE_SIZES[m.type].w,
        h: MODULE_SIZES[m.type].h,
        static: !editing,
      })),
    [modules, editing]
  );

  const onLayoutChange = useCallback(
    (newLayout: Layout) => {
      if (!editing) return;
      updateLayouts(newLayout.map((l) => ({ i: l.i, x: l.x, y: l.y })));
    },
    [editing, updateLayouts]
  );

  const loading = modulesLoading || progressLoading;

  if (loading) {
    return (
      <div className="progress-dashboard">
        <div className="progress-dashboard__header">
          <h1 className="text-xl font-bold color-txt-main">Progress</h1>
        </div>
        <div className="flex flex-wrap gap-4">
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
    <div className="progress-dashboard">
      <div className="progress-dashboard__header">
        <h1 className="text-xl font-bold color-txt-main">Progress</h1>
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
        <div className="flex flex-col items-center justify-center flex-1 gap-4 py-20">
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
          className={`progress-grid-area${editing ? " progress-grid-area--editing" : ""}`}
        >
          {containerWidth > 0 && (
            <ReactGridLayout
              className="progress-grid-layout"
              layout={layout}
              cols={GRID_COLS}
              rowHeight={rowHeight}
              width={containerWidth}
              margin={GRID_MARGIN}
              isDraggable={editing}
              isResizable={false}
              compactType={null}
              preventCollision
              onLayoutChange={onLayoutChange}
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
                  case "paper-heatmap":
                    inner = <PaperHeatmapModule {...sharedProps} />;
                    break;
                  case "question-heatmap":
                    inner = <QuestionHeatmapModule {...sharedProps} />;
                    break;
                  default:
                    inner = null;
                }

                return (
                  <div key={mod.id} className="progress-grid-item">
                    {inner}
                  </div>
                );
              })}
            </ReactGridLayout>
          )}
        </div>
      )}

      {showAddModal && (
        <AddModuleModal
          onAdd={addModule}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
};

export default Progress;
