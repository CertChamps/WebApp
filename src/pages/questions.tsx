// Hooks
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import useQuestions from "../hooks/useQuestions";
import { OptionsContext } from "../context/OptionsContext";
import { UserContext } from "../context/UserContext";
import {
    useExamPapers,
    isPaperFree,
    normalizePaperLevel,
    type ExamPaper,
    type PaperQuestion,
} from "../hooks/useExamPapers";
import { usePaperSnapshot } from "../hooks/usePaperSnapshot";
import { usePaperProgress } from "../hooks/usePaperProgress";
import useFilters from "../hooks/useFilters";
import { getPastPaperTopicScope } from "../data/mathsHigherTopics";
import { useQuestionSessionLog, type QuestionMeta } from "../hooks/useQuestionSessionLog";
import {
  useImageQuestionsForTopic,
  useAllTopicsForSubjectLevel,
  type GroupedImageQuestion,
  type ImageTopic,
} from "../hooks/useImageQuestions";

// Components
import { createPortal } from "react-dom";
import { LuMaximize2, LuMinimize2, LuX, LuClipboardList, LuBookOpen, LuCalculator, LuChevronLeft, LuChevronRight, LuChevronDown, LuFilter, LuSearch, LuCircleCheck, LuCircle } from "react-icons/lu";
import { TbDice5 } from "react-icons/tb";
import QuestionsTopBar from "../components/questions/QuestionsTopBar";
import QSearch from "../components/questions/qSearch";
import DrawingCanvas, { type RegisterDrawingSnapshot, type RegisterGetGradingCapture, type RegisterGetStaveAnalysis } from "../components/questions/DrawingCanvas";
import { useCanvasStorage } from "../hooks/useCanvasStorage";
import RenderMath from "../components/math/mathdisplay";
import { AnimatePresence, motion } from "framer-motion";
import PaperPdfPlaceholder, { getQuestionScrollOffset } from "../components/questions/PaperPdfPlaceholder";
import PaperQuestionRegionPanel from "../components/questions/PaperQuestionRegionPanel";
import CroppedPdfRegions from "../components/questions/CroppedPdfRegions";
import FloatingLogTables from "../components/FloatingLogTables";
import FloatingCalculator from "../components/calculator/FloatingCalculator";
import { CollapsibleSidebar } from "../components/sidebar/CollapsibleSidebar";
import { TimerProvider } from "../context/TimerContext";
import { TimerFloatingWidget } from "../components/TimerFloatingWidget";
import PastPaperFilterPanel from "../components/questions/PastPaperFilterPanel";
import PaperProGate from "../components/PaperProGate";
import Filter from "../components/filter";
import { getDocumentCached } from "../utils/pdfDocumentCache";
import type { InjectedExchange } from "../components/ai/useAI";
import { runGrading } from "../lib/grading/GradingEngine";
import type { CanvasAnnotation, CanvasCapturePayload, GradingStatus, Pass1Result } from "../lib/grading/GradingTypes";
import { buildPartSummary } from "../lib/grading/annotationBuilder";
import { BlankCanvasError } from "../lib/grading/canvasCapture";

// Style Imports
import "../styles/questions.css";
import "../styles/navbar.css";
import "../styles/sidebar.css";

const QUESTIONS_MODE_KEY = "questions-page-mode";
const CHAT_API_URL = "https://us-central1-certchamps-a7527.cloudfunctions.net/chat";

function isSavedGradingAnnotations(value: unknown): value is CanvasAnnotation[] {
    if (!Array.isArray(value)) return false;
    return value.every((item) => {
        if (!item || typeof item !== "object") return false;
        const record = item as Record<string, unknown>;
        if (record.type === "errorComment") {
            return typeof record.id === "string" && typeof record.worldX === "number" && typeof record.worldY === "number" && typeof record.text === "string";
        }
        if (record.type === "markAnnotation") {
            return typeof record.worldX === "number" && typeof record.worldY === "number" && typeof record.label === "string";
        }
        if (record.type === "handCircle") {
            return typeof record.worldX === "number" && typeof record.worldY === "number" && typeof record.width === "number" && typeof record.height === "number";
        }
        return false;
    });
}

function gradingStatusLabel(status: GradingStatus): string {
    switch (status) {
        case "capturing":
        case "reading":
            return "Reading your workings...";
        case "marking": return "Marking...";
        case "rendering": return "Check my answer";
        case "done": return "Done";
        case "error": return "Try again";
        default: return "Check my answer";
    }
}

export type QuestionsMode = "certchamps" | "pastpaper" | "imagequestions";

const MODE_TO_PATHS: Record<string, string[]> = {
  certchamps: ["questions/certchamps"],
  pastpaper: ["questions/exam-papers"],
  imagequestions: [],
};

function getPathsForMode(mode: QuestionsMode, subject?: string | null): string[] {
  if (mode === "certchamps" && subject) {
    return [`questions/certchamps/${subject}`];
  }
  return MODE_TO_PATHS[mode] ?? [];
}

function getStoredMode(): QuestionsMode {
  try {
    const s = localStorage.getItem(QUESTIONS_MODE_KEY);
    if (s === "certchamps" || s === "pastpaper" || s === "imagequestions") return s;
    } catch {}
  return "certchamps";
}

function formatSectionLabel(id: string): string {
  return id.replace(/-/g, " ").replace(/\b(\w)/g, (c) => c.toUpperCase());
}

function formatTags(tags: string[] | string | undefined): string {
  if (tags == null || tags === "") return "";
  const list = Array.isArray(tags) ? tags : tags.split(",").map((t) => t.trim());
  return list.filter(Boolean).map((t) => `#${t}`).join(", ");
}

async function renderPdfPageSnapshot(blob: Blob, pageNumber: number, maxWidth = 700): Promise<string | null> {
    try {
        const doc = await getDocumentCached(blob);
        const page = await doc.getPage(Math.max(1, Math.min(doc.numPages, Math.floor(pageNumber))));
        const viewport = page.getViewport({ scale: 1 });
        const width = Math.min(viewport.width, maxWidth);
        const scale = width / viewport.width;
        const scaledViewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
        return canvas.toDataURL("image/jpeg", 0.85);
    } catch {
        return null;
    }
}

function TopicSwitcher({ topics, value, onChange }: { topics: ImageTopic[]; value: string | null; onChange: (topic: string) => void }) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        if (open) {
            document.addEventListener("mousedown", handleClickOutside);
            return () => document.removeEventListener("mousedown", handleClickOutside);
        }
    }, [open]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return topics;
        return topics.filter((t) => t.displayName.toLowerCase().includes(q));
    }, [search, topics]);

    const selectedLabel = topics.find((t) => t.name === value)?.displayName ?? "Select topic";

    return (
        <div ref={containerRef} className="relative pointer-events-auto" data-state={open ? "open" : "closed"}>
            <button
                type="button"
                className="flex items-center gap-1.5 color-bg-grey-5 color-txt-sub font-bold py-0.5 px-3 rounded-out border-0 cursor-pointer text-sm max-w-[200px]"
                onClick={() => { setOpen((o) => !o); setSearch(""); }}
                aria-expanded={open}
                aria-haspopup="listbox"
                aria-label="Switch topic"
            >
                <span className="truncate">{selectedLabel}</span>
                <LuChevronDown size={14} className={`shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden />
            </button>
            {open && (
                <div
                    className="absolute right-0 top-full mt-1 w-[280px] max-h-[360px] overflow-hidden flex flex-col rounded-lg z-50 color-bg border-2 color-shadow"
                    style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}
                    role="listbox"
                >
                    <div className="flex items-center gap-2 px-3 py-2 shrink-0 border-b color-shadow">
                        <LuSearch size={16} className="shrink-0 color-txt-sub" aria-hidden />
                        <input
                            type="text"
                            className="flex-1 min-w-0 py-0.5 text-sm border-none bg-transparent color-txt-main outline-none"
                            placeholder="Search topics…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            autoFocus
                            aria-label="Search topics"
                        />
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto">
                        {filtered.length === 0 ? (
                            <div className="px-3 py-3 text-sm color-txt-sub">No topics match</div>
                        ) : (
                            filtered.map((t) => (
                                <button
                                    key={t.name}
                                    type="button"
                                    role="option"
                                    aria-selected={t.name === value}
                                    className={`flex items-center gap-2 w-full px-3 py-2 text-sm text-left border-none cursor-pointer transition-colors duration-150 ${
                                        t.name === value
                                            ? "color-bg-accent color-txt-accent font-bold"
                                            : "bg-transparent color-txt-main hover:color-bg-grey-10"
                                    }`}
                                    onClick={() => {
                                        onChange(t.name);
                                        setOpen(false);
                                        setSearch("");
                                    }}
                                >
                                    <span className="truncate flex-1 min-w-0">{t.displayName}</span>
                                    <span className="shrink-0 text-xs color-txt-sub">{t.questionCount}</span>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function Questions() {
    const { options, setOptions } = useContext(OptionsContext);
    const { user } = useContext(UserContext);
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    const urlMode = searchParams.get("mode") as QuestionsMode | null;
    const urlSubject = searchParams.get("subject");
    const urlPaperId = searchParams.get("paperId");
    const urlLevel = searchParams.get("level");
    const urlTopic = searchParams.get("topic");
    const urlIndexInPaper = searchParams.get("indexInPaper");
    const urlQuestionId = searchParams.get("questionId");
    const normalizedUrlLevel = normalizePaperLevel(urlLevel);
    const normalizedUrlSubject = (urlSubject ?? "").trim().toLowerCase();

    const initialMode: QuestionsMode =
        urlMode === "certchamps" || urlMode === "pastpaper" || urlMode === "imagequestions" ? urlMode : getStoredMode();
    const initialPaths = getPathsForMode(initialMode, urlSubject || null);

    //==============================================> State <========================================//
    const [filters, setFilters] = useState<Record<string, string[]>>({});
    const [position, setPosition] = useState(0);
    const [questions, setQuestions] = useState<any[]>([]);
    const [showSearch, setShowSearch] = useState(false);
    const [randomise, setRandomise] = useState(false);
    const [showPastPaperFilter, setShowPastPaperFilter] = useState(false);
    const [showFilter, setShowFilter] = useState(false);
    const [selectedSubTopics, setSelectedSubTopics] = useState<string[]>([]);

    const [mode, setMode] = useState<QuestionsMode>(initialMode);

    useEffect(() => {
        const m = urlMode === "certchamps" || urlMode === "pastpaper" || urlMode === "imagequestions" ? urlMode : getStoredMode();
        setMode(m);
    }, [urlMode]);

    const [subjectFilter, setSubjectFilter] = useState<string | null>(urlSubject || null);
    const [collectionPaths, setCollectionPaths] = useState<string[]>(initialPaths);
    const [sidebarOpen, setSidebarOpen] = useState(true);

        const pastPaperFilterRef = useRef<HTMLDivElement>(null);
    /** When set, next paperQuestions effect will jump here (used for random across scoped papers). */
    const pendingRandomRef = useRef<{ pos: number } | { questionId: string } | null>(null);
    /** When set, next paperQuestions effect will jump to this index (used when selecting from scoped-paper search). */
    const pendingSearchRef = useRef<{ indexInPaper: number } | null>(null);
    /** Tracks whether the initial urlQuestionId has been consumed (certchamps mode). */
    const urlQuestionIdConsumedRef = useRef(false);
    const getDrawingSnapshotRef = useRef<(() => string | null) | null>(null);
    const registerDrawingSnapshot = useCallback<RegisterDrawingSnapshot>((getSnapshot) => {
        getDrawingSnapshotRef.current = getSnapshot;
    }, []);
    const getDrawingSnapshot = useCallback(() => getDrawingSnapshotRef.current?.() ?? null, []);

        const getGradingCaptureRef = useRef<((mode?: "default" | "full-ink" | "retry-aggressive") => CanvasCapturePayload | null) | null>(null);
        const registerGetGradingCapture = useCallback<RegisterGetGradingCapture>((fn) => {
            getGradingCaptureRef.current = fn;
        }, []);
        const getGradingCapture = useCallback((mode: "default" | "full-ink" | "retry-aggressive" = "default") => getGradingCaptureRef.current?.(mode) ?? null, []);

    const getStaveAnalysisRef = useRef<(() => string | null) | null>(null);
    const registerGetStaveAnalysis = useCallback<RegisterGetStaveAnalysis>((fn) => {
        getStaveAnalysisRef.current = fn;
    }, []);
    const getStaveAnalysis = useCallback(() => getStaveAnalysisRef.current?.() ?? null, []);

    // ---- Canvas persistence (state declared here; effects placed after derived vars below) ----
    const { saveCanvas, loadCanvas } = useCanvasStorage();
    const [canvasStrokes, setCanvasStrokes] = useState<any[]>([]);
    const [canvasLoading, setCanvasLoading] = useState(false);
    const [gradingAnnotations, setGradingAnnotations] = useState<CanvasAnnotation[]>([]);
    const [checkMyAnswerStatus, setCheckMyAnswerStatus] = useState<string | null>(null);
    const [gradingStatus, setGradingStatus] = useState<GradingStatus>("idle");
    const [pass1Cache, setPass1Cache] = useState<Record<string, Pass1Result>>({});
    const [aiInjectedExchange, setAiInjectedExchange] = useState<InjectedExchange | null>(null);
    //===============================================================================================//

    //==============================================> Hooks <========================================//
    const { loadQuestions } = useQuestions({
        setQuestions,
        collectionPaths,
        filters,
    });
    const {
        papers,
        loading: papersLoading,
        error: papersError,
        getPaperBlob,
        getPaperQuestions,
        getMarkingSchemeBlob,
        firstFreePaper,
    } = useExamPapers(null, { loadAllWhenNull: true });
    const { availableSets } = useFilters();
    const { completedForPaper, loadPaperProgress, toggleQuestion, isQuestionCompleted } = usePaperProgress();
    const certChampsSet = availableSets.find((s) => s.id === "certchamps");

    // Image questions mode state
    const [imageQuestionTopic, setImageQuestionTopic] = useState<string | null>(urlTopic || null);
    const {
        grouped: imageGroupedList,
        loading: imageQuestionsLoading,
    } = useImageQuestionsForTopic(
        mode === "imagequestions" ? normalizedUrlSubject || null : null,
        mode === "imagequestions" ? normalizedUrlLevel || null : null,
        mode === "imagequestions" ? imageQuestionTopic : null
    );
    const {
        topics: imageAllTopics,
    } = useAllTopicsForSubjectLevel(
        mode === "imagequestions" ? normalizedUrlSubject || null : null,
        mode === "imagequestions" ? normalizedUrlLevel || null : null
    );
    const [imageQuestionPosition, setImageQuestionPosition] = useState(0);
    const currentGroupedQuestion: GroupedImageQuestion | undefined = imageGroupedList[imageQuestionPosition];
    const [showComingSoonToast, setShowComingSoonToast] = useState(false);

    const [selectedPaper, setSelectedPaper] = useState<ExamPaper | null>(null);
    const [paperBlob, setPaperBlob] = useState<Blob | null>(null);
    const [paperLoadError, setPaperLoadError] = useState<string | null>(null);
    const [currentPaperPage, setCurrentPaperPage] = useState(1);
    const [paperQuestions, setPaperQuestions] = useState<PaperQuestion[]>([]);
    const [paperQuestionPosition, setPaperQuestionPosition] = useState(1);
    const [scrollToPage, setScrollToPage] = useState<number | null>(null);
    const [isFullPaperExpanded, setIsFullPaperExpanded] = useState(false);
    const [markingSchemeBlob, setMarkingSchemeBlob] = useState<Blob | null>(null);
    const [sidebarOpenPanel, setSidebarOpenPanel] = useState<"ai" | "threads" | "timer" | "markingscheme" | null>(null);
    const [markingSchemeQuestionIndex, setMarkingSchemeQuestionIndex] = useState<number | null>(null);
    const [logTablesQuestionIndex, setLogTablesQuestionIndex] = useState<number | null>(null);
    const [showLogTables, setShowLogTables] = useState(false);
    const [showCalculator, setShowCalculator] = useState(false);
    const [paperDocumentLoaded, setPaperDocumentLoaded] = useState(false);
    const [paperNumPages, setPaperNumPages] = useState(0);
    const [logTablesBlob, setLogTablesBlob] = useState<Blob | null>(null);
    const [logTablesPreloaded, setLogTablesPreloaded] = useState(false);
    const [viewportWidth, setViewportWidth] = useState(
        typeof window !== "undefined" ? window.innerWidth : 1024
    );
    const [navbarActionOffsetPx, setNavbarActionOffsetPx] = useState(96);
    useEffect(() => {
        const onResize = () => setViewportWidth(window.innerWidth);
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);
    useEffect(() => {
        if (typeof window === "undefined" || typeof document === "undefined") return;

        const navbar = document.getElementById("app-navbar");
        if (!navbar) return;

        const updateOffset = () => {
            const rightEdge = Math.max(0, Math.round(navbar.getBoundingClientRect().right));
            setNavbarActionOffsetPx(rightEdge + 8);
        };

        updateOffset();

        const resizeObserver =
            typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateOffset) : null;
        resizeObserver?.observe(navbar);

        window.addEventListener("resize", updateOffset);
        navbar.addEventListener("mouseenter", updateOffset);
        navbar.addEventListener("mouseleave", updateOffset);
        navbar.addEventListener("transitionend", updateOffset);

        return () => {
            resizeObserver?.disconnect();
            window.removeEventListener("resize", updateOffset);
            navbar.removeEventListener("mouseenter", updateOffset);
            navbar.removeEventListener("mouseleave", updateOffset);
            navbar.removeEventListener("transitionend", updateOffset);
        };
    }, []);
    useEffect(() => {
        const onCloseLogTables = () => setShowLogTables(false);
        window.addEventListener("tutorial-close-logtables", onCloseLogTables);
        return () => window.removeEventListener("tutorial-close-logtables", onCloseLogTables);
    }, []);
    const paperScrollRef = useRef<HTMLDivElement | null>(null);
    const panelsScrollRef = useRef<HTMLDivElement | null>(null);

    const currentQuestion = questions[position - 1];

    // Past-paper scope: once in a paper session, keep all paper operations within subject+level.
    const scopedSubject = useMemo(
        () => normalizedUrlSubject || String(selectedPaper?.subject ?? "").trim().toLowerCase(),
        [normalizedUrlSubject, selectedPaper?.subject]
    );
    const scopedLevel = useMemo(
        () => normalizedUrlLevel || normalizePaperLevel(selectedPaper?.level),
        [normalizedUrlLevel, selectedPaper?.level]
    );
    const scopedPapers = useMemo(() => {
        return papers.filter((p) => {
            if (scopedSubject && (p.subject ?? "").toLowerCase() !== scopedSubject) return false;
            if (scopedLevel && normalizePaperLevel(p.level) !== scopedLevel) return false;
            return true;
        });
    }, [papers, scopedSubject, scopedLevel]);
    const pastPaperTopicScope = useMemo(
        () => getPastPaperTopicScope(scopedSubject, scopedLevel),
        [scopedSubject, scopedLevel]
    );

    // Normalise tag for matching (e.g. "Area & Volume" <-> "Area and Volume")
    const normTag = (t: string) =>
      t.trim().toLowerCase().replace(/\s*&\s*/g, " and ");
    const filteredPaperQuestions = useMemo(() => {
      if (selectedSubTopics.length === 0) return paperQuestions;
      const set = new Set(selectedSubTopics.map((s) => normTag(s)));
      return paperQuestions.filter((q) =>
        q.tags?.some((tag) => set.has(normTag(String(tag))))
      );
    }, [paperQuestions, selectedSubTopics]);

    const currentPaperQuestion = filteredPaperQuestions[paperQuestionPosition - 1];
    const paperQuestionIndexInFullList =
      currentPaperQuestion != null ? paperQuestions.indexOf(currentPaperQuestion) : -1;
    const questionForMarkingScheme =
        markingSchemeQuestionIndex != null
            ? paperQuestions[markingSchemeQuestionIndex]
            : currentPaperQuestion;
    const questionForLogTables =
        logTablesQuestionIndex != null ? paperQuestions[logTablesQuestionIndex] : currentPaperQuestion;
    const aiPaperPage = useMemo(() => {
        if (mode !== "pastpaper") return currentPaperPage;
        const activeQ = currentPaperQuestion ?? filteredPaperQuestions[0] ?? paperQuestions[0];
        return activeQ?.pageRegions?.[0]?.page ?? activeQ?.pageRange?.[0] ?? currentPaperPage;
    }, [mode, currentPaperPage, currentPaperQuestion, filteredPaperQuestions, paperQuestions]);
    const paperSnapshot = usePaperSnapshot(paperBlob, aiPaperPage);
    const getPaperSnapshot = useCallback(() => paperSnapshot ?? null, [paperSnapshot]);

    const msCode = currentQuestion?.properties?.markingScheme
        ? String(currentQuestion.properties.markingScheme)
        : "";
    const msYear = msCode.length >= 2 ? msCode.substring(0, 2) : (mode === "pastpaper" ? "25" : "");

    // ---- Canvas persistence (derived + effects, after all deps are declared) ----
    const activeCanvasQuestionId = useMemo(() => {
        if (mode === "pastpaper" && selectedPaper && currentPaperQuestion) {
            return `${selectedPaper.id}_${currentPaperQuestion.id}`;
        }
        if (mode === "imagequestions" && currentGroupedQuestion) {
            return `img_${normalizedUrlSubject}_${normalizedUrlLevel}_${imageQuestionTopic}_${currentGroupedQuestion.key}`;
        }
        if (mode === "certchamps" && currentQuestion?.id) {
            return currentQuestion.id as string;
        }
        return null;
    }, [mode, selectedPaper, currentPaperQuestion, currentGroupedQuestion, currentQuestion, normalizedUrlSubject, normalizedUrlLevel, imageQuestionTopic]);

    const questionLogMeta = useMemo((): QuestionMeta | null => {
        if (mode === "pastpaper" && selectedPaper && currentPaperQuestion) {
            return {
                questionId: currentPaperQuestion.id,
                questionName: currentPaperQuestion.questionName,
                paperId: selectedPaper.id,
                paperLabel: selectedPaper.label,
                subject: selectedPaper.subject ?? "unknown",
                level: selectedPaper.level ?? "unknown",
                topics: currentPaperQuestion.tags ?? [],
                completed: isQuestionCompleted(currentPaperQuestion.id),
            };
        }
        return null;
    }, [mode, selectedPaper, currentPaperQuestion, isQuestionCompleted]);

    useQuestionSessionLog(user?.uid, questionLogMeta);

    // Load saved strokes whenever the active question changes
    useEffect(() => {
        if (!activeCanvasQuestionId) {
            setCanvasStrokes([]);
            setGradingAnnotations([]);
            setCanvasLoading(false);
            return;
        }
        setCanvasLoading(true);
        setGradingAnnotations([]);
        let cancelled = false;
        loadCanvas(activeCanvasQuestionId)
            .then((loaded) => {
                if (cancelled) return;
                setCanvasStrokes(loaded?.strokes ?? []);
                setGradingAnnotations(isSavedGradingAnnotations(loaded?.feedbackOverlay) ? loaded.feedbackOverlay : []);
                setCanvasLoading(false);
            })
            .catch(() => {
                if (cancelled) return;
                setCanvasStrokes([]);
                setGradingAnnotations([]);
                setCanvasLoading(false);
            });
        return () => { cancelled = true; };
    }, [activeCanvasQuestionId, loadCanvas]);

    const handleStrokesChange = useCallback(
        (strokes: any[]) => {
            if (!activeCanvasQuestionId) return;
            const nextAnnotations = strokes.length === 0 ? [] : gradingAnnotations;
            if (strokes.length === 0 && gradingAnnotations.length > 0) {
                setGradingAnnotations([]);
            }
            saveCanvas(activeCanvasQuestionId, strokes, nextAnnotations);
        },
        [activeCanvasQuestionId, saveCanvas, gradingAnnotations]
    );

    useEffect(() => {
        setCheckMyAnswerStatus(null);
        setGradingStatus("idle");
        setAiInjectedExchange(null);
    }, [activeCanvasQuestionId, mode]);

    const streamChatResponse = useCallback(async (
        messages: Array<{ role: string; content: any }>,
        options?: { temperature?: number; top_p?: number; context?: string }
    ): Promise<string> => {
        const res = await fetch(CHAT_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                messages,
                context: options?.context,
                temperature: options?.temperature,
                top_p: options?.top_p,
            }),
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || errData.details || "Failed to check answer");
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
    }, []);

    const canCheckNow = gradingStatus === "idle" || gradingStatus === "done" || gradingStatus === "error";

    const handleToggleQuestionCompleted = useCallback(() => {
        if (mode === "pastpaper" && selectedPaper && currentPaperQuestion) {
            toggleQuestion(selectedPaper, currentPaperQuestion.id, paperQuestions.length);
        }
    }, [mode, selectedPaper, currentPaperQuestion, paperQuestions.length, toggleQuestion]);

    const injectGradingMessage = useCallback((result: Awaited<ReturnType<typeof runGrading>>) => {
        if (result.pass2.isFullMarks) {
            setAiInjectedExchange({
                nonce: `${Date.now()}`,
                userMessage: "Check my answer",
                assistantMessage: `Well done - full marks! You scored ${result.pass2.totalAwarded}/${result.pass2.totalAvailable}.\n\nReady to mark this question as complete?`,
                action: { type: "markComplete", label: "Mark as complete" },
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

        const partSummaries = buildPartSummary(result.pass2);
        const partBreakdown = partSummaries
            .map((p) => {
                if (p.marksAwarded === p.marksAvailable) {
                    return `${p.marksAwarded}/${p.marksAvailable} \u2014 well done.`;
                }
                return `${p.marksAwarded}/${p.marksAvailable} \u2014 ${p.summary}`;
            })
            .join("\n");

        const message = [
            `You scored ${result.pass2.totalAwarded}/${result.pass2.totalAvailable} \u2014 ${openingEncouragement}`,
            "",
            partBreakdown,
            "",
            "I've highlighted exactly where to look on your working.",
        ].join("\n");

        setAiInjectedExchange({
            nonce: `${Date.now()}`,
            userMessage: "Check my answer",
            assistantMessage: message,
        });
    }, []);

    const handleCheckMyAnswer = useCallback(async () => {
        if (!canCheckNow) return;
        if (canvasLoading) {
            setCheckMyAnswerStatus("Something went wrong - try again");
            setGradingStatus("error");
            return;
        }
        if (!activeCanvasQuestionId) {
            setCheckMyAnswerStatus("Something went wrong - try again");
            setGradingStatus("error");
            return;
        }

        setCheckMyAnswerStatus(null);
        setGradingAnnotations([]);

        try {
            const capture = getGradingCapture("default");
            const fullInkCapture = getGradingCapture("full-ink");
            if (!capture) {
                throw new BlankCanvasError();
            }

            const questionText = mode === "pastpaper"
                ? [
                    currentPaperQuestion?.questionName ?? "Question",
                    currentPaperQuestion?.tags?.length ? `Tags: ${currentPaperQuestion.tags.join(", ")}` : "",
                  ].filter(Boolean).join("\n")
                : [
                    String(currentQuestion?.properties?.name ?? "Question"),
                    ...(Array.isArray(currentQuestion?.content)
                        ? currentQuestion.content
                              .map((p: any, i: number) => (p?.question ? `Part ${i + 1}: ${String(p.question)}` : ""))
                              .filter(Boolean)
                        : []),
                  ].filter(Boolean).join("\n\n");

            const markingSchemeImages: string[] = [];
            let markingSchemeText = "";
            if (mode === "pastpaper") {
                if (!selectedPaper || !currentPaperQuestion?.markingSchemePageRange) throw new Error("Something went wrong - try again");
                const msBlob = markingSchemeBlob ?? (await getMarkingSchemeBlob(selectedPaper));
                if (!msBlob) throw new Error("Something went wrong - try again");
                const start = Math.max(1, Math.min(currentPaperQuestion.markingSchemePageRange.start, currentPaperQuestion.markingSchemePageRange.end));
                const end = Math.max(start, Math.max(currentPaperQuestion.markingSchemePageRange.start, currentPaperQuestion.markingSchemePageRange.end));
                markingSchemeText = `Past-paper marking scheme pages ${start}-${end}`;
                for (let page = start; page <= end && page < start + 4; page += 1) {
                    const shot = await renderPdfPageSnapshot(msBlob, page, 700);
                    if (shot) markingSchemeImages.push(shot);
                }
            } else {
                const rawMs = String(currentQuestion?.properties?.markingScheme ?? "").trim();
                const digits = rawMs.replace(/\D/g, "");
                const year = digits.length >= 4 ? digits.slice(0, 2) : msYear;
                const pageNumber = digits.length >= 4 ? Number(digits.slice(2)) : Number(digits);
                if (!year || !Number.isFinite(pageNumber) || pageNumber <= 0) throw new Error("Something went wrong - try again");
                const msRes = await fetch(`/assets/marking_schemes/${year}.pdf`);
                if (!msRes.ok) throw new Error("Something went wrong - try again");
                const msBlob = await msRes.blob();
                const shot = await renderPdfPageSnapshot(msBlob, pageNumber, 700);
                if (shot) markingSchemeImages.push(shot);
                markingSchemeText = `CertChamps marking scheme ${year}${String(pageNumber).padStart(2, "0")}`;
            }

            const result = await runGrading({
                questionId: activeCanvasQuestionId,
                questionText,
                markingSchemeText,
                markingSchemeImages,
                capture,
                fullInkCapture: fullInkCapture ?? undefined,
                getAggressiveCapture: () => getGradingCapture("retry-aggressive"),
                streamChatResponse,
                pass1Cache,
                setPass1Cache,
                onStatus: setGradingStatus,
            });

            setGradingAnnotations(result.annotations);
            saveCanvas(activeCanvasQuestionId, canvasStrokes, result.annotations);
            injectGradingMessage(result);
            setSidebarOpen(true);
            setSidebarOpenPanel("ai");
            setCheckMyAnswerStatus(null);
        } catch (err) {
            setGradingStatus("error");
            if (err instanceof BlankCanvasError) {
                setCheckMyAnswerStatus("Your canvas looks empty - write your workings and try again.");
            } else {
                setCheckMyAnswerStatus("Something went wrong - try again");
            }
            console.error("[grading] failed", err);
        }
    }, [
        canCheckNow,
        canvasLoading,
        activeCanvasQuestionId,
        getGradingCapture,
        mode,
        currentPaperQuestion,
        currentQuestion,
        selectedPaper,
        markingSchemeBlob,
        getMarkingSchemeBlob,
        msYear,
        streamChatResponse,
        pass1Cache,
        setPass1Cache,
        saveCanvas,
        canvasStrokes,
        injectGradingMessage,
    ]);

    // ---- Cross-paper helpers for topic filtering ----

    /** Given a list of subtopic strings, find the first paper (starting at `startIdx`, searching forward)
     *  that contains at least one matching question. Returns { paper, questions, filtered } or null. */
    const findPaperWithTopics = useCallback(
        async (
            subTopics: string[],
            startIdx: number,
            direction: "forward" | "backward" = "forward",
            sourcePapers: ExamPaper[] = scopedPapers
        ): Promise<{ paper: ExamPaper; questions: PaperQuestion[]; filtered: PaperQuestion[] } | null> => {
            if (sourcePapers.length === 0 || !getPaperQuestions) return null;
            const tagSet = new Set(subTopics.map((s) => normTag(s)));
            const step = direction === "forward" ? 1 : -1;
            for (
                let i = startIdx;
                direction === "forward" ? i < sourcePapers.length : i >= 0;
                i += step
            ) {
                const p = sourcePapers[i];
                try {
                    const list = await getPaperQuestions(p);
                    if (list.length === 0) continue;
                    if (subTopics.length === 0) return { paper: p, questions: list, filtered: list };
                    const filtered = list.filter((q) =>
                        q.tags?.some((tag) => tagSet.has(normTag(String(tag))))
                    );
                    if (filtered.length > 0) return { paper: p, questions: list, filtered };
                } catch { /* skip broken papers */ }
            }
            return null;
        },
        [scopedPapers, getPaperQuestions]
    );

    //==============================================================================================//

    //====================================> useEffect First Render <================================//

    // load questions at start and on filter change
    useEffect(() => {
        loadQuestions();
        setPosition((prev) => prev + 1);
    }, [filters]);

    // Sync mode + subjectFilter -> collectionPaths and reload when they change
    useEffect(() => {
        const paths = getPathsForMode(mode, subjectFilter);
        setCollectionPaths(paths);
        try {
            localStorage.setItem(QUESTIONS_MODE_KEY, mode);
        } catch {}
    }, [mode, subjectFilter]);

    const isInitialPathsRef = useRef(true);
    useEffect(() => {
        if (isInitialPathsRef.current) {
            isInitialPathsRef.current = false;
            return;
        }
        loadQuestions();
        setPosition(1);
    }, [collectionPaths]);

    // Load paper as Blob when selected (avoids CORS; react-pdf accepts Blob). Cache in useExamPapers makes revisits instant.
    useEffect(() => {
        if (!selectedPaper) {
            setPaperBlob(null);
            setPaperLoadError(null);
            return;
        }
        let cancelled = false;
        setPaperBlob(null);
        setPaperLoadError(null);
        getPaperBlob(selectedPaper)
            .then((blob) => {
                if (!cancelled) setPaperBlob(blob);
                // Preload next paper so "Next" is instant
                const idx = scopedPapers.findIndex((p: ExamPaper) => p.storagePath === selectedPaper.storagePath);
                if (idx >= 0 && idx < scopedPapers.length - 1) {
                    getPaperBlob(scopedPapers[idx + 1]!).catch(() => {});
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    console.error("Failed to load paper:", err);
                    setPaperLoadError(err?.message ?? "Failed to load paper");
                    setPaperBlob(null);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [selectedPaper, getPaperBlob, scopedPapers]);

    // Reset "current page" when user selects a different paper
    useEffect(() => {
        setCurrentPaperPage(1);
    }, [selectedPaper]);

    // Fetch paper's questions subcollection when paper is selected
    useEffect(() => {
        if (!selectedPaper || !getPaperQuestions) {
            setPaperQuestions([]);
            setPaperQuestionPosition(1);
            return;
        }
        let cancelled = false;
        getPaperQuestions(selectedPaper)
            .then((list) => {
                if (!cancelled) {
                    setPaperQuestions(list);
                    const pending = pendingRandomRef.current;
                    pendingRandomRef.current = null;
                    const pendingSearch = pendingSearchRef.current;
                    pendingSearchRef.current = null;

                    if (pendingSearch != null && list.length > 0) {
                        const q = list[pendingSearch.indexInPaper];
                        const subSet = new Set(selectedSubTopics.map((s) => normTag(s)));
                        const filtered = selectedSubTopics.length === 0
                            ? list
                            : list.filter((qq) =>
                                qq.tags?.some((tag) => subSet.has(normTag(String(tag))))
                              );
                        const filteredIdx = q ? filtered.findIndex((qq) => qq.id === q.id) : -1;
                        const pos = filteredIdx >= 0 ? filteredIdx + 1 : 1;
                        setPaperQuestionPosition(pos);
                        const targetQ = filtered[pos - 1] ?? q;
                        setScrollToPage(targetQ?.pageRegions?.[0]?.page ?? targetQ?.pageRange?.[0] ?? null);
                    } else if (pending && list.length > 0) {
                        if ("pos" in pending) {
                            const pos = Math.min(pending.pos, list.length);
                            setPaperQuestionPosition(pos);
                            const q = list[pos - 1];
                            setScrollToPage(q?.pageRegions?.[0]?.page ?? q?.pageRange?.[0] ?? null);
                        } else {
                            const q = list.find((qq) => qq.id === pending.questionId);
                            if (q) {
                                const subSet = new Set(selectedSubTopics.map((s) => normTag(s)));
                                const filtered = selectedSubTopics.length === 0
                                    ? list
                                    : list.filter((qq) =>
                                        qq.tags?.some((tag) => subSet.has(normTag(String(tag))))
                                      );
                                const filteredIdx = filtered.findIndex((qq) => qq.id === q.id);
                                const pos = filteredIdx >= 0 ? filteredIdx + 1 : 1;
                                setPaperQuestionPosition(pos);
                                setScrollToPage(q?.pageRegions?.[0]?.page ?? q?.pageRange?.[0] ?? null);
                            } else {
                                setPaperQuestionPosition(1);
                                const firstQ = list[0];
                                setScrollToPage(firstQ?.pageRegions?.[0]?.page ?? firstQ?.pageRange?.[0] ?? null);
                            }
                        }
                    } else {
                        // Apply active subtopic filter so we scroll to first matching question
                        const subSet = new Set(selectedSubTopics.map((s) => normTag(s)));
                        const filtered = selectedSubTopics.length === 0
                            ? list
                            : list.filter((qq) => qq.tags?.some((tag) => subSet.has(normTag(String(tag)))));
                        setPaperQuestionPosition(1);
                        const firstQ = filtered[0] ?? list[0];
                        const firstPage = firstQ?.pageRegions?.[0]?.page ?? firstQ?.pageRange?.[0] ?? null;
                        setScrollToPage(firstPage);
                    }
                    setIsFullPaperExpanded(false);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setPaperQuestions([]);
                    setPaperQuestionPosition(1);
                    pendingRandomRef.current = null;
                    pendingSearchRef.current = null;
                }
            });
        return () => {
            cancelled = true;
        };
    }, [selectedPaper, getPaperQuestions, selectedSubTopics]);

    // Load paper progress when paper is selected
    useEffect(() => {
        if (selectedPaper) loadPaperProgress(selectedPaper);
    }, [selectedPaper, loadPaperProgress]);

    // Clamp past-paper position when filter shrinks the list.
    // If no questions match in the current paper, auto-switch to a paper that has matches.
    useEffect(() => {
        if (filteredPaperQuestions.length > 0) {
            if (paperQuestionPosition > filteredPaperQuestions.length) {
                setPaperQuestionPosition(1);
                const q = filteredPaperQuestions[0];
                if (q) setScrollToPage(q?.pageRegions?.[0]?.page ?? q?.pageRange?.[0] ?? null);
            }
            return;
        }
        // Current paper has 0 filtered questions — find the nearest paper that does
        if (selectedSubTopics.length === 0 || scopedPapers.length === 0 || paperQuestions.length === 0) return;
        let searching = true;
        (async () => {
            const curIdx = selectedPaper ? scopedPapers.findIndex((p) => p.storagePath === selectedPaper.storagePath) : 0;
            // Search forward first (newer papers are at lower indices), then backward
            const result =
                (await findPaperWithTopics(selectedSubTopics, curIdx + 1, "forward")) ??
                (await findPaperWithTopics(selectedSubTopics, curIdx - 1, "backward"));
            if (!searching) return;
            if (result) {
                pendingRandomRef.current = { questionId: result.filtered[0].id };
                setSelectedPaper(result.paper);
            }
        })();
        return () => { searching = false; };
    }, [filteredPaperQuestions.length, paperQuestionPosition, selectedSubTopics, selectedPaper, scopedPapers, paperQuestions.length, findPaperWithTopics]);

    // If the selected paper drifts outside the active scope (subject+level), snap to first scoped paper.
    useEffect(() => {
        if (mode !== "pastpaper" || !selectedPaper || scopedPapers.length === 0) return;
        const inScope = scopedPapers.some((p) => p.storagePath === selectedPaper.storagePath);
        if (!inScope) {
            setSelectedPaper(scopedPapers[0]);
        }
    }, [mode, selectedPaper, scopedPapers]);

    // Do NOT sync PDF page/scroll to question — question only changes via arrows or "Open question".

    const pdfWidthPercent = options.laptopMode ? 0.4 : 0.3;
    const snippetWidth = Math.max(
        280,
        Math.min(options.laptopMode ? 680 : 400, Math.floor(viewportWidth * pdfWidthPercent))
    );
    const PAGE_GAP_PX = 0;
    const PDF_ASPECT = 842 / 595;
    const pageHeightPx = snippetWidth * PDF_ASPECT;

    // Full-paper scroll does NOT change the current question; user can scroll freely and click "Question only" to return to the question they were on.

    const paperContentHeightPx =
      paperNumPages > 0 ? paperNumPages * (pageHeightPx + PAGE_GAP_PX) - PAGE_GAP_PX : 0;

    // When expanding to full paper, scroll PDF to current question
    useEffect(() => {
        if (!isFullPaperExpanded || paperQuestions.length === 0 || !paperScrollRef.current) return;
        const q = currentPaperQuestion ?? filteredPaperQuestions[0] ?? paperQuestions[0];
        const offset = getQuestionScrollOffset(snippetWidth, q);
        const pdfEl = paperScrollRef.current;
        const doScroll = () => {
            if (pdfEl.scrollTop !== offset) {
                pdfEl.scrollTop = offset;
            }
            if (panelsScrollRef.current && panelsScrollRef.current.scrollTop !== offset) {
                panelsScrollRef.current.scrollTop = offset;
            }
        };
        doScroll();
        requestAnimationFrame(doScroll);
    }, [isFullPaperExpanded, paperQuestions, paperQuestionPosition, snippetWidth, currentPaperQuestion]);

    // Sync PDF scroll with region-aligned panels
    useEffect(() => {
        if (!isFullPaperExpanded || !paperScrollRef.current || !panelsScrollRef.current) return;
        const pdfEl = paperScrollRef.current;
        const panelsEl = panelsScrollRef.current;
        let raf: number | null = null;
        const syncFromPdf = () => {
            if (raf) return;
            raf = requestAnimationFrame(() => {
                raf = null;
                if (panelsEl.scrollTop !== pdfEl.scrollTop) panelsEl.scrollTop = pdfEl.scrollTop;
            });
        };
        const syncFromPanels = () => {
            if (raf) return;
            raf = requestAnimationFrame(() => {
                raf = null;
                if (pdfEl.scrollTop !== panelsEl.scrollTop) pdfEl.scrollTop = panelsEl.scrollTop;
            });
        };
        pdfEl.addEventListener("scroll", syncFromPdf, { passive: true });
        panelsEl.addEventListener("scroll", syncFromPanels, { passive: true });
        syncFromPdf();
        return () => {
            pdfEl.removeEventListener("scroll", syncFromPdf);
            panelsEl.removeEventListener("scroll", syncFromPanels);
            if (raf) cancelAnimationFrame(raf);
        };
    }, [isFullPaperExpanded]);

    // Load marking scheme when paper and question (for marking scheme view) have markingSchemePageRange
    useEffect(() => {
        if (
            !selectedPaper ||
            !getMarkingSchemeBlob ||
            !questionForMarkingScheme?.markingSchemePageRange
        ) {
            setMarkingSchemeBlob(null);
            return;
        }
        let cancelled = false;
        getMarkingSchemeBlob(selectedPaper)
            .then((blob) => {
                if (!cancelled) setMarkingSchemeBlob(blob ?? null);
            })
            .catch(() => {
                if (!cancelled) setMarkingSchemeBlob(null);
            });
        return () => {
            cancelled = true;
        };
    }, [selectedPaper, getMarkingSchemeBlob, questionForMarkingScheme?.markingSchemePageRange]);

    // Reset PDF document loaded and page count when paper blob changes (new paper)
    useEffect(() => {
        setPaperDocumentLoaded(false);
        setPaperNumPages(0);
    }, [paperBlob]);

    // Preload log tables PDF so modal opens instantly
    useEffect(() => {
        let cancelled = false;
        setLogTablesPreloaded(false);
        fetch("/assets/log_tables.pdf")
            .then((res) => (res.ok ? res.blob() : null))
            .then((blob) => {
                if (!cancelled && blob) {
                    setLogTablesBlob(blob);
                }
            })
            .catch(() => {})
            .finally(() => {
                if (!cancelled) setLogTablesPreloaded(true);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    // When landing with paperId + questionId/indexInPaper (e.g. shared link or Practice Hub search), set pending so we jump to that question when paper questions load
    useEffect(() => {
        if (urlPaperId && urlQuestionId) {
            pendingRandomRef.current = { questionId: urlQuestionId };
        } else if (urlPaperId && urlIndexInPaper != null) {
            const idx = parseInt(urlIndexInPaper, 10);
            if (!isNaN(idx) && idx >= 0) {
                pendingSearchRef.current = { indexInPaper: idx };
            }
        }
    }, [urlPaperId, urlQuestionId, urlIndexInPaper]);

    // Preselect paper: URL paperId > current question year > first paper
    useEffect(() => {
        if (scopedPapers.length === 0 || selectedPaper !== null) return;
        let match: ExamPaper | undefined;
        if (urlPaperId) {
            match = scopedPapers.find(
                (p) =>
                    p.id === urlPaperId &&
                    (!normalizedUrlLevel || normalizePaperLevel(p.level) === normalizedUrlLevel) &&
                    (!normalizedUrlSubject || (p.subject ?? "").toLowerCase() === normalizedUrlSubject)
            );

            if (!match && !normalizedUrlLevel) {
                match = scopedPapers.find(
                    (p) =>
                        p.id === urlPaperId &&
                        (!normalizedUrlSubject || (p.subject ?? "").toLowerCase() === normalizedUrlSubject)
                );
            }
        }
        if (!match && msYear) {
            match = scopedPapers.find((p) => p.label.toLowerCase().startsWith("20" + msYear)) ?? scopedPapers[0];
        }
        if (!match) match = scopedPapers[0];
        setSelectedPaper(match);
    }, [scopedPapers, msYear, selectedPaper, urlPaperId, normalizedUrlLevel, normalizedUrlSubject]);

    // When landing in certchamps mode with a questionId URL param, jump to that question once questions load
    useEffect(() => {
        if (mode !== "certchamps" || urlQuestionIdConsumedRef.current || !urlQuestionId || questions.length === 0) return;
        const idx = questions.findIndex((q: any) => String(q.id) === urlQuestionId);
        if (idx >= 0) {
            urlQuestionIdConsumedRef.current = true;
            setPosition(idx + 1);
        }
    }, [questions, urlQuestionId, mode]);

    // Sync URL to the current question (replace so navigating questions doesn't pollute browser history)
    useEffect(() => {
        if (mode === "pastpaper") {
            if (!selectedPaper || !currentPaperQuestion) return;
            setSearchParams(
                {
                    mode: "pastpaper",
                    paperId: selectedPaper.id,
                    level: selectedPaper.level ?? "",
                    subject: selectedPaper.subject ?? "",
                    questionId: currentPaperQuestion.id,
                },
                { replace: true }
            );
        } else if (mode === "imagequestions") {
            if (!currentGroupedQuestion) return;
            setSearchParams(
                {
                    mode: "imagequestions",
                    subject: normalizedUrlSubject,
                    level: normalizedUrlLevel,
                    topic: imageQuestionTopic ?? "",
                },
                { replace: true }
            );
        } else {
            if (!currentQuestion?.id) return;
            const params: Record<string, string> = {
                mode: "certchamps",
                questionId: String(currentQuestion.id),
            };
            if (subjectFilter) params.subject = subjectFilter;
            setSearchParams(params, { replace: true });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, selectedPaper?.storagePath, currentPaperQuestion?.id, currentQuestion?.id, subjectFilter, currentGroupedQuestion?.key, imageQuestionTopic]);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            const target = e.target as Node;
            if (pastPaperFilterRef.current && !pastPaperFilterRef.current.contains(target)) {
                setShowPastPaperFilter(false);
            }
        }
        if (showPastPaperFilter) {
            document.addEventListener("mousedown", handleClickOutside);
            return () => document.removeEventListener("mousedown", handleClickOutside);
        }
    }, [showPastPaperFilter]);

    //===============================================================================================//

    //===========================================> Next Question <===================================//
    const nextQuestion = async () => {
        if (randomise) {
          await loadQuestions();
          setPosition((p) => p + 1);
        } else {
          if (position + 1 >= questions.length) {
            await loadQuestions();
          }
          setPosition((p) => p + 1);
        }
    };
    //===============================================================================================//

    //===========================================> Previous Question <================================//
    const previousQuestion = () => {
        setPosition((p) => Math.max(0, p - 1));
    };
    //===============================================================================================//

    const isNetworkDev =
        typeof window !== "undefined" &&
        import.meta.env.DEV &&
        !["localhost", "127.0.0.1"].includes(window.location.hostname);
    const [dismissedCorsHint, setDismissedCorsHint] = useState(() => {
        try {
            return localStorage.getItem("questions-dismissed-cors-hint") === "1";
        } catch {
            return false;
        }
    });
    const showCorsHint = isNetworkDev && !dismissedCorsHint;
    const dismissCorsHint = useCallback(() => {
        setDismissedCorsHint(true);
        try {
            localStorage.setItem("questions-dismissed-cors-hint", "1");
        } catch {}
    }, []);

    return (
        <TimerProvider>
        <div className="relative flex min-h-0 w-full flex-1 flex-col gap-0 overflow-hidden h-full">
            {showCorsHint && (
                <div className="shrink-0 z-30 flex items-center justify-between gap-2 px-3 py-2 text-xs color-bg-grey-10 color-txt-main border-b border-[var(--grey-10)]">
                    <span>
                        Testing on another device? Add <strong>{typeof window !== "undefined" ? window.location.origin : ""}</strong> to Firebase Storage CORS so papers load. See <code className="px-1 rounded color-bg-grey-5">CORS_SETUP.md</code>.
                    </span>
                    <button
                        type="button"
                        onClick={dismissCorsHint}
                        aria-label="Dismiss"
                        className="shrink-0 p-1 rounded hover:color-bg-grey-5"
                    >
                        <LuX size={16} />
                    </button>
                </div>
            )}
            {/* Drawing canvas: disabled in laptop mode; only mount after saved strokes have loaded */}
            {!options.laptopMode && !canvasLoading && (
                <div className="absolute inset-0 z-0">
                    <DrawingCanvas
                        key={activeCanvasQuestionId ?? "no-question"}
                        registerDrawingSnapshot={registerDrawingSnapshot}
                        registerGetStaveAnalysis={registerGetStaveAnalysis}
                        initialStrokes={canvasStrokes}
                        onStrokesChange={handleStrokesChange}
                        registerGetGradingCapture={registerGetGradingCapture}
                        gradingAnnotations={gradingAnnotations}
                    />
                    {mode === "pastpaper" && selectedPaper && currentPaperQuestion && (
                        <div className="absolute z-30 pointer-events-auto bottom-16 left-1/2 -translate-x-1/2 flex items-center gap-2">
                            <div className="relative">
                                <button
                                    type="button"
                                    aria-label="Check my answer"
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium color-bg-accent color-txt-accent hover:opacity-85 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                                    onClick={handleCheckMyAnswer}
                                    disabled={!canCheckNow}
                                    title="Check my answer with AI"
                                >
                                    <LuCircleCheck size={14} strokeWidth={2} />
                                    <span>{!canCheckNow ? gradingStatusLabel(gradingStatus) : "Check my answer"}</span>
                                </button>
                                {checkMyAnswerStatus && (
                                    <div className="absolute bottom-full mb-2 max-w-[280px] text-xs color-txt-sub bg-[var(--grey-5)]/90 rounded-md px-2 py-1 z-20 flex items-center gap-2">
                                        <span>{checkMyAnswerStatus}</span>
                                        {gradingStatus === "error" && (
                                            <button
                                                type="button"
                                                onClick={handleCheckMyAnswer}
                                                className="text-[11px] font-semibold color-txt-accent hover:opacity-80"
                                            >
                                                Retry
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={handleToggleQuestionCompleted}
                                className={`questions-top-bar__tick ${isQuestionCompleted(currentPaperQuestion.id) ? "questions-top-bar__tick--done" : ""}`}
                                aria-label={isQuestionCompleted(currentPaperQuestion.id) ? "Mark question incomplete" : "Mark question complete"}
                                title={isQuestionCompleted(currentPaperQuestion.id) ? "Mark incomplete" : "Mark complete"}
                            >
                                {isQuestionCompleted(currentPaperQuestion.id) ? (
                                    <LuCircleCheck size={18} strokeWidth={2.2} />
                                ) : (
                                    <LuCircle size={18} strokeWidth={1.8} />
                                )}
                            </button>
                            {paperQuestions.length > 0 && (
                                <span className="questions-top-bar__progress-pill">
                                    {completedForPaper.size}/{paperQuestions.length}
                                </span>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Sidebar: left or right depending on left-hand mode */}
            <div
                className={`absolute bottom-0 top-11 z-20 overflow-hidden pointer-events-auto transition-[width] duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] ${options.leftHandMode ? "left-0" : "right-0"} ${sidebarOpen ? "w-[35%]" : "w-12"}`}
            >
                <CollapsibleSidebar
                    side={options.leftHandMode ? "left" : "right"}
                    question={mode === "pastpaper"
                        ? (currentPaperQuestion && selectedPaper
                            ? {
                                id: `${selectedPaper.id}_${currentPaperQuestion.id}`,
                                _paperThread: true,
                                paperId: selectedPaper.id,
                                paperQuestionId: currentPaperQuestion.id,
                                questionName: currentPaperQuestion.questionName,
                                tags: currentPaperQuestion.tags,
                                paperLabel: selectedPaper.label,
                                subject: selectedPaper.subject,
                                level: selectedPaper.level,
                                indexInPaper: paperQuestionIndexInFullList,
                                storagePath: selectedPaper.storagePath,
                                pageRange: currentPaperQuestion.pageRange,
                                pageRegions: currentPaperQuestion.pageRegions,
                            }
                            : undefined)
                        : mode === "imagequestions"
                            ? (currentGroupedQuestion
                                ? {
                                    id: activeCanvasQuestionId ?? currentGroupedQuestion.key,
                                    properties: { name: currentGroupedQuestion.displayName },
                                    imageUrls: currentGroupedQuestion.images.map((img) => img.downloadUrl),
                                  }
                                : undefined)
                            : currentQuestion}
                    getDrawingSnapshot={getDrawingSnapshot}
                    getStaveAnalysis={getStaveAnalysis}
                    getPaperSnapshot={getPaperSnapshot}
                    open={sidebarOpen}
                    onOpenChange={(open) => {
                        setSidebarOpen(open);
                        if (!open) setMarkingSchemeQuestionIndex(null);
                    }}
                    openPanel={(mode === "pastpaper" || mode === "imagequestions") ? (sidebarOpenPanel ?? undefined) : undefined}
                    forceShowMarkingSchemeTab={mode === "imagequestions"}
                    onOpenPanelChange={(panel) => {
                        setSidebarOpenPanel(panel ?? null);
                        if (panel !== "markingscheme") setMarkingSchemeQuestionIndex(null);
                    }}
                    markingSchemeBlob={mode === "pastpaper" ? markingSchemeBlob : undefined}
                    markingSchemePageRange={mode === "pastpaper" ? questionForMarkingScheme?.markingSchemePageRange : undefined}
                    markingSchemeQuestionName={mode === "pastpaper" ? questionForMarkingScheme?.questionName : undefined}
                    aiInjectedExchange={aiInjectedExchange}
                    onMarkCompleteFromGrading={handleToggleQuestionCompleted}
                />
            </div>

            {/* Full-width scaled layout: top bar then question + PDF */}
            <div
                className="absolute inset-0 z-10 flex flex-col items-start pointer-events-none"
                style={{ transform: "scale(1)", transformOrigin: "0 0" }}
            >
            {/* Full-width top bar with underline – left: Hub/Laptop, center: question title, right: action buttons */}
            {(() => {
                const overrideTitle = mode === "pastpaper"
                    ? papersLoading
                        ? "Loading…"
                        : papersError
                            ? "Failed to load"
                            : filteredPaperQuestions.length > 0
                                ? filteredPaperQuestions[paperQuestionPosition - 1]?.questionName ?? ""
                                : selectedSubTopics.length > 0
                                    ? "Searching for matching paper…"
                                    : selectedPaper?.label ?? "Select a paper"
                    : mode === "imagequestions"
                        ? imageQuestionsLoading
                            ? "Loading…"
                            : currentGroupedQuestion?.displayName ?? "Select a topic"
                        : undefined;
                const centerLabel = overrideTitle ?? currentQuestion?.properties?.name ?? "...";
                const overrideTags = mode === "pastpaper" ? (currentPaperQuestion?.tags ?? []) : undefined;
                const imageTagsDisplay = mode === "imagequestions" && imageQuestionTopic
                    ? `${imageQuestionPosition + 1} / ${imageGroupedList.length}`
                    : undefined;
                const tagsDisplay = imageTagsDisplay ?? (overrideTags != null
                    ? formatTags(overrideTags)
                    : formatTags(currentQuestion?.properties?.tags));

                const onPrev = mode === "imagequestions"
                    ? () => {
                        if (imageQuestionPosition > 0) {
                            setImageQuestionPosition((p) => p - 1);
                        }
                    }
                    : mode === "pastpaper"
                    ? async () => {
                        if (filteredPaperQuestions.length > 0 && paperQuestionPosition > 1) {
                            setPaperQuestionPosition((p) => p - 1);
                            const prevQ = filteredPaperQuestions[paperQuestionPosition - 2];
                            setScrollToPage(prevQ?.pageRegions?.[0]?.page ?? prevQ?.pageRange?.[0] ?? null);
                        } else {
                            // Cross-paper: find previous paper with matching topics
                            const idx = selectedPaper ? scopedPapers.findIndex((p: ExamPaper) => p.storagePath === selectedPaper.storagePath) : -1;
                            if (idx <= 0) return;
                            if (selectedSubTopics.length === 0) {
                                setSelectedPaper(scopedPapers[idx - 1]);
                                return;
                            }
                            const result = await findPaperWithTopics(selectedSubTopics, idx - 1, "backward");
                            if (result) {
                                // Jump to last filtered question of that paper
                                pendingRandomRef.current = { questionId: result.filtered[result.filtered.length - 1].id };
                                setSelectedPaper(result.paper);
                            }
                        }
                    }
                    : previousQuestion;

                const onNext = mode === "imagequestions"
                    ? () => {
                        if (randomise && imageGroupedList.length > 1) {
                            let next = imageQuestionPosition;
                            while (next === imageQuestionPosition) {
                                next = Math.floor(Math.random() * imageGroupedList.length);
                            }
                            setImageQuestionPosition(next);
                        } else if (imageQuestionPosition < imageGroupedList.length - 1) {
                            setImageQuestionPosition((p) => p + 1);
                        }
                    }
                    : mode === "pastpaper"
                    ? async () => {
                        if (randomise) {
                            // Random: build a pool of scoped papers that have matching questions
                            const tagSet = selectedSubTopics.length > 0
                                ? new Set(selectedSubTopics.map((s) => normTag(s)))
                                : null;
                            if (scopedPapers.length === 0) return;

                            // Try up to 10 random scoped papers to find one with matching questions
                            const tried = new Set<string>();
                            for (let attempt = 0; attempt < Math.min(10, scopedPapers.length); attempt++) {
                                const randomPaper = scopedPapers[Math.floor(Math.random() * scopedPapers.length)];
                                if (tried.has(randomPaper.id)) continue;
                                tried.add(randomPaper.id);
                                const list = await getPaperQuestions(randomPaper);
                                if (list.length === 0) continue;
                                const filtered = tagSet
                                    ? list.filter((q) =>
                                        q.tags?.some((tag) => tagSet.has(normTag(String(tag))))
                                      )
                                    : list;
                                if (filtered.length === 0) continue;
                                const randomPos = 1 + Math.floor(Math.random() * filtered.length);
                                const q = filtered[randomPos - 1];
                                if (randomPaper.id === selectedPaper?.id) {
                                    setPaperQuestionPosition(randomPos);
                                    setScrollToPage(q?.pageRegions?.[0]?.page ?? q?.pageRange?.[0] ?? null);
                                } else {
                                    pendingRandomRef.current = { questionId: q.id };
                                    setSelectedPaper(randomPaper);
                                }
                                return;
                            }
                            // Fallback: scan scoped papers sequentially
                            const result = await findPaperWithTopics(selectedSubTopics, 0, "forward");
                            if (result) {
                                const rIdx = Math.floor(Math.random() * result.filtered.length);
                                pendingRandomRef.current = { questionId: result.filtered[rIdx].id };
                                setSelectedPaper(result.paper);
                            }
                        } else {
                            if (filteredPaperQuestions.length > 0 && paperQuestionPosition < filteredPaperQuestions.length) {
                                setPaperQuestionPosition((p) => p + 1);
                                const nextQ = filteredPaperQuestions[paperQuestionPosition];
                                setScrollToPage(nextQ?.pageRegions?.[0]?.page ?? nextQ?.pageRange?.[0] ?? null);
                            } else {
                                // Cross-paper: find next paper with matching topics
                                const idx = selectedPaper ? scopedPapers.findIndex((p: ExamPaper) => p.storagePath === selectedPaper.storagePath) : -1;
                                if (idx < 0 || idx >= scopedPapers.length - 1) {
                                    // Wrap around to first paper if at end
                                    if (selectedSubTopics.length > 0) {
                                        const result = await findPaperWithTopics(selectedSubTopics, 0, "forward");
                                        if (result) {
                                            pendingRandomRef.current = { questionId: result.filtered[0].id };
                                            setSelectedPaper(result.paper);
                                        }
                                    }
                                    return;
                                }
                                if (selectedSubTopics.length === 0) {
                                    setSelectedPaper(scopedPapers[idx + 1]);
                                    return;
                                }
                                const result =
                                    (await findPaperWithTopics(selectedSubTopics, idx + 1, "forward")) ??
                                    (await findPaperWithTopics(selectedSubTopics, 0, "forward")); // wrap
                                if (result) {
                                    pendingRandomRef.current = { questionId: result.filtered[0].id };
                                    setSelectedPaper(result.paper);
                                }
                            }
                        }
                    }
                    : nextQuestion;

                const hideTitleAndArrows = mode === "pastpaper" && isFullPaperExpanded;

                return (
                    <QuestionsTopBar
                        onBack={() => navigate("/practice")}
                        laptopMode={options.laptopMode}
                        onLaptopModeChange={() => setOptions((opts: any) => ({ ...opts, laptopMode: !opts.laptopMode }))}
                        mode={mode}
                        subjectFilter={subjectFilter}
                        onSubjectFilterChange={setSubjectFilter}
                        subjectOptions={certChampsSet?.sections?.map((sec) => ({ value: sec, label: formatSectionLabel(sec) })) ?? []}
                        showQuestionCompleteControl={true}
                        leftActionContent={
                            options.laptopMode ? (
                                <div className="relative">
                                    <button
                                        type="button"
                                        aria-label="Check my answer"
                                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium color-bg-accent color-txt-accent hover:opacity-85 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                                        onClick={handleCheckMyAnswer}
                                        disabled={!canCheckNow}
                                        title="Check my answer with AI"
                                    >
                                        <LuCircleCheck size={14} strokeWidth={2} />
                                        <span>{!canCheckNow ? gradingStatusLabel(gradingStatus) : "Check my answer"}</span>
                                    </button>
                                    {checkMyAnswerStatus && (
                                        <div className="absolute top-full mt-2 max-w-[280px] text-xs color-txt-sub bg-[var(--grey-5)]/90 rounded-md px-2 py-1 z-20 flex items-center gap-2">
                                            <span>{checkMyAnswerStatus}</span>
                                            {gradingStatus === "error" && (
                                                <button
                                                    type="button"
                                                    onClick={handleCheckMyAnswer}
                                                    className="text-[11px] font-semibold color-txt-accent hover:opacity-80"
                                                >
                                                    Retry
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ) : null
                        }
                        questionCompleted={mode === "pastpaper" && currentPaperQuestion ? isQuestionCompleted(currentPaperQuestion.id) : undefined}
                        onToggleQuestionCompleted={mode === "pastpaper" && selectedPaper && currentPaperQuestion ? handleToggleQuestionCompleted : undefined}
                        paperProgress={mode === "pastpaper" && paperQuestions.length > 0 ? {
                            completed: completedForPaper.size,
                            total: paperQuestions.length,
                        } : undefined}
                        centerContent={!hideTitleAndArrows ? (
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    aria-label={mode === "pastpaper" ? "Previous paper" : "Previous question"}
                                    className="questions-advance pointer-events-auto"
                                    onClick={onPrev}
                                >
                                    <LuChevronLeft size={16} strokeWidth={2.5} />
                                </button>
                                <div className="flex min-w-0 flex-col overflow-hidden px-2">
                                    <AnimatePresence mode="wait">
                                        <motion.div
                                            key={overrideTitle ?? currentQuestion?.id ?? "empty"}
                                            initial={{ opacity: 0, x: 8 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: -8 }}
                                            transition={{ duration: 0.15, ease: [0.25, 0.4, 0.25, 1] }}
                                            className="flex min-w-0 flex-col"
                                        >
                                            <h2 className="question-selector-title question-selector-truncate color-txt-accent text-sm font-bold leading-tight">
                                                {centerLabel}
                                            </h2>
                                            {tagsDisplay && (
                                                <p className="question-selector-truncate color-txt-sub mt-0.5 text-xs font-normal">
                                                    {tagsDisplay}
                                                </p>
                                            )}
                                        </motion.div>
                                    </AnimatePresence>
                                </div>
                                <button
                                    type="button"
                                    aria-label={mode === "pastpaper" ? "Next paper" : "Next question"}
                                    className="questions-advance pointer-events-auto"
                                    onClick={onNext}
                                >
                                    <LuChevronRight size={16} strokeWidth={2.5} />
                                </button>
                            </div>
                        ) : undefined}
                        rightContent={
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    aria-label={randomise ? "Random question (on)" : "Random question (off)"}
                                    className={`question-selector-button pointer-events-auto ${randomise ? "question-selector-button-active" : ""}`}
                                    onClick={() => setRandomise(!randomise)}
                                >
                                    <TbDice5 size={20} strokeWidth={1.8} />
                                    <span>randomize</span>
                                </button>
                                {mode === "imagequestions" ? (
                                    <TopicSwitcher
                                        topics={imageAllTopics}
                                        value={imageQuestionTopic}
                                        onChange={(t) => {
                                            setImageQuestionTopic(t);
                                            setImageQuestionPosition(0);
                                        }}
                                    />
                                ) : mode === "pastpaper" ? (
                                    <div ref={pastPaperFilterRef} className="practice-hub__topics-wrap relative">
                                        <button
                                            type="button"
                                            className="flex color-txt-sub font-bold py-0.5 px-2 items-center justify-center rounded-out color-bg-grey-5 gap-1 mx-2 cursor-pointer border-0 pointer-events-auto"
                                            onClick={() => setShowPastPaperFilter((o) => !o)}
                                            aria-expanded={showPastPaperFilter}
                                            aria-haspopup="dialog"
                                            aria-label="Filter questions by topic"
                                        >
                                            <span>Topics</span>
                                            <LuChevronDown size={16} className="color-txt-sub" aria-hidden />
                                        </button>
                                        <PastPaperFilterPanel
                                            asDropdown
                                            open={showPastPaperFilter}
                                            onClose={() => setShowPastPaperFilter(false)}
                                            selectedSubTopics={selectedSubTopics}
                                            topicScope={pastPaperTopicScope}
                                            onApply={async (subTopics) => {
                                                setSelectedSubTopics(subTopics);
                                                setShowPastPaperFilter(false);

                                                if (subTopics.length === 0) {
                                                    setPaperQuestionPosition(1);
                                                    if (paperQuestions.length > 0) {
                                                        const first = paperQuestions[0];
                                                        setScrollToPage(first?.pageRegions?.[0]?.page ?? first?.pageRange?.[0] ?? null);
                                                    }
                                                    return;
                                                }

                                                const tagSet = new Set(subTopics.map((s) => normTag(s)));
                                                const localFiltered = paperQuestions.filter((q) =>
                                                    q.tags?.some((tag) => tagSet.has(normTag(String(tag))))
                                                );

                                                if (localFiltered.length > 0) {
                                                    setPaperQuestionPosition(1);
                                                    const first = localFiltered[0];
                                                    setScrollToPage(first?.pageRegions?.[0]?.page ?? first?.pageRange?.[0] ?? null);
                                                } else {
                                                    const result = await findPaperWithTopics(subTopics, 0, "forward");
                                                    if (result) {
                                                        pendingRandomRef.current = { questionId: result.filtered[0].id };
                                                        setSelectedPaper(result.paper);
                                                    }
                                                }
                                            }}
                                        />
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        aria-label="Filter questions by topic"
                                        className={`question-selector-button pointer-events-auto ${Object.values(filters).some(v => v.length > 0) ? "question-selector-button-active" : ""}`}
                                        onClick={() => setShowFilter(true)}
                                    >
                                        <LuFilter size={18} strokeWidth={2} />
                                        <span>filter</span>
                                    </button>
                                )}
                                {mode !== "imagequestions" && (
                                    <button
                                        type="button"
                                        aria-label="Search questions"
                                        className="question-selector-button pointer-events-auto"
                                        onClick={() => setShowSearch(true)}
                                    >
                                        <LuSearch size={18} strokeWidth={2} />
                                        <span>search</span>
                                    </button>
                                )}
                            </div>
                        }
                    />
                );
            })()}

            {/* Foreground: content block then PDF/image underneath */}
            <div className={`relative flex min-h-0 flex-1 w-full ${options.laptopMode && (mode === "pastpaper" || mode === "imagequestions") ? "flex-col" : "flex-col gap-4 items-start"}`}>
                {/* Math preview for certchamps mode */}
                {mode === "certchamps" && (
                    <div className={`questions-top-left shrink-0 flex flex-col gap-2 max-w-sm w-[35%] min-w-xs pointer-events-auto ${
                        options.leftHandMode ? "pt-4 pr-4 self-end" : "pt-4 pl-4"
                    }`}>
                        <RenderMath text={currentQuestion?.content?.[0]?.question ?? "ughhhh no question"} className="questions-math-preview font-bold text-sm txt" />
                    </div>
                )}

                {/* Image viewer for imagequestions mode */}
                {mode === "imagequestions" && (() => {
                    const snippetWidth = options.laptopMode
                        ? Math.min(800, viewportWidth - 200)
                        : Math.min(400, viewportWidth * 0.35);

                    const renderImageContent = () => {
                        if (imageQuestionsLoading) {
                            return (
                                <div className="flex h-full min-h-[200px] flex-col items-center justify-center px-4 text-center">
                                    <p className="color-txt-sub text-sm">Loading questions...</p>
                                    <div className="mt-2 h-8 w-8 animate-spin rounded-full border-2 border-[var(--grey-10)] border-t-[var(--grey-5)]" />
                                </div>
                            );
                        }
                        if (imageGroupedList.length === 0) {
                            return (
                                <div className="flex h-full min-h-[200px] flex-col items-center justify-center px-4 text-center">
                                    <p className="color-txt-sub text-sm">No questions found for this topic.</p>
                                </div>
                            );
                        }
                        if (!currentGroupedQuestion) {
                            return (
                                <div className="flex h-full min-h-[200px] flex-col items-center justify-center px-4 text-center">
                                    <p className="color-txt-sub text-sm">Select a question.</p>
                                </div>
                            );
                        }

                        const imageActionButtons = (
                            <>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowComingSoonToast(true);
                                        setTimeout(() => setShowComingSoonToast(false), 2000);
                                    }}
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium color-bg-grey-5 color-txt-sub opacity-60 cursor-pointer transition-all"
                                    title="Full paper view coming soon"
                                    aria-label="Full paper (coming soon)"
                                >
                                    <LuMaximize2 size={14} strokeWidth={2} />
                                    <span>Full paper</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowCalculator(true)}
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium color-bg-grey-5 color-txt-sub hover:color-txt-main hover:color-bg-grey-10 transition-all cursor-pointer"
                                    title="Calculator"
                                    aria-label="Calculator"
                                >
                                    <LuCalculator size={14} strokeWidth={2} />
                                    <span>Calculator</span>
                                </button>
                            </>
                        );

                        return (
                            <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
                                {showComingSoonToast && (
                                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-lg color-bg-grey-5 color-txt-sub text-sm font-medium shadow-lg">
                                        Coming soon
                                    </div>
                                )}
                                {typeof document !== "undefined" &&
                                    createPortal(
                                        <div
                                            className={`fixed z-[25] flex flex-row gap-2 items-center py-3 pointer-events-auto bg-transparent ${options.leftHandMode ? "justify-end right-2" : "justify-start"}`}
                                            style={{
                                                bottom: "max(0.5rem, var(--safe-area-bottom, env(safe-area-inset-bottom, 0px)))",
                                                left: options.leftHandMode ? undefined : `${navbarActionOffsetPx}px`,
                                            }}
                                        >
                                            {imageActionButtons}
                                        </div>,
                                        document.body
                                    )}
                                <div className="flex-1 min-h-0 relative pt-4 pb-14">
                                    <div className="flex flex-col overflow-y-auto overflow-x-hidden scrollbar-minimal h-full py-2 items-center">
                                        <div className="flex flex-col items-center w-full" style={{ maxWidth: snippetWidth }}>
                                            {currentGroupedQuestion.images.map((img, idx) => (
                                                <img
                                                    key={img.storagePath}
                                                    src={img.downloadUrl}
                                                    alt={idx === 0 ? currentGroupedQuestion.displayName : `${currentGroupedQuestion.displayName} part ${idx + 1}`}
                                                    className="w-full h-auto"
                                                    style={{ objectFit: "contain", display: "block" }}
                                                    draggable={false}
                                                />
                                            ))}
                                        </div>
                                        <div className="pt-4 flex justify-center w-full" style={{ maxWidth: snippetWidth }}>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setSidebarOpen(true);
                                                    setSidebarOpenPanel("markingscheme");
                                                }}
                                                className="w-full py-4 px-6 rounded-2xl text-base font-medium color-bg-grey-5 color-txt-sub hover:color-bg-grey-10 transition-all duration-200 cursor-pointer flex items-center justify-center gap-2"
                                                aria-label="Reveal marking scheme"
                                            >
                                                <LuClipboardList size={20} strokeWidth={2} />
                                                Reveal marking scheme
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    };

                    return options.laptopMode ? (
                        <div className="absolute inset-0 flex w-full min-h-0 justify-center items-start pointer-events-auto">
                            <div className="practice-paper-fly-in flex h-full min-h-0 w-full shrink-0 flex-col overflow-hidden pointer-events-auto max-w-[920px]">
                                <div className="min-h-0 min-w-0 flex-1 flex flex-col overflow-hidden pt-2 px-2 pb-0">
                                    {renderImageContent()}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className={`flex flex-1 min-h-0 w-full max-w-sm shrink-0 flex-col overflow-hidden pointer-events-auto ${options.leftHandMode ? "ml-auto" : ""}`}>
                            <div className="min-h-0 min-w-0 flex-1 flex flex-col overflow-hidden p-2">
                                {renderImageContent()}
                            </div>
                        </div>
                    );
                })()}

                {/* PDF panel: viewer when past paper mode; snippet (pageRegions) or full paper with expand/collapse. */}
                {mode === "pastpaper" && (
                    (() => {
                        const hasPageRegions = currentPaperQuestion?.pageRegions && currentPaperQuestion.pageRegions.length > 0;
                        const showSnippetView = hasPageRegions && !isFullPaperExpanded;

                        const handleExpandToggle = () => {
                            if (isFullPaperExpanded) {
                                setIsFullPaperExpanded(false);
                            } else {
                                const q = currentPaperQuestion ?? filteredPaperQuestions[0] ?? paperQuestions[0];
                                const firstPage = q?.pageRegions?.[0]?.page ?? q?.pageRange?.[0] ?? 1;
                                setScrollToPage(firstPage);
                                setIsFullPaperExpanded(true);
                            }
                        };

                        const renderPdfContent = () => {
                            if (paperLoadError) {
                                return (
                                    <div className="shrink-0 py-2 text-sm color-txt-sub">
                                        {paperLoadError}
                                    </div>
                                );
                            }
                            if (!paperBlob) {
                                if (selectedPaper && !paperLoadError) {
                                    return (
                                        <div className="flex h-full min-h-[200px] flex-col items-center justify-center px-4 text-center">
                                            <p className="color-txt-sub text-sm">Loading paper…</p>
                                        </div>
                                    );
                                }
                                return (
                                    <div className="flex h-full min-h-[200px] flex-col items-center justify-center px-4 text-center">
                                        <p className="color-txt-sub text-sm">Select a paper to view.</p>
                                    </div>
                                );
                            }
                            // When hasPageRegions we preload full paper off-screen, so view "uses" Document whenever we might show it
                            const viewUsesDocument = !hasPageRegions || isFullPaperExpanded;
                            const fullPaperPreloaded = !hasPageRegions || paperDocumentLoaded;
                            const showPdfLoadingOverlay =
                                (!viewUsesDocument ? false : !fullPaperPreloaded) || !logTablesPreloaded;

                            const paperActionButtons = (
                                <>
                                    {hasPageRegions && (
                                        <button
                                            type="button"
                                            onClick={handleExpandToggle}
                                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium color-bg-grey-5 color-txt-sub hover:color-txt-main hover:color-bg-grey-10 transition-all cursor-pointer"
                                            aria-label={isFullPaperExpanded ? "Show question only" : "Expand to full paper"}
                                            title={isFullPaperExpanded ? "Show question only" : "Expand to full paper"}
                                        >
                                            {isFullPaperExpanded ? (
                                                <>
                                                    <LuMinimize2 size={14} strokeWidth={2} />
                                                    <span>Question only</span>
                                                </>
                                            ) : (
                                                <>
                                                    <LuMaximize2 size={14} strokeWidth={2} />
                                                    <span>Full paper</span>
                                                </>
                                            )}
                                        </button>
                                    )}
                                    {currentPaperQuestion && (
                                        <button
                                            type="button"
                                            data-tutorial-id="sidebar-logtables"
                                            onClick={() => {
                                                setLogTablesQuestionIndex(paperQuestionIndexInFullList >= 0 ? paperQuestionIndexInFullList : 0);
                                                setShowLogTables(true);
                                            }}
                                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium color-bg-grey-5 color-txt-sub hover:color-txt-main hover:color-bg-grey-10 transition-all cursor-pointer"
                                            title="Log tables"
                                            aria-label="Log tables"
                                        >
                                            <LuBookOpen size={14} strokeWidth={2} />
                                            <span>Log tables</span>
                                        </button>
                                    )}
                                    {currentPaperQuestion && (
                                        <button
                                            type="button"
                                            onClick={() => setShowCalculator(true)}
                                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium color-bg-grey-5 color-txt-sub hover:color-txt-main hover:color-bg-grey-10 transition-all cursor-pointer"
                                            title="Calculator"
                                            aria-label="Calculator"
                                        >
                                            <LuCalculator size={14} strokeWidth={2} />
                                            <span>Calculator</span>
                                        </button>
                                    )}
                                </>
                            );

                            return (
                                <div className="relative flex-1 min-h-0  flex flex-col overflow-hidden">
                                    {showPdfLoadingOverlay && (
                                        <div
                                            className="absolute inset-0 z-30 flex flex-col items-center justify-center color-bg opacity-95"
                                            aria-busy="true"
                                            aria-live="polite"
                                        >
                                            <div className="color-txt-sub text-sm font-medium">Loading PDF…</div>
                                            <div className="mt-2 h-8 w-8 animate-spin rounded-full border-2 border-[var(--grey-10)] border-t-[var(--grey-5)]" />
                                        </div>
                                    )}
                                    {(hasPageRegions || currentPaperQuestion) &&
                                        typeof document !== "undefined" &&
                                        createPortal(
                                            <div
                                                className={`fixed z-[25] flex flex-row gap-2 items-center py-3 pointer-events-auto bg-transparent ${options.leftHandMode ? "justify-end right-2" : "justify-start"}`}
                                                style={{
                                                        bottom: "max(0.5rem, var(--safe-area-bottom, env(safe-area-inset-bottom, 0px)))",
                                                    left: options.leftHandMode ? undefined : `${navbarActionOffsetPx}px`,
                                                }}
                                            >
                                                {paperActionButtons}
                                            </div>,
                                            document.body
                                        )}
                                    <div className="flex-1 min-h-0 relative pt-4 pb-14">
                                        {hasPageRegions ? (
                                            <>
                                                <motion.div
                                                    className="absolute inset-0 flex flex-col overflow-hidden"
                                                    initial={false}
                                                    animate={{
                                                        opacity: showSnippetView ? 1 : 0,
                                                        pointerEvents: showSnippetView ? "auto" : "none",
                                                        visibility: showSnippetView ? "visible" : "hidden",
                                                    }}
                                                    transition={{ duration: 0.2, ease: [0.25, 0.4, 0.25, 1] }}
                                                >
                                                    <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-y-auto scrollbar-minimal py-2 pr-2 items-center">
                                                        <CroppedPdfRegions
                                                            file={paperBlob}
                                                            regions={currentPaperQuestion!.pageRegions!.map((r) => ({
                                                                page: r.page,
                                                                x: r.x ?? 0,
                                                                y: r.y ?? 0,
                                                                width: r.width ?? 595,
                                                                height: r.height ?? 150,
                                                            }))}
                                                            pageWidth={snippetWidth}
                                                        />
                                                        {markingSchemeBlob && currentPaperQuestion?.markingSchemePageRange && (
                                                            <div className="pt-2 flex justify-center" style={{ width: snippetWidth }}>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setMarkingSchemeQuestionIndex(paperQuestionIndexInFullList >= 0 ? paperQuestionIndexInFullList : 0);
                                                                        setSidebarOpen(true);
                                                                        setSidebarOpenPanel("markingscheme");
                                                                    }}
                                                                    className="w-full py-4 px-6 rounded-2xl text-base font-medium color-bg-grey-5 color-txt-main hover:color-bg-grey-10 transition-all duration-200 cursor-pointer  flex items-center justify-center gap-2"
                                                                    aria-label="Reveal marking scheme"
                                                                >
                                                                    <LuClipboardList size={20} strokeWidth={2} />
                                                                    Reveal marking scheme
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </motion.div>
                                                {/* Full paper: PDF viewbox (left) + panels (right); wrapped and centered */}
                                                {(() => {
                                                    const panelWidthPx = 176;
                                                    const isTablet = !options.laptopMode;
                                                    const fullPaperTotalWidth = isTablet ? snippetWidth : snippetWidth + panelWidthPx;
                                                    const lineEl = (
                                                        <div
                                                            className="w-full border-t border-dashed pointer-events-none color-shadow shrink-0"
                                                            style={{ borderColor: "#DADADA" }}
                                                            aria-hidden
                                                        />
                                                    );
                                                    return (
                                                <div
                                                    className="overflow-hidden"
                                                    style={{
                                                        position: "absolute",
                                                        ...(isFullPaperExpanded
                                                            ? { inset: 0, zIndex: 1, pointerEvents: "auto", display: "flex", justifyContent: "center", alignItems: "stretch" }
                                                            : {
                                                                  left: "-9999px",
                                                                  top: 0,
                                                                  width: "auto",
                                                                  height: "100%",
                                                                  pointerEvents: "none",
                                                              }),
                                                    }}
                                                >
                                                    <div
                                                        className={`flex shrink-0 min-h-0 overflow-hidden ${!isTablet && options.leftHandMode ? "flex-row-reverse" : !isTablet ? "flex-row" : ""}`}
                                                        style={{
                                                            width: fullPaperTotalWidth,
                                                            maxWidth: "100%",
                                                        }}
                                                    >
                                                    <div
                                                        className="shrink-0 min-h-0 overflow-hidden flex flex-col"
                                                        style={{ width: snippetWidth }}
                                                    >
                                                        <PaperPdfPlaceholder
                                                            file={paperBlob}
                                                            pageWidth={snippetWidth}
                                                            onCurrentPageChange={setCurrentPaperPage}
                                                            scrollToPage={scrollToPage ?? undefined}
                                                            onScrolledToPage={() => setScrollToPage(null)}
                                                            onDocumentLoadSuccess={() => setPaperDocumentLoaded(true)}
                                                            onNumPages={setPaperNumPages}
                                                            scrollContainerRef={paperScrollRef}
                                                            overlayNodes={
                                                                paperQuestions.length > 0
                                                                    ? paperQuestions.map((q, i) => {
                                                                          if (isTablet) {
                                                                              const panelEl = (
                                                                                  <div key={q.id} className="flex justify-end pointer-events-auto w-full">
                                                                                      <PaperQuestionRegionPanel
                                                                                          question={q}
                                                                                          index={i}
                                                                                          paperLabel={selectedPaper?.label}
                                                                                          onGoToQuestion={() => {
                                                                                              const filteredIdx = filteredPaperQuestions.findIndex((fq) => fq.id === q.id);
                                                                                              setPaperQuestionPosition(filteredIdx >= 0 ? filteredIdx + 1 : 1);
                                                                                              setMarkingSchemeQuestionIndex(i);
                                                                                              setIsFullPaperExpanded(false);
                                                                                          }}
                                                                                          hasMarkingScheme={!!(markingSchemeBlob && q.markingSchemePageRange)}
                                                                                          onOpenMarkingScheme={() => {
                                                                                              setMarkingSchemeQuestionIndex(i);
                                                                                              setSidebarOpen(true);
                                                                                              setSidebarOpenPanel("markingscheme");
                                                                                          }}
                                                                                          onOpenLogTables={() => {
                                                                                              setLogTablesQuestionIndex(i);
                                                                                              setShowLogTables(true);
                                                                                          }}
                                                                                          compact
                                                                                      />
                                                                                  </div>
                                                                              );
                                                                              return {
                                                                                  topPx: getQuestionScrollOffset(snippetWidth, q),
                                                                                  content: (
                                                                                      <div className="w-full flex flex-col pointer-events-none">
                                                                                          {lineEl}
                                                                                          {panelEl}
                                                                                      </div>
                                                                                  ),
                                                                              };
                                                                          }
                                                                          return {
                                                                              topPx: getQuestionScrollOffset(snippetWidth, q),
                                                                              content: lineEl,
                                                                          };
                                                                      })
                                                                    : undefined
                                                            }
                                                        />
                                                    </div>
                                                    {isFullPaperExpanded && paperQuestions.length > 0 && paperContentHeightPx > 0 && options.laptopMode && (
                                                        <div
                                                            ref={panelsScrollRef}
                                                            className="shrink-0 min-h-0 overflow-y-auto scrollbar-minimal"
                                                            style={{ width: panelWidthPx }}
                                                        >
                                                            <div
                                                                className="relative w-full"
                                                                style={{ minHeight: paperContentHeightPx }}
                                                            >
                                                                {paperQuestions.map((q, i) => (
                                                                    <div
                                                                        key={q.id}
                                                                        className="absolute left-0 right-0"
                                                                        style={{
                                                                            top: getQuestionScrollOffset(snippetWidth, q),
                                                                        }}
                                                                    >
                                                                        <PaperQuestionRegionPanel
                                                                            question={q}
                                                                            index={i}
                                                                            paperLabel={selectedPaper?.label}
                                                                            onGoToQuestion={() => {
                                                                                const filteredIdx = filteredPaperQuestions.findIndex((fq) => fq.id === q.id);
                                                                                setPaperQuestionPosition(filteredIdx >= 0 ? filteredIdx + 1 : 1);
                                                                                setMarkingSchemeQuestionIndex(i);
                                                                                setIsFullPaperExpanded(false);
                                                                            }}
                                                                            hasMarkingScheme={!!(markingSchemeBlob && q.markingSchemePageRange)}
                                                                            onOpenMarkingScheme={() => {
                                                                                setMarkingSchemeQuestionIndex(i);
                                                                                setSidebarOpen(true);
                                                                                setSidebarOpenPanel("markingscheme");
                                                                            }}
                                                                            onOpenLogTables={() => {
                                                                                setLogTablesQuestionIndex(i);
                                                                                setShowLogTables(true);
                                                                            }}
                                                                        />
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                    </div>
                                                </div>
                                                    );
                                                })()}
                                            </>
                                        ) : (
                                            <PaperPdfPlaceholder
                                                file={paperBlob}
                                                pageWidth={snippetWidth}
                                                onCurrentPageChange={setCurrentPaperPage}
                                                scrollToPage={scrollToPage ?? undefined}
                                                onScrolledToPage={() => setScrollToPage(null)}
                                                onDocumentLoadSuccess={() => setPaperDocumentLoaded(true)}
                                                scrollContainerRef={paperScrollRef}
                                            />
                                        )}
                                    </div>
                                </div>
                            );
                        };

                        return options.laptopMode ? (
                            <div className="absolute inset-0 flex w-full min-h-0 justify-center items-start pointer-events-auto">
                                <div
                                    className={`practice-paper-fly-in flex h-full min-h-0 w-full shrink-0 flex-col overflow-hidden pointer-events-auto ${
                                        mode === "pastpaper" ? "max-w-[920px]" : "max-w-[720px]"
                                    }`}
                                >
                                    <div className="min-h-0 min-w-0 flex-1 flex flex-col overflow-hidden pt-2 px-2 pb-0">
                                        {renderPdfContent()}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className={`flex flex-1 min-h-0 w-full max-w-sm shrink-0 flex-col overflow-hidden pointer-events-auto ${options.leftHandMode ? "ml-auto" : ""}`}>
                                <div className="min-h-0 min-w-0 flex-1 flex flex-col overflow-hidden p-2">
                                    {renderPdfContent()}
                                </div>
                            </div>
                        );
                    })()
                )}
            </div>

            {/* Floating log tables — rendered via portal */}
            {showLogTables &&
                typeof document !== "undefined" &&
                createPortal(
                    <FloatingLogTables
                        pgNumber={
                            mode === "certchamps"
                                ? String(currentQuestion?.content?.[0]?.logtables ?? "1")
                                : String(questionForLogTables?.log_table_page ?? "1")
                        }
                        onClose={() => {
                            setShowLogTables(false);
                            setLogTablesQuestionIndex(null);
                        }}
                        file={logTablesBlob}
                    />,
                    document.body
                )}

            {/* Floating calculator — rendered via portal */}
            {showCalculator &&
                typeof document !== "undefined" &&
                createPortal(
                    <FloatingCalculator onClose={() => setShowCalculator(false)} />,
                    document.body
                )}

            {showFilter && mode !== "pastpaper" &&
                typeof document !== "undefined" &&
                createPortal(
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-black/50" onClick={() => setShowFilter(false)} aria-hidden="true" />
                        <div className="relative z-10 w-full max-w-md h-[80vh]">
                            <Filter
                                onApply={(tags, paths) => {
                                    setFilters(tags);
                                    if (paths.length > 0) setCollectionPaths(paths);
                                    setQuestions([]);
                                    setPosition(0);
                                    setShowFilter(false);
                                }}
                                onClose={() => setShowFilter(false)}
                            />
                        </div>
                    </div>,
                    document.body
                )}

            {showSearch &&
                typeof document !== "undefined" &&
                createPortal(
                    mode === "pastpaper" ? (
                        <QSearch
                            mode="pastpaper"
                            setShowSearch={setShowSearch}
                            papers={scopedPapers}
                            getPaperQuestions={getPaperQuestions}
                            onSelectPaperQuestion={(paper, indexInPaper) => {
                                pendingSearchRef.current = { indexInPaper };
                                setSelectedPaper(paper);
                            }}
                        />
                    ) : (
                        <QSearch
                            mode="certchamps"
                            setShowSearch={setShowSearch}
                            questions={questions}
                            position={position}
                            setPosition={setPosition}
                            collectionPaths={collectionPaths}
                        />
                    ),
                    document.body
                )}

            </div>
            {/*===============================================================================================*/}

            {/* Paper pro gate: when non-pro loads a locked past paper */}
            {mode === "pastpaper" && selectedPaper && !user?.isPro && !isPaperFree(selectedPaper) && (
                <PaperProGate firstFreePaper={firstFreePaper} />
            )}
        </div>
        <TimerFloatingWidget leftHandMode={options.leftHandMode} />
        </TimerProvider>
    )
}

 