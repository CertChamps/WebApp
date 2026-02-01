// Hooks 
import { useEffect, useState } from "react";
import useQuestions from "../hooks/useQuestions";


// Components
import { AnimatePresence, motion } from "framer-motion";
import QuestionSelector from "../components/questions/questionSelector";
import QSearch from "../components/questions/qSearch";
import DrawingCanvas from "../components/questions/DrawingCanvas";
import RenderMath from "../components/math/mathdisplay";

// Style Imports 
import '../styles/questions.css'
import '../styles/navbar.css'

export default function Questions() {

    //==============================================> State <========================================//
    const [filters, setFilters] = useState<Record<string, string[]>>({})
    const [position, setPosition] = useState(0) // position of question in the array
    const [questions, setQuestions] = useState<any[]>([]);

    const [showSearch, setShowSearch] = useState(false)
    const [canvasMode, setCanvasMode] = useState(false)

    const [collectionPaths, setCollectionPaths] = useState<string[]>([ 
        "questions/certchamps",
    ]);

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
                    canvasMode={canvasMode}
                    setCanvasMode={setCanvasMode}
                />
            </div>

          
            <div className="z-10 w-1/2 p-4 pointer-events-none">
                <RenderMath text={questions[position - 1]?.content?.[0]?.question ?? 'ughhhh no question'} className="font-bold text-sm txt" />
            </div>

            {/*===================================> OVERLAY COMPONENTS <===================================*/}
            
            <AnimatePresence>
                {canvasMode && (
                    <motion.div
                        key="drawing-canvas"
                        className="w-full h-full absolute inset-0 z-0"
                        initial={{ opacity: 1 }}
                        animate={{ opacity: 1 }}
                        exit={{ y: 16, opacity: 0 }}
                        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1], when: "afterChildren" }}
                    >
                        <DrawingCanvas />
                    </motion.div>
                )}
            </AnimatePresence>

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

