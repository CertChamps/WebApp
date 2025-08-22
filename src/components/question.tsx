// Icons 
import { LuChevronRight, LuMessageSquareText, LuBook } from "react-icons/lu";
import { TbCards } from "react-icons/tb";

// Hooks 
import useQuestions from "../hooks/useQuestions";
import { useEffect, useState } from "react";

// Components
import Lottie  from 'lottie-react';
import loadingAnim from '../assets/animations/loading.json';
import RenderMath from "../components/mathdisplay";
import MathInput from "../components/mathinput";

// Style Imports 
import '../styles/questions.css'
import '../styles/navbar.css'


type questionsProps = {
    questions: any[], 
    position: number
}

export default function Question(props: questionsProps) {

    //=================================> State, Hooks, and Context <================================//
    const [content, setContent] = useState<any>()
    const [properties, setProperties] = useState<any>()
    const [part, setPart] = useState(0) // position of part in a question
    const [page, setPage ]= useState<string>('practice')

    const { toRoman } = useQuestions()


    //=========================================> Constants <========================================//
    const iconSize = 48
    const strokewidth = 2
    
    //=================================> UPDATE QUESTION INFO <================================//
    useEffect(() => {

        setPage('practice')
        setPart(0) 

        // Set the current question content and properties 
        const questions = Array.isArray(props.questions) ? props.questions : []
        const q = questions[props.position] ?? {}
        setContent(q.content ?? null )
        setProperties(q.properties ?? null )

    }, [props.position, props.questions])


    return (
        //============================================ QUESTION CARD ==========================================//
        <div className="card-container">

        {
            props.questions[props.position]? ( 
            <div className="h-container items-start justify-between">

                <div className="p-8">

                    {/* ===================================== HEADING ======================================== */}
                    <p className="txt-bold">{properties?.name}
                        <span className="txt-sub mx-2">#{properties?.tags.join(", ")}</span>
                    </p>
                    {/* ====================================================================================== */}
                    

                    {/* ================================== DEALING WITH PARTS ================================ */}
                    <div className="flex">
                        {    
                        content?.length > 1  ?

                        // DEALING WITH MULTIPLE PART QUESTIONS
                        content?.map( (_: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-center h-10"
                                onClick={() => {setPart(idx)}}>

                                <p className={`part-number
                                    ${part == idx ? 'bg-light-grey/50 dark:bg-grey/50' : 'hover:bg-light-grey/25 dark:hover:bg-grey/25'}`} 
                                >{toRoman(idx + 1)}</p>

                                <LuChevronRight className={`${idx + 1 == props.questions[props.position].content.length ? 'invisible' : 'visible' } 
                                    text-grey dark:text-light-grey`}/>

                            </div>
                        ) ) : <></>
                        }
                    </div>
                    {/* ====================================================================================== */}

                    {/* ================================== QUESTION CONTENT ================================== */}
                    <div className="w-2/3 m-4">
                        <RenderMath text={props.questions[props.position].content[part].question} className="txt text-xl" />
                        <img src={props.questions[props.position].content[part].image} className=" max-h-30 m-4 dark:invert-100"/>  
                    </div>
                    {/* ====================================================================================== */}

                    {/* ================================== MATH INPUT ======================================== */}
                    {
                        props.questions[props.position].content[part].answer.map(() => (
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
    )
}