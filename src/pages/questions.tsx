// Hooks
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import useQuestions from "../hooks/useQuestions";
import { OptionsContext } from "../context/OptionsContext";
import { UserContext } from "../context/UserContext";
import { useExamPapers, isPaperFree, type ExamPaper, type PaperQuestion } from "../hooks/useExamPapers";
import { usePaperSnapshot } from "../hooks/usePaperSnapshot";
import useFilters from "../hooks/useFilters";
import { usePaperProgress } from "../hooks/usePaperProgress";

// Components
import { createPortal } from "react-dom";
import { LuMaximize2, LuMinimize2, LuX, LuClipboardList, LuBookOpen, LuCalculator, LuChevronLeft, LuChevronRight, LuChevronDown, LuFilter, LuSearch } from "react-icons/lu";
import { TbDice5 } from "react-icons/tb";
import QuestionsTopBar from "../components/questions/QuestionsTopBar";
import QSearch from "../components/questions/qSearch";
import DrawingCanvas, { type RegisterDrawingSnapshot } from "../components/questions/DrawingCanvas";
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

function formatTags(tags: string[] | string | undefined): string {
  if (tags == null || tags === "") return "";
  const list = Array.isArray(tags) ? tags : tags.split(",").map((t) => t.trim());
  return list.filter(Boolean).map((t) => `#${t}`).join(", ");
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

  const initialMode: QuestionsMode =
    urlMode === "certchamps" || urlMode === "pastpaper" ? urlMode : getStoredMode();
  const initialPaths = getPathsForMode(initialMode, urlSubject || null);

  //==============================================> State <========================================//
  const [filters, _setFilters] = useState<Record<string, string[]>>({});
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
    /** When set, next paperQuestions effect will jump here (used for random across papers). */
    const pendingRandomRef = useRef<{ pos: number } | { questionId: string } | null>(null);
    /** When set, next paperQuestions effect will jump to this index (used when selecting from all-papers search). */
    const pendingSearchRef = useRef<{ indexInPaper: number } | null>(null);
    /** Tracks whether the initial urlQuestionId has been consumed (certchamps mode). */
    const urlQuestionIdConsumedRef = useRef(false);
    const getDrawingSnapshotRef = useRef<(() => string | null) | null>(null);
    const registerDrawingSnapshot = useCallback<RegisterDrawingSnapshot>((getSnapshot) => {
        getDrawingSnapshotRef.current = getSnapshot;
    }, []);
    const getDrawingSnapshot = useCallback(() => getDrawingSnapshotRef.current?.() ?? null, []);

    // ---- Canvas persistence (state declared here; effects placed after derived vars below) ----
    const { saveCanvas, loadCanvas } = useCanvasStorage();
    const [canvasStrokes, setCanvasStrokes] = useState<any[]>([]);
    const [canvasLoading, setCanvasLoading] = useState(false);
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
    const paperSnapshot = usePaperSnapshot(paperBlob, currentPaperPage);
    const getPaperSnapshot = useCallback(() => paperSnapshot ?? null, [paperSnapshot]);

    const currentQuestion = questions[position - 1];

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

    // ---- Cross-paper helpers for topic filtering ----

    /** Given a list of subtopic strings, find the first paper (starting at `startIdx`, searching forward)
     *  that contains at least one matching question. Returns { paper, questions, filtered } or null. */
    const findPaperWithTopics = useCallback(
        async (
            subTopics: string[],
            startIdx: number,
            direction: "forward" | "backward" = "forward"
        ): Promise<{ paper: ExamPaper; questions: PaperQuestion[]; filtered: PaperQuestion[] } | null> => {
            if (papers.length === 0 || !getPaperQuestions) return null;
            const tagSet = new Set(subTopics.map((s) => normTag(s)));
            const step = direction === "forward" ? 1 : -1;
            for (
                let i = startIdx;
                direction === "forward" ? i < papers.length : i >= 0;
                i += step
            ) {
                const p = papers[i];
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
        [papers, getPaperQuestions]
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
                const idx = papers.findIndex((p: ExamPaper) => p.storagePath === selectedPaper.storagePath);
                if (idx >= 0 && idx < papers.length - 1) {
                    getPaperBlob(papers[idx + 1]!).catch(() => {});
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
    }, [selectedPaper, getPaperBlob, papers]);

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
        if (selectedSubTopics.length === 0 || papers.length === 0 || paperQuestions.length === 0) return;
        let searching = true;
        (async () => {
            const curIdx = selectedPaper ? papers.findIndex((p) => p.storagePath === selectedPaper.storagePath) : 0;
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
    }, [filteredPaperQuestions.length, paperQuestionPosition, selectedSubTopics, selectedPaper, papers, paperQuestions.length]);

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
        if (papers.length === 0 || selectedPaper !== null) return;
        let match: ExamPaper | undefined;
        if (urlPaperId) {
            match = papers.find((p) => p.id === urlPaperId && (!urlLevel || p.level === urlLevel))
                ?? papers.find((p) => p.id === urlPaperId);
        }
        if (!match && msYear) {
            match = papers.find((p) => p.label.toLowerCase().startsWith("20" + msYear)) ?? papers[0];
        }
        if (!match) match = papers[0];
        setSelectedPaper(match);
    }, [papers, msYear, selectedPaper, urlPaperId, urlLevel]);

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
                    />
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
                            const idx = selectedPaper ? papers.findIndex((p: ExamPaper) => p.storagePath === selectedPaper.storagePath) : -1;
                            if (idx <= 0) return;
                            if (selectedSubTopics.length === 0) {
                                setSelectedPaper(papers[idx - 1]);
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
                            // Random: build a pool of all papers that have matching questions
                            const tagSet = selectedSubTopics.length > 0
                                ? new Set(selectedSubTopics.map((s) => normTag(s)))
                                : null;
                            // Randomise across all loaded papers (any subject/level)
                            if (papers.length === 0) return;

                            // Try up to 10 random papers to find one with matching questions
                            const tried = new Set<string>();
                            for (let attempt = 0; attempt < Math.min(10, papers.length); attempt++) {
                                const randomPaper = papers[Math.floor(Math.random() * papers.length)];
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
                            // Fallback: scan all papers sequentially
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
                                const idx = selectedPaper ? papers.findIndex((p: ExamPaper) => p.storagePath === selectedPaper.storagePath) : -1;
                                if (idx < 0 || idx >= papers.length - 1) {
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
                                    setSelectedPaper(papers[idx + 1]);
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
                                                    // Current paper has NO matches — search ALL papers (newest first)
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
                            papers={papers}
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

 