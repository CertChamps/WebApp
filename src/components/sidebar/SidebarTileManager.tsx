import { useState, useCallback, useContext, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LuSparkles, LuMessageSquare, LuTimer, LuPanelRightClose, LuClipboardList, LuSearch } from "react-icons/lu";
import { AIChat } from "../ai";
import type { InjectedExchange } from "../ai/useAI";
import QThread from "../questions/q_thread";
import QuestionDiscover from "../questions/QuestionDiscover";
import Timer from "../timer";
import SpotifyPanel from "../spotify/SpotifyPanel";
import { SpotifyLogo } from "../spotify/SpotifyLogo";
import PastPaperMarkingScheme from "../questions/PastPaperMarkingScheme";
import ImageMarkingScheme from "../questions/ImageMarkingScheme";
import type { ImageQuestion } from "../../hooks/useImageQuestions";
import ProGate from "../ProGate";
import { UserContext } from "../../context/UserContext";
import { canUseAceFeature } from "../../lib/contentAccess";

const TILE_TRANSITION = { type: "tween" as const, duration: 0.35, ease: [0.25, 0.1, 0.25, 1] as const };

export type SidebarPanelId = "ai" | "threads" | "timer" | "spotify" | "markingscheme";

export type SidebarPanelDef = {
  id: SidebarPanelId;
  label: string;
  icon: React.ReactNode;
};

const PANELS: SidebarPanelDef[] = [
  { id: "ai", label: "AI", icon: <LuSparkles size={20} strokeWidth={2} /> },
  { id: "threads", label: "Threads", icon: <LuMessageSquare size={20} strokeWidth={2} /> },
  { id: "timer", label: "Timer", icon: <LuTimer size={20} strokeWidth={2} /> },
  { id: "spotify", label: "Spotify", icon: <SpotifyLogo className="h-5 w-5" /> },
  { id: "markingscheme", label: "Marking scheme", icon: <LuClipboardList size={20} strokeWidth={2} /> },
];

export type MarkingSchemePageRange = { start: number; end: number };

export type SidebarTileManagerProps = {
  question?: any;
  /** Optional: controlled open panel. If not provided, internal state is used. */
  openPanel?: SidebarPanelId | null;
  onOpenPanelChange?: (panel: SidebarPanelId | null) => void;
  /** Called when user requests to collapse the sidebar (e.g. collapse button). */
  onCollapse?: () => void;
  /** Optional: return current drawing as PNG data URL so AI can see handwriting/maths. */
  getDrawingSnapshot?: (() => string | null) | null;
  /** Optional: return music stave analysis (detected note positions as text). */
  getStaveAnalysis?: (() => string | null) | null;
  /** Optional: return current exam paper (first page) as image data URL so AI can see the paper. */
  getPaperSnapshot?: (() => string | null) | null;
  /** Optional: return live document / workspace text for AI chat context. */
  getWorkspaceText?: (() => string | null) | null;
  /** Optional: past paper marking scheme — when provided, marking scheme tab is shown. */
  markingSchemeBlob?: Blob | null;
  markingSchemePageRange?: MarkingSchemePageRange | null;
  markingSchemeQuestionName?: string;
  /** Topic-based image marking scheme pages (imagequestions mode). */
  markingSchemeImages?: ImageQuestion[] | null;
  markingSchemeLoading?: boolean;
  /** When true, always show the marking scheme tab even without a blob (shows placeholder). */
  forceShowMarkingSchemeTab?: boolean;
  /** Optional externally injected chat exchange (e.g. check-answer feedback). */
  aiInjectedExchange?: InjectedExchange | null;
  /** Optional completion CTA handler from grading flow. */
  onMarkCompleteFromGrading?: (() => void) | null;
  /** Whether the current question is already marked complete. */
  questionCompleted?: boolean;
};

export function SidebarTileManager({
  question,
  openPanel: controlledPanel,
  onOpenPanelChange,
  onCollapse,
  getDrawingSnapshot,
  getStaveAnalysis,
  getPaperSnapshot,
  getWorkspaceText,
  markingSchemeBlob,
  markingSchemePageRange,
  markingSchemeQuestionName,
  markingSchemeImages,
  markingSchemeLoading,
  forceShowMarkingSchemeTab,
  aiInjectedExchange,
  onMarkCompleteFromGrading,
  questionCompleted = false,
}: SidebarTileManagerProps) {
  const [internalPanel, setInternalPanel] = useState<SidebarPanelId | null>("ai");
  const isControlled = controlledPanel !== undefined;
  const openPanelId = isControlled ? controlledPanel : internalPanel;

  const showMarkingScheme =
    !!(markingSchemeBlob && markingSchemePageRange) ||
    !!(markingSchemeImages && markingSchemeImages.length > 0) ||
    !!markingSchemeLoading ||
    !!forceShowMarkingSchemeTab;
  const visiblePanels = PANELS.filter((p) => p.id !== "markingscheme" || showMarkingScheme);

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
    <div className="sidebar-tile-manager flex h-full flex-col overflow-hidden rounded-xl border border-grey/25 backdrop-blur-xl color-bg">
      {/* Tab bar: separated “window” tabs + collapse */}
      <div className="sidebar-tile-manager__tabs flex shrink-0 items-center justify-center gap-1 py-2">
        <div className="flex items-center gap-1">
          {visiblePanels.map((p) => {
            const isOpen = p.id === openPanelId;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => togglePanel(p.id)}
                title={p.label}
                className={`sidebar-tile-manager__tab flex items-center justify-center p-2 transition-all duration-200 ${
                  isOpen ? "color-txt-accent" : "color-txt-sub hover:color-txt-main"
                }`}
              >
                <span className="shrink-0 [&>svg]:size-5">{p.icon}</span>
              </button>
            );
          })}
        </div>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            className="sidebar-tile-manager__collapse flex shrink-0 items-center justify-center p-2 color-txt-sub transition-colors hover:color-txt-main"
          >
            <LuPanelRightClose size={20} strokeWidth={2} />
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
              className="sidebar-tile-manager__tile flex flex-1 min-h-0 flex-col overflow-hidden rounded-lg color-bg"
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
                  getStaveAnalysis={getStaveAnalysis}
                  getPaperSnapshot={getPaperSnapshot}
                  getWorkspaceText={getWorkspaceText}
                  markingSchemeBlob={markingSchemeBlob}
                  markingSchemePageRange={markingSchemePageRange}
                  markingSchemeQuestionName={markingSchemeQuestionName}
                  markingSchemeImages={markingSchemeImages}
                  markingSchemeLoading={markingSchemeLoading}
                  aiInjectedExchange={aiInjectedExchange}
                  onMarkCompleteFromGrading={onMarkCompleteFromGrading}
                  questionCompleted={questionCompleted}
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
function TileContent({
  panelId,
  question,
  getDrawingSnapshot,
  getStaveAnalysis,
  getPaperSnapshot,
  getWorkspaceText,
  markingSchemeBlob,
  markingSchemePageRange,
  markingSchemeQuestionName,
  markingSchemeImages,
  markingSchemeLoading,
  aiInjectedExchange,
  onMarkCompleteFromGrading,
  questionCompleted = false,
  onClosePanel: _onClosePanel,
}: {
  panelId: SidebarPanelId;
  question?: any;
  getDrawingSnapshot?: (() => string | null) | null;
  getStaveAnalysis?: (() => string | null) | null;
  getPaperSnapshot?: (() => string | null) | null;
  getWorkspaceText?: (() => string | null) | null;
  markingSchemeBlob?: Blob | null;
  markingSchemePageRange?: MarkingSchemePageRange | null;
  markingSchemeQuestionName?: string;
  markingSchemeImages?: ImageQuestion[] | null;
  markingSchemeLoading?: boolean;
  aiInjectedExchange?: InjectedExchange | null;
  onMarkCompleteFromGrading?: (() => void) | null;
  questionCompleted?: boolean;
  onClosePanel?: () => void;
}) {
  const part = 0;
  const questionId = question?.id ?? "";

  switch (panelId) {
    case "ai":
      return (
        <AIChat
          question={question}
          getDrawingSnapshot={getDrawingSnapshot}
          getStaveAnalysis={getStaveAnalysis}
          getPaperSnapshot={getPaperSnapshot}
          getWorkspaceText={getWorkspaceText}
          injectedExchange={aiInjectedExchange}
          onMarkCompleteFromGrading={onMarkCompleteFromGrading}
        />
      );
    case "threads": {
      const isPaperThread = !!question?._paperThread;
      return <ThreadsPanel questionId={questionId} part={part} isPaperThread={isPaperThread} question={question} />;
    }
    case "timer":
      return (
        <div className="h-full overflow-auto flex justify-center items-start color-bg p-2">
          <Timer />
        </div>
      );
    case "spotify":
      return (
        <div className="h-full overflow-hidden color-bg">
          <SpotifyPanel />
        </div>
      );
    case "markingscheme": {
      let schemeBody: ReactNode;
      if (markingSchemeBlob && markingSchemePageRange) {
        schemeBody = (
          <div className="h-full overflow-hidden flex flex-col">
            {markingSchemeQuestionName && (
              <div className="shrink-0 px-3 py-2 text-center text-sm font-bold color-txt-sub truncate ">
                {markingSchemeQuestionName}
              </div>
            )}
            <div className="flex-1 min-h-0 overflow-auto p-2 w-full">
              <PastPaperMarkingScheme
                file={markingSchemeBlob}
                pageRange={markingSchemePageRange}
                fillWidth
                className="w-full"
              />
            </div>
          </div>
        );
      } else if (markingSchemeLoading) {
        schemeBody = (
          <div className="flex h-full flex-col items-center justify-center p-4 text-center color-txt-sub">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--grey-10)] border-t-[var(--grey-5)] mb-3" />
            <p className="text-sm font-medium">Loading marking scheme…</p>
          </div>
        );
      } else if (markingSchemeImages && markingSchemeImages.length > 0) {
        schemeBody = (
          <div className="h-full overflow-hidden flex flex-col">
            <ImageMarkingScheme
              images={markingSchemeImages}
              questionName={markingSchemeQuestionName}
              className="h-full"
            />
          </div>
        );
      } else {
        schemeBody = (
          <div className="flex h-full flex-col items-center justify-center p-4 text-center color-txt-sub">
            <LuClipboardList size={32} strokeWidth={1.5} className="mb-3 opacity-40" />
            <p className="text-sm font-medium">No marking scheme</p>
            <p className="text-xs mt-1 opacity-70">No marking scheme is available for this question yet.</p>
          </div>
        );
      }
      return (
        <div className="flex h-full min-h-0 flex-col">
          <div className="min-h-0 flex-1 overflow-hidden">{schemeBody}</div>
          {onMarkCompleteFromGrading ? (
            <div className="shrink-0 border-t border-grey/15 p-3">
              <button
                type="button"
                onClick={onMarkCompleteFromGrading}
                className="w-full rounded-lg px-3 py-2 text-xs font-semibold color-bg-accent color-txt-accent hover:opacity-90 transition-opacity"
              >
                {questionCompleted ? "Marked complete ✓" : "Mark as complete"}
              </button>
            </div>
          ) : null}
        </div>
      );
    }
    default:
      return null;
  }
}

function ThreadsPanel({ questionId, part, isPaperThread, question }: { questionId: string; part: number; isPaperThread: boolean; question?: any }) {
  const { user } = useContext(UserContext);
  const [threadView, setThreadView] = useState<"discover" | "discussion">("discover");

  if (!canUseAceFeature(user, "threads")) {
    return (
      <div className="relative h-full overflow-hidden color-bg">
        <div className="h-full filter blur-[2px] pointer-events-none select-none opacity-85 p-4 space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-xl color-bg-grey-5 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full color-bg-grey-10" />
                <div className="h-2.5 w-16 rounded color-bg-grey-10" />
              </div>
              <div className="h-2.5 w-full rounded color-bg-grey-10" />
              <div className="h-2.5 w-2/3 rounded color-bg-grey-10" />
            </div>
          ))}
        </div>
        <ProGate />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden color-bg">
      <div className="shrink-0 p-2 pb-1">
        <div className="grid grid-cols-2 gap-1 rounded-2xl color-bg-grey-5 p-1" role="tablist" aria-label="Question threads">
          <button
            type="button"
            role="tab"
            aria-selected={threadView === "discover"}
            onClick={() => setThreadView("discover")}
            className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-colors cursor-pointer ${
              threadView === "discover" ? "color-bg-accent color-txt-accent" : "color-txt-sub hover:color-txt-main"
            }`}
          >
            <LuSearch size={14} /> Discover
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={threadView === "discussion"}
            onClick={() => setThreadView("discussion")}
            className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-colors cursor-pointer ${
              threadView === "discussion" ? "color-bg-accent color-txt-accent" : "color-txt-sub hover:color-txt-main"
            }`}
          >
            <LuMessageSquare size={14} /> Discussion
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {threadView === "discover" ? (
          <QuestionDiscover question={question} />
        ) : questionId ? (
          <QThread
            questionId={questionId}
            part={part}
            paperThread={isPaperThread}
            paperId={isPaperThread ? question.paperId : undefined}
            paperQuestionId={isPaperThread ? question.paperQuestionId : undefined}
            paperLabel={isPaperThread ? question.paperLabel : undefined}
            questionName={question?._discoverName ?? question?.questionName ?? question?.properties?.name}
            subject={question?._discoverSubjectId ?? question?.subject}
            subjectLabel={question?._discoverSubjectLabel}
            level={question?._discoverLevel ?? question?.level}
            topic={question?._discoverTopic}
            discoverQuestionId={question?._discoverId ?? questionId}
            practiceUrl={question?._practiceUrl}
            sourceContext={question?._discoverSource}
            indexInPaper={isPaperThread ? question.indexInPaper : undefined}
            storagePath={isPaperThread ? question.storagePath : undefined}
            pageRange={isPaperThread ? question.pageRange : undefined}
            pageRegions={isPaperThread ? question.pageRegions : undefined}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-4 text-sm color-txt-sub">
            Select a question to view threads.
          </div>
        )}
      </div>
    </div>
  );
}
