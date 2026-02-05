// Hooks
import { useCallback, useEffect, useRef, useState } from "react";
import useQuestions from "../hooks/useQuestions";
import { useExamPapers, type ExamPaper } from "../hooks/useExamPapers";
import { usePaperSnapshot } from "../hooks/usePaperSnapshot";

// Components
import QuestionSelector from "../components/questions/questionSelector";
import QSearch from "../components/questions/qSearch";
import DrawingCanvas, { type RegisterDrawingSnapshot } from "../components/questions/DrawingCanvas";
import RenderMath from "../components/math/mathdisplay";
import PaperPdfPlaceholder from "../components/questions/PaperPdfPlaceholder";
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

function getStoredMode(): QuestionsMode {
  try {
    const s = localStorage.getItem(QUESTIONS_MODE_KEY);
    if (s === "certchamps" || s === "pastpaper") return s;
  } catch (_) {}
  return "certchamps";
}

export default function Questions() {
  //==============================================> State <========================================//
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [position, setPosition] = useState(0);
  const [questions, setQuestions] = useState<any[]>([]);
  const [showSearch, setShowSearch] = useState(false);

  const [mode, setMode] = useState<QuestionsMode>(getStoredMode);
  const [collectionPaths, setCollectionPaths] = useState<string[]>(() => MODE_TO_PATHS[getStoredMode()]);

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
    const { papers, loading: papersLoading, error: papersError, getPaperBlob } = useExamPapers();
    const [selectedPaper, setSelectedPaper] = useState<ExamPaper | null>(null);
    const [paperBlob, setPaperBlob] = useState<Blob | null>(null);
    const [paperLoadError, setPaperLoadError] = useState<string | null>(null);
    const [currentPaperPage, setCurrentPaperPage] = useState(1);
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

    // Sync mode -> collectionPaths and reload when mode changes
    useEffect(() => {
        const paths = MODE_TO_PATHS[mode];
        setCollectionPaths(paths);
        try {
            localStorage.setItem(QUESTIONS_MODE_KEY, mode);
        } catch (_) {}
    }, [mode]);

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

    // Preselect paper matching current question year when papers load (e.g. "25" -> 2025-p1 or first 2025)
    useEffect(() => {
        if (papers.length === 0 || selectedPaper !== null) return;
        const match = msYear
            ? papers.find((p) => p.label.toLowerCase().startsWith("20" + msYear)) ?? papers[0]
            : papers[0];
        setSelectedPaper(match);
    }, [papers, msYear, selectedPaper]);

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
            {/* Drawing canvas: render first so it sits behind (z-0) */}
            <div className="absolute inset-0 z-0">
                <DrawingCanvas registerDrawingSnapshot={registerDrawingSnapshot} />
            </div>

            {/* Sidebar: outside scaled area so it sits at viewport right edge */}
            <div className="absolute right-0 top-0 bottom-0 z-20 h-full pointer-events-auto">
                <CollapsibleSidebar question={currentQuestion} getDrawingSnapshot={getDrawingSnapshot} getPaperSnapshot={getPaperSnapshot} />
            </div>

            {/* Full-width scaled layout: question + PDF on the left (no centering) */}
            <div
                className="absolute inset-0 z-10 flex flex-col items-start pointer-events-none"
                style={{ transform: "scale(0.82)", transformOrigin: "0 0" }}
            >
            {/* Foreground: top-left block on top, then PDF underneath. */}
            <div className="relative flex min-h-0 flex-1 flex-col gap-4 items-start w-full">
                {/* Top left: dropdown, question selector (title + arrows + buttons), question text - no background or border */}
                <div className="shrink-0 flex flex-col gap-2 pt-4 pl-4 max-w-md pointer-events-auto">
                    <label htmlFor="questions-mode" className="sr-only">Question source</label>
                    <select
                        id="questions-mode"
                        value={mode}
                        onChange={(e) => setMode(e.target.value as QuestionsMode)}
                        className="w-fit rounded border-0 bg-transparent color-txt-main py-1 pr-6 text-sm focus:outline-none focus:ring-0"
                    >
                        <option value="certchamps">CertChamps questions</option>
                        <option value="pastpaper">Past paper questions</option>
                    </select>
                    <QuestionSelector
                        question={currentQuestion}
                        nextQuestion={nextQuestion}
                        previousQuestion={previousQuestion}
                        setShowSearch={setShowSearch}
                        overrideTitle={mode === "pastpaper" ? (papersLoading ? "Loading…" : papersError ? "Failed to load" : selectedPaper?.label ?? "Select a paper") : undefined}
                        overrideOnPrevious={mode === "pastpaper" ? () => {
                            const idx = selectedPaper ? papers.findIndex((p: ExamPaper) => p.id === selectedPaper.id) : -1;
                            if (idx > 0) setSelectedPaper(papers[idx - 1]);
                        } : undefined}
                        overrideOnNext={mode === "pastpaper" ? () => {
                            const idx = selectedPaper ? papers.findIndex((p: ExamPaper) => p.id === selectedPaper.id) : -1;
                            if (idx >= 0 && idx < papers.length - 1) setSelectedPaper(papers[idx + 1]);
                        } : undefined}
                    />
                    {mode !== "pastpaper" && (
                        <RenderMath text={currentQuestion?.content?.[0]?.question ?? "ughhhh no question"} className="font-bold text-sm txt" />
                    )}
                </div>

                {/* PDF panel: viewer when past paper mode */}
                {mode === "pastpaper" && (
                    <div className="flex h-[740px] max-h-[75vh] w-full max-w-[520px] shrink-0 flex-col overflow-hidden pl-4 pointer-events-auto">
                        <div className="min-h-0 min-w-0 flex-1 flex flex-col overflow-hidden p-2">
                            {paperLoadError && (
                                <div className="shrink-0 py-2 text-sm color-txt-sub">
                                    {paperLoadError}
                                </div>
                            )}
                            {paperBlob ? (
                                <PaperPdfPlaceholder
                                    file={paperBlob}
                                    pageWidth={480}
                                    onCurrentPageChange={setCurrentPaperPage}
                                />
                            ) : selectedPaper && !paperBlob && !paperLoadError ? (
                                <div className="flex h-full min-h-[200px] flex-col items-center justify-center px-4 text-center">
                                    <p className="color-txt-sub text-sm">Loading paper…</p>
                                </div>
                            ) : (
                                <div className="flex h-full min-h-[200px] flex-col items-center justify-center px-4 text-center">
                                    <p className="color-txt-sub text-sm">Select a paper to view.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {showSearch ? (
                <QSearch
                    setShowSearch={setShowSearch}
                    questions={questions}
                    position={position}
                    setPosition={setPosition}
                />
            ) : null}

            </div>
            {/*===============================================================================================*/}
        </div>
    )
}

 