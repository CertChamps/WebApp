import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  LuArrowLeft,
  LuBookOpen,
  LuCalculator,
  LuChevronLeft,
  LuChevronRight,
  LuClipboardList,
  LuEye,
  LuEyeOff,
  LuFileText,
  LuLoaderCircle,
  LuMaximize2,
  LuMinimize2,
  LuPencil,
  LuPlus,
  LuWrench,
} from "react-icons/lu";
import DrawingCanvas, {
  type RegisterDrawingSnapshot,
  type CanvasObject,
} from "../components/questions/DrawingCanvas";
import QuestionTitlePicker from "../components/questions/QuestionTitlePicker";
import ZoomableQuestionImage from "../components/questions/ZoomableQuestionImage";
import WhiteboardsSidebar from "../components/whiteboards/WhiteboardsSidebar";
import PageDetailsModal from "../components/whiteboards/PageDetailsModal";
import FolderModal from "../components/whiteboards/FolderModal";
import AddQuestionModal from "../components/whiteboards/AddQuestionModal";
import FloatingCalculator from "../components/calculator/FloatingCalculator";
import FloatingLogTables from "../components/FloatingLogTables";
import { getLogTablesPdfBlob } from "../utils/logTablesPdf";
import { CollapsibleSidebar } from "../components/sidebar/CollapsibleSidebar";
import type { SidebarPanelId } from "../components/sidebar/SidebarTileManager";
import { FloatingWidgets } from "../components/floating/FloatingWidgets";
import { useCanvasStorage } from "../hooks/useCanvasStorage";
import { useWhiteboards, useWhiteboardPage } from "../hooks/useWhiteboards";
import { useAttachedQuestionMedia } from "../hooks/useAttachedQuestionMedia";
import { OptionsContext } from "../context/OptionsContext";
import { TimerProvider } from "../context/TimerContext";
import {
  setLastWhiteboardsSubject,
  whiteboardCanvasId,
  type AttachedQuestion,
  type WhiteboardFolder,
  type WhiteboardPage,
} from "../data/whiteboards";
import type { ImageQuestion } from "../hooks/useImageQuestions";
import { getThemedPortalTarget } from "../utils/themedPortal";
import "../styles/questions.css";
import "../styles/practiceHub.css";

/** Matches the stroke shape used by DrawingCanvas + useCanvasStorage. */
type CanvasStroke = {
  points: { x: number; y: number; pressure: number }[];
  tool: "pen" | "eraser";
  colorIndex?: number;
  thicknessIndex?: number;
  color?: string;
};

function PaperPanelToggle({
  visible,
  onToggle,
  className = "",
}: {
  visible: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`questions-paper-toggle ${className}`}
      onClick={onToggle}
      aria-label={visible ? "Hide question paper" : "Show question paper"}
      aria-pressed={visible}
      title={visible ? "Hide question paper" : "Show question paper"}
    >
      {visible ? <LuEyeOff size={16} strokeWidth={2} /> : <LuEye size={16} strokeWidth={2} />}
    </button>
  );
}

/** Full-screen toggle whose icon animates (rotate + fade) between the two states. */
function FullscreenToggle({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={active ? "Exit full screen" : "Full screen"}
      title={active ? "Exit full screen" : "Full screen"}
      className={`shrink-0 rounded-lg p-2 transition-colors cursor-pointer ${
        active ? "color-bg-accent color-txt-accent" : "color-txt-sub hover:color-bg-grey-5"
      }`}
    >
      <span className="relative block h-4 w-4">
        <AnimatePresence initial={false} mode="wait">
          <motion.span
            key={active ? "min" : "max"}
            initial={{ opacity: 0, rotate: -90, scale: 0.5 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 90, scale: 0.5 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 flex items-center justify-center"
          >
            {active ? (
              <LuMinimize2 size={16} strokeWidth={2} />
            ) : (
              <LuMaximize2 size={16} strokeWidth={2} />
            )}
          </motion.span>
        </AnimatePresence>
      </span>
    </button>
  );
}

/** A pressable square (icon above label) with clear on/off states, for the tools menu. */
function ToolSquare({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof LuCalculator;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-16 w-16 flex-col items-center justify-center gap-1.5 rounded-xl border transition-all cursor-pointer ${
        active
          ? "color-bg-accent color-txt-accent border-transparent"
          : "color-bg-grey-5 color-txt-sub border-transparent hover:color-bg-grey-10"
      }`}
    >
      <Icon size={20} strokeWidth={2} />
      <span className="text-[10px] font-semibold leading-none">{label}</span>
    </button>
  );
}

type ToolsPanelPosition = { top: number; right: number };

/** Dropdown of floatable tools (calculator, log tables) with on/off tiles. */
function ToolsMenu({
  showCalculator,
  showLogTables,
  onToggleCalculator,
  onToggleLogTables,
}: {
  showCalculator: boolean;
  showLogTables: boolean;
  onToggleCalculator: () => void;
  onToggleLogTables: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState<ToolsPanelPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const anyActive = showCalculator || showLogTables;

  const updatePanelPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setPanelPosition({
      top: rect.bottom + 8,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePanelPosition();
  }, [open, updatePanelPosition]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", updatePanelPosition);
    window.addEventListener("scroll", updatePanelPosition, true);
    return () => {
      window.removeEventListener("resize", updatePanelPosition);
      window.removeEventListener("scroll", updatePanelPosition, true);
    };
  }, [open, updatePanelPosition]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const handleClose = useCallback(() => setOpen(false), []);

  const portalTarget =
    typeof document !== "undefined" ? getThemedPortalTarget() : null;

  const dropdownPortal =
    portalTarget && panelPosition
      ? createPortal(
          <AnimatePresence onExitComplete={() => setPanelPosition(null)}>
            {open && (
              <>
                <motion.button
                  key="tools-menu-backdrop"
                  type="button"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="fixed inset-0 z-[55] cursor-default border-none bg-transparent p-0"
                  aria-label="Close tools menu"
                  onPointerDown={handleClose}
                />
                <motion.div
                  key="tools-menu-panel"
                  initial={{ opacity: 0, y: -6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.96 }}
                  transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
                  className="pointer-events-auto fixed z-[60] rounded-2xl border border-grey/20 color-bg p-2"
                  style={{ top: panelPosition.top, right: panelPosition.right }}
                >
                  <div className="grid grid-cols-2 gap-2">
                    <ToolSquare
                      icon={LuCalculator}
                      label="Calculator"
                      active={showCalculator}
                      onClick={onToggleCalculator}
                    />
                    <ToolSquare
                      icon={LuBookOpen}
                      label="Log tables"
                      active={showLogTables}
                      onClick={onToggleLogTables}
                    />
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          portalTarget
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Tools"
        aria-expanded={open}
        aria-haspopup="menu"
        title="Tools"
        className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
          open || anyActive
            ? "color-bg-accent color-txt-accent"
            : "color-txt-main color-bg-grey-5 hover:color-bg-grey-10"
        }`}
      >
        <LuWrench size={13} strokeWidth={2.5} />
        Tools
      </button>
      {dropdownPortal}
    </>
  );
}

function toImageQuestions(
  images: { src: string; alt: string; key?: string }[],
  prefix: string
): ImageQuestion[] {
  return images.map((img, i) => ({
    name: img.key ?? `${prefix}-${i}`,
    displayName: img.alt,
    storagePath: img.key ?? `${prefix}-${i}`,
    downloadUrl: img.src,
  }));
}

export default function WhiteboardPageView() {
  return (
    <TimerProvider>
      <div className="relative flex min-h-0 w-full flex-1 h-full overflow-hidden color-bg">
        <WhiteboardPageViewInner />
      </div>
    </TimerProvider>
  );
}

function WhiteboardPageViewInner() {
  const navigate = useNavigate();
  const { pageId } = useParams<{ pageId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { options } = useContext(OptionsContext);

  const { page, loading: pageLoading, notFound } = useWhiteboardPage(pageId ?? null);

  const [sidebarSubject, setSidebarSubject] = useState<string | null>(null);
  useEffect(() => {
    if (page && sidebarSubject === null) setSidebarSubject(page.subject);
  }, [page, sidebarSubject]);
  useEffect(() => {
    if (sidebarSubject) setLastWhiteboardsSubject(sidebarSubject);
  }, [sidebarSubject]);

  const {
    folders,
    pages,
    tree,
    loading: treeLoading,
    createPage,
    updatePage,
    deletePage,
    touchPageOpened,
    createFolder,
    updateFolder,
    deleteFolder,
    moveItem,
  } = useWhiteboards(sidebarSubject);

  // Full-screen focus mode (collapses the sidebar + app navbar) and floatable tools.
  const [focusMode, setFocusMode] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [showLogTables, setShowLogTables] = useState(false);
  const [logTablesBlob, setLogTablesBlob] = useState<Blob | null>(null);

  useEffect(() => {
    if (focusMode) document.body.classList.add("wb-focus-mode");
    else document.body.classList.remove("wb-focus-mode");
    return () => document.body.classList.remove("wb-focus-mode");
  }, [focusMode]);

  useEffect(() => {
    if (!showLogTables || logTablesBlob) return;
    let cancelled = false;
    void getLogTablesPdfBlob().then((blob) => {
      if (!cancelled && blob) setLogTablesBlob(blob);
    });
    return () => {
      cancelled = true;
    };
  }, [showLogTables, logTablesBlob]);

  const { saveCanvas, loadCanvas, uploadCanvasAsset } = useCanvasStorage();
  const canvasId = pageId ? whiteboardCanvasId(pageId) : null;
  const [canvasStrokes, setCanvasStrokes] = useState<CanvasStroke[]>([]);
  const [canvasObjects, setCanvasObjects] = useState<CanvasObject[]>([]);
  const [canvasLoading, setCanvasLoading] = useState(true);
  const canvasStrokesRef = useRef(canvasStrokes);
  canvasStrokesRef.current = canvasStrokes;
  const canvasObjectsRef = useRef(canvasObjects);
  canvasObjectsRef.current = canvasObjects;
  const getDrawingSnapshotRef = useRef<(() => string | null) | null>(null);
  const registerDrawingSnapshot = useCallback<RegisterDrawingSnapshot>((fn) => {
    getDrawingSnapshotRef.current = fn;
  }, []);
  const getDrawingSnapshot = useCallback(() => getDrawingSnapshotRef.current?.() ?? null, []);

  useEffect(() => {
    if (!canvasId) return;
    let cancelled = false;
    setCanvasLoading(true);
    loadCanvas(canvasId)
      .then((loaded) => {
        if (cancelled) return;
        setCanvasStrokes(loaded?.strokes ?? []);
        setCanvasObjects(loaded?.objects ?? []);
        setCanvasLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setCanvasStrokes([]);
        setCanvasObjects([]);
        setCanvasLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canvasId, loadCanvas]);

  const handleStrokesChange = useCallback(
    (strokes: CanvasStroke[]) => {
      if (!canvasId) return;
      setCanvasStrokes(strokes);
      saveCanvas(canvasId, strokes, null, canvasObjectsRef.current);
    },
    [canvasId, saveCanvas]
  );

  const handleObjectsChange = useCallback(
    (objects: CanvasObject[]) => {
      if (!canvasId) return;
      setCanvasObjects(objects);
      saveCanvas(canvasId, canvasStrokesRef.current, null, objects);
    },
    [canvasId, saveCanvas]
  );

  const handleUploadImage = useCallback(
    (blob: Blob) => {
      if (!canvasId) return Promise.reject(new Error("No active canvas"));
      return uploadCanvasAsset(canvasId, blob);
    },
    [canvasId, uploadCanvasAsset]
  );

  const touchedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pageId || touchedRef.current === pageId) return;
    touchedRef.current = pageId;
    void touchPageOpened(pageId);
  }, [pageId, touchPageOpened]);

  const attachments = useMemo(() => page?.attachedQuestions ?? [], [page]);
  const [attachmentIndex, setAttachmentIndex] = useState(0);
  const [paperPanelVisible, setPaperPanelVisible] = useState(true);
  const [sessionSidebarOpen, setSessionSidebarOpen] = useState(true);
  const [sidebarOpenPanel, setSidebarOpenPanel] = useState<SidebarPanelId | null>("ai");

  useEffect(() => {
    setAttachmentIndex((i) => Math.min(i, Math.max(0, attachments.length - 1)));
  }, [attachments.length]);

  useEffect(() => {
    setAttachmentIndex(0);
    setPaperPanelVisible(true);
    setSidebarOpenPanel("ai");
  }, [pageId]);

  const qParam = searchParams.get("q");
  useEffect(() => {
    if (!qParam || attachments.length === 0) return;
    const index = attachments.findIndex((a) => a.id === qParam);
    if (index >= 0) {
      setAttachmentIndex(index);
      setPaperPanelVisible(true);
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("q");
        return next;
      },
      { replace: true }
    );
  }, [qParam, attachments, setSearchParams]);

  const currentAttachment: AttachedQuestion | null = attachments[attachmentIndex] ?? null;
  const media = useAttachedQuestionMedia(currentAttachment);

  const markingSchemeImages = useMemo(
    () => toImageQuestions(media.markingSchemeImages, "ms"),
    [media.markingSchemeImages]
  );

  const pickerItems = useMemo(
    () => attachments.map((a) => ({ id: a.id, label: a.label })),
    [attachments]
  );
  const centerTitleRowRef = useRef<HTMLDivElement>(null);

  const [editingPage, setEditingPage] = useState<WhiteboardPage | null>(null);
  const [creatingPage, setCreatingPage] = useState(false);
  const [editingFolder, setEditingFolder] = useState<WhiteboardFolder | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [showAddQuestion, setShowAddQuestion] = useState(false);

  const handleAddAttachments = useCallback(
    async (added: AttachedQuestion[]) => {
      if (!page) return;
      await updatePage(page.id, { attachedQuestions: [...page.attachedQuestions, ...added] });
      setAttachmentIndex(page.attachedQuestions.length);
      setPaperPanelVisible(true);
    },
    [page, updatePage]
  );

  const openPage = useCallback(
    (target: WhiteboardPage) => {
      if (target.id !== pageId) navigate(`/whiteboards/page/${target.id}`);
    },
    [navigate, pageId]
  );

  const openQuestion = useCallback(
    (target: WhiteboardPage, attachmentId: string) => {
      if (target.id === pageId) {
        const index = attachments.findIndex((a) => a.id === attachmentId);
        if (index >= 0) {
          setAttachmentIndex(index);
          setPaperPanelVisible(true);
        }
        return;
      }
      navigate(`/whiteboards/page/${target.id}?q=${encodeURIComponent(attachmentId)}`);
    },
    [pageId, attachments, navigate]
  );

  const sidebarQuestion = useMemo(() => {
    if (!currentAttachment || !page) return undefined;
    return {
      id: `${page.id}_${currentAttachment.id}`,
      properties: { name: currentAttachment.label },
      imageUrls: media.questionImages.map((img) => img.src),
    };
  }, [currentAttachment, page, media.questionImages]);

  const snippetWidth = Math.min(400, Math.floor(typeof window !== "undefined" ? window.innerWidth * 0.3 : 360));

  if (notFound) {
    return (
      <div className="flex h-full w-full flex-1 flex-col items-center justify-center gap-3 color-bg">
        <p className="text-sm color-txt-sub">This page doesn't exist anymore.</p>
        <button
          type="button"
          className="rounded-xl px-4 py-2 text-sm font-semibold color-bg-accent color-txt-accent hover:opacity-90 transition-opacity cursor-pointer"
          onClick={() => navigate("/whiteboards")}
        >
          Back to Whiteboards
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 h-full w-full">
      <div
        className={`flex h-full min-h-0 shrink-0 transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          focusMode ? "w-0 overflow-hidden" : "w-64"
        }`}
        aria-hidden={focusMode}
      >
        <WhiteboardsSidebar
          subject={sidebarSubject}
          onSubjectChange={setSidebarSubject}
          tree={tree}
          folders={folders}
          pages={pages}
          loading={treeLoading}
          currentPageId={pageId ?? null}
          onOpenPage={openPage}
          onOpenQuestion={openQuestion}
          onEditPage={(target) => setEditingPage(target)}
          onEditFolder={(folder) => setEditingFolder(folder)}
          onCreatePage={() => setCreatingPage(true)}
          onCreateFolder={() => setCreatingFolder(true)}
          onHome={() => navigate("/whiteboards")}
          onMove={(drag, move) => void moveItem(drag, move)}
        />
      </div>

      <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* ---- Top bar (kept) ---- */}
        <div className="relative z-40 flex h-11 shrink-0 items-center gap-1 px-2">
          <button
            type="button"
            className="shrink-0 rounded-lg p-2 color-txt-sub hover:color-bg-grey-5 transition-colors cursor-pointer"
            onClick={() => navigate("/whiteboards")}
            aria-label="Back to Whiteboards"
          >
            <LuArrowLeft size={16} />
          </button>

          <div className="flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 text-base leading-none" aria-hidden>
              {page?.emoji ?? <LuFileText size={15} className="color-txt-sub" />}
            </span>
            <span className="min-w-0 truncate text-sm font-bold color-txt-main">
              {page?.name ?? (pageLoading ? "…" : "Untitled page")}
            </span>
            <button
              type="button"
              className="shrink-0 rounded-lg p-1.5 color-txt-sub hover:color-bg-grey-5 transition-colors cursor-pointer"
              onClick={() => page && setEditingPage(page)}
              aria-label="Edit page details"
              title="Edit page details"
            >
              <LuPencil size={13} />
            </button>
          </div>

          {attachments.length > 0 && (
            <div ref={centerTitleRowRef} className="mx-auto flex min-w-0 items-center gap-0.5">
              <button
                type="button"
                className="shrink-0 rounded-lg p-1.5 color-txt-sub hover:color-bg-grey-5 transition-colors cursor-pointer disabled:opacity-30"
                onClick={() => setAttachmentIndex((i) => Math.max(0, i - 1))}
                disabled={attachmentIndex <= 0}
                aria-label="Previous question"
              >
                <LuChevronLeft size={16} />
              </button>
              <QuestionTitlePicker
                anchorRef={centerTitleRowRef}
                title={currentAttachment?.label ?? ""}
                titleKey={currentAttachment?.id}
                items={pickerItems}
                currentIndex={attachmentIndex}
                onSelect={(index) => {
                  setAttachmentIndex(index);
                  setPaperPanelVisible(true);
                }}
              />
              <button
                type="button"
                className="shrink-0 rounded-lg p-1.5 color-txt-sub hover:color-bg-grey-5 transition-colors cursor-pointer disabled:opacity-30"
                onClick={() => setAttachmentIndex((i) => Math.min(attachments.length - 1, i + 1))}
                disabled={attachmentIndex >= attachments.length - 1}
                aria-label="Next question"
              >
                <LuChevronRight size={16} />
              </button>
            </div>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <ToolsMenu
              showCalculator={showCalculator}
              showLogTables={showLogTables}
              onToggleCalculator={() => setShowCalculator((v) => !v)}
              onToggleLogTables={() => setShowLogTables((v) => !v)}
            />
            <button
              type="button"
              className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold color-txt-main color-bg-grey-5 hover:color-bg-grey-10 transition-colors cursor-pointer"
              onClick={() => setShowAddQuestion(true)}
            >
              <LuPlus size={13} strokeWidth={2.5} />
              Add question
            </button>
            <FullscreenToggle active={focusMode} onClick={() => setFocusMode((f) => !f)} />
          </div>
        </div>

        {/* ---- Canvas (full bleed, same as practice) ---- */}
        <div className="relative min-h-0 flex-1">
          {!canvasLoading && (
            <div className="absolute inset-0 z-0">
              <DrawingCanvas
                key={canvasId ?? "no-page"}
                initialStrokes={canvasStrokes}
                onStrokesChange={handleStrokesChange}
                registerDrawingSnapshot={registerDrawingSnapshot}
                enableAttachments
                initialObjects={canvasObjects}
                onObjectsChange={handleObjectsChange}
                onUploadImage={handleUploadImage}
              />
            </div>
          )}
          {canvasLoading && (
            <div className="absolute inset-0 z-0 flex items-center justify-center">
              <LuLoaderCircle size={22} className="animate-spin color-txt-sub" />
            </div>
          )}

          {/* Question paper — left side, same pattern as practice image mode */}
          <div
            className={`absolute bottom-0 top-0 z-10 flex pointer-events-none ${
              options.leftHandMode ? "right-0 justify-end" : "left-0 justify-start"
            }`}
          >
            <AnimatePresence initial={false} mode="popLayout">
              {currentAttachment && paperPanelVisible ? (
                <motion.div
                  key="paper-panel"
                  initial={{ opacity: 0, x: options.leftHandMode ? 16 : -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: options.leftHandMode ? 16 : -16 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className={`relative flex h-full max-h-full min-h-0 w-full max-w-sm shrink-0 flex-col overflow-hidden pointer-events-none ${
                    options.leftHandMode ? "ml-auto" : ""
                  }`}
                >
                  <PaperPanelToggle
                    visible
                    onToggle={() => setPaperPanelVisible(false)}
                    className={`absolute top-3 z-40 ${options.leftHandMode ? "left-3" : "right-3"}`}
                  />
                  <div className="min-h-0 min-w-0 h-full flex flex-col pl-2 pr-1 overflow-hidden pointer-events-none">
                    <div className="flex-1 min-h-0 relative pt-4 pointer-events-none">
                      <div className="flex flex-col overflow-y-auto overflow-x-hidden scrollbar-hide h-full py-2 pb-8 items-center pointer-events-auto">
                        <div className="flex flex-col items-center w-full" style={{ maxWidth: snippetWidth }}>
                          {media.loading ? (
                            <div className="flex h-40 w-full items-center justify-center">
                              <LuLoaderCircle size={20} className="animate-spin color-txt-sub" />
                            </div>
                          ) : media.error ? (
                            <p className="py-6 text-center text-sm color-txt-sub px-3">
                              Couldn't load this question — try again in a moment.
                            </p>
                          ) : media.questionImages.length > 0 ? (
                            <ZoomableQuestionImage
                              images={media.questionImages}
                              className="w-full h-auto"
                              roundStack
                            />
                          ) : (
                            <p className="py-6 text-center text-sm color-txt-sub px-3">
                              No question image available.
                            </p>
                          )}
                        </div>
                        {markingSchemeImages.length > 0 && (
                          <div className="pt-4 flex justify-center w-full" style={{ maxWidth: snippetWidth }}>
                            <button
                              type="button"
                              onClick={() => {
                                setSessionSidebarOpen(true);
                                setSidebarOpenPanel("markingscheme");
                              }}
                              className="questions-marking-scheme-button w-full"
                              aria-label="Reveal marking scheme"
                            >
                              <LuClipboardList size={20} strokeWidth={2} />
                              Reveal marking scheme
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : currentAttachment ? (
                <motion.div
                  key="paper-toggle"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className={`shrink-0 pt-3 pointer-events-auto self-start ${
                    options.leftHandMode ? "ml-auto pr-2" : "pl-2"
                  }`}
                >
                  <PaperPanelToggle
                    visible={false}
                    onToggle={() => setPaperPanelVisible(true)}
                    className="questions-paper-toggle--active"
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          {/* Practice-style collapsible sidebar (AI / threads / timer / marking scheme) */}
          <div
            className={`absolute bottom-0 top-0 z-20 overflow-hidden pointer-events-none ${
              options.leftHandMode ? "left-0" : "right-0"
            } w-[35%]`}
            style={{
              transition: "clip-path 300ms cubic-bezier(0.25,0.1,0.25,1)",
              clipPath: sessionSidebarOpen
                ? "inset(0 0 0 0)"
                : options.leftHandMode
                  ? "inset(0 calc(100% - 3rem) 0 0)"
                  : "inset(0 0 0 calc(100% - 3rem))",
            }}
          >
            <CollapsibleSidebar
              className="pointer-events-auto"
              side={options.leftHandMode ? "left" : "right"}
              question={sidebarQuestion}
              getDrawingSnapshot={getDrawingSnapshot}
              open={sessionSidebarOpen}
              onOpenChange={setSessionSidebarOpen}
              openPanel={sidebarOpenPanel ?? undefined}
              forceShowMarkingSchemeTab={attachments.length > 0}
              onOpenPanelChange={(panel) => setSidebarOpenPanel(panel ?? null)}
              markingSchemeImages={markingSchemeImages}
              markingSchemeLoading={media.loading}
              markingSchemeQuestionName={currentAttachment?.label}
            />
          </div>
        </div>
      </div>

      <FloatingWidgets
        leftHandMode={options.leftHandMode}
        spotifyTabVisible={sessionSidebarOpen && sidebarOpenPanel === "spotify"}
        onOpenTimer={() => {
          setSessionSidebarOpen(true);
          setSidebarOpenPanel("timer");
        }}
        onOpenSpotify={() => {
          setSessionSidebarOpen(true);
          setSidebarOpenPanel("spotify");
        }}
      />

      {/* ---- Modals ---- */}
      {editingPage && (
        <PageDetailsModal
          subject={editingPage.subject}
          folders={folders}
          initial={editingPage}
          onSave={(result) => updatePage(editingPage.id, result)}
          onDelete={async (target) => {
            await deletePage(target);
            if (target.id === pageId) navigate("/whiteboards");
          }}
          onCreateFolder={(input) => createFolder({ ...input, subject: editingPage.subject })}
          onClose={() => setEditingPage(null)}
        />
      )}

      {creatingPage && sidebarSubject && (
        <PageDetailsModal
          subject={sidebarSubject}
          folders={folders}
          onSave={async (result) => {
            const created = await createPage({ ...result, subject: sidebarSubject });
            navigate(`/whiteboards/page/${created.id}`);
          }}
          onBlankCanvas={async (result) => {
            const created = await createPage({ ...result, subject: sidebarSubject });
            navigate(`/whiteboards/page/${created.id}`);
          }}
          onCreateFolder={(input) => createFolder({ ...input, subject: sidebarSubject })}
          onClose={() => setCreatingPage(false)}
        />
      )}

      {editingFolder && (
        <FolderModal
          folders={folders}
          initial={editingFolder}
          onSave={(result) => updateFolder(editingFolder.id, result)}
          onDelete={(folder) => deleteFolder(folder)}
          onClose={() => setEditingFolder(null)}
        />
      )}

      {creatingFolder && sidebarSubject && (
        <FolderModal
          folders={folders}
          onSave={(result) => {
            void createFolder({ ...result, subject: sidebarSubject });
          }}
          onClose={() => setCreatingFolder(false)}
        />
      )}

      {showAddQuestion && page && (
        <AddQuestionModal
          subject={page.subject}
          onAdd={(added) => void handleAddAttachments(added)}
          onClose={() => setShowAddQuestion(false)}
        />
      )}

      {/* ---- Floatable tools (rendered via portal so they float over everything) ---- */}
      {showCalculator && typeof document !== "undefined" && (
        <FloatingCalculator onClose={() => setShowCalculator(false)} />
      )}

      {showLogTables && typeof document !== "undefined" && (
        <FloatingLogTables
          pgNumber="1"
          file={logTablesBlob ?? null}
          onClose={() => setShowLogTables(false)}
        />
      )}
    </div>
  );
}
