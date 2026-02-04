// Hooks
import { useCallback, useEffect, useRef, useState } from "react";
import useQuestions from "../hooks/useQuestions";

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
        collectionPaths, // Use the state variable here
    });

    //const { id } = useParams() -- will be used to load questions from a specific deck later on!

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


    const currentQuestion = questions[position - 1];
    const msCode = currentQuestion?.properties?.markingScheme
        ? String(currentQuestion.properties.markingScheme)
        : "";
    const msYear = msCode.length >= 2 ? msCode.substring(0, 2) : (mode === "pastpaper" ? "25" : "");

    return (
        <div className="relative flex w-full h-full flex-col gap-0">
            {/* Drawing canvas: render first so it sits behind (z-0) */}
            <div className="absolute inset-0 z-0">
                <DrawingCanvas registerDrawingSnapshot={registerDrawingSnapshot} />
            </div>

            {/* Foreground: top-left block on top, then PDF underneath. pointer-events-none so drawing passes through; bar and PDF opt back in. */}
            <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-4 items-start pointer-events-none">
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
                    />
                    <RenderMath text={currentQuestion?.content?.[0]?.question ?? "ughhhh no question"} className="font-bold text-sm txt" />
                </div>

                {/* PDF panel: directly underneath the top-left block when past paper mode */}
                {mode === "pastpaper" && (
                    <div className="flex min-h-[420px] w-full max-w-[380px] shrink-0 flex-col overflow-hidden color-bg-grey-5 pl-4 pointer-events-auto">
                        <div className="flex shrink-0 items-center border-b border-grey/20 px-3 py-2">
                            <span className="color-txt-sub text-sm font-medium">Paper / marking scheme</span>
                        </div>
                        <div className="flex min-h-[420px] min-w-0 flex-1 flex-col overflow-hidden p-2">
                            {msYear ? (
                                <PaperPdfPlaceholder year={msYear} />
                            ) : (
                                <div className="flex h-full min-h-[200px] flex-col items-center justify-center px-4 text-center">
                                    <p className="color-txt-sub text-sm">Select a question to view the paper.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Collapsible sidebar: collapse button + swipe right to close */}
            <div className="absolute right-0 top-0 bottom-0 z-20 h-full pointer-events-auto">
                <CollapsibleSidebar question={currentQuestion} getDrawingSnapshot={getDrawingSnapshot} />
            </div>

            {showSearch ? (
                <QSearch
                    setShowSearch={setShowSearch}
                    questions={questions}
                    position={position}
                    setPosition={setPosition}
                />
            ) : null}

            {/*===============================================================================================*/}
        </div>
    )
}

 