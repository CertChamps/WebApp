import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  LuArrowLeft,
  LuChevronLeft,
  LuChevronRight,
  LuClipboardList,
  LuEye,
  LuEyeOff,
  LuFileText,
  LuLoaderCircle,
  LuPencil,
  LuPlus,
} from "react-icons/lu";
import DrawingCanvas, {
  type RegisterDrawingSnapshot,
} from "../components/questions/DrawingCanvas";
import QuestionTitlePicker from "../components/questions/QuestionTitlePicker";
import ZoomableQuestionImage from "../components/questions/ZoomableQuestionImage";
import WhiteboardsSidebar from "../components/whiteboards/WhiteboardsSidebar";
import PageDetailsModal from "../components/whiteboards/PageDetailsModal";
import FolderModal from "../components/whiteboards/FolderModal";
import AddQuestionModal from "../components/whiteboards/AddQuestionModal";
import { CollapsibleSidebar } from "../components/sidebar/CollapsibleSidebar";
import type { SidebarPanelId } from "../components/sidebar/SidebarTileManager";
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
      <WhiteboardPageViewInner />
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
    tree,
    loading: treeLoading,
    createPage,
    updatePage,
    deletePage,
    touchPageOpened,
    createFolder,
    updateFolder,
    deleteFolder,
  } = useWhiteboards(sidebarSubject);

  const { saveCanvas, loadCanvas } = useCanvasStorage();
  const canvasId = pageId ? whiteboardCanvasId(pageId) : null;
  const [canvasStrokes, setCanvasStrokes] = useState<CanvasStroke[]>([]);
  const [canvasLoading, setCanvasLoading] = useState(true);
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
        setCanvasLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setCanvasStrokes([]);
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
      saveCanvas(canvasId, strokes, null);
    },
    [canvasId, saveCanvas]
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
    <div className="flex h-full w-full flex-1 min-w-0 overflow-hidden color-bg">
      <WhiteboardsSidebar
        subject={sidebarSubject}
        onSubjectChange={setSidebarSubject}
        tree={tree}
        folders={folders}
        loading={treeLoading}
        currentPageId={pageId ?? null}
        onOpenPage={openPage}
        onOpenQuestion={openQuestion}
        onEditPage={(target) => setEditingPage(target)}
        onEditFolder={(folder) => setEditingFolder(folder)}
        onCreatePage={() => setCreatingPage(true)}
        onCreateFolder={() => setCreatingFolder(true)}
        onHome={() => navigate("/whiteboards")}
        onMovePage={(pageIdToMove, folderId) => void updatePage(pageIdToMove, { folderId })}
        onMoveFolder={(folderId, parentId) => void updateFolder(folderId, { parentId })}
      />

      <div className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
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

          <div className={`flex items-center gap-1 ${attachments.length > 0 ? "" : "ml-auto"}`}>
            <button
              type="button"
              className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold color-txt-main color-bg-grey-5 hover:color-bg-grey-10 transition-colors cursor-pointer"
              onClick={() => setShowAddQuestion(true)}
            >
              <LuPlus size={13} strokeWidth={2.5} />
              Add question
            </button>
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
                            <ZoomableQuestionImage images={media.questionImages} className="w-full h-auto" />
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
    </div>
  );
}
