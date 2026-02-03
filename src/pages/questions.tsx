// Hooks
import { useCallback, useEffect, useRef, useState } from "react";
import useQuestions from "../hooks/useQuestions";

// Components
import QuestionSelector from "../components/questions/questionSelector";
import QSearch from "../components/questions/qSearch";
import DrawingCanvas, { type RegisterDrawingSnapshot } from "../components/questions/DrawingCanvas";
import RenderMath from "../components/math/mathdisplay";
import { CollapsibleSidebar } from "../components/sidebar";

// Style Imports 
import '../styles/questions.css'
import '../styles/navbar.css'
import '../styles/sidebar.css'

export default function Questions() {

    //==============================================> State <========================================//
    const [filters, setFilters] = useState<Record<string, string[]>>({})
    const [position, setPosition] = useState(0) // position of question in the array
    const [questions, setQuestions] = useState<any[]>([]);

    const [showSearch, setShowSearch] = useState(false)

    const [collectionPaths, setCollectionPaths] = useState<string[]>([ 
        "questions/certchamps",
    ]);

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
        loadQuestions() // load new question in 
        setPosition(prev => prev + 1 )
    }, [filters])

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
        <div className="relative flex  w-full h-full gap-4">
    
            <div className="w-[22.5%] h-full min-w-80 shrink-0 z-10 pointer-events-none"> 
                <QuestionSelector
                    question={questions[position - 1]}
                    nextQuestion={nextQuestion}
                    previousQuestion={previousQuestion}
                    setShowSearch={setShowSearch}
                />
            </div>

            <div className="w-full h-full z-10 flex justify-between items-start pointer-events-none">
                <div className="z-10  p-4 pointer-events-none">
                    <RenderMath text={questions[position - 1]?.content?.[0]?.question ?? 'ughhhh no question'} className="font-bold text-sm txt" />
                </div>
                {/* Placeholder for layout - sidebar is a sibling below so it can receive pointer events */}
                <div className="min-w-80 max-w-96 w-1/2 shrink-0" aria-hidden />
            </div>

            {/* Collapsible sidebar: collapse button + swipe right to close */}
            <div className="absolute right-0 top-0 bottom-0 z-20 h-full pointer-events-auto">
                <CollapsibleSidebar question={questions[position - 1]} getDrawingSnapshot={getDrawingSnapshot} />
            </div>

            {/*===================================> OVERLAY COMPONENTS <===================================*/}
            <div className="w-full h-full absolute inset-0 z-0">
                <DrawingCanvas registerDrawingSnapshot={registerDrawingSnapshot} />
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

 