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
  LuBookOpen,
  LuCalculator,
  LuChevronLeft,
  LuChevronRight,
  LuCircleCheck,
  LuClipboardList,
  LuEye,
  LuEyeOff,
  LuFileText,
  LuLoaderCircle,
  LuPanelLeftClose,
  LuPanelLeftOpen,
  LuPencil,
  LuPin,
  LuPlus,
  LuWrench,
} from "react-icons/lu";
import DrawingCanvas, {
  type RegisterDrawingSnapshot,
  type RegisterGetGradingCapture,
  type AttachQuestionImagesFn,
  type RestoreCanvasObjectFn,
  type CanvasObject,
  type ToolMode,
  questionAttachmentObjectId,
} from "../components/questions/DrawingCanvas";
import CanvasTextBoxLayer, { type CanvasTextBox, type CanvasTextDefaults } from "../components/questions/CanvasTextBoxLayer";
import QuestionTitlePicker from "../components/questions/QuestionTitlePicker";
import ZoomableQuestionImage from "../components/questions/ZoomableQuestionImage";
import QuestionAudioPlayer from "../components/questions/QuestionAudioPlayer";
import WhiteboardsSidebar from "../components/whiteboards/WhiteboardsSidebar";
import { applyThemeTextColor } from "../lib/themeTextColor";
import PageDetailsModal from "../components/whiteboards/PageDetailsModal";
import DocumentEditor from "../components/whiteboards/DocumentEditor";
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
import {
  useAttachedQuestionMedia,
  invalidateAttachedQuestionMedia,
  resolveAttachedQuestionImageUrls,
} from "../hooks/useAttachedQuestionMedia";
import { OptionsContext } from "../context/OptionsContext";
import { TimerProvider } from "../context/TimerContext";
import {
  documentCanvasId,
  setLastWhiteboardsSubject,
  whiteboardCanvasId,
  whiteboardQuestionCanvasId,
  type AttachedQuestion,
  type WhiteboardFolder,
  type WhiteboardPage,
} from "../data/whiteboards";
import type { ImageQuestion } from "../hooks/useImageQuestions";
import { getThemedPortalTarget } from "../utils/themedPortal";
import type { InjectedExchange } from "../components/ai/useAI";
import { AiRequestError, aiResponseError, authenticatedAiFetch, createAiUsageId, METERED_CHAT_API_URL } from "../lib/aiApi";
import { runGrading } from "../lib/grading/GradingEngine";
import type { CanvasAnnotation, CanvasCapturePayload, GradingStatus, Pass1Result } from "../lib/grading/GradingTypes";
import { buildPartSummary } from "../lib/grading/annotationBuilder";
import { BlankCanvasError } from "../lib/grading/canvasCapture";
import { getPracticeSubjectId, getSubjectLabel } from "../data/practiceHubSubjects";
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

function isSavedGradingAnnotations(value: unknown): value is CanvasAnnotation[] {
  if (!Array.isArray(value)) return false;
  return value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const record = item as Record<string, unknown>;
    if (record.type === "errorComment") {
      return (
        typeof record.id === "string" &&
        typeof record.worldX === "number" &&
        typeof record.worldY === "number" &&
        typeof record.text === "string"
      );
    }
    if (record.type === "markAnnotation") {
      return (
        typeof record.worldX === "number" &&
        typeof record.worldY === "number" &&
        typeof record.label === "string"
      );
    }
    if (record.type === "errorBox") {
      return (
        typeof record.id === "string" &&
        typeof record.worldX === "number" &&
        typeof record.worldY === "number"
      );
    }
    if (record.type === "handCircle") {
      return (
        typeof record.worldX === "number" &&
        typeof record.worldY === "number" &&
        typeof record.width === "number" &&
        typeof record.height === "number"
      );
    }
    return false;
  });
}

function gradingStatusLabel(status: GradingStatus): string {
  switch (status) {
    case "capturing":
    case "reading":
      return "Reading your workings...";
    case "marking":
      return "Marking...";
    case "rendering":
      return "Check Answer";
    case "done":
      return "Done";
    case "error":
      return "Try again";
    default:
      return "Check Answer";
  }
}

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
      className={`questions-paper-toggle color-shadow ${className}`}
      onClick={onToggle}
      aria-label={visible ? "Hide question paper" : "Show question paper"}
      aria-pressed={visible}
      title={visible ? "Hide question paper" : "Show question paper"}
    >
      {visible ? <LuEyeOff size={16} strokeWidth={2} /> : <LuEye size={16} strokeWidth={2} />}
    </button>
  );
}

/** Fixed eye control for documents — sits above the portaled top toolbar. */
function DocumentPaperEye({
  visible,
  onToggle,
  leftHandMode,
}: {
  visible: boolean;
  onToggle: () => void;
  leftHandMode: boolean;
}) {
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number } | null>(null);

  useLayoutEffect(() => {
    const update = () => {
      const area = document.querySelector("[data-wb-canvas-area]") as HTMLElement | null;
      if (!area) {
        setPos(null);
        return;
      }
      const rect = area.getBoundingClientRect();
      const top = Math.max(8, rect.top + 12);
      if (leftHandMode) {
        setPos({ top, right: Math.max(8, window.innerWidth - rect.right + 12) });
      } else {
        setPos({ top, left: Math.max(8, rect.left + 12) });
      }
    };
    update();
    window.addEventListener("resize", update);
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    const area = document.querySelector("[data-wb-canvas-area]");
    if (area) ro?.observe(area);
    return () => {
      window.removeEventListener("resize", update);
      ro?.disconnect();
    };
  }, [leftHandMode]);

  if (typeof document === "undefined" || !pos) return null;

  return createPortal(
    <div
      className="pointer-events-auto"
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        right: pos.right,
        zIndex: 40,
      }}
    >
      <PaperPanelToggle
        visible={visible}
        onToggle={onToggle}
        className={visible ? "" : "questions-paper-toggle--active"}
      />
    </div>,
    getThemedPortalTarget()
  );
}

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

  // The folders control collapses both left-side navigation areas together.
  const [foldersSidebarOpen, setFoldersSidebarOpen] = useState(true);
  const [showCalculator, setShowCalculator] = useState(false);
  const [showLogTables, setShowLogTables] = useState(false);
  const [logTablesBlob, setLogTablesBlob] = useState<Blob | null>(null);

  useEffect(() => {
    if (!foldersSidebarOpen) document.body.classList.add("wb-focus-mode");
    else document.body.classList.remove("wb-focus-mode");
    return () => document.body.classList.remove("wb-focus-mode");
  }, [foldersSidebarOpen]);

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

  const attachments = useMemo(() => page?.attachedQuestions ?? [], [page]);
  const [attachmentIndex, setAttachmentIndex] = useState(0);
  const [pinnedSideObject, setPinnedSideObject] = useState<CanvasObject | null>(null);
  const [paperPanelVisible, setPaperPanelVisible] = useState(true);
  const [sessionSidebarOpen, setSessionSidebarOpen] = useState(true);
  const [sidebarOpenPanel, setSidebarOpenPanel] = useState<SidebarPanelId | null>("ai");
  const pendingQuestionSeedsRef = useRef(new Set<string>());
  const seedingInFlightRef = useRef(new Set<string>());
  const attachQuestionImagesRef = useRef<AttachQuestionImagesFn | null>(null);
  const restoreCanvasObjectRef = useRef<RestoreCanvasObjectFn | null>(null);
  const [attachQuestionReady, setAttachQuestionReady] = useState(0);
  const registerAttachQuestionImages = useCallback((fn: AttachQuestionImagesFn | null) => {
    attachQuestionImagesRef.current = fn;
    if (fn) setAttachQuestionReady((version) => version + 1);
  }, []);
  const registerRestoreCanvasObject = useCallback((fn: RestoreCanvasObjectFn | null) => {
    restoreCanvasObjectRef.current = fn;
  }, []);

  useEffect(() => {
    setAttachmentIndex((i) => Math.min(i, Math.max(0, attachments.length - 1)));
  }, [attachments.length]);

  useEffect(() => {
    setAttachmentIndex(0);
    setPinnedSideObject(null);
    setPaperPanelVisible(true);
    setSidebarOpenPanel("ai");
    pendingQuestionSeedsRef.current = new Set();
    seedingInFlightRef.current = new Set();
  }, [pageId]);

  const qParam = searchParams.get("q");
  useEffect(() => {
    if (!qParam || attachments.length === 0) return;
    const index = attachments.findIndex((a) => a.id === qParam);
    if (index >= 0) {
      setAttachmentIndex(index);
      pendingQuestionSeedsRef.current.add(qParam);
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
  const canvasAttachmentIdRef = useRef<string | null>(null);
  canvasAttachmentIdRef.current = currentAttachment?.id ?? null;

  // Each attached question gets its own whiteboard (strokes + attachments).
  const canvasId = pageId && page?.id === pageId
    ? (page.pageType === "document"
      ? documentCanvasId(pageId)
      : currentAttachment
        ? whiteboardQuestionCanvasId(pageId, currentAttachment.id)
        : whiteboardCanvasId(pageId))
    : null;
  const [canvasStrokes, setCanvasStrokes] = useState<CanvasStroke[]>([]);
  const [canvasObjects, setCanvasObjects] = useState<CanvasObject[]>([]);
  const [canvasTextBoxes, setCanvasTextBoxes] = useState<CanvasTextBox[]>([]);
  const [canvasTextDefaults, setCanvasTextDefaults] = useState<CanvasTextDefaults>({
    fontSize: 18,
    colorIndex: 0,
    fontWeight: "normal",
    fontStyle: "normal",
    listStyle: "none",
  });
  const [editorMode, setEditorMode] = useState<"pen" | "text">("pen");
  const [canvasTool, setCanvasTool] = useState<ToolMode>("pen");
  const [selectedCanvasTextBoxId, setSelectedCanvasTextBoxId] = useState<string | null>(null);
  const [canvasTextFormat, setCanvasTextFormat] = useState({ bold: false, italic: false, bullet: false });
  const selectActive = canvasTool === "lasso";
  const textEditing = editorMode === "text" && !selectActive;
  const [canvasViewport, setCanvasViewport] = useState({
    pan: { x: 0, y: 0 },
    scale: 1,
  });
  const [canvasLoading, setCanvasLoading] = useState(true);
  const [canvasLoadError, setCanvasLoadError] = useState("");
  const [canvasLoadAttempt, setCanvasLoadAttempt] = useState(0);

  const [gradingAnnotations, setGradingAnnotations] = useState<CanvasAnnotation[]>([]);
  const [checkAnswerStatus, setCheckAnswerStatus] = useState<string | null>(null);
  const [gradingStatus, setGradingStatus] = useState<GradingStatus>("idle");
  const [pass1Cache, setPass1Cache] = useState<Record<string, Pass1Result>>({});
  const [aiInjectedExchange, setAiInjectedExchange] = useState<InjectedExchange | null>(null);
  const canvasStrokesRef = useRef(canvasStrokes);
  canvasStrokesRef.current = canvasStrokes;
  const canvasObjectsRef = useRef(canvasObjects);
  canvasObjectsRef.current = canvasObjects;
  const canvasTextBoxesRef = useRef(canvasTextBoxes);
  canvasTextBoxesRef.current = canvasTextBoxes;
  const canvasTextSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gradingAnnotationsRef = useRef(gradingAnnotations);
  gradingAnnotationsRef.current = gradingAnnotations;
  const activeCanvasIdRef = useRef(canvasId);
  const previousCanvasIdRef = useRef<string | null>(null);
  const getDrawingSnapshotRef = useRef<(() => string | null) | null>(null);
  const registerDrawingSnapshot = useCallback<RegisterDrawingSnapshot>((fn) => {
    getDrawingSnapshotRef.current = fn;
  }, []);
  const getDrawingSnapshot = useCallback(() => getDrawingSnapshotRef.current?.() ?? null, []);
  const getDocumentTextRef = useRef<(() => string) | null>(null);
  const registerGetDocumentText = useCallback((fn: (() => string) | null) => {
    getDocumentTextRef.current = fn;
  }, []);
  const getWorkspaceText = useCallback(() => {
    if (page?.pageType !== "document") return null;
    const text = getDocumentTextRef.current?.() ?? "";
    return text.trim() ? text : null;
  }, [page?.pageType]);
  const documentCheckAnswerRef = useRef<(() => Promise<void>) | null>(null);
  const registerDocumentCheckAnswer = useCallback((fn: (() => Promise<void>) | null) => {
    documentCheckAnswerRef.current = fn;
  }, []);
  const [documentChecking, setDocumentChecking] = useState(false);

  const getGradingCaptureRef = useRef<
    ((mode?: "default" | "full-ink" | "retry-aggressive") => CanvasCapturePayload | null) | null
  >(null);
  const registerGetGradingCapture = useCallback<RegisterGetGradingCapture>((fn) => {
    getGradingCaptureRef.current = fn;
  }, []);
  const getGradingCapture = useCallback(
    (mode: "default" | "full-ink" | "retry-aggressive" = "default") =>
      getGradingCaptureRef.current?.(mode) ?? null,
    []
  );

  // Persist the previous question board before loading the next (keeps drawings isolated).
  useEffect(() => {
    const prevId = previousCanvasIdRef.current;
    if (prevId && prevId !== canvasId) {
      void saveCanvas(
        prevId,
        canvasStrokesRef.current,
        gradingAnnotationsRef.current,
        canvasObjectsRef.current,
        canvasTextBoxesRef.current
      ).catch((error) => console.error("[whiteboard] switch save failed", error));
    }
    previousCanvasIdRef.current = canvasId;
    activeCanvasIdRef.current = canvasId;
  }, [canvasId, saveCanvas]);

  useEffect(() => {
    if (!canvasId) return;
    let cancelled = false;
    setCanvasLoading(true);
    setCanvasLoadError("");
    setCanvasStrokes([]);
    setCanvasObjects([]);
    setCanvasTextBoxes([]);
    setGradingAnnotations([]);
    loadCanvas(canvasId)
      .then((loaded) => {
        if (cancelled) return;
        const strokes = loaded?.strokes ?? [];
        const objects = loaded?.objects ?? [];
        setCanvasStrokes(strokes);
        setCanvasObjects(objects);
        setCanvasTextBoxes(loaded?.textBoxes ?? []);
        setGradingAnnotations(
          isSavedGradingAnnotations(loaded?.feedbackOverlay) ? loaded.feedbackOverlay : []
        );
        setCanvasLoading(false);
        // Fresh per-question board → place that question's image once.
        const attachmentId = canvasAttachmentIdRef.current;
        if (attachmentId && strokes.length === 0 && objects.length === 0) {
          pendingQuestionSeedsRef.current.add(attachmentId);
        } else if (attachmentId) {
          const objectId = questionAttachmentObjectId(attachmentId);
          if (objects.some((o) => o.id === objectId)) {
            pendingQuestionSeedsRef.current.delete(attachmentId);
          }
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setCanvasStrokes([]);
        setCanvasObjects([]);
        setCanvasTextBoxes([]);
        setGradingAnnotations([]);
        setCanvasLoadError(error instanceof Error ? error.message : "Couldn’t load this page");
        setCanvasLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canvasId, loadCanvas, canvasLoadAttempt]);

  const handleCanvasEditInteraction = useCallback(() => {
    setGradingAnnotations([]);
    setAiInjectedExchange(null);
    setCheckAnswerStatus(null);
    setGradingStatus("idle");
  }, []);

  useEffect(() => {
    setCheckAnswerStatus(null);
    setGradingStatus("idle");
    setAiInjectedExchange(null);
    setEditorMode("pen");
    setSelectedCanvasTextBoxId(null);
    setCanvasViewport({ pan: { x: 0, y: 0 }, scale: 1 });
    setPinnedSideObject(null);
    setQuestionSeedStatus("idle");
  }, [canvasId]);

  useEffect(() => {
    // Keep pinned src fresh if the object is upgraded while pinned.
    if (!pinnedSideObject) return;
    const match = canvasObjects.find((object) => object.id === pinnedSideObject.id);
    if (match?.pinnedToSide && match.src !== pinnedSideObject.src) {
      setPinnedSideObject({ ...match });
    }
  }, [canvasObjects, pinnedSideObject]);

  // Rehydrate side panel from persisted pinned objects after canvas load.
  useEffect(() => {
    if (canvasLoading) return;
    const pinned = canvasObjects.find((object) => object.pinnedToSide && object.src);
    setPinnedSideObject(pinned ?? null);
  }, [canvasId, canvasLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePinObjectToSide = useCallback((object: CanvasObject) => {
    if (!object.src) return;
    setPinnedSideObject({ ...object, pinnedToSide: true });
  }, []);

  const handleUnpinFromSide = useCallback(() => {
    if (!pinnedSideObject) return;
    const toRestore = { ...pinnedSideObject, pinnedToSide: false };
    setPinnedSideObject(null);
    restoreCanvasObjectRef.current?.(toRestore);
  }, [pinnedSideObject]);

  const pinnedSideImages = useMemo(() => {
    if (!pinnedSideObject?.src) return [];
    return [{ src: pinnedSideObject.src, alt: "Pinned attachment", key: pinnedSideObject.id }];
  }, [pinnedSideObject]);

  useEffect(() => () => {
    if (!canvasTextSaveTimerRef.current) return;
    clearTimeout(canvasTextSaveTimerRef.current);
    canvasTextSaveTimerRef.current = null;
    if (!canvasId) return;
    void saveCanvas(
      canvasId,
      canvasStrokesRef.current,
      [],
      canvasObjectsRef.current,
      canvasTextBoxesRef.current
    ).catch((error) => console.error("[whiteboard text] final save failed", error));
  }, [canvasId, saveCanvas]);

  const handleStrokesChange = useCallback(
    (strokes: CanvasStroke[]) => {
      if (!canvasId) return;
      // Ignore stale flushes from a previous question's canvas unmount.
      if (canvasId !== activeCanvasIdRef.current) return;
      setCanvasStrokes(strokes);
      void saveCanvas(
        canvasId,
        strokes,
        [],
        canvasObjectsRef.current,
        canvasTextBoxesRef.current
      ).catch((error) => console.error("[whiteboard] stroke save failed", error));
    },
    [canvasId, saveCanvas]
  );

  const handleObjectsChange = useCallback(
    (objects: CanvasObject[]) => {
      if (!canvasId) return;
      if (canvasId !== activeCanvasIdRef.current) return;
      setCanvasObjects(objects);
      void saveCanvas(
        canvasId,
        canvasStrokesRef.current,
        gradingAnnotationsRef.current,
        objects,
        canvasTextBoxesRef.current
      ).catch((error) => console.error("[whiteboard] object save failed", error));
    },
    [canvasId, saveCanvas]
  );

  const handleCanvasTextBoxesChange = useCallback((boxes: CanvasTextBox[]) => {
    if (!canvasId) return;
    if (canvasId !== activeCanvasIdRef.current) return;
    canvasTextBoxesRef.current = boxes;
    setCanvasTextBoxes(boxes);
    handleCanvasEditInteraction();
    if (canvasTextSaveTimerRef.current) clearTimeout(canvasTextSaveTimerRef.current);
    canvasTextSaveTimerRef.current = setTimeout(() => {
      canvasTextSaveTimerRef.current = null;
      if (canvasId !== activeCanvasIdRef.current) return;
      void saveCanvas(
        canvasId,
        canvasStrokesRef.current,
        [],
        canvasObjectsRef.current,
        boxes
      ).catch((error) => console.error("[whiteboard text] save failed", error));
    }, 450);
  }, [canvasId, handleCanvasEditInteraction, saveCanvas]);

  const handleCanvasViewportChange = useCallback(
    (viewport: { pan: { x: number; y: number }; scale: number }) => setCanvasViewport(viewport),
    []
  );

  const handleUploadImage = useCallback(
    (blob: Blob) => {
      if (!canvasId) return Promise.reject(new Error("No active canvas"));
      return uploadCanvasAsset(canvasId, blob);
    },
    [canvasId, uploadCanvasAsset]
  );

  const streamChatResponse = useCallback(
    async (
      messages: Array<{ role: string; content: unknown }>,
      opts?: { temperature?: number; top_p?: number; context?: string; usageId?: string }
    ): Promise<string> => {
      const res = await authenticatedAiFetch(
        METERED_CHAT_API_URL,
        {
          messages,
          context: opts?.context,
          temperature: opts?.temperature,
          top_p: opts?.top_p,
        },
        "grading",
        opts?.usageId
      );

      if (!res.ok) {
        throw await aiResponseError(res, "Failed to check answer");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payload) as {
              choices?: Array<{ delta?: { content?: string } }>;
              error?: { message?: string };
            };
            if (parsed.error?.message) throw new Error(parsed.error.message);
            const token = parsed.choices?.[0]?.delta?.content;
            if (token) fullText += token;
          } catch (err) {
            if (err instanceof SyntaxError) continue;
            throw err;
          }
        }
      }

      return fullText.trim();
    },
    []
  );

  const canCheckNow = gradingStatus === "idle" || gradingStatus === "done" || gradingStatus === "error";

  const injectGradingMessage = useCallback((result: Awaited<ReturnType<typeof runGrading>>) => {
    const hasMarks = result.pass2.totalAvailable > 0;

    if (hasMarks && result.pass2.isFullMarks) {
      setAiInjectedExchange({
        nonce: `${Date.now()}`,
        userMessage: "Check Answer",
        assistantMessage: `Well done - full marks! You scored ${result.pass2.totalAwarded}/${result.pass2.totalAvailable}.`,
      });
      return;
    }

    const partSummaries = buildPartSummary(result.pass2);
    const partBreakdown = partSummaries
      .map((p) => {
        if (!hasMarks) {
          if (p.summary === "correct") return "Looking good on this part.";
          return p.summary;
        }
        if (p.marksAwarded === p.marksAvailable) {
          return `${p.marksAwarded}/${p.marksAvailable} \u2014 well done.`;
        }
        return `${p.marksAwarded}/${p.marksAvailable} \u2014 ${p.summary}`;
      })
      .join("\n");

    if (!hasMarks) {
      const notes = partSummaries.filter((p) => p.summary !== "correct");
      const message = notes.length === 0
        ? "I've looked over your work — it's looking solid. I've left notes on the canvas where useful."
        : [
            "I've reviewed your work — here's what to focus on:",
            "",
            partBreakdown,
            "",
            "I've highlighted the key spots on your working.",
          ].join("\n");
      setAiInjectedExchange({
        nonce: `${Date.now()}`,
        userMessage: "Check Answer",
        assistantMessage: message,
      });
      return;
    }

    const scoreRatio = result.pass2.totalAwarded / result.pass2.totalAvailable;
    let openingEncouragement = "keep working at it, here is where things went wrong.";
    if (scoreRatio >= 0.7 && scoreRatio < 1) {
      openingEncouragement = "nearly there, here is what to work on.";
    } else if (scoreRatio >= 0.4 && scoreRatio < 0.7) {
      openingEncouragement = "close, just a couple of things to fix.";
    }

    const message = [
      `You scored ${result.pass2.totalAwarded}/${result.pass2.totalAvailable} \u2014 ${openingEncouragement}`,
      "",
      partBreakdown,
      "",
      "I've highlighted exactly where to look on your working.",
    ].join("\n");

    setAiInjectedExchange({
      nonce: `${Date.now()}`,
      userMessage: "Check Answer",
      assistantMessage: message,
    });
  }, []);

  const touchedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pageId || touchedRef.current === pageId) return;
    touchedRef.current = pageId;
    void touchPageOpened(pageId);
  }, [pageId, touchPageOpened]);

  const [questionSeedStatus, setQuestionSeedStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [questionSeedRetry, setQuestionSeedRetry] = useState(0);
  const [mediaReloadToken, setMediaReloadToken] = useState(0);
  const media = useAttachedQuestionMedia(currentAttachment, mediaReloadToken);
  const questionObjectId = currentAttachment ? questionAttachmentObjectId(currentAttachment.id) : null;
  const hasQuestionObjectOnCanvas = useCallback(
    () =>
      Boolean(
        questionObjectId && canvasObjectsRef.current.some((object) => object.id === questionObjectId)
      ),
    [questionObjectId]
  );
  const hasQuestionObject = Boolean(
    questionObjectId && canvasObjects.some((object) => object.id === questionObjectId)
  );

  // Place the chosen question as one continuous canvas attachment (like a manual attach).
  useEffect(() => {
    if (canvasLoading || canvasLoadError || page?.pageType === "document") {
      setQuestionSeedStatus("idle");
      return;
    }
    if (!currentAttachment) {
      setQuestionSeedStatus("idle");
      return;
    }

    const attachmentId = currentAttachment.id;
    const objectId = questionAttachmentObjectId(attachmentId);

    if (canvasObjectsRef.current.some((o) => o.id === objectId)) {
      pendingQuestionSeedsRef.current.delete(attachmentId);
      setQuestionSeedStatus("ready");
      return;
    }

    if (media.loading) {
      setQuestionSeedStatus("loading");
      return;
    }

    if (media.error && !hasQuestionObjectOnCanvas()) {
      setQuestionSeedStatus("error");
      return;
    }

    const urls = media.questionImages.map((img) => img.src).filter(Boolean);
    if (urls.length === 0) {
      if (hasQuestionObjectOnCanvas()) {
        setQuestionSeedStatus("ready");
        return;
      }
      setQuestionSeedStatus("error");
      return;
    }

    // Fresh / newly chosen questions are always seeded once per board.
    if (!pendingQuestionSeedsRef.current.has(attachmentId)) {
      // Canvas already had content without the question strip — don't force-insert.
      if (canvasObjectsRef.current.length > 0 || canvasStrokesRef.current.length > 0) {
        setQuestionSeedStatus("idle");
        return;
      }
      pendingQuestionSeedsRef.current.add(attachmentId);
    }

    if (seedingInFlightRef.current.has(attachmentId)) {
      setQuestionSeedStatus("loading");
      return;
    }

    const attach = attachQuestionImagesRef.current;
    if (!attach) {
      setQuestionSeedStatus("loading");
      return;
    }

    let cancelled = false;
    seedingInFlightRef.current.add(attachmentId);
    setQuestionSeedStatus("loading");

    void (async () => {
      let placed = false;
      try {
        // One quick retry for transient decode/network blips.
        placed = await attach(attachmentId, urls);
        if (!placed && !cancelled && !canvasObjectsRef.current.some((o) => o.id === objectId)) {
          await new Promise((r) => setTimeout(r, 250));
          if (!cancelled) placed = await attach(attachmentId, urls);
        }
      } finally {
        seedingInFlightRef.current.delete(attachmentId);
      }

      if (cancelled) {
        // Effect was interrupted — keep pending and nudge a follow-up attempt.
        setQuestionSeedRetry((n) => n + 1);
        return;
      }

      if (placed || canvasObjectsRef.current.some((o) => o.id === objectId)) {
        pendingQuestionSeedsRef.current.delete(attachmentId);
        setQuestionSeedStatus("ready");
        return;
      }

      // Give the canvas a moment to sync before treating placement as failed.
      await new Promise((r) => setTimeout(r, 400));
      if (cancelled) return;

      if (canvasObjectsRef.current.some((o) => o.id === objectId)) {
        pendingQuestionSeedsRef.current.delete(attachmentId);
        setQuestionSeedStatus("ready");
        return;
      }

      setQuestionSeedStatus("error");
    })();

    return () => {
      cancelled = true;
    };
  }, [
    canvasLoading,
    canvasLoadError,
    page?.pageType,
    currentAttachment,
    media.loading,
    media.error,
    media.questionImages,
    attachQuestionReady,
    questionSeedRetry,
    canvasObjects,
  ]);

  const retryQuestionLoad = useCallback(() => {
    if (!currentAttachment) return;
    invalidateAttachedQuestionMedia(currentAttachment.id);
    pendingQuestionSeedsRef.current.add(currentAttachment.id);
    setQuestionSeedStatus("loading");
    setMediaReloadToken((n) => n + 1);
    setQuestionSeedRetry((n) => n + 1);
  }, [currentAttachment]);

  const [questionLoadErrorVisible, setQuestionLoadErrorVisible] = useState(false);

  const showQuestionLoading =
    page?.pageType !== "document" &&
    Boolean(currentAttachment) &&
    !hasQuestionObject &&
    !hasQuestionObjectOnCanvas() &&
    !canvasLoading &&
    !canvasLoadError &&
    (questionSeedStatus === "loading" || media.loading);

  const showQuestionLoadErrorRaw =
    page?.pageType !== "document" &&
    Boolean(currentAttachment) &&
    !hasQuestionObject &&
    !hasQuestionObjectOnCanvas() &&
    !canvasLoading &&
    !canvasLoadError &&
    questionSeedStatus === "error" &&
    !media.loading;

  useEffect(() => {
    if (!showQuestionLoadErrorRaw) {
      setQuestionLoadErrorVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setQuestionLoadErrorVisible(true), 2500);
    return () => window.clearTimeout(timer);
  }, [showQuestionLoadErrorRaw, currentAttachment?.id]);

  const showQuestionLoadError = showQuestionLoadErrorRaw && questionLoadErrorVisible;
  const markingSchemeImages = useMemo(
    () => toImageQuestions(media.markingSchemeImages, "ms"),
    [media.markingSchemeImages]
  );

  const handleCheckAnswer = useCallback(async () => {
    if (!canCheckNow) return;
    if (canvasLoading || !canvasId) {
      setCheckAnswerStatus("Something went wrong - try again");
      setGradingStatus("error");
      return;
    }

    setCheckAnswerStatus(null);
    setGradingAnnotations([]);

    try {
      const capture = getGradingCapture("default");
      const fullInkCapture = getGradingCapture("full-ink");
      if (!capture) {
        throw new BlankCanvasError();
      }

      const questionImages = media.questionImages.map((img) => img.src).filter(Boolean).slice(0, 4);
      const schemeImages = media.markingSchemeImages.map((img) => img.src).filter(Boolean).slice(0, 4);
      const hasScheme = schemeImages.length > 0;
      const isCustom = currentAttachment?.source === "custom";
      const adaptiveMarking = !hasScheme || isCustom;

      const questionText = currentAttachment
        ? [
            currentAttachment.label || "Question",
            currentAttachment.source === "custom"
              ? "This is a custom / student-uploaded question. Infer what is being asked from the question images when provided."
              : "",
            !hasScheme
              ? "No official marking scheme is attached — give helpful feedback and only award marks if clearly suited."
              : "",
          ]
            .filter(Boolean)
            .join("\n")
        : [
            "Open whiteboard practice — no specific question is attached.",
            "Review whatever the student has written and give helpful, encouraging feedback.",
            "Only award marks if the work clearly follows a standard exam-style question with an obvious mark allocation.",
          ].join("\n");

      const markingSchemeText = hasScheme
        ? `Marking scheme images for: ${currentAttachment?.label ?? "question"}`
        : "";

      const result = await runGrading({
        usageId: createAiUsageId("grading"),
        questionId: canvasId,
        questionText,
        markingSchemeText,
        markingSchemeImages: schemeImages,
        questionImages,
        adaptiveMarking,
        capture,
        fullInkCapture: fullInkCapture ?? undefined,
        getAggressiveCapture: () => getGradingCapture("retry-aggressive"),
        streamChatResponse,
        pass1Cache,
        setPass1Cache,
        onStatus: setGradingStatus,
      });

      setGradingAnnotations(result.annotations);
      await saveCanvas(
        canvasId,
        canvasStrokesRef.current,
        result.annotations,
        canvasObjectsRef.current,
        canvasTextBoxesRef.current
      );
      injectGradingMessage(result);
      setSessionSidebarOpen(true);
      setSidebarOpenPanel("ai");
      setCheckAnswerStatus(null);
    } catch (err) {
      setGradingStatus("error");
      if (err instanceof BlankCanvasError) {
        setCheckAnswerStatus("Your canvas looks empty - write your workings and try again.");
      } else if (err instanceof AiRequestError && err.code === "AI_QUOTA_EXCEEDED") {
        setCheckAnswerStatus(err.message);
      } else {
        setCheckAnswerStatus("Something went wrong - try again");
      }
      console.error("[whiteboard grading] failed", err);
    }
  }, [
    canCheckNow,
    canvasLoading,
    canvasId,
    getGradingCapture,
    media.questionImages,
    media.markingSchemeImages,
    currentAttachment,
    streamChatResponse,
    pass1Cache,
    saveCanvas,
    injectGradingMessage,
  ]);

  const pickerItems = useMemo(
    () => attachments.map((a) => ({ id: a.id, label: a.label })),
    [attachments]
  );
  const centerTitleRowRef = useRef<HTMLDivElement>(null);

  const [editingPage, setEditingPage] = useState<WhiteboardPage | null>(null);
  const [creatingPage, setCreatingPage] = useState(false);
  const [editingFolder, setEditingFolder] = useState<WhiteboardFolder | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [questionModalMode, setQuestionModalMode] = useState<"add" | "attach" | null>(null);

  const handleAddAttachments = useCallback(
    async (added: AttachedQuestion[]) => {
      if (!page) return;
      for (const attachment of added) {
        pendingQuestionSeedsRef.current.add(attachment.id);
      }
      await updatePage(page.id, { attachedQuestions: [...page.attachedQuestions, ...added] });
      setAttachmentIndex(page.attachedQuestions.length);
      if (page.pageType === "document") setPaperPanelVisible(true);
    },
    [page, updatePage]
  );

  const handleAttachQuestionImages = useCallback(async (selected: AttachedQuestion[]) => {
    const attach = attachQuestionImagesRef.current;
    if (!attach) throw new Error("The canvas is not ready for attachments yet.");

    for (const attachment of selected) {
      const imageUrls = await resolveAttachedQuestionImageUrls(attachment);
      const placed = await attach(attachment.id, imageUrls);
      if (!placed) throw new Error("The question image could not be placed on the canvas.");
    }
  }, []);

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
          pendingQuestionSeedsRef.current.add(attachmentId);
          if (target.pageType === "document") setPaperPanelVisible(true);
        }
        return;
      }
      navigate(`/whiteboards/page/${target.id}?q=${encodeURIComponent(attachmentId)}`);
    },
    [pageId, attachments, navigate]
  );

  const sidebarQuestion = useMemo(() => {
    if (!page) return undefined;
    const rawSubject = page.subject;
    const subjectId = getPracticeSubjectId(rawSubject);
    const subjectLabel = getSubjectLabel(rawSubject);

    if (!currentAttachment) {
      return {
        id: `whiteboard_${page.id}`,
        properties: { name: page.name },
        questionName: page.name,
        subject: subjectId,
        _discoverId: `whiteboard_${page.id}`,
        _discoverName: page.name,
        _discoverSubjectId: subjectId,
        _discoverSubjectLabel: subjectLabel,
        _discoverSource: "whiteboard",
      };
    }

    const bank = currentAttachment.bank;
    const attachmentSubject = bank?.subject ?? page.subject;
    const attachmentSubjectId = getPracticeSubjectId(attachmentSubject);
    const attachmentSubjectLabel = getSubjectLabel(attachmentSubject);
    const discoverId = bank?.kind === "paper" && bank.paperId && bank.questionId
      ? `${bank.paperId}_${bank.questionId}`
      : bank?.kind === "image" && bank.groupKey
        ? `image_${attachmentSubject}_${bank.level}_${bank.topic ?? "topic"}_${bank.groupKey}`
        : `whiteboard_${page.id}_${currentAttachment.id}`;
    const practiceUrl = bank?.kind === "paper" && bank.paperId && bank.questionId
      ? `/practice/session?${new URLSearchParams({
          mode: "pastpaper",
          subject: attachmentSubjectId,
          level: bank.level,
          paperId: bank.paperId,
          questionId: bank.questionId,
        }).toString()}`
      : bank?.kind === "image" && bank.groupKey && bank.topic
        ? `/practice?${new URLSearchParams({
            subject: attachmentSubjectId,
            level: bank.level,
            browse: "topic",
            topic: bank.topic,
            question: bank.groupKey,
          }).toString()}`
        : undefined;
    return {
      id: discoverId,
      properties: { name: currentAttachment.label },
      imageUrls: media.questionImages.map((img) => img.src),
      _paperThread: bank?.kind === "paper",
      paperId: bank?.paperId,
      paperQuestionId: bank?.questionId,
      paperLabel: currentAttachment.label,
      questionName: currentAttachment.label,
      subject: attachmentSubjectId,
      level: bank?.level,
      storagePath: bank?.paperStoragePath,
      pageRange: bank?.pageRange,
      pageRegions: bank?.pageRegions,
      _discoverId: discoverId,
      _discoverName: currentAttachment.label,
      _discoverSubjectId: attachmentSubjectId,
      _discoverSubjectLabel: attachmentSubjectLabel,
      _discoverLevel: bank?.level,
      _discoverTopic: bank?.topic,
      _discoverSource: "whiteboard",
      _practiceUrl: practiceUrl,
    };
  }, [currentAttachment, page, media.questionImages]);

  const snippetWidth = Math.min(400, Math.floor(typeof window !== "undefined" ? window.innerWidth * 0.3 : 360));

  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const [chromeCenterX, setChromeCenterX] = useState<number | null>(null);
  const [, setToolbarFollowX] = useState<number | null>(null);
  /** Only animate left for discrete inset changes (session/paper), not folders width resize. */
  const [chromeLeftAnimated, setChromeLeftAnimated] = useState(false);
  const chromeInsetKeyRef = useRef("");
  const chromeAnimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDocumentPage = page?.pageType === "document";
  const documentSideImages = isDocumentPage
    ? media.questionImages.map((image) => ({ src: image.src, alt: image.alt, key: image.key }))
    : [];
  const sidePanelImages = isDocumentPage ? documentSideImages : pinnedSideImages;
  // Documents: show the panel whenever a question is attached (even while images load).
  const documentHasQuestion = isDocumentPage && Boolean(currentAttachment);
  const hasSideQuestionPanel = isDocumentPage
    ? documentHasQuestion && paperPanelVisible
    : Boolean(pinnedSideObject && sidePanelImages.length > 0);
  // Documents ignore the side question for chrome centering — overlap is intentional.
  const chromeInsetKey = `${sessionSidebarOpen}|${options.leftHandMode}`;

  useLayoutEffect(() => {
    if (!isDocumentPage) {
      setChromeCenterX(null);
      setChromeLeftAnimated(false);
      chromeInsetKeyRef.current = "";
      return;
    }
    const el = canvasAreaRef.current;
    if (!el) return;

    const insetsChanged =
      chromeInsetKeyRef.current !== "" && chromeInsetKeyRef.current !== chromeInsetKey;
    chromeInsetKeyRef.current = chromeInsetKey;
    if (insetsChanged) {
      setChromeLeftAnimated(true);
      if (chromeAnimTimerRef.current) clearTimeout(chromeAnimTimerRef.current);
      chromeAnimTimerRef.current = setTimeout(() => {
        setChromeLeftAnimated(false);
        chromeAnimTimerRef.current = null;
      }, 320);
    }

    let frame = 0;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0) return;
        const isXl = window.matchMedia("(min-width: 1280px)").matches;
        let leftInset = 0;
        let rightInset = 0;
        if (isXl && sessionSidebarOpen) {
          const sidebarInset = rect.width * 0.35;
          if (options.leftHandMode) leftInset += sidebarInset;
          else rightInset += sidebarInset;
        }
        const visibleWidth = Math.max(0, rect.width - leftInset - rightInset);
        setChromeCenterX(rect.left + leftInset + visibleWidth / 2);
      });
    };
    update();
    window.addEventListener("resize", update);
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    resizeObserver?.observe(el);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      resizeObserver?.disconnect();
      if (chromeAnimTimerRef.current) {
        clearTimeout(chromeAnimTimerRef.current);
        chromeAnimTimerRef.current = null;
      }
    };
  }, [
    isDocumentPage,
    chromeInsetKey,
    sessionSidebarOpen,
    foldersSidebarOpen,
    options.leftHandMode,
    pageId,
    canvasLoading,
  ]);

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

  const activeToolbarPage = page?.id === pageId && !canvasLoading && !canvasLoadError ? page : null;
  const pageToolbarExtras = activeToolbarPage ? (
    <>
      <span className="mx-1 h-6 w-px shrink-0 color-bg-grey-10" aria-hidden />
      <div className="relative">
        <button
          type="button"
          aria-label="Check Answer"
          className="flex h-[30px] items-center gap-1.5 rounded-in px-2 text-sm font-semibold color-txt-main hover:color-bg-grey-10 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => {
            if (isDocumentPage) {
              setDocumentChecking(true);
              void documentCheckAnswerRef.current?.()
                .catch(() => undefined)
                .finally(() => setDocumentChecking(false));
              return;
            }
            void handleCheckAnswer();
          }}
          disabled={isDocumentPage ? documentChecking : !canCheckNow}
          title="Check Answer with AI"
        >
          <LuCircleCheck size={16} strokeWidth={2} />
          <span>
            {isDocumentPage
              ? (documentChecking ? "Checking…" : "Check Answer")
              : (!canCheckNow ? gradingStatusLabel(gradingStatus) : "Check Answer")}
          </span>
        </button>
        {!isDocumentPage && checkAnswerStatus && (
          <div className="absolute left-1/2 top-full z-20 mt-2 flex max-w-[280px] -translate-x-1/2 items-center gap-2 rounded-md bg-[var(--grey-5)]/90 px-2 py-1 text-xs color-txt-sub">
            <span>{checkAnswerStatus}</span>
            {gradingStatus === "error" && (
              <button
                type="button"
                onClick={() => void handleCheckAnswer()}
                className="text-[11px] font-semibold color-txt-accent hover:opacity-80"
              >
                Retry
              </button>
            )}
          </div>
        )}
      </div>
      {markingSchemeImages.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setSessionSidebarOpen(true);
            setSidebarOpenPanel("markingscheme");
          }}
          className="flex h-[30px] items-center gap-1.5 rounded-in px-2 text-sm font-semibold color-txt-main hover:color-bg-grey-10"
          aria-label="Reveal marking scheme"
          title="Reveal marking scheme"
        >
          <LuClipboardList size={16} strokeWidth={2} />
          <span>Marking scheme</span>
        </button>
      )}
    </>
  ) : null;


  return (
    <div className="flex min-h-0 h-full w-full">
      <div
        className={`flex h-full min-h-0 shrink-0 transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          !foldersSidebarOpen ? "w-0 overflow-hidden" : "w-64"
        }`}
        aria-hidden={!foldersSidebarOpen}
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
        <div className="relative z-40 flex h-10 shrink-0 items-center gap-1 px-2 color-bg">
          <button
            type="button"
            className="shrink-0 rounded-lg p-2 color-txt-sub hover:color-bg-grey-5 transition-colors cursor-pointer"
            onClick={() => setFoldersSidebarOpen((open) => !open)}
            aria-label={foldersSidebarOpen ? "Collapse navigation" : "Open navigation"}
            title={foldersSidebarOpen ? "Collapse navigation" : "Open navigation"}
          >
            {foldersSidebarOpen ? (
              <LuPanelLeftClose size={16} />
            ) : (
              <LuPanelLeftOpen size={16} />
            )}
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
            <div
              ref={centerTitleRowRef}
              className="absolute left-1/2 top-1/2 z-10 flex w-[min(45%,360px)] min-w-0 -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-0.5"
            >
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
                  const next = attachments[index];
                  if (next) pendingQuestionSeedsRef.current.add(next.id);
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
              onClick={() => setQuestionModalMode("add")}
            >
              <LuPlus size={13} strokeWidth={2.5} />
              Add question
            </button>
          </div>
        </div>

        {/* ---- Canvas (full bleed, same as practice) ---- */}
        <div ref={canvasAreaRef} data-wb-canvas-area className="relative min-h-0 flex-1 overflow-hidden">
          {page && page.id === pageId && page.pageType === "document" && !canvasLoading && !canvasLoadError ? (
            <DocumentEditor
              key={page.id}
              page={page}
              canvasStrokes={canvasStrokes}
              canvasObjects={canvasObjects}
              onStrokesChange={handleStrokesChange}
              onObjectsChange={handleObjectsChange}
              onUploadImage={handleUploadImage}
              registerDrawingSnapshot={registerDrawingSnapshot}
              registerGetGradingCapture={registerGetGradingCapture}
              registerGetDocumentText={registerGetDocumentText}
              registerCheckAnswer={registerDocumentCheckAnswer}
              onTouch={() => updatePage(page.id, {})}
              toolbarCenterX={chromeCenterX}
              toolbarCenterAnimated={chromeLeftAnimated}
              onToolbarCenterChange={setToolbarFollowX}
              toolbarExtras={pageToolbarExtras}
              viewportClassName={
                sessionSidebarOpen
                  ? options.leftHandMode
                    ? "xl:pl-[35%]"
                    : "xl:pr-[35%]"
                  : ""
              }
            />
          ) : page?.id === pageId && !canvasLoading && !canvasLoadError ? (
            <div className="absolute inset-0 z-0 color-bg">
              <DrawingCanvas
                key={canvasId ?? "no-page"}
                initialStrokes={canvasStrokes}
                onStrokesChange={handleStrokesChange}
                onEditInteraction={handleCanvasEditInteraction}
                registerDrawingSnapshot={registerDrawingSnapshot}
                registerGetGradingCapture={registerGetGradingCapture}
                gradingAnnotations={gradingAnnotations}
                enableAttachments
                registerAttachQuestionImages={registerAttachQuestionImages}
                registerRestoreCanvasObject={registerRestoreCanvasObject}
                onPinObjectToSide={handlePinObjectToSide}
                onAttachQuestions={() => setQuestionModalMode("attach")}
                initialObjects={canvasObjects}
                captureTextBoxes={canvasTextBoxes}
                onSelectTextBox={setSelectedCanvasTextBoxId}
                onObjectsChange={handleObjectsChange}
                onUploadImage={handleUploadImage}
                onToolbarCenterChange={setToolbarFollowX}
                toolbarPlacement="top"
                toolbarExtras={pageToolbarExtras}
                wrapperClassName={`bg-transparent ${editorMode === "pen" || selectActive ? "z-20" : "z-10"}`}
                readOnly={editorMode === "text" && !selectActive}
                editorMode={editorMode}
                onToolChange={setCanvasTool}
                onRequestTextMode={() => {
                  setSelectedCanvasTextBoxId(null);
                  setEditorMode("text");
                }}
                onRequestPenMode={() => {
                  setSelectedCanvasTextBoxId(null);
                  setEditorMode("pen");
                }}
                textFormat={{
                  bold: canvasTextFormat.bold,
                  italic: canvasTextFormat.italic,
                  bullet: canvasTextFormat.bullet,
                  fontSize: (canvasTextBoxes.find((box) => box.id === selectedCanvasTextBoxId) ?? canvasTextDefaults).fontSize,
                  fontSizeOptions: [
                    { value: 14, label: "14" },
                    { value: 16, label: "16" },
                    { value: 18, label: "18" },
                    { value: 22, label: "22" },
                    { value: 28, label: "28" },
                    { value: 36, label: "36" },
                    { value: 48, label: "48" },
                  ],
                  onToggleBold: () => {
                    document.execCommand("bold");
                    setCanvasTextFormat({
                      bold: document.queryCommandState("bold"),
                      italic: document.queryCommandState("italic"),
                      bullet: document.queryCommandState("insertUnorderedList"),
                    });
                    const active = document.activeElement;
                    if (active instanceof HTMLElement && active.isContentEditable) {
                      active.dispatchEvent(new Event("input", { bubbles: true }));
                    }
                  },
                  onToggleItalic: () => {
                    document.execCommand("italic");
                    setCanvasTextFormat({
                      bold: document.queryCommandState("bold"),
                      italic: document.queryCommandState("italic"),
                      bullet: document.queryCommandState("insertUnorderedList"),
                    });
                    const active = document.activeElement;
                    if (active instanceof HTMLElement && active.isContentEditable) {
                      active.dispatchEvent(new Event("input", { bubbles: true }));
                    }
                  },
                  onToggleBullet: () => {
                    document.execCommand("insertUnorderedList");
                    setCanvasTextFormat({
                      bold: document.queryCommandState("bold"),
                      italic: document.queryCommandState("italic"),
                      bullet: document.queryCommandState("insertUnorderedList"),
                    });
                    const active = document.activeElement;
                    if (active instanceof HTMLElement && active.isContentEditable) {
                      active.dispatchEvent(new Event("input", { bubbles: true }));
                    }
                  },
                  onFontSizeChange: (value) => {
                    const fontSize = typeof value === "number" ? value : Number(value);
                    if (!Number.isFinite(fontSize)) return;
                    setCanvasTextDefaults((current) => ({ ...current, fontSize }));
                    if (!selectedCanvasTextBoxId) return;
                    handleCanvasTextBoxesChange(
                      canvasTextBoxesRef.current.map((box) =>
                        box.id === selectedCanvasTextBoxId ? { ...box, fontSize } : box
                      )
                    );
                  },
                  onColorChange: (colorIndex) => {
                    setCanvasTextDefaults((current) => ({ ...current, colorIndex }));
                    applyThemeTextColor(colorIndex);
                    if (selectedCanvasTextBoxId) {
                      handleCanvasTextBoxesChange(
                        canvasTextBoxesRef.current.map((box) =>
                          box.id === selectedCanvasTextBoxId ? { ...box, colorIndex } : box
                        )
                      );
                    }
                    const active = document.activeElement;
                    if (active instanceof HTMLElement && active.isContentEditable) {
                      active.dispatchEvent(new Event("input", { bubbles: true }));
                    }
                  },
                  onUndo: () => {
                    const active = document.activeElement;
                    if (active instanceof HTMLElement && active.isContentEditable) document.execCommand("undo");
                  },
                  onRedo: () => {
                    const active = document.activeElement;
                    if (active instanceof HTMLElement && active.isContentEditable) document.execCommand("redo");
                  },
                }}
                onViewportChange={handleCanvasViewportChange}
              />
              <div className={`pointer-events-none absolute inset-0 ${textEditing || selectActive ? "z-20" : "z-10"}`}>
                <CanvasTextBoxLayer
                  boxes={canvasTextBoxes}
                  pan={canvasViewport.pan}
                  scale={canvasViewport.scale}
                  editing={textEditing}
                  selectable={selectActive || editorMode === "text"}
                  selectedId={selectedCanvasTextBoxId}
                  onSelectedIdChange={setSelectedCanvasTextBoxId}
                  onCreateChange={handleCanvasTextBoxesChange}
                  defaults={canvasTextDefaults}
                  onFormatStateChange={setCanvasTextFormat}
                />
              </div>
            </div>
          ) : null}
          {canvasLoading && (
            <div className="absolute inset-0 z-0 flex items-center justify-center">
              <LuLoaderCircle size={22} className="animate-spin color-txt-sub" />
            </div>
          )}
          {!canvasLoading && showQuestionLoading && (
            <div className="absolute inset-0 z-[5] flex items-center justify-center pointer-events-none">
              <LuLoaderCircle size={22} className="animate-spin color-txt-accent" aria-label="Loading question" />
            </div>
          )}
          {!canvasLoading && showQuestionLoadError && (
            <div className="absolute inset-0 z-[5] flex items-center justify-center pointer-events-none">
              <div className="pointer-events-auto flex flex-col items-center gap-3 rounded-2xl color-bg color-shadow border px-5 py-4"
                style={{ borderColor: "color-mix(in srgb, currentColor 14%, transparent)" }}
              >
                <p className="text-sm font-semibold color-txt-main">Couldn't load this question</p>
                <p className="max-w-[240px] text-center text-xs color-txt-sub">
                  {media.error || "Something went wrong placing it on the board."}
                </p>
                <button
                  type="button"
                  onClick={retryQuestionLoad}
                  className="rounded-lg color-bg-accent color-txt-accent px-3 py-2 text-xs font-semibold hover:opacity-90"
                >
                  Retry
                </button>
              </div>
            </div>
          )}
          {!canvasLoading && canvasLoadError && (
            <div className="absolute inset-0 z-0 flex flex-col items-center justify-center gap-3 color-bg-grey-5 px-4 text-center">
              <p className="text-sm font-semibold color-txt-main">This page couldn’t be loaded safely.</p>
              <p className="max-w-sm text-xs color-txt-sub">Your saved content has not been changed. Check your connection and retry.</p>
              <button
                type="button"
                className="rounded-lg color-bg-accent color-txt-accent px-3 py-2 text-xs font-semibold hover:opacity-90"
                onClick={() => setCanvasLoadAttempt((attempt) => attempt + 1)}
              >
                Retry
              </button>
            </div>
          )}

          {/* Pinned attachment — side paper panel */}
          <div
            className={`absolute bottom-0 flex pointer-events-none ${
              isDocumentPage ? "top-0 z-50" : "top-0 z-10"
            } ${options.leftHandMode ? "right-0 justify-end" : "left-0 justify-start"}`}
          >
            {isDocumentPage && documentHasQuestion && (
              <DocumentPaperEye
                visible={paperPanelVisible}
                onToggle={() => setPaperPanelVisible((v) => !v)}
                leftHandMode={options.leftHandMode}
              />
            )}
            <AnimatePresence initial={false} mode="popLayout">
              {hasSideQuestionPanel ? (
                <motion.div
                  key={isDocumentPage ? `document-question-${currentAttachment?.id ?? "none"}` : "pinned-side-panel"}
                  initial={{ opacity: 0, x: options.leftHandMode ? 16 : -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: options.leftHandMode ? 16 : -16 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className={`relative flex h-full max-h-full min-h-0 w-full max-w-sm shrink-0 flex-col pointer-events-none ${
                    options.leftHandMode ? "ml-auto" : ""
                  }`}
                >
                  <div className="min-h-0 min-w-0 h-full flex flex-col pl-2 pr-1 overflow-hidden pointer-events-none">
                    <div className={`flex-1 min-h-0 relative pointer-events-none ${isDocumentPage ? "pt-12" : "pt-4"}`}>
                      <div className="flex flex-col overflow-y-auto overflow-x-hidden scrollbar-hide h-full py-2 pb-8 items-center pointer-events-auto">
                        {isDocumentPage && media.loading && sidePanelImages.length === 0 && (
                          <div className="flex h-40 w-full items-center justify-center" style={{ maxWidth: snippetWidth }}>
                            <LuLoaderCircle size={20} className="animate-spin color-txt-sub" />
                          </div>
                        )}
                        {currentAttachment &&
                          (isDocumentPage || pinnedSideObject?.id === questionAttachmentObjectId(currentAttachment.id)) &&
                          !media.loading &&
                          !media.error &&
                          media.audioPath && (
                          <div className="w-full mb-3" style={{ maxWidth: snippetWidth }}>
                            <QuestionAudioPlayer
                              audioPath={media.audioPath}
                              startSec={media.audioStartSec}
                              startLabel={media.audioStartLabel ?? undefined}
                              className="w-full"
                              autoLoad={false}
                            />
                          </div>
                        )}
                        <div
                          className="flex flex-col items-center w-full gap-2"
                          style={{ maxWidth: snippetWidth }}
                        >
                          {!isDocumentPage && (
                            <button
                              type="button"
                              onClick={handleUnpinFromSide}
                              className="self-start flex items-center gap-1 rounded-md color-bg color-txt-main color-shadow border px-2 py-1 hover:color-bg-grey-10 transition-colors"
                              style={{
                                borderColor: "color-mix(in srgb, currentColor 18%, transparent)",
                              }}
                              aria-label="Unpin from side"
                              title="Unpin from side"
                            >
                              <LuPin size={12} strokeWidth={2} />
                              <span className="text-[10px] font-semibold leading-none">Unpin</span>
                            </button>
                          )}
                          {sidePanelImages.length > 0 && (
                            <ZoomableQuestionImage
                              images={sidePanelImages}
                              className="w-full h-auto"
                              roundStack
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          {/* Practice-style collapsible sidebar (AI / threads / timer / marking scheme) */}
          <div
            className={`ai-session-sidebar absolute bottom-0 top-10 z-20 overflow-hidden pointer-events-none ${
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
              getWorkspaceText={getWorkspaceText}
              open={sessionSidebarOpen}
              onOpenChange={setSessionSidebarOpen}
              openPanel={sidebarOpenPanel ?? undefined}
              forceShowMarkingSchemeTab={attachments.length > 0}
              onOpenPanelChange={(panel) => setSidebarOpenPanel(panel ?? null)}
              markingSchemeImages={markingSchemeImages}
              markingSchemeLoading={media.loading}
              markingSchemeQuestionName={currentAttachment?.label}
              aiInjectedExchange={aiInjectedExchange}
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
          initial={editingPage}
          onSave={(result) => updatePage(editingPage.id, result)}
          onDelete={async (target) => {
            await deletePage(target);
            if (target.id === pageId) navigate("/whiteboards");
          }}
          onClose={() => setEditingPage(null)}
        />
      )}

      {creatingPage && sidebarSubject && (
        <PageDetailsModal
          subject={sidebarSubject}
          onSave={async (result) => {
            const created = await createPage({ ...result, subject: sidebarSubject });
            navigate(`/whiteboards/page/${created.id}`);
          }}
          onBlankCanvas={async (result) => {
            const created = await createPage({ ...result, subject: sidebarSubject });
            navigate(`/whiteboards/page/${created.id}`);
          }}
          onClose={() => setCreatingPage(false)}
        />
      )}

      {editingFolder && (
        <FolderModal
          initial={editingFolder}
          onSave={(result) => updateFolder(editingFolder.id, result)}
          onDelete={(folder) => deleteFolder(folder)}
          onClose={() => setEditingFolder(null)}
        />
      )}

      {creatingFolder && sidebarSubject && (
        <FolderModal
          onSave={(result) => {
            void createFolder({ ...result, subject: sidebarSubject });
          }}
          onClose={() => setCreatingFolder(false)}
        />
      )}

      {questionModalMode && page && (
        <AddQuestionModal
          subject={page.subject}
          mode={questionModalMode}
          onAdd={questionModalMode === "attach" ? handleAttachQuestionImages : handleAddAttachments}
          onClose={() => setQuestionModalMode(null)}
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
