import { LuSearch, LuFilter } from "react-icons/lu";
import useQuestions from "../hooks/useQuestions";
import { useEffect, useState } from "react";
import Lottie  from 'lottie-react';
import loadingAnim from '../assets/animations/loading.json';
import { LuChevronRight } from "react-icons/lu";
import RenderMath from "../components/mathdisplay";
import MathInput from "../components/mathinput";


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


    const [questions, setQuestions] = useState<any[]>([])
    const [position, setPosition] = useState(0) // position of question in the array
    const [part, setPart] = useState(0) // position of part in a question


    const { loadQuestions } = useQuestions({ setQuestions })

    useEffect(() => {
        loadQuestions()
    }, [])

    return (
        <div className="w-full h-full flex flex-col justify-items-center p-4">

            {/* ======================================== SEARCH AND FILTER ========================================== */}
            <div className="flex items-center justify-center w-full ">
                <div className="flex items-center justify-between txtbox w-9/12 max-w-xs">
                    <input type="text" placeholder="Search Questions" className=" txtbox w-full outline-none border-none"/>
                    <LuSearch className="text-grey dark:text-light-grey" size={24}/>
                </div>
                <LuFilter className="text-grey dark:text-light-grey m-4"  size={24}/>
            </div>

            {/* ======================================== QUESTION CARD ========================================== */}
            <div className="h-[90%] w-[97.5%] bg-grey/5 dark:bg--light-grey/10 rounded-out m-auto border-2 p-8
             border-light-grey dark:border-grey shadow-xl">

            {
                questions[position]? (
                    <div>

                        {/* ===================================== HEADING ======================================== */}
                        <span className="txt-bold block">{questions[position].properties.name}
                            <span className="txt-sub mx-2 inline">#{questions[position].properties.tags.join(", ")}</span>
                        </span>
                        

                        {/* ======================================= DEALING WITH PARTS ========================================== */}
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
                        
                        <div className="w-1/2 m-4">
                            <RenderMath text={questions[position].content[part].question} className="txt text-xl h-20" />
                            <img src={questions[position].content[part].image} className="h-30 m-4 dark:invert-100"/>
                           
                        </div>
                        {
                            questions[position].content[part].answer.map(() => (
                                <MathInput />
                            ))
                        }
                        <p className="plain-btn m-4 cursor-pointer" onClick={() => {loadQuestions(); setPosition(prev => prev + 1); setPart(0)}}>Next Questions</p>
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