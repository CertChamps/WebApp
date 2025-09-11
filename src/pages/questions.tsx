// React
import { useContext } from "react";

// Icons 
import { LuSearch, LuFilter } from "react-icons/lu";

// Hooks 
import useQuestions from "../hooks/useQuestions";
import { UserContext } from "../context/UserContext"
import { useEffect, useState } from "react";

// Components
import Question from "../components/questions/question";
import SearchandFilter from "../components/searchandfilter";



// Style Imports 
import '../styles/questions.css'
import '../styles/navbar.css'

export default function Questions() {

    //=================================> State, Hooks, and Context <================================//
    const [questions, setQuestions] = useState<any[]>([])
    const [filters, setFilters] = useState<any[]>([])
    const [position, setPosition] = useState(0) // position of question in the array
    const { loadQuestions } = useQuestions({ setQuestions, filters })
    const { user } = useContext(UserContext);

    useEffect(() => {
        setQuestions([]) // reset questions 
        loadQuestions() // load new question in 
    }, [filters])
    //===================================> useEffect First Render <=================================//
    useEffect(() => {
  
        // load questions 
        loadQuestions()

        // key press functionality
        const onKeyDown = (e: any) => {

            // manually going to next question
            if(e.which === 13){
                loadQuestions(); 
                setPosition(prev => prev + 1); 
            }
                
        }

        // key press event listening
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)

    }, [])
    //===============================================================================================//


    return (
        <div className="w-h-container flex-col justify-start p-4">

            {/* ======================================== TOP PAGE INFORMATION ========================================== */}
            <div className="flex items-end justify-end">
                
                {/* ======================================== SEARCH AND FILTER ========================================== */}
            
                    <SearchandFilter setFilters={setFilters} />
            </div>
            {/* ===================================================================================================== */}




            <Question questions={questions} position={position} />

        </div>
    )
}

