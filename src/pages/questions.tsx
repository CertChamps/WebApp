// Icons 
import { LuSearch, LuFilter, LuChevronRight, LuMessageSquareText, LuBook } from "react-icons/lu";
import { TbCards } from "react-icons/tb";

// Hooks 
import useQuestions from "../hooks/useQuestions";
import { useEffect, useState } from "react";

// Components
import Lottie  from 'lottie-react';
import loadingAnim from '../assets/animations/loading.json';
import RenderMath from "../components/mathdisplay";
import MathInput from "../components/mathinput";

// Other Imports 


// ================================= CONVERTS NUMBER TO ROMAN NUMERAL ====================================== //
function toRoman(n: number): string | null {
    const map: Record<number, string> = {
        1: "i",
        2: "ii",
        3: "iii",
        4: "iv",
        5: "v",
        6: "vi",
        7: "vii",
        8: "viii",
        9: "ix",
        10: "x",
    };

    return map[n] ?? null;
}
// ========================================================================================================= //

export default function Questions() {

    //=================================> State, Hooks, and Context <================================//
    const [questions, setQuestions] = useState<any[]>([])
    const [position, setPosition] = useState(0) // position of question in the array
    const [part, setPart] = useState(0) // position of part in a question
    const { loadQuestions } = useQuestions({ setQuestions })
    const [page, setPage ]= useState<string>('practice')

    //=========================================> Constants <========================================//
    const iconSize = 48
    const strokewidth = 2

    //===================================> useEffect First Render <=================================//
    useEffect(() => {

        // load questions 
        loadQuestions()

        // key press functionality
        const onKeyDown = (e: any) => {

            // manually going to next question
            if(e.which === 40 || e.which === 39 || e.which === 13){
                loadQuestions(); 
                setPosition(prev => prev + 1); 
                setPart(0)
            }
                
        }

        // key press event listening
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)

    }, [])
    //===============================================================================================//


    return (
        <div className="w-full h-full flex flex-col justify-items-center p-4">

            {/* ======================================== SEARCH AND FILTER ========================================== */}
            <div className="flex items-center justify-center w-full">

                <div className="flex items-center justify-between txtbox w-9/12 max-w-xs">
                    <input type="text" placeholder="Searchh Questions" className=" w-full p-1 outline-none border-none"/>
                    <LuSearch className="text-grey dark:text-light-grey" size={24}/>
                </div>

                <LuFilter className="text-grey dark:text-light-grey m-4"  size={24}/>

            </div>
            {/* ===================================================================================================== */}


            {/* ============================================ QUESTION CARD ========================================== */}
            <div className="h-[85%] w-[97.5%] rounded-out m-auto border-3 shadow-small 
            border-light-grey dark:border-grey ">

            {
                questions[position]? ( 
                <div className="flex justify-between h-full">

                    <div className="p-8">

                        {/* ===================================== HEADING ======================================== */}
                        <span className="txt-bold block">{questions[position].properties.name}
                            <span className="txt-sub mx-2 inline">#{questions[position].properties.tags.join(", ")}</span>
                        </span>
                        {/* ====================================================================================== */}
                        

                        {/* ================================== DEALING WITH PARTS ================================ */}
                        <div className="flex">
                            {    
                            questions[position].content.length > 1  ?

                            // DEALING WITH MULTIPLE PART QUESTIONS
                            questions[position].content.map( (_: any, idx: number) => (
                                <div key={idx} className="flex items-center justify-center h-10"
                                    onClick={() => {setPart(idx)}}>

                                    <p className={`txt mx-2 rounded-out cursor-pointer px-3 py-1 text-grey dark:text-light-grey
                                        ${part == idx ? 'bg-light-grey/50 dark:bg-grey/50' : 'hover:bg-light-grey/25 dark:hover:bg-grey/25'}`} >{toRoman(idx + 1)}</p>
                                    <LuChevronRight className={`${idx + 1 == questions[position].content.length ? 'invisible' : 'visible' } text-grey dark:text-light-grey`}/>

                                </div>
                            ) ) : <></>
                            }
                        </div>
                        {/* ====================================================================================== */}

                        {/* ================================== QUESTION CONTENT ================================== */}
                        <div className="w-2/3 m-4">
                            <RenderMath text={questions[position].content[part].question} className="txt text-xl" />
                            <img src={questions[position].content[part].image} className=" max-h-30 m-4 dark:invert-100"/>  
                        </div>
                        {/* ====================================================================================== */}

                        {/* ================================== MATH INPUT ======================================== */}
                        {
                            questions[position].content[part].answer.map(() => (
                                <MathInput />
                            ))
                        }
                        {/* ====================================================================================== */}

                    </div>
                    {/* ====================================================================================== */}

                    {/* ================================== QUESTION SIDEBAR ================================== */}
                    <div className="h-full rounded-r-out p-4">
                        <div className={page == 'practice' ? 'nav-item-selected mb-4 mt-0' : 'nav-item mb-4'} onClick={() => {}} >
                            <LuMessageSquareText strokeWidth={strokewidth} size={iconSize} 
                                className={page == 'practice' ? 'nav-icon-selected' : 'nav-icon'}
                                fill={page == 'practice' ? 'currentColor' : 'none'} />
                        </div>

                        <div className={page == 'practicee' ? 'nav-item-selected mb-4' : 'nav-item mb-4'} onClick={() => {}} >
                            <TbCards strokeWidth={strokewidth} size={iconSize} 
                                className={page == 'practicee' ? 'nav-icon-selected' : 'nav-icon'}
                                fill={page == 'practicee' ? 'currentColor' : 'none'} />
  
                        </div>

                        <div className={page == 'practicee' ? 'nav-item-selected' : 'nav-item'} onClick={() => {}} >
                            <LuBook strokeWidth={strokewidth} size={iconSize} 
                                className={page == 'practicee' ? 'nav-icon-selected' : 'nav-icon'}
                                fill={page == 'practicee' ? 'currentColor' : 'none'} />
                        </div>
                    </div>
                    {/* ====================================================================================== */}

                </div>
                ) : (
                    <div className="w-full h-full flex justify-center items-center">
                        <Lottie animationData={loadingAnim} loop={true} autoplay={true} 
                            className="h-40 w-40" />
                    </div>
                )
            }
            
            </div>

        </div>
    )
}

