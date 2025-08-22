// Icons 
import { LuSearch, LuFilter } from "react-icons/lu";

// Hooks 
import useQuestions from "../hooks/useQuestions";
import { useEffect, useState } from "react";

// Components
import Question from "../components/question";

// Style Imports 
import '../styles/questions.css'
import '../styles/navbar.css'

export default function Questions() {

    //=================================> State, Hooks, and Context <================================//
    const [questions, setQuestions] = useState<any[]>([])
    const [position, setPosition] = useState(0) // position of question in the array
    const { loadQuestions } = useQuestions({ setQuestions })

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
        <div className="w-h-container flex-col p-4">

            {/* ======================================== SEARCH AND FILTER ========================================== */}
            <div className="w-container">

                <div className="search-container">
                    <input type="text" placeholder="Searchh Questions" className="search-input"/>
                    <LuSearch className="search-icon" size={24}/>
                </div>

                <LuFilter className="search-icon m-4"  size={24}/>

            </div>
            {/* ===================================================================================================== */}


            <Question questions={questions} position={position} />

        </div>
    )
}

