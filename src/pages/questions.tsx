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
    const [questions, setQuestions] = useState<any[]>([])
    const [filters, setFilters] = useState<any[]>([])
    const [position, setPosition] = useState(0) // position of question in the array
    const { loadQuestions } = useQuestions({ setQuestions, filters })
    const { id } = useParams()


    useEffect(() => {
        setQuestions([]) // reset questions 
        loadQuestions() // load new question in 
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
            />

        </div>
    )
}

