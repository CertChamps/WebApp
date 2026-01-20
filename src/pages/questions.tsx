// React
import { useParams } from "react-router-dom";

// Hooks 
import useQuestions from "../hooks/useQuestions";
import { useEffect, useState } from "react";

// Components
import Question from "../components/questions/question";

// Style Imports 
import '../styles/questions.css'
import '../styles/navbar.css'

export default function Questions() {

    //=================================> State, Hooks, and Context <================================//
    const [filters, setFilters] = useState<any[]>([])
    const [position, setPosition] = useState(0) // position of question in the array
    const [questions, setQuestions] = useState<any[]>([]);
    const [collectionPaths, setCollectionPaths] = useState<string[]>([ // Default paths
        "questions/certchamps",
        "questions/exam-papers",
    ]);


    useEffect(() => {
        console.log("Collection Paths updated:", collectionPaths);
    }, [collectionPaths])

    useEffect(() => {
        console.log("Position updated:", position, questions);
    }, [position, questions])

    const { loadQuestions } = useQuestions({ 
        setQuestions, 
        filters,
        collectionPaths, // Use the state variable here
    });
    const { id } = useParams()


    useEffect(() => {
        loadQuestions() // load new question in 
        setPosition(prev => prev + 1)
    }, [filters])
    //===================================> useEffect First Render <=================================//
    useEffect(() => {
  
        // load questions 
        if ( id )
            loadQuestions(id) 
        else 
            loadQuestions()


    }, [])
    //===============================================================================================//

    const nextQuestion = async () => {
        // If we’re at the end of the loaded array, load one more first
        if (position + 1 >= questions.length) {
          await loadQuestions();
        }
        setPosition((p) => p + 1);
    };


    return (
        <div className="w-h-container flex-row justify-end items-center">

            {/* ======================================== TOP PAGE INFORMATION ========================================== */}
            <div className="flex items-end justify-end">
                
                {/* ======================================== SEARCH AND FILTER ========================================== */}
            
                    {/* <SearchandFilter setFilters={setFilters} /> */}
            </div>
            {/* ===================================================================================================== */}
            <Question
                questions={questions}
                position={position}
                setPosition={setPosition}    // optional but handy
                nextQuestion={nextQuestion}  // <-- pass this
                setFilters={setFilters}
                setCollectionPaths={setCollectionPaths}
            />

        </div>
    )
}

