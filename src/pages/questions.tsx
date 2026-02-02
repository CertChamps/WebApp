// Hooks 
import { useEffect, useRef, useState } from "react";
import useQuestions from "../hooks/useQuestions";


// Components
import QuestionSelector from "../components/questions/questionSelector";
import QSearch from "../components/questions/qSearch";
import DrawingCanvas from "../components/questions/DrawingCanvas";
import RenderMath from "../components/math/mathdisplay";
import { AIChat } from "../components/ai";

// Style Imports 
import '../styles/questions.css'
import '../styles/navbar.css'

export default function Questions() {

    //==============================================> State <========================================//
    const [filters, setFilters] = useState<Record<string, string[]>>({})
    const [position, setPosition] = useState(0) // position of question in the array
    const [questions, setQuestions] = useState<any[]>([]);

    const [showSearch, setShowSearch] = useState(false)

    const [collectionPaths, setCollectionPaths] = useState<string[]>([ 
        "questions/certchamps",
    ]);

    const cardContainerRef = useRef<HTMLElement | null>(null)
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
                {/* Placeholder for layout - AIChat is a sibling below so it can receive pointer events */}
                <div className="min-w-80 max-w-96 w-1/2 shrink-0" aria-hidden />
            </div>

            {/* AIChat as sibling (not under pointer-events-none) so it receives clicks */}
            <div className="absolute right-0 h-full top-0 bottom-0 z-20 min-w-96 max-w-120 w-1/2 pointer-events-auto">
                <div className="h-full w-full backdrop-blur-3xl border-l-1 color-shadow rounded-xl overflow-hidden">
                    <AIChat question={questions[position - 1]} />
                </div>
            </div>

            {/*===================================> OVERLAY COMPONENTS <===================================*/}
            <div className="w-full h-full absolute inset-0 z-0">
                <DrawingCanvas />
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

