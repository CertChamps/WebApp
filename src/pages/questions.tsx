// React
import { useContext } from "react";

// Icons 
import { LuSearch, LuFilter } from "react-icons/lu";

// Hooks 
import useQuestions from "../hooks/useQuestions";
import { UserContext } from "../context/UserContext"
import { useEffect, useState } from "react";

// Components

import Question from "../components/question";
import RankBar from "../components/rankbar";


// Style Imports 
import '../styles/questions.css'
import '../styles/navbar.css'

export default function Questions() {

    //=================================> State, Hooks, and Context <================================//
    const [questions, setQuestions] = useState<any[]>([])
    const [position, setPosition] = useState(0) // position of question in the array
    const { loadQuestions } = useQuestions({ setQuestions })
    const { user } = useContext(UserContext);

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

            {/* ======================================== TOP PAGE INFORMATION ========================================== */}
            <div className="flex items-end justify-end ">
                {/* ======================================== RANKBAR ========================================== */}
                <div className="flex mr-20">
                    <RankBar rank={user.rank} progress={Math.min(user.xp, 100)} />
                </div>

                {/* ======================================== SEARCH AND FILTER ========================================== */}
                <div className="flex items-center gap-3 w-205">
                    <div className="flex items-center txtbox w-full max-w-xs">
                        <input type="text" placeholder="Search Questions" className=" w-full p-1 outline-none border-none"/>
                        <LuSearch className="color-grey " size={24}/>
                    </div>
                    
                    <button type="button" className="p-1">
                        <LuFilter className="text-grey dark:text-light-grey m-4"  size={30}/>
                    </button>
                </div>
            </div>
            {/* ===================================================================================================== */}


            <Question questions={questions} position={position} />

        </div>
    )
}

