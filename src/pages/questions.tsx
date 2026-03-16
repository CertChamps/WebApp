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

// Components
import { createPortal } from "react-dom";
import { LuMaximize2, LuMinimize2, LuX, LuClipboardList, LuBookOpen, LuCalculator, LuChevronLeft, LuChevronRight, LuChevronDown, LuFilter, LuSearch, LuCircleCheck } from "react-icons/lu";
import { TbDice5 } from "react-icons/tb";
import QuestionsTopBar from "../components/questions/QuestionsTopBar";
import QSearch from "../components/questions/qSearch";
import DrawingCanvas, { type RegisterDrawingSnapshot, type RegisterGetLineCount, type WhiteboardFeedbackOverlay, type WhiteboardRelevantRegion } from "../components/questions/DrawingCanvas";
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

// Style Imports
import "../styles/questions.css";
import "../styles/navbar.css";
import "../styles/sidebar.css";

const QUESTIONS_MODE_KEY = "questions-page-mode";
const CHAT_API_URL = "https://us-central1-certchamps-a7527.cloudfunctions.net/chat";
const WHITEBOARD_REGION_SYSTEM_PROMPT = "You are identifying the region of a student's whiteboard that contains the answer relevant to the question. Ignore side notes, rough work, labels, doodles, sketches, margin annotations, or anything clearly not part of the answer being graded. Return JSON only in the shape {\"x\":number,\"y\":number,\"width\":number,\"height\":number} in canvas coordinates with origin at the top-left of the visible whiteboard canvas. If there is no clearly relevant region, return null.";
const CHECK_MY_ANSWER_SYSTEM_PROMPT = "You are a teacher grading a student's whiteboard answer for Leaving Cert exam style marking. Rules: (1) If the whiteboard is blank or completely irrelevant, refuse to grade. (2) For text-only answers: if correct say \"That's correct! Good job.\" — if incorrect say \"Not quite, you made some small mistakes here:\" then a concise bullet list of errors, no solutions. (3) For whiteboard answers: the user message tells you the exact number of lines. Output EXACTLY that many lines of feedback, one per canvas line, top to bottom — no more, no fewer. Every relevant graded line MUST include a useful short comment. If a line earns marks, prefix the line with \u2713 and then a specific comment about why that step is good (never output a bare \u2713). If a line loses marks, write a short plain-English comment stating what is wrong on that line (no LaTeX, no solutions, no restating the student's work). (4) Do NOT deduct marks for handwriting neatness, formatting style, wording style, or minor consistency/presentation issues unless they change mathematical correctness or method. Use a single period . only for lines that are clearly irrelevant notes/scribbles and should not be graded. At the end output the total mark as X/Y on its own line.";

export type QuestionsMode = "certchamps" | "pastpaper";

const MODE_TO_PATHS: Record<QuestionsMode, string[]> = {
  certchamps: ["questions/certchamps"],
  pastpaper: ["questions/exam-papers"],
};

function getPathsForMode(mode: QuestionsMode, subject?: string | null): string[] {
  if (mode === "certchamps" && subject) {
    return [`questions/certchamps/${subject}`];
  }
  return MODE_TO_PATHS[mode];
}

function getStoredMode(): QuestionsMode {
  try {
    const s = localStorage.getItem(QUESTIONS_MODE_KEY);
    if (s === "certchamps" || s === "pastpaper") return s;
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

function clampToRange(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function normaliseRelevantRegion(input: unknown, metrics: { width: number; height: number } | null): WhiteboardRelevantRegion | null {
    if (!input || typeof input !== "object" || !metrics) return null;
    const candidate = input as Record<string, unknown>;
    const x = Number(candidate.x);
    const y = Number(candidate.y);
    const width = Number(candidate.width);
    const height = Number(candidate.height);
    if ([x, y, width, height].every(Number.isFinite)) {
        const region = {
            x: clampToRange(x, 0, metrics.width),
            y: clampToRange(y, 0, metrics.height),
            width: clampToRange(width, 0, metrics.width),
            height: clampToRange(height, 0, metrics.height),
        };
        if (region.width < 12 || region.height < 12) return null;
        if (region.x + region.width > metrics.width) region.width = Math.max(0, metrics.width - region.x);
        if (region.y + region.height > metrics.height) region.height = Math.max(0, metrics.height - region.y);
        return region.width >= 12 && region.height >= 12 ? region : null;
    }

    // Backward compatibility for any older left/top/right/bottom responses.
    const left = Number(candidate.left);
    const top = Number(candidate.top);
    const right = Number(candidate.right);
    const bottom = Number(candidate.bottom);
    if (![left, top, right, bottom].every(Number.isFinite)) return null;
    const useNormalised = left >= 0 && right <= 1 && top >= 0 && bottom <= 1;
    const region = useNormalised
        ? {
            x: left * metrics.width,
            y: top * metrics.height,
            width: Math.max(0, (right - left) * metrics.width),
            height: Math.max(0, (bottom - top) * metrics.height),
        }
        : {
            x: left,
            y: top,
            width: Math.max(0, right - left),
            height: Math.max(0, bottom - top),
        };
    return normaliseRelevantRegion(region, metrics);
}

function parseRelevantRegionResponse(raw: string, metrics: { width: number; height: number } | null): WhiteboardRelevantRegion | null {
    const trimmed = raw.trim();
    if (!trimmed || /^null$/i.test(trimmed)) return null;

    const candidates = [trimmed];
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    if (fenced) candidates.push(fenced.trim());
    const objectLiteral = trimmed.match(/\{[\s\S]*\}/)?.[0];
    if (objectLiteral) candidates.push(objectLiteral);

    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate);
            const normalised = normaliseRelevantRegion(parsed, metrics);
            if (normalised) return normalised;
            if (parsed === null) return null;
        } catch {
            // Keep trying other candidate extractions.
        }
    }

    return null;
}

function expandRelevantRegion(region: WhiteboardRelevantRegion, metrics: { width: number; height: number }, padding = 18): WhiteboardRelevantRegion {
    const x = Math.max(0, region.x - padding);
    const y = Math.max(0, region.y - padding);
    const right = Math.min(metrics.width, region.x + region.width + padding);
    const bottom = Math.min(metrics.height, region.y + region.height + padding);
    return {
        x,
        y,
        width: Math.max(1, right - x),
        height: Math.max(1, bottom - y),
    };
}

async function cropSnapshotToRelevantRegion(dataUrl: string, region: WhiteboardRelevantRegion | null, metrics: { width: number; height: number } | null): Promise<string> {
    if (!region || !metrics) return dataUrl;

    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Failed to load whiteboard snapshot for cropping."));
        img.src = dataUrl;
    });

    const scaleX = image.width / metrics.width;
    const scaleY = image.height / metrics.height;
    const sx = Math.max(0, Math.floor(region.x * scaleX));
    const sy = Math.max(0, Math.floor(region.y * scaleY));
    const sw = Math.max(1, Math.ceil(region.width * scaleX));
    const sh = Math.max(1, Math.ceil(region.height * scaleY));

    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
    return canvas.toDataURL("image/png");
}

function renderSnapshotFromStoredStrokes(strokes: any[]): string | null {
    if (!Array.isArray(strokes) || strokes.length === 0) return null;

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const stroke of strokes) {
        if (!stroke || !Array.isArray(stroke.points) || stroke.points.length === 0) continue;
        for (const point of stroke.points) {
            const x = Number(point?.x);
            const y = Number(point?.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return null;

    const padding = 24;
    const width = Math.max(1, Math.ceil(maxX - minX + padding * 2));
    const height = Math.max(1, Math.ceil(maxY - minY + padding * 2));
    const offsetX = padding - minX;
    const offsetY = padding - minY;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#111827";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const stroke of strokes) {
        if (!stroke || stroke.tool !== "pen" || !Array.isArray(stroke.points) || stroke.points.length < 2) continue;
        for (let i = 0; i < stroke.points.length - 1; i += 1) {
            const p0 = stroke.points[i];
            const p1 = stroke.points[i + 1];
            const x0 = Number(p0?.x);
            const y0 = Number(p0?.y);
            const x1 = Number(p1?.x);
            const y1 = Number(p1?.y);
            if (![x0, y0, x1, y1].every(Number.isFinite)) continue;
            const pressure = Number.isFinite(p0?.pressure) ? p0.pressure : 1;
            ctx.lineWidth = 2.2 * (Math.max(0.3, pressure) + 0.5);
            ctx.beginPath();
            ctx.moveTo(x0 + offsetX, y0 + offsetY);
            ctx.lineTo(x1 + offsetX, y1 + offsetY);
            ctx.stroke();
        }
    }

    return canvas.toDataURL("image/png");
}

function buildWhiteboardOverlay(raw: string, relevantRegion: WhiteboardRelevantRegion | null = null): WhiteboardFeedbackOverlay {
    const rows = raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    const items: WhiteboardFeedbackOverlay["items"] = [];
    let finalMark: string | undefined;
    let lineIndex = 0;

    for (const row of rows) {
        const cleaned = row.replace(/^[-*]\s*/, "").trim();
        if (!cleaned) continue;
        const lower = cleaned.toLowerCase();
        if (lower.includes("mark allocation") || /\btotal\b/.test(lower) || /\b\d+\s*\/\s*\d+\b/.test(cleaned)) {
            finalMark = cleaned;
            continue;
        }
        // A line with ✓ is treated as a tick; any remaining text on the same line is kept as comment.
        if (/\u2713/.test(cleaned)) {
            items.push({ kind: "tick", lineIndex, text: "\u2713" });
            const tickComment = cleaned
                .replace(/^\u2713\s*/, "")
                .replace(/\u2713/g, "")
                .replace(/^comment:\s*/i, "")
                .replace(/\$\$[\s\S]*?\$\$/g, "")
                .replace(/\$[^$]*\$/g, "")
                .replace(/\\[()\[\]]/g, "")
                .trim();
            if (tickComment && tickComment !== ".") {
                items.push({ kind: "comment", lineIndex, text: tickComment });
            } else {
                items.push({ kind: "comment", lineIndex, text: "Good step: method is correct here." });
            }
            lineIndex += 1;
            continue;
        }

        // A lone period (.) means annotation/note — counts as a line but no tick or comment.
        if (cleaned === ".") {
            lineIndex += 1;
            continue;
        }
        const commentText = cleaned
            .replace(/^\u2717\s*/, "")
            .replace(/^comment:\s*/i, "")
            .replace(/\u2713/g, "")
            .replace(/\$\$[\s\S]*?\$\$/g, "")
            .replace(/\$[^$]*\$/g, "")
            .replace(/\\[()\[\]]/g, "")
            .trim();
        if (!commentText) {
            items.push({ kind: "comment", lineIndex, text: "Check this line carefully: there is an accuracy issue to fix." });
            lineIndex += 1;
            continue;
        }
        items.push({ kind: "comment", lineIndex, text: commentText });
        lineIndex += 1;
    }

    if (items.length === 0 && !finalMark) {
        if (raw.includes("That's correct! Good job.")) {
            items.push({ kind: "tick", lineIndex: 0, text: "\u2713" });
        } else {
            items.push({ kind: "comment", lineIndex: 0, text: raw.trim() || "No gradable working found." });
        }
    }

    return {
        runId: `${Date.now()}`,
        items,
        relevantRegion,
        finalMark,
    };
}

function buildWhiteboardChatSummary(raw: string, overlay: WhiteboardFeedbackOverlay): string {
    const rows = raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    const lineSummaries: Array<{ lineIndex: number; isTick: boolean; comment: string }> = [];
    let lineIndex = 0;

    for (const row of rows) {
        const cleaned = row.replace(/^[-*]\s*/, "").trim();
        if (!cleaned) continue;

        const lower = cleaned.toLowerCase();
        if (lower.includes("mark allocation") || /\btotal\b/.test(lower) || /\b\d+\s*\/\s*\d+\b/.test(cleaned)) {
            continue;
        }

        if (cleaned === ".") {
            lineIndex += 1;
            continue;
        }

        const isTick = /\u2713/.test(cleaned);
        const comment = cleaned
            .replace(/^\u2713\s*/, "")
            .replace(/^\u2717\s*/, "")
            .replace(/^comment:\s*/i, "")
            .replace(/\u2713/g, "")
            .replace(/\$\$[\s\S]*?\$\$/g, "")
            .replace(/\$[^$]*\$/g, "")
            .replace(/\\[()\[\]]/g, "")
            .trim();

        lineSummaries.push({ lineIndex, isTick, comment });
        lineIndex += 1;
    }

    const gradedLines = lineSummaries.length;
    const tickLines = lineSummaries.filter((line) => line.isTick).length;
    const firstIssue = lineSummaries.find((line) => !line.isTick && line.comment && line.comment !== ".");
    const firstPraise = lineSummaries.find((line) => line.isTick && line.comment && line.comment !== ".");

    const scoreText = overlay.finalMark?.match(/\d+\s*\/\s*\d+/)?.[0]?.replace(/\s+/g, "") ?? overlay.finalMark ?? "";
    const scoreMatch = scoreText.match(/(\d+)\/(\d+)/);
    const earned = scoreMatch ? Number(scoreMatch[1]) : NaN;
    const possible = scoreMatch ? Number(scoreMatch[2]) : NaN;
    const ratio = Number.isFinite(earned) && Number.isFinite(possible) && possible > 0 ? earned / possible : null;

    if (Number.isFinite(earned) && Number.isFinite(possible) && possible > 0 && earned === possible) {
        return `Excellent work. Full marks awarded: ${earned}/${possible}.`;
    }

    const opening = (() => {
        if (ratio == null) return "Solid effort overall.";
        if (ratio >= 0.9) return "Excellent work overall.";
        if (ratio >= 0.75) return "Strong attempt overall.";
        if (ratio >= 0.55) return "You were quite close overall.";
        return "Good effort, and there are clear pieces to build on.";
    })();

    const issueSentence = firstIssue
        ? `The main slip was on line ${firstIssue.lineIndex + 1}: ${firstIssue.comment}.`
        : gradedLines > 0
            ? "I did not spot a major single error; remaining losses are from mathematical accuracy in a few steps."
            : "I could not detect enough clear working lines to give detailed line-by-line issues.";

    const strengthsSentence = (() => {
        if (firstPraise) return `Your method was good in parts, especially where you ${firstPraise.comment.toLowerCase()}.`;
        if (gradedLines > 0) return `You showed valid method on ${tickLines} out of ${gradedLines} graded line${gradedLines === 1 ? "" : "s"}.`;
        return "Please keep showing each step clearly so I can reward method marks.";
    })();

    const markSentence = scoreText
        ? `So I awarded ${scoreText} based on method quality and accuracy across the full working.`
        : "The final mark was based on method quality and accuracy across the full working.";

    return `${opening} ${issueSentence} ${strengthsSentence} ${markSentence}`.replace(/\s+/g, " ").trim();
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
  const urlIndexInPaper = searchParams.get("indexInPaper");
  const urlQuestionId = searchParams.get("questionId");
    const normalizedUrlLevel = normalizePaperLevel(urlLevel);
    const normalizedUrlSubject = (urlSubject ?? "").trim().toLowerCase();

  const initialMode: QuestionsMode =
    urlMode === "certchamps" || urlMode === "pastpaper" ? urlMode : getStoredMode();
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

  // Sync mode from URL when navigating (e.g. from Practice Hub with ?mode=pastpaper)
  useEffect(() => {
    const m = urlMode === "certchamps" || urlMode === "pastpaper" ? urlMode : getStoredMode();
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

        const getLineCountRef = useRef<((region?: WhiteboardRelevantRegion | null) => number) | null>(null);
        const registerGetLineCount = useCallback<RegisterGetLineCount>((fn) => {
            getLineCountRef.current = fn;
        }, []);
        const getLineCount = useCallback((region?: WhiteboardRelevantRegion | null) => getLineCountRef.current?.(region) ?? 0, []);

    // ---- Canvas persistence (state declared here; effects placed after derived vars below) ----
    const { saveCanvas, loadCanvas } = useCanvasStorage();
    const [canvasStrokes, setCanvasStrokes] = useState<any[]>([]);
    const [canvasLoading, setCanvasLoading] = useState(false);
    const [whiteboardFeedback, setWhiteboardFeedback] = useState<WhiteboardFeedbackOverlay | null>(null);
    const [checkMyAnswerLoading, setCheckMyAnswerLoading] = useState(false);
    const [checkMyAnswerStatus, setCheckMyAnswerStatus] = useState<string | null>(null);
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
    useEffect(() => {
        const onResize = () => setViewportWidth(window.innerWidth);
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
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
        if (mode === "certchamps" && currentQuestion?.id) {
            return currentQuestion.id as string;
        }
        return null;
    }, [mode, selectedPaper, currentPaperQuestion, currentQuestion]);

    // Load saved strokes whenever the active question changes
    useEffect(() => {
        if (!activeCanvasQuestionId) {
            setCanvasStrokes([]);
            setCanvasLoading(false);
            return;
        }
        setCanvasLoading(true);
        let cancelled = false;
        loadCanvas(activeCanvasQuestionId)
            .then((loaded) => {
                if (cancelled) return;
                setCanvasStrokes(loaded ?? []);
                setCanvasLoading(false);
            })
            .catch(() => {
                if (cancelled) return;
                setCanvasStrokes([]);
                setCanvasLoading(false);
            });
        return () => { cancelled = true; };
    }, [activeCanvasQuestionId, loadCanvas]);

    const handleStrokesChange = useCallback(
        (strokes: any[]) => {
            if (!activeCanvasQuestionId) return;
            saveCanvas(activeCanvasQuestionId, strokes);
        },
        [activeCanvasQuestionId, saveCanvas]
    );

    useEffect(() => {
        setWhiteboardFeedback(null);
        setCheckMyAnswerStatus(null);
        setAiInjectedExchange(null);
    }, [activeCanvasQuestionId, mode]);

    const streamChatResponse = useCallback(async (messages: Array<{ role: string; content: any }>): Promise<string> => {
        const res = await fetch(CHAT_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages }),
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

    const handleCheckMyAnswer = useCallback(async () => {
        if (checkMyAnswerLoading) return;
        if (canvasLoading) {
            setCheckMyAnswerStatus("Your saved whiteboard is still loading. Please try again in a moment.");
            return;
        }
        setCheckMyAnswerLoading(true);
        setCheckMyAnswerStatus(null);
        setWhiteboardFeedback(null);

        try {
                let drawingDataUrl = getDrawingSnapshot();
                const hasStoredStrokes = Array.isArray(canvasStrokes) && canvasStrokes.length > 0;
                if (!drawingDataUrl && hasStoredStrokes) {
                    drawingDataUrl = renderSnapshotFromStoredStrokes(canvasStrokes);
                }
                const hasWhiteboard = Boolean(drawingDataUrl) || hasStoredStrokes || getLineCount(null) > 0;
                if (hasWhiteboard && !drawingDataUrl) {
                    throw new Error("Your saved whiteboard is still loading. Please try again in a moment.");
                }

            const questionText = mode === "pastpaper"
                ? [
                    currentPaperQuestion?.questionName ?? "Unknown paper question",
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

            let relevantRegion: WhiteboardRelevantRegion | null = null;
            let fullLineCount = 0;
            let scopedDrawingDataUrl = drawingDataUrl;

            if (hasWhiteboard && drawingDataUrl) {
                const imageMetrics = await new Promise<{ width: number; height: number }>((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => resolve({ width: img.width, height: img.height });
                    img.onerror = () => reject(new Error("Failed to read whiteboard image metrics."));
                    img.src = drawingDataUrl;
                });
                fullLineCount = getLineCount(null);
                const regionResponse = await streamChatResponse([
                    { role: "system", content: WHITEBOARD_REGION_SYSTEM_PROMPT },
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: [
                                    `Question:\n${questionText || "(missing question text)"}`,
                                    `Canvas size: width=${Math.round(imageMetrics.width)}, height=${Math.round(imageMetrics.height)}.`,
                                    "Identify the smallest bounding region containing only the student's answer relevant to this question.",
                                    "Return JSON only as { x, y, width, height } in canvas coordinates. Ignore side notes, doodles, rough sketches, margin labels, stray annotations, or anything clearly not part of the answer.",
                                ].join("\n\n"),
                            },
                            { type: "image_url", image_url: { url: drawingDataUrl } },
                        ],
                    },
                ]);
                relevantRegion = parseRelevantRegionResponse(regionResponse, imageMetrics);
                if (relevantRegion && fullLineCount > 0) {
                    relevantRegion = expandRelevantRegion(relevantRegion, imageMetrics);
                    const scopedCount = getLineCount(relevantRegion);
                    // If region selection drops too much content, treat it as bad detection and grade full content.
                    const minimumExpectedLines = Math.max(1, Math.floor(fullLineCount * 0.7));
                    if (scopedCount < minimumExpectedLines) relevantRegion = null;
                }
                scopedDrawingDataUrl = await cropSnapshotToRelevantRegion(drawingDataUrl, relevantRegion, imageMetrics);
            }

            const markingSchemeImages: string[] = [];
            let markingSchemeMeta = "";

            if (mode === "pastpaper") {
                if (!selectedPaper || !currentPaperQuestion?.markingSchemePageRange) {
                    throw new Error("Marking scheme page range is missing for this question.");
                }
                const msBlob = markingSchemeBlob ?? (await getMarkingSchemeBlob(selectedPaper));
                if (!msBlob) {
                    throw new Error("Could not retrieve marking scheme for this paper.");
                }
                const start = Math.max(1, Math.min(currentPaperQuestion.markingSchemePageRange.start, currentPaperQuestion.markingSchemePageRange.end));
                const end = Math.max(start, Math.max(currentPaperQuestion.markingSchemePageRange.start, currentPaperQuestion.markingSchemePageRange.end));
                for (let page = start; page <= end && page < start + 4; page += 1) {
                    const shot = await renderPdfPageSnapshot(msBlob, page, 700);
                    if (shot) markingSchemeImages.push(shot);
                }
                markingSchemeMeta = `Past-paper marking scheme pages: ${start}-${end}`;
            } else {
                const rawMs = String(currentQuestion?.properties?.markingScheme ?? "").trim();
                const digits = rawMs.replace(/\D/g, "");
                const year = digits.length >= 4 ? digits.slice(0, 2) : msYear;
                const pageNumber = digits.length >= 4 ? Number(digits.slice(2)) : Number(digits);
                if (!year || !Number.isFinite(pageNumber) || pageNumber <= 0) {
                    throw new Error("No marking scheme is linked to this question.");
                }
                const msRes = await fetch(`/assets/marking_schemes/${year}.pdf`);
                if (!msRes.ok) {
                    throw new Error("Failed to retrieve the marking scheme PDF.");
                }
                const msBlob = await msRes.blob();
                const shot = await renderPdfPageSnapshot(msBlob, pageNumber, 700);
                if (!shot) {
                    throw new Error("Failed to render the marking scheme page.");
                }
                markingSchemeImages.push(shot);
                markingSchemeMeta = `CertChamps marking scheme page: ${year}${String(pageNumber).padStart(2, "0")}`;
            }

            if (markingSchemeImages.length === 0) {
                throw new Error("Marking scheme could not be attached, so grading was not sent.");
            }

            const userContent: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [
                {
                    type: "text",
                    text: [
                        `Question:\n${questionText || "(missing question text)"}`,
                        `Marking scheme context:\n${markingSchemeMeta}`,
                        hasWhiteboard
                            ? (() => {
                                const n = getLineCount(relevantRegion);
                                const fullN = fullLineCount > 0 ? fullLineCount : getLineCount(null);
                                return [
                                    "Student answer type: whiteboard.",
                                    "The first attached whiteboard image is the full high-contrast canvas capture (theme-independent) and is the source of truth.",
                                    "If a second whiteboard image is attached, it is a focused crop to help ignore side notes; use it as a hint, but do not ignore valid working from the full image.",
                                    `Treat the answer as exactly ${n > 0 ? n : fullN > 0 ? fullN : "an unknown number of"} line${(n > 1 || fullN > 1) ? "s" : ""} of content, counted top to bottom, and output exactly that many feedback lines in order.`
                                ].join(" ");
                              })()
                            : "Student answer type: text-only. No written student response was provided.",
                    ].join("\n\n"),
                },
                ...markingSchemeImages.map((url) => ({ type: "image_url" as const, image_url: { url } })),
            ];

            if (hasWhiteboard && drawingDataUrl) {
                userContent.push({ type: "image_url", image_url: { url: drawingDataUrl } });
            }
            if (hasWhiteboard && scopedDrawingDataUrl && scopedDrawingDataUrl !== drawingDataUrl) {
                userContent.push({ type: "image_url", image_url: { url: scopedDrawingDataUrl } });
            }

            const feedback = await streamChatResponse([
                { role: "system", content: CHECK_MY_ANSWER_SYSTEM_PROMPT },
                { role: "user", content: userContent },
            ]);

            let aiAssistantMessage = feedback || "No feedback returned.";
            if (hasWhiteboard) {
                const overlay = buildWhiteboardOverlay(feedback, relevantRegion);
                setWhiteboardFeedback(overlay);
                aiAssistantMessage = buildWhiteboardChatSummary(feedback, overlay);
            }

            setSidebarOpen(true);
            setSidebarOpenPanel("ai");
            setAiInjectedExchange({
                nonce: `${Date.now()}`,
                userMessage: "Check my answer",
                assistantMessage: aiAssistantMessage,
            });

            if (hasWhiteboard) {
                setCheckMyAnswerStatus("Feedback added to whiteboard and AI chat.");
            } else {
                setCheckMyAnswerStatus("Feedback added to AI chat.");
            }
        } catch (err) {
            setCheckMyAnswerStatus(err instanceof Error ? err.message : "Failed to check answer");
        } finally {
            setCheckMyAnswerLoading(false);
        }
    }, [
        checkMyAnswerLoading,
        canvasLoading,
        getDrawingSnapshot,
        canvasStrokes,
        mode,
        currentPaperQuestion,
        currentQuestion,
        selectedPaper,
        markingSchemeBlob,
        getMarkingSchemeBlob,
        msYear,
        streamChatResponse,
        setSidebarOpen,
        setSidebarOpenPanel,
        getLineCount,
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
    }, [mode, selectedPaper?.storagePath, currentPaperQuestion?.id, currentQuestion?.id, subjectFilter]);

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
                        initialStrokes={canvasStrokes}
                        onStrokesChange={handleStrokesChange}
                        registerGetLineCount={registerGetLineCount}
                        feedbackOverlay={whiteboardFeedback}
                    />
                    <div
                        className="absolute z-30 pointer-events-auto bottom-4 left-1/2"
                        style={{
                            transform: options.leftHandMode
                                ? "translateX(calc(-50% + 210px))"
                                : "translateX(calc(-50% - 210px))",
                        }}
                    >
                        <button
                            type="button"
                            aria-label="Check my answer"
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium color-bg-grey-5 color-txt-sub hover:color-txt-main hover:color-bg-grey-10 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                            onClick={handleCheckMyAnswer}
                            disabled={checkMyAnswerLoading}
                            title="Check my answer with AI"
                        >
                            <LuCircleCheck size={14} strokeWidth={2} />
                            <span>{checkMyAnswerLoading ? "Checking..." : "Check my answer"}</span>
                        </button>
                        {checkMyAnswerStatus && (
                            <p className="absolute bottom-full mb-2 max-w-[260px] text-xs color-txt-sub bg-[var(--grey-5)]/85 rounded-md px-2 py-1">
                                {checkMyAnswerStatus}
                            </p>
                        )}
                    </div>
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
                        : currentQuestion}
                    getDrawingSnapshot={getDrawingSnapshot}
                    getPaperSnapshot={getPaperSnapshot}
                    open={sidebarOpen}
                    onOpenChange={(open) => {
                        setSidebarOpen(open);
                        if (!open) setMarkingSchemeQuestionIndex(null);
                    }}
                    openPanel={mode === "pastpaper" ? (sidebarOpenPanel ?? undefined) : undefined}
                    onOpenPanelChange={(panel) => {
                        setSidebarOpenPanel(panel ?? null);
                        if (panel !== "markingscheme") setMarkingSchemeQuestionIndex(null);
                    }}
                    markingSchemeBlob={mode === "pastpaper" ? markingSchemeBlob : undefined}
                    markingSchemePageRange={mode === "pastpaper" ? questionForMarkingScheme?.markingSchemePageRange : undefined}
                    markingSchemeQuestionName={mode === "pastpaper" ? questionForMarkingScheme?.questionName : undefined}
                    aiInjectedExchange={aiInjectedExchange}
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
                    : undefined;
                const centerLabel = overrideTitle ?? currentQuestion?.properties?.name ?? "...";
                const overrideTags = mode === "pastpaper" ? (currentPaperQuestion?.tags ?? []) : undefined;
                const tagsDisplay = overrideTags != null
                    ? formatTags(overrideTags)
                    : formatTags(currentQuestion?.properties?.tags);

                const onPrev = mode === "pastpaper"
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

                const onNext = mode === "pastpaper"
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
                        questionCompleted={mode === "pastpaper" && currentPaperQuestion ? isQuestionCompleted(currentPaperQuestion.id) : undefined}
                        onToggleQuestionCompleted={mode === "pastpaper" && selectedPaper && currentPaperQuestion ? () => {
                            toggleQuestion(selectedPaper, currentPaperQuestion.id, paperQuestions.length);
                        } : undefined}
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
                                {mode === "pastpaper" ? (
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
                                                    // Clearing filter — stay on current paper
                                                    setPaperQuestionPosition(1);
                                                    if (paperQuestions.length > 0) {
                                                        const first = paperQuestions[0];
                                                        setScrollToPage(first?.pageRegions?.[0]?.page ?? first?.pageRange?.[0] ?? null);
                                                    }
                                                    return;
                                                }

                                                // Check if current paper has matching questions
                                                const tagSet = new Set(subTopics.map((s) => normTag(s)));
                                                const localFiltered = paperQuestions.filter((q) =>
                                                    q.tags?.some((tag) => tagSet.has(normTag(String(tag))))
                                                );

                                                if (localFiltered.length > 0) {
                                                    // Current paper has matches — jump to first match
                                                    setPaperQuestionPosition(1);
                                                    const first = localFiltered[0];
                                                    setScrollToPage(first?.pageRegions?.[0]?.page ?? first?.pageRange?.[0] ?? null);
                                                } else {
                                                    // Current paper has NO matches — search scoped papers (newest first)
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
                                <button
                                    type="button"
                                    aria-label="Search questions"
                                    className="question-selector-button pointer-events-auto"
                                    onClick={() => setShowSearch(true)}
                                >
                                    <LuSearch size={18} strokeWidth={2} />
                                    <span>search</span>
                                </button>
                            </div>
                        }
                    />
                );
            })()}

            {/* Foreground: content block then PDF underneath. In laptop+past paper, paper fills from top. */}
            <div className={`relative flex min-h-0 flex-1 w-full ${options.laptopMode && mode === "pastpaper" ? "flex-col" : "flex-col gap-4 items-start"}`}>
                {/* Math preview for certchamps mode */}
                {mode !== "pastpaper" && (
                    <div className={`questions-top-left shrink-0 flex flex-col gap-2 max-w-sm w-[35%] min-w-xs pointer-events-auto ${
                        options.leftHandMode ? "pt-4 pr-4 self-end" : "pt-4 pl-4"
                    }`}>
                        <RenderMath text={currentQuestion?.content?.[0]?.question ?? "ughhhh no question"} className="questions-math-preview font-bold text-sm txt" />
                    </div>
                )}

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
                                                className={`fixed z-[25] flex flex-row gap-2 items-center py-3 pointer-events-auto bg-transparent ${options.leftHandMode ? "justify-end right-0 pr-4" : "justify-start left-[var(--navbar-width,5.5rem)]"}`}
                                                style={{
                                                    bottom: "env(safe-area-inset-bottom, 0px)",
                                                }}
                                            >
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

 