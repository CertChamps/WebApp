import { useState, useCallback, Component, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LuSparkles, LuBookOpen, LuMessageSquare, LuTimer, LuPanelRightClose } from "react-icons/lu";
import { AIChat } from "../ai";
import LogTables from "../logtables";
import QThread from "../questions/q_thread";
import Timer from "../timer";

const TILE_TRANSITION = { type: "tween" as const, duration: 0.35, ease: [0.25, 0.1, 0.25, 1] };

export type SidebarPanelId = "ai" | "logtables" | "threads" | "timer";

export type SidebarPanelDef = {
  id: SidebarPanelId;
  label: string;
  icon: React.ReactNode;
};

const PANELS: SidebarPanelDef[] = [
  { id: "ai", label: "AI", icon: <LuSparkles size={16} strokeWidth={2} /> },
  { id: "logtables", label: "Log tables", icon: <LuBookOpen size={16} strokeWidth={2} /> },
  { id: "threads", label: "Threads", icon: <LuMessageSquare size={16} strokeWidth={2} /> },
  { id: "timer", label: "Timer", icon: <LuTimer size={16} strokeWidth={2} /> },
];

export type SidebarTileManagerProps = {
  question?: any;
  /** Optional: controlled open panels [top, bottom]. If not provided, internal state is used. */
  openPanels?: [SidebarPanelId | null, SidebarPanelId | null];
  onOpenPanelsChange?: (panels: [SidebarPanelId | null, SidebarPanelId | null]) => void;
  /** Called when user requests to collapse the sidebar (e.g. collapse button). */
  onCollapse?: () => void;
  /** Optional: return current drawing as PNG data URL so AI can see handwriting/maths. */
  getDrawingSnapshot?: (() => string | null) | null;
};

export function SidebarTileManager({
  question,
  openPanels: controlledOpen,
  onOpenPanelsChange,
  onCollapse,
  getDrawingSnapshot,
}: SidebarTileManagerProps) {
  const [internalOpen, setInternalOpen] = useState<[SidebarPanelId | null, SidebarPanelId | null]>([
    "ai",
    null,
  ]);
  const isControlled = controlledOpen != null;
  const openPanels: [SidebarPanelId | null, SidebarPanelId | null] = isControlled
    ? controlledOpen
    : internalOpen;

  const setOpenPanels = useCallback(
    (next: [SidebarPanelId | null, SidebarPanelId | null]) => {
      if (!isControlled) setInternalOpen(next);
      onOpenPanelsChange?.(next);
    },
    [isControlled, onOpenPanelsChange]
  );

  const openPanel = useCallback(
    (id: SidebarPanelId) => {
      const [top, bottom] = openPanels;
      if (top === id || bottom === id) {
        // Tap open tab = close that panel
        if (top === id) setOpenPanels([bottom, null]);
        else setOpenPanels([top, null]);
        return;
      }
      if (top == null) {
        setOpenPanels([id, null]);
        return;
      }
      if (bottom == null) {
        setOpenPanels([top, id]);
        return;
      }
      // Two already open: drop top, shift bottom up, add new at bottom
      setOpenPanels([bottom, id]);
    },
    [openPanels, setOpenPanels]
  );

  const [topId, bottomId] = openPanels;
  const hasTwo = topId != null && bottomId != null;
  const panelCount = (topId != null ? 1 : 0) + (bottomId != null ? 1 : 0);

  return (
    <div className="sidebar-tile-manager flex h-full flex-col overflow-hidden rounded-xl border border-grey/25 color-shadow backdrop-blur-xl color-bg">
      {/* Tab bar: separated “window” tabs + collapse */}
      <div className="sidebar-tile-manager__tabs flex shrink-0 items-center gap-2 border-b border-grey/25 px-2 py-2 color-bg-grey-5/90">
        <div className="flex min-w-0 flex-1 gap-2">
          {PANELS.map((p) => {
            const isOpen = p.id === topId || p.id === bottomId;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => openPanel(p.id)}
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

      {/* Stack of 1 or 2 panels — new slides in from right, removed slides out, others slide up */}
      <motion.div
        className="sidebar-tile-manager__stack relative flex flex-1 min-h-0 flex-col overflow-hidden"
        layout
        transition={TILE_TRANSITION}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {[topId, bottomId].filter((id): id is SidebarPanelId => id != null).map((id, index) => {
            const isTop = index === 0;
            const isBottom = index === 1;
            return (
              <motion.div
                key={id}
                layout
                className={`sidebar-tile-manager__tile flex flex-col overflow-hidden rounded-lg border border-grey/25 color-shadow color-bg ${
                  isTop ? "shrink-0" : "flex-1 min-h-0"
                }`}
                style={
                  isTop
                    ? { height: hasTwo ? "50%" : "100%", minHeight: 0 }
                    : { minHeight: 0 }
                }
                initial={isBottom ? { x: "100%", opacity: 0.85 } : false}
                animate={{ x: 0, opacity: 1 }}
                exit={
                  isTop
                    ? { y: "-100%", opacity: 0, transition: TILE_TRANSITION }
                    : { y: "100%", opacity: 0, transition: TILE_TRANSITION }
                }
                transition={TILE_TRANSITION}
              >
                <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                  <TileContent panelId={id} question={question} getDrawingSnapshot={getDrawingSnapshot} />
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        {panelCount === 0 && (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 flex items-center justify-center color-txt-sub text-sm px-4"
          >
            Open a panel from the tabs above.
          </motion.div>
        )}
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
}: {
  panelId: SidebarPanelId;
  question?: any;
  getDrawingSnapshot?: (() => string | null) | null;
}) {
  const part = 0;
  const pgNumber = question?.content?.[part]?.logtables != null
    ? String(question.content[part].logtables)
    : "1";
  const questionId = question?.id ?? "";

  switch (panelId) {
    case "ai":
      return <AIChat question={question} getDrawingSnapshot={getDrawingSnapshot} />;
    case "logtables":
      return (
        <TileErrorBoundary
          fallback={
            <div className="flex h-full items-center justify-center p-4 text-center text-sm color-txt-sub">
              Log tables failed to load. Try refreshing.
            </div>
          }
        >
          <div className="h-full overflow-auto flex justify-center color-bg">
            <LogTables pgNumber={pgNumber} />
          </div>
        </TileErrorBoundary>
      );
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
