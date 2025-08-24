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
import QThread from "../components/questions/q_thread"

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
    const [ showThread, setShowThread ] = useState<boolean>(false)

    const { toRoman } = useQuestions()

    const iconSize = 48
    const strokewidth = 2

    useEffect(() => {
        setPage('practice')
        setPart(0)

        const questions = Array.isArray(props.questions) ? props.questions : []
        const q = questions[props.position] ?? {}

        // Ensure content array is never null and each part has defaults
        const safeContent = (q.content ?? []).map((p: any) => ({
            question: p?.question ?? '',
            answer: Array.isArray(p?.answer) ? p.answer : [],
            image: p?.image ?? ''
        }))

        setContent(safeContent)
        setProperties(q.properties ?? {})
    }, [props.position, props.questions])

    return (
        <div className="card-container">
        {
            props.questions[props.position]? ( 
            <div className="h-container items-start justify-between">

                <div className="p-8">

                    {/* HEADING */}
                    <p className="txt-bold">{properties?.name}
                        <span className="txt-sub mx-2">{properties?.tags?.join?.(", ")}</span>
                        {   
                            
                            content?.[part]?.answer.map((ans: any) => (
                                <span className="txt-sub text-blue">{`ANS: ${ans}`}</span>
                            ))
                        }
                        
                    </p>
                    
                    {/* PART NAVIGATION */}
                    <div className="flex">
                        {content.length > 1 && content.map((_ : any, idx: number) => (
                            <div key={idx} className="flex items-center justify-center h-10"
                                onClick={() => setPart(idx)}>

                                <p className={`part-number
                                    ${part === idx ? 'bg-light-grey/50 dark:bg-grey/50' : 'hover:bg-light-grey/25 dark:hover:bg-grey/25'}`} 
                                >{toRoman(idx + 1)}</p>

                                <LuChevronRight className={`${idx + 1 === content.length ? 'invisible' : 'visible'} 
                                    text-grey dark:text-light-grey`}/>

                            </div>
                        ))}
                    </div> 

                    {/* QUESTION CONTENT */}
                    <div className="w-2/3 m-4">
                        <RenderMath text={content[part]?.question ?? ''} className="txt text-xl" />
                        {content?.[part]?.image && <img src={content[part].image} className="max-h-30 m-4 dark:invert-100"/>}
                    </div>

                    {/* MATH INPUT */}
                    {content?.[part]?.answer?.map((ans: any, idx: number) => (
                        <MathInput key={idx} answer={ans}/>
                    ))}

                </div>
                {/* ====================================================================================== */}
                
                {showThread ? (
                    <div className="border-l border-light-grey dark:border-grey h-full w-150">
                        <QThread
                        questionId={properties?.id ?? props.questions[props.position]?.id}
                        part={part}
                        />
                    </div>
                ) : null}
                    
                
                {/* ================================== QUESTION SIDEBAR ================================== */}
                <div className="h-full rounded-r-out p-4">
                    <div
                        className={page == "practice" ? "nav-item-selected mb-4 mt-0" : "nav-item mb-4"}
                        onClick={() => {
                            setPage("practice");
                            setShowThread(v => !v);
                        }}
                    >
                        <LuMessageSquareText strokeWidth={strokewidth} size={iconSize} 
                            className={page == 'practice' ? 'nav-icon-selected' : 'nav-icon'}
                            fill={page == 'practice' ? 'currentColor' : 'none'} /> 

                    </div>

                    <div className={page === 'practicee' ? 'nav-item-selected mb-4' : 'nav-item mb-4'} >
                        <TbCards strokeWidth={strokewidth} size={iconSize} 
                            className={page === 'practicee' ? 'nav-icon-selected' : 'nav-icon'}
                            fill={page === 'practicee' ? 'currentColor' : 'none'} />
                    </div>

                    <div className={page === 'practicee' ? 'nav-item-selected' : 'nav-item'} >
                        <LuBook strokeWidth={strokewidth} size={iconSize} 
                            className={page === 'practicee' ? 'nav-icon-selected' : 'nav-icon'}
                            fill={page === 'practicee' ? 'currentColor' : 'none'} />
                    </div>
                </div>

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
