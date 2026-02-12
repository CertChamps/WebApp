// Hooks
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import useQuestions from "../hooks/useQuestions";
import { OptionsContext } from "../context/OptionsContext";
import { useExamPapers, type ExamPaper, type PaperQuestion } from "../hooks/useExamPapers";
import { usePaperSnapshot } from "../hooks/usePaperSnapshot";
import useFilters from "../hooks/useFilters";

// Components
import { createPortal } from "react-dom";
import { LuMonitor, LuTablet, LuArrowLeft, LuMaximize2, LuMinimize2, LuClipboardList, LuX, LuBookOpen } from "react-icons/lu";
import QuestionSelector from "../components/questions/questionSelector";
import QSearch from "../components/questions/qSearch";
import DrawingCanvas, { type RegisterDrawingSnapshot } from "../components/questions/DrawingCanvas";
import RenderMath from "../components/math/mathdisplay";
import { motion, AnimatePresence } from "framer-motion";
import PaperPdfPlaceholder, {
  getRegionScrollOffset,
  getRegionHeightPx,
} from "../components/questions/PaperPdfPlaceholder";
import PdfRegionView from "../components/questions/PdfRegionView";
import PastPaperMarkingScheme from "../components/questions/PastPaperMarkingScheme";
import FloatingLogTables from "../components/FloatingLogTables";
import { CollapsibleSidebar } from "../components/sidebar";

// Style Imports
import "../styles/questions.css";
import "../styles/navbar.css";
import "../styles/sidebar.css";

const QUESTIONS_MODE_KEY = "questions-page-mode";

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
  } catch (_) {}
  return "certchamps";
}

function formatSectionLabel(id: string): string {
  return id.replace(/-/g, " ").replace(/\b(\w)/g, (c) => c.toUpperCase());
}

export default function Questions() {
  const { options, setOptions } = useContext(OptionsContext);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const urlMode = searchParams.get("mode") as QuestionsMode | null;
  const urlSubject = searchParams.get("subject");
  const urlPaperId = searchParams.get("paperId");

  const initialMode: QuestionsMode =
    urlMode === "certchamps" || urlMode === "pastpaper" ? urlMode : getStoredMode();
  const initialPaths = getPathsForMode(initialMode, urlSubject || null);

  //==============================================> State <========================================//
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [position, setPosition] = useState(0);
  const [questions, setQuestions] = useState<any[]>([]);
  const [showSearch, setShowSearch] = useState(false);

  const [mode, setMode] = useState<QuestionsMode>(initialMode);
  const [subjectFilter, setSubjectFilter] = useState<string | null>(urlSubject || null);
  const [collectionPaths, setCollectionPaths] = useState<string[]>(initialPaths);

    const cardContainerRef = useRef<HTMLElement | null>(null);
    const getDrawingSnapshotRef = useRef<(() => string | null) | null>(null);
    const registerDrawingSnapshot = useCallback<RegisterDrawingSnapshot>((getSnapshot) => {
        getDrawingSnapshotRef.current = getSnapshot;
    }, []);
    const getDrawingSnapshot = useCallback(() => getDrawingSnapshotRef.current?.() ?? null, []);
    //===============================================================================================//

    //==============================================> Hooks <========================================//
    const { loadQuestions } = useQuestions({
        setQuestions,
        collectionPaths,
    });
    const {
        papers,
        loading: papersLoading,
        error: papersError,
        getPaperBlob,
        getPaperQuestions,
        getMarkingSchemeBlob,
    } = useExamPapers();
    const { availableSets } = useFilters();
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
    const [showMarkingSchemeModal, setShowMarkingSchemeModal] = useState(false);
    const [showLogTables, setShowLogTables] = useState(false);
    const paperScrollRef = useRef<HTMLDivElement | null>(null);
    const paperSnapshot = usePaperSnapshot(paperBlob, currentPaperPage);
    const getPaperSnapshot = useCallback(() => paperSnapshot ?? null, [paperSnapshot]);

    const currentQuestion = questions[position - 1];
    const msCode = currentQuestion?.properties?.markingScheme
        ? String(currentQuestion.properties.markingScheme)
        : "";
    const msYear = msCode.length >= 2 ? msCode.substring(0, 2) : (mode === "pastpaper" ? "25" : "");

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
        } catch (_) {}
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

    // Load paper as Blob when selected (avoids CORS; react-pdf accepts Blob)
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
    }, [selectedPaper, getPaperBlob]);

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
                    setPaperQuestionPosition(1);
                    setScrollToPage(list[0]?.pageRange?.[0] ?? null);
                    setIsFullPaperExpanded(false);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setPaperQuestions([]);
                    setPaperQuestionPosition(1);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [selectedPaper, getPaperQuestions]);

    // When PDF scroll reports a page, sync to question (only when not in full paper mode; otherwise region-based sync handles it)
    useEffect(() => {
        if (paperQuestions.length === 0 || isFullPaperExpanded) return;
        const idx = paperQuestions.findIndex(
            (q) => currentPaperPage >= q.pageRange[0] && currentPaperPage <= q.pageRange[1]
        );
        if (idx >= 0) setPaperQuestionPosition(idx + 1);
    }, [currentPaperPage, paperQuestions, isFullPaperExpanded]);

    const snippetWidth = options.laptopMode ? 680 : 480;

    // Region-based scroll sync: when full paper expanded, use exact scroll position vs page regions
    const PAGE_GAP_PX = 8;
    const PDF_ASPECT = 842 / 595;
    const pageHeightPx = snippetWidth * PDF_ASPECT;

    useEffect(() => {
        if (!isFullPaperExpanded) return;
        const container = paperScrollRef.current;
        if (!container || paperQuestions.length === 0) return;

        let rafId: number | null = null;
        const handleScroll = () => {
            if (rafId != null) return;
            rafId = requestAnimationFrame(() => {
                rafId = null;
                const scrollTop = container.scrollTop;
                const viewportBottom = scrollTop + container.clientHeight;

                let bestIdx = -1;
                let bestOverlap = 0;

                for (let i = 0; i < paperQuestions.length; i++) {
                    const q = paperQuestions[i]!;
                    let regionTop: number;
                    let regionHeight: number;

                    if (q.pageRegions && q.pageRegions.length > 0) {
                        const firstRegion = q.pageRegions[0]!;
                        regionTop = getRegionScrollOffset(snippetWidth, firstRegion);
                        regionHeight = getRegionHeightPx(snippetWidth, firstRegion);
                    } else {
                        const pageIdx = (q.pageRange[0] ?? 1) - 1;
                        regionTop = pageIdx * (pageHeightPx + PAGE_GAP_PX);
                        regionHeight = pageHeightPx + PAGE_GAP_PX;
                    }

                    const regionBottom = regionTop + regionHeight;
                    const overlapTop = Math.max(scrollTop, regionTop);
                    const overlapBottom = Math.min(viewportBottom, regionBottom);
                    const overlap = Math.max(0, overlapBottom - overlapTop);

                    if (overlap > bestOverlap) {
                        bestOverlap = overlap;
                        bestIdx = i;
                    }
                }

                if (bestIdx >= 0) {
                    setPaperQuestionPosition(bestIdx + 1);
                }
            });
        };

        container.addEventListener("scroll", handleScroll, { passive: true });
        handleScroll();
        return () => {
            container.removeEventListener("scroll", handleScroll);
            if (rafId != null) cancelAnimationFrame(rafId);
        };
    }, [paperQuestions, snippetWidth, isFullPaperExpanded, pageHeightPx]);

    // Load marking scheme when paper and current question have markingSchemePageRange
    const currentPaperQuestion = paperQuestions[paperQuestionPosition - 1];
    useEffect(() => {
        if (
            !selectedPaper ||
            !getMarkingSchemeBlob ||
            !currentPaperQuestion?.markingSchemePageRange
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
    }, [selectedPaper, getMarkingSchemeBlob, currentPaperQuestion?.markingSchemePageRange]);

    // Preselect paper: URL paperId > current question year > first paper
    useEffect(() => {
        if (papers.length === 0 || selectedPaper !== null) return;
        let match: ExamPaper | undefined;
        if (urlPaperId) {
            match = papers.find((p) => p.id === urlPaperId);
        }
        if (!match && msYear) {
            match = papers.find((p) => p.label.toLowerCase().startsWith("20" + msYear)) ?? papers[0];
        }
        if (!match) match = papers[0];
        setSelectedPaper(match);
    }, [papers, msYear, selectedPaper, urlPaperId]);

    //===============================================================================================//

    //===========================================> Next Question <===================================//
    const nextQuestion = async () => {
        if (position + 1 >= questions.length) {
          await loadQuestions();
        }
        setPosition((p) => p + 1);
    };
    //===============================================================================================//

    //===========================================> Previous Question <================================//
    const previousQuestion = () => {
        setPosition((p) => Math.max(0, p - 1));
    };
    //===============================================================================================//

    return (
        <div className="relative flex w-full h-full flex-col gap-0">
            {/* Drawing canvas: disabled in laptop mode; render first so it sits behind (z-0) */}
            {!options.laptopMode && (
                <div className="absolute inset-0 z-0">
                    <DrawingCanvas registerDrawingSnapshot={registerDrawingSnapshot} />
                </div>
            )}

            {/* Sidebar: outside scaled area so it sits at viewport right edge */}
            <div className="absolute right-0 top-0 bottom-0 w-[30%] z-20 h-full pointer-events-auto">
                <CollapsibleSidebar
                    question={mode === "pastpaper" ? undefined : currentQuestion}
                    getDrawingSnapshot={getDrawingSnapshot}
                    getPaperSnapshot={getPaperSnapshot}
                />
            </div>

            {/* Full-width scaled layout: question + PDF on the left (no centering) */}
            <div
                className="absolute inset-0 z-10 flex flex-col items-start pointer-events-none"
                style={{ transform: "scale(1)", transformOrigin: "0 0" }}
            >
            {/* Foreground: top-left block on top, then PDF underneath. In laptop+past paper, paper fills from top and header overlays. */}
            <div className={`relative flex min-h-0 flex-1 w-full ${options.laptopMode && mode === "pastpaper" ? "flex-col" : "flex-col gap-4 items-start"}`}>
                {/* Top left: tablet/laptop toggle, dropdown, question selector, question text — in laptop+past paper this overlays the paper */}
                <div className={`shrink-0 flex flex-col gap-2 max-w-md pointer-events-auto ${options.laptopMode && mode === "pastpaper" ? "absolute top-0 left-0 z-10 pt-4 pl-4" : "pt-4 pl-4"}`}>
                    <div className="flex items-center gap-2 mb-1">
                        <button
                            type="button"
                            onClick={() => navigate("/practice")}
                            className="flex items-center gap-1.5 text-sm color-txt-sub hover:color-txt-main transition-colors"
                            aria-label="Back to Practice Hub"
                        >
                            <LuArrowLeft size={18} strokeWidth={2} />
                            <span>Hub</span>
                        </button>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                        <button
                            type="button"
                            onClick={() => setOptions((opts: any) => ({ ...opts, laptopMode: !opts.laptopMode }))}
                            className="practice-device-toggle"
                            title={options.laptopMode ? "Tablet layout" : "Laptop layout"}
                            aria-label={options.laptopMode ? "Switch to tablet layout" : "Switch to laptop layout"}
                        >
                            {options.laptopMode ? (
                                <LuMonitor className="practice-device-icon" strokeWidth={2} size={22} />
                            ) : (
                                <LuTablet className="practice-device-icon" strokeWidth={2} size={22} />
                            )}
                            <span className="practice-device-label">{options.laptopMode ? "Laptop" : "Tablet"}</span>
                        </button>
                        <label htmlFor="questions-mode" className="sr-only">Question source</label>
                        <select
                            id="questions-mode"
                            value={mode}
                            onChange={(e) => {
                                const m = e.target.value as QuestionsMode;
                                setMode(m);
                                if (m === "pastpaper") setSubjectFilter(null);
                            }}
                            className="practice-mode-dropdown"
                        >
                            <option value="certchamps">CertChamps questions</option>
                            <option value="pastpaper">Past paper questions</option>
                        </select>
                        {mode === "certchamps" && certChampsSet && certChampsSet.sections.length > 0 && (
                            <>
                                <label htmlFor="questions-subject" className="sr-only">Subject</label>
                                <select
                                    id="questions-subject"
                                    value={subjectFilter ?? ""}
                                    onChange={(e) => setSubjectFilter(e.target.value || null)}
                                    className="practice-mode-dropdown"
                                >
                                    <option value="">All topics</option>
                                    {certChampsSet.sections.map((sec) => (
                                        <option key={sec} value={sec}>
                                            {formatSectionLabel(sec)}
                                        </option>
                                    ))}
                                </select>
                            </>
                        )}
                        {/* Log tables — both modes when we have a question */}
                        {(mode === "certchamps" ? currentQuestion : currentPaperQuestion) && (
                            <button
                                type="button"
                                onClick={() => setShowLogTables(true)}
                                className="flex items-center justify-center w-10 h-10 rounded-xl color-bg-grey-5 color-txt-sub hover:color-txt-main hover:color-bg-grey-10 transition-all border border-[var(--grey-10)]"
                                title="Log tables"
                                aria-label="Log tables"
                            >
                                <LuBookOpen size={20} strokeWidth={2} />
                            </button>
                        )}
                        {mode === "pastpaper" &&
                            markingSchemeBlob &&
                            currentPaperQuestion?.markingSchemePageRange && (
                                <button
                                    type="button"
                                    onClick={() => setShowMarkingSchemeModal(true)}
                                    className="flex items-center justify-center w-10 h-10 rounded-xl color-bg-grey-5 color-txt-sub hover:color-txt-main hover:color-bg-grey-10 transition-all border border-[var(--grey-10)]"
                                    title="Marking scheme"
                                    aria-label="Marking scheme"
                                >
                                    <LuClipboardList size={20} strokeWidth={2} />
                                </button>
                            )}
                    </div>
                    <QuestionSelector
                        question={currentQuestion}
                        nextQuestion={nextQuestion}
                        previousQuestion={previousQuestion}
                        setShowSearch={setShowSearch}
                        overrideTitle={
                            mode === "pastpaper"
                                ? papersLoading
                                    ? "Loading…"
                                    : papersError
                                        ? "Failed to load"
                                        : paperQuestions.length > 0
                                            ? paperQuestions[paperQuestionPosition - 1]?.questionName ?? ""
                                            : selectedPaper?.label ?? "Select a paper"
                                : undefined
                        }
                        overrideOnPrevious={
                            mode === "pastpaper"
                                ? () => {
                                        if (paperQuestions.length > 0 && paperQuestionPosition > 1) {
                                            setPaperQuestionPosition((p) => p - 1);
                                            setScrollToPage(paperQuestions[paperQuestionPosition - 2]?.pageRange[0] ?? null);
                                        } else {
                                            const idx = selectedPaper ? papers.findIndex((p: ExamPaper) => p.id === selectedPaper.id) : -1;
                                            if (idx > 0) setSelectedPaper(papers[idx - 1]);
                                        }
                                    }
                                : undefined
                        }
                        overrideOnNext={
                            mode === "pastpaper"
                                ? () => {
                                        if (paperQuestions.length > 0 && paperQuestionPosition < paperQuestions.length) {
                                            setPaperQuestionPosition((p) => p + 1);
                                            setScrollToPage(paperQuestions[paperQuestionPosition]?.pageRange[0] ?? null);
                                        } else {
                                            const idx = selectedPaper ? papers.findIndex((p: ExamPaper) => p.id === selectedPaper.id) : -1;
                                            if (idx >= 0 && idx < papers.length - 1) setSelectedPaper(papers[idx + 1]);
                                        }
                                    }
                                : undefined
                        }
                    />
                    {mode !== "pastpaper" && (
                        <RenderMath text={currentQuestion?.content?.[0]?.question ?? "ughhhh no question"} className="font-bold text-sm txt" />
                    )}
                </div>

                {/* PDF panel: viewer when past paper mode; snippet (pageRegions) or full paper with expand/collapse. */}
                {mode === "pastpaper" && (
                    (() => {
                        const currentPaperQuestion = paperQuestions[paperQuestionPosition - 1];
                        const hasPageRegions = currentPaperQuestion?.pageRegions && currentPaperQuestion.pageRegions.length > 0;
                        const snippetWidth = options.laptopMode ? 680 : 480;
                        const showSnippetView = hasPageRegions && !isFullPaperExpanded;

                        const handleExpandToggle = () => {
                            if (isFullPaperExpanded) {
                                setIsFullPaperExpanded(false);
                            } else {
                                const firstPage = currentPaperQuestion?.pageRegions?.[0]?.page ?? currentPaperQuestion?.pageRange?.[0] ?? 1;
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
                            return (
                                <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
                                    {hasPageRegions && (
                                        <button
                                            type="button"
                                            onClick={handleExpandToggle}
                                            className="absolute top-0 right-2 z-20 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium color-bg-grey-10 color-txt-sub hover:color-txt-main hover:color-bg-grey-5 transition-all shadow-sm"
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
                                    <div className="flex-1 min-h-0 relative pt-2">
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
                                                    <div className="flex flex-col gap-3 overflow-y-auto scrollbar-minimal h-full py-2 pr-2">
                                                        {currentPaperQuestion!.pageRegions!.map((region, i) => (
                                                            <PdfRegionView
                                                                key={`${region.page}-${region.y}-${i}`}
                                                                file={paperBlob}
                                                                region={{
                                                                    page: region.page,
                                                                    x: region.x ?? 0,
                                                                    y: region.y ?? 0,
                                                                    width: region.width ?? 595,
                                                                    height: region.height ?? 150,
                                                                }}
                                                                width={snippetWidth}
                                                            />
                                                        ))}
                                                    </div>
                                                </motion.div>
                                                <motion.div
                                                    className="absolute inset-0 flex flex-col overflow-hidden"
                                                    initial={false}
                                                    animate={{
                                                        opacity: isFullPaperExpanded ? 1 : 0,
                                                        pointerEvents: isFullPaperExpanded ? "auto" : "none",
                                                        visibility: isFullPaperExpanded ? "visible" : "hidden",
                                                    }}
                                                    transition={{ duration: 0.2, ease: [0.25, 0.4, 0.25, 1] }}
                                                >
                                                    <PaperPdfPlaceholder
                                                        file={paperBlob}
                                                        pageWidth={snippetWidth}
                                                        onCurrentPageChange={setCurrentPaperPage}
                                                        scrollToPage={scrollToPage ?? undefined}
                                                        onScrolledToPage={() => setScrollToPage(null)}
                                                        scrollContainerRef={paperScrollRef}
                                                    />
                                                </motion.div>
                                            </>
                                        ) : (
                                            <PaperPdfPlaceholder
                                                file={paperBlob}
                                                pageWidth={snippetWidth}
                                                onCurrentPageChange={setCurrentPaperPage}
                                                scrollToPage={scrollToPage ?? undefined}
                                                onScrolledToPage={() => setScrollToPage(null)}
                                                scrollContainerRef={paperScrollRef}
                                            />
                                        )}
                                    </div>
                                </div>
                            );
                        };

                        return options.laptopMode ? (
                            <div className="absolute inset-0 flex w-full min-h-0 justify-center items-start pointer-events-auto">
                                <div className="practice-paper-fly-in flex h-full min-h-0 w-full max-w-[720px] shrink-0 flex-col overflow-hidden pointer-events-auto">
                                    <div className="min-h-0 min-w-0 flex-1 flex flex-col overflow-hidden pt-2 px-2 pb-0">
                                        {renderPdfContent()}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex h-[740px] max-h-[75vh] w-full max-w-[520px] shrink-0 flex-col overflow-hidden pl-4 pointer-events-auto">
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
                                : String(currentPaperQuestion?.log_table_page ?? "1")
                        }
                        onClose={() => setShowLogTables(false)}
                    />,
                    document.body
                )}

            {showSearch ? (
                <QSearch
                    setShowSearch={setShowSearch}
                    questions={questions}
                    position={position}
                    setPosition={setPosition}
                />
            ) : null}

            {/* Marking scheme modal — past paper only */}
            <AnimatePresence>
                {showMarkingSchemeModal &&
                    markingSchemeBlob &&
                    currentPaperQuestion?.markingSchemePageRange && (
                        <motion.div
                            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                        >
                            <div
                                className="absolute inset-0 color-bg-grey-5/90 backdrop-blur-sm"
                                onClick={() => setShowMarkingSchemeModal(false)}
                                aria-hidden
                            />
                            <motion.div
                                className="relative flex flex-col w-full max-w-2xl max-h-[90vh] color-bg rounded-2xl color-shadow overflow-hidden border border-[var(--grey-10)]"
                                initial={{ scale: 0.95, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.95, opacity: 0 }}
                                transition={{ duration: 0.2, ease: [0.25, 0.4, 0.25, 1] }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-[var(--grey-10)]">
                                    <h2 className="text-lg font-semibold color-txt-main">
                                        Marking scheme
                                        <span className="ml-2 color-txt-sub font-normal text-sm">
                                            — {currentPaperQuestion.questionName}
                                        </span>
                                    </h2>
                                    <button
                                        type="button"
                                        onClick={() => setShowMarkingSchemeModal(false)}
                                        className="p-2 rounded-xl color-txt-sub hover:color-txt-main hover:color-bg-grey-10 transition-all"
                                        aria-label="Close"
                                    >
                                        <LuX size={22} strokeWidth={2} />
                                    </button>
                                </div>
                                <div className="flex-1 min-h-0 overflow-hidden flex flex-col p-6">
                                    <PastPaperMarkingScheme
                                        file={markingSchemeBlob}
                                        pageRange={currentPaperQuestion.markingSchemePageRange!}
                                        pageWidth={580}
                                        className="flex-1 min-h-0 rounded-xl overflow-hidden"
                                    />
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
            </AnimatePresence>

            </div>
            {/*===============================================================================================*/}
        </div>
    )
}

 