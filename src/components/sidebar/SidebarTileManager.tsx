import { useState, useCallback, Component, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LuSparkles, LuMessageSquare, LuTimer, LuPanelRightClose } from "react-icons/lu";
import { AIChat } from "../ai";
import QThread from "../questions/q_thread";
import Timer from "../timer";

const TILE_TRANSITION = { type: "tween" as const, duration: 0.35, ease: [0.25, 0.1, 0.25, 1] };

export type SidebarPanelId = "ai" | "threads" | "timer";

export type SidebarPanelDef = {
  id: SidebarPanelId;
  label: string;
  icon: React.ReactNode;
};

const PANELS: SidebarPanelDef[] = [
  { id: "ai", label: "AI", icon: <LuSparkles size={16} strokeWidth={2} /> },
  { id: "threads", label: "Threads", icon: <LuMessageSquare size={16} strokeWidth={2} /> },
  { id: "timer", label: "Timer", icon: <LuTimer size={16} strokeWidth={2} /> },
];

export type SidebarTileManagerProps = {
  question?: any;
  /** Optional: controlled open panel. If not provided, internal state is used. */
  openPanel?: SidebarPanelId | null;
  onOpenPanelChange?: (panel: SidebarPanelId | null) => void;
  /** Called when user requests to collapse the sidebar (e.g. collapse button). */
  onCollapse?: () => void;
  /** Optional: return current drawing as PNG data URL so AI can see handwriting/maths. */
  getDrawingSnapshot?: (() => string | null) | null;
  /** Optional: return current exam paper (first page) as image data URL so AI can see the paper. */
  getPaperSnapshot?: (() => string | null) | null;
};

export function SidebarTileManager({
  question,
  openPanel: controlledPanel,
  onOpenPanelChange,
  onCollapse,
  getDrawingSnapshot,
  getPaperSnapshot,
}: SidebarTileManagerProps) {
  const [internalPanel, setInternalPanel] = useState<SidebarPanelId | null>("ai");
  const isControlled = controlledPanel !== undefined;
  const openPanelId = isControlled ? controlledPanel : internalPanel;

  const setOpenPanel = useCallback(
    (next: SidebarPanelId | null) => {
      if (!isControlled) setInternalPanel(next);
      onOpenPanelChange?.(next);
    },
    [isControlled, onOpenPanelChange]
  );

  const togglePanel = useCallback(
    (id: SidebarPanelId) => {
      setOpenPanel(openPanelId === id ? null : id);
    },
    [openPanelId, setOpenPanel]
  )

  return (
    <div className="sidebar-tile-manager flex h-full flex-col overflow-hidden rounded-xl border border-grey/25 color-shadow backdrop-blur-xl color-bg">
      {/* Tab bar: separated “window” tabs + collapse */}
      <div className="sidebar-tile-manager__tabs flex shrink-0 items-center gap-2 px-2 py-2 color-bg-grey-5/90">
        <div className="flex min-w-0 flex-1 gap-2">
          {PANELS.map((p) => {
            const isOpen = p.id === openPanelId;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => togglePanel(p.id)}
                className={`sidebar-tile-manager__tab flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition-all duration-200 ${
                  isOpen
                    ? "border-grey/30 color-bg-accent color-txt-accent shadow-sm"
                    : "border-grey/20 color-txt-sub hover:border-grey/30 hover:color-bg-grey-10 hover:color-txt-main"
                }`}
                title={p.label}
              >
                <span className="shrink-0 [&>svg]:size-4">{p.icon}</span>
                <span className="truncate">{p.label}</span>
              </button>
            );
          })}
        </div>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            aria-label="Collapse sidebar"
            className="sidebar-tile-manager__collapse flex shrink-0 items-center justify-center rounded-lg border border-grey/20 p-2 color-txt-sub transition-colors hover:border-grey/30 hover:color-bg-grey-10 hover:color-txt-main"
          >
            <LuPanelRightClose size={18} strokeWidth={2} />
          </button>
        )}
      </div>

      {/* Single panel — fills full height */}
      <motion.div
        className="sidebar-tile-manager__stack relative flex flex-1 min-h-0 flex-col overflow-hidden"
        layout
        transition={TILE_TRANSITION}
      >
        <AnimatePresence mode="wait" initial={false}>
          {openPanelId ? (
            <motion.div
              key={openPanelId}
              layout
              className="sidebar-tile-manager__tile flex flex-1 min-h-0 flex-col overflow-hidden rounded-lg color-shadow color-bg"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={TILE_TRANSITION}
            >
              <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                <TileContent
                  panelId={openPanelId}
                  question={question}
                  getDrawingSnapshot={getDrawingSnapshot}
                  getPaperSnapshot={getPaperSnapshot}
                  onClosePanel={() => setOpenPanel(null)}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center color-txt-sub text-sm px-4"
            >
              Open a panel from the tabs above.
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

/** Catches render errors (e.g. from react-pdf) and shows a fallback. */
class TileErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function TileContent({
  panelId,
  question,
  getDrawingSnapshot,
  getPaperSnapshot,
  onClosePanel,
}: {
  panelId: SidebarPanelId;
  question?: any;
  getDrawingSnapshot?: (() => string | null) | null;
  getPaperSnapshot?: (() => string | null) | null;
  onClosePanel?: () => void;
}) {
  const part = 0;
  const questionId = question?.id ?? "";

  switch (panelId) {
    case "ai":
      return <AIChat question={question} getDrawingSnapshot={getDrawingSnapshot} getPaperSnapshot={getPaperSnapshot} />;
    case "threads":
      return (
        <div className="h-full overflow-auto color-bg">
          {questionId ? (
            <QThread questionId={questionId} part={part} />
          ) : (
            <div className="flex h-full items-center justify-center p-4 text-sm color-txt-sub">
              Select a question to view threads.
            </div>
          )}
        </div>
      );
    case "timer":
      return (
        <div className="h-full overflow-auto flex justify-center items-start color-bg p-2">
          <Timer />
        </div>
      );
    default:
      return null;
  }
}
