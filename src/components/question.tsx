// Icons 
import { LuChevronRight, LuMessageSquareText, LuBook, LuShare2 } from "react-icons/lu";
import { TbCards } from "react-icons/tb";

// Hooks 
import useQuestions from "../hooks/useQuestions";
import { useEffect, useState } from "react";

// Components
import Lottie  from 'lottie-react';
import loadingAnim from '../assets/animations/loading.json';
import RenderMath from "./math/mathdisplay";
import MathInput from "./math/mathinput";
import QThread from "../components/questions/q_thread"
import ViewDecks from "./viewDecks";
import SharePanel from "./social/sharePanel";

// Style Imports 
import '../styles/questions.css'
import '../styles/navbar.css'


type questionsProps = {
    questions: any[], 
    position: number,
    deckmode?: boolean
    preview?: boolean 
}

export default function Question(props: questionsProps) {

    //=================================> State, Hooks, and Context <================================//
    const [content, setContent] = useState<any>()
    const [properties, setProperties] = useState<any>()
    const [part, setPart] = useState(0) // position of part in a question
    const [page, setPage ]= useState<string>('practice')
    const [ sideView, setSideView ] = useState<string>('')

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

                <div className="p-8 w-2/3">

                    {/* HEADING */}
                    <p className="txt-bold color-txt-accent">{properties?.name}
                        <span className="txt-sub mx-2">{properties?.tags?.join?.(", ")}</span>
                        {   
                            
                            content?.[part]?.answer.map((ans: any) => (
                                <span className="txt-sub">{`ANS: ${ans}`}</span>
                            ))
                        }
                        
                    </p>
                    
                    {/* PART NAVIGATION */}
                    <div className="flex">
                        {content.length > 1 && content.map((_ : any, idx: number) => (
                            <div key={idx} className="flex items-center justify-center h-10"
                                onClick={() => setPart(idx)}>

                                <p className={`part-number
                                    ${part === idx ? 'bg-white/5' : 'hover:bg-white/10'}`} 
                                >{toRoman(idx + 1)}</p>

                                <LuChevronRight className={`${idx + 1 === content.length ? 'invisible' : 'visible'} 
                                    color-txt-sub`}/>

                            </div>
                        ))}
                    </div> 

                    {/* QUESTION CONTENT */}
                    <div className="w-2/3 m-4">
                        <RenderMath text={content[part]?.question ?? ''} className="txt text-xl" />
                        {content?.[part]?.image && <img src={content[part].image} className="max-h-30 m-4 dark:invert-100"/>}
                    </div>

                    {/* MATH INPUT */}
                    { !props.preview ? (
                    content?.[part]?.answer?.map((ans: any, idx: number) => (
                        <MathInput key={idx} answer={ans}/>
                    ))
                    ) :(<></>)
                    }

                </div>
                {/* ====================================================================================== */}
                
                {sideView === 'thread' ? (
                    <div className="border-l border-light-grey dark:border-grey h-full w-150">
                        <QThread
                        questionId={properties?.id ?? props.questions[props.position]?.id}
                        part={part}
                        />
                    </div>
                ) : null}

                {sideView === 'decks' ? (
                    <div className="border-l border-light-grey dark:border-grey h-full w-150">
                        <ViewDecks question={properties?.id}/>
                    </div>
                ) : null}

                {sideView === 'share' ? (
                    <div className="border-l border-light-grey dark:border-grey h-full w-150">
                        <SharePanel/>
                    </div>
                ) : null}
                    
                
                {/* ================================== QUESTION SIDEBAR ================================== */}
                { !props.preview ? (
                <div className="h-full rounded-r-out p-4">
                    <div
                        className={sideView == 'thread' ? "nav-item-selected mb-4 mt-0" : "nav-item mb-4"}
                        onClick={() => {
                            setSideView( (prev: any) => {
                                if (prev != 'thread') return 'thread'
                                else return '' 
                            });
                        }}
                    >
                        <LuMessageSquareText strokeWidth={strokewidth} size={iconSize} 
                            className={sideView == 'thread' ? 'nav-icon-selected' : 'nav-icon'}
                            fill={sideView == 'thread' ? 'currentColor' : 'none'} /> 
                    </div>
                    
                    {
                    props.deckmode ? 
                    (
                    <div className={sideView == 'share' ? 'nav-item-selected mb-4' : 'nav-item mb-4'} 
                        onClick={() => {
                            setSideView( (prev: any) => {
                                if (prev != 'share') return 'share'
                                else return '' 
                            });
                        }}
                    >
                        <LuShare2 strokeWidth={strokewidth} size={iconSize} 
                            className={sideView == 'share' ? 'nav-icon-selected' : 'nav-icon'}
                            fill={sideView == 'share' ? 'currentColor' : 'none'} />
                    </div>
                    ) : 
                    (
                    <div className={sideView == 'decks' ? 'nav-item-selected mb-4' : 'nav-item mb-4'} 
                        onClick={() => {
                            setSideView( (prev: any) => {
                                if (prev != 'decks') return 'decks'
                                else return '' 
                            });
                        }}
                    >
                        <TbCards strokeWidth={strokewidth} size={iconSize} 
                            className={sideView == 'decks' ? 'nav-icon-selected' : 'nav-icon'}
                            fill={sideView == 'decks' ? 'currentColor' : 'none'} />
                    </div>
                    )
                    }   

                    <div className={page === 'practicee' ? 'nav-item-selected' : 'nav-item'} >
                        <LuBook strokeWidth={strokewidth} size={iconSize} 
                            className={page === 'practicee' ? 'nav-icon-selected' : 'nav-icon'}
                            fill={page === 'practicee' ? 'currentColor' : 'none'} />
                    </div>
                </div>
                ) : (<></>)}        
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
