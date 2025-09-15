// Icons 
import { LuChevronRight, LuMessageSquareText, LuShare2, LuBookMarked, LuCheck } from "react-icons/lu";
import { TbCards } from "react-icons/tb";

// Hooks 
import useQuestions from "../../hooks/useQuestions";
import { useEffect, useState } from "react";

// Components
import Lottie  from 'lottie-react';
import loadingAnim from '../../assets/animations/loading.json';
import RenderMath from "./../math/mathdisplay";
import MathInput from "./../math/mathinput";
import QThread from "../../components/questions/q_thread"
import ViewDecks from "./../viewDecks";
import SharePanel from "../social/sharePanel";
import LogTables from "../../components/logtables"
import RankBar from "../../components/rankbar";
import AnswerNoti from "../math/answerNoti";

// Style Imports 
import '../../styles/questions.css'
import '../../styles/navbar.css'
import useMaths from "../../hooks/useMaths";

// Sounds
import correctSound from "../../assets/sounds/Click-Bounce_Success.wav";
import incorrectSound from "../../assets/sounds/Click-Bounce_Failure.wav";

// Component Props
type questionsProps = {
    questions: any[];
    position: number;
    setPosition?: (n: number | ((p: number) => number)) => void;
    nextQuestion?: () => Promise<void> | void;
    deckmode?: boolean;
    preview?: boolean;
};

export default function Question(props: questionsProps) {

    //================================= State, Hooks, and Context ================================//
    const [content, setContent] = useState<any>()
    const [properties, setProperties] = useState<any>()
    const [part, setPart] = useState<number>(0) 
    const [inputs, setInputs] = useState<any[]>([])
    useEffect(() => {
        console.log("inputs: ", inputs)
        console.log("answers: ",content?.[part]?.answer)
        console.log(isCorrect(inputs, content?.[part]?.answer))
    }, [inputs])

    const [ sideView, setSideView ] = useState<string>('')

    const { toRoman } = useQuestions()
    const { isCorrect } = useMaths();

    const [isRight, setIsRight] = useState(false);   // result of last check
    const [showNoti, setShowNoti] = useState(false); // controls AnswerNoti

    

    //=========================================== Constants =====================================//
    const iconSize = 48
    const strokewidth = 2

    //===================================== Question handling ===================================//
    useEffect(() => {

        // initialise the parts
        setPart(0)

        // Get the current question
        const questions = Array.isArray(props.questions) ? props.questions : []
        const q = questions[props.position] ?? {}

        // Ensure content array is never null and each part has defaults
        const safeContent = (q.content ?? []).map((p: any) => ({
            question: p?.question ?? '',
            answer: Array.isArray(p?.answer) ? p.answer : [],
            image: p?.image ?? ''
        }))

        // Set the question state 
        setContent(safeContent)
        setProperties(q.properties ?? {})

    }, [props.position, props.questions])
    //==========================================================================================//

    //===================================== Answer checking ===================================//
    function onCheck() {
        const answers = content?.[part]?.answer ?? [];
        const ready =
            Array.isArray(inputs) &&
            inputs.length === answers.length &&
            inputs.every((v) => (v ?? "").toString().trim().length > 0);
          
        const ok = ready ? isCorrect(inputs, answers) : false;
          
        if (ok) {
            playCorrectSound();   // 🔊 play sound when correct
        } else {
            playInorrectSound(); // 🔊 play sound when incorrect
        }
          
        setIsRight(ok);
        setShowNoti(true);
    }

    function goNextFromNoti() {
        setShowNoti(false);
        setIsRight(false);
        setInputs([]);
      
        // Next part if available
        if ((content?.length ?? 0) > part + 1) {
          setPart((p) => p + 1);
          return;
        }
      
        // Otherwise ask parent to move to the next question
        if (props.nextQuestion) {
          props.nextQuestion();
        } else if (props.setPosition) {
          // fallback if parent didn’t pass nextQuestion
          props.setPosition((p) => Math.min(p + 1, (props.questions?.length ?? 1) - 1));
        }
    }

    function playCorrectSound() {
        try {
          const audio = new Audio(correctSound);
          audio.volume = 0.6; // tweak volume as you like
          audio.play().catch(() => {});
        } catch (err) {
          console.error("Could not play sound", err);
        }
    }

    function playInorrectSound() {
        try {
          const audio = new Audio(incorrectSound);
          audio.volume = 0.6; // tweak volume as you like
          audio.play().catch(() => {});
        } catch (err) {
          console.error("Could not play sound", err);
        }
    }

    useEffect(() => {
        setInputs([]);
        setIsRight(false);
        setShowNoti(false);
    }, [part]);
      
    useEffect(() => {
        setPart(0);
        setInputs([]);
        setIsRight(false);
        setShowNoti(false);
    }, [props.position, props.questions]);
    //==========================================================================================//


    return (
    <div className="flex h-full w-full items-start my-4 ">
    <AnswerNoti visible={showNoti && isRight} onNext={goNextFromNoti} />
    { //============================= QUESTIONS CONTAINER ====================================// 
    props.questions[props.position]? ( 
    <div className="card-container h-container items-start justify-start w-full">
        <div className="p-8 w-full h-full flex flex-col justify-between">

            <div>
            {/* ================================ HEADING =================================== */}
            {/* ======================================== RANKBAR ========================================== */}
                <div className="flex ">
                    <RankBar rank={2} progress={Math.min(50, 100)} />
                </div>

            <p className="txt-bold color-txt-accent">{properties?.name}
                <span className="txt-sub mx-2">{properties?.tags?.join?.(", ")}</span>
                {       
                    content?.[part]?.answer.map((ans: any) => (
                        <span className="txt-sub">{`ANS: ${ans}`}</span>
                    ))
                }
            </p>
            {/* ============================================================================ */}

            
            {/* ============================= PART NAVIGATION ===============================*/}
            <div className="flex">
                {content.length > 1 && content.map((_ : any, idx: number) => (
                    <div key={idx} className="flex items-center justify-center h-10" onClick={() => {setPart(idx); setInputs([])}}>

                        <p className={`part-number ${part === idx ? 'bg-white/5' : 'hover:bg-white/10'}`} >
                            {toRoman(idx + 1)}
                        </p>

                        <LuChevronRight className={`${idx + 1 === content.length ? 'invisible' : 'visible'} color-txt-sub`}/>

                    </div>
                ))}
            </div> 
            {/* ============================================================================ */}


            {/* ============================== QUESTION CONTENT =========================== */}
            <div className="w-2/3 m-4 ">
                <RenderMath text={content[part]?.question ?? ''} className="txt text-xl" />
                {content?.[part]?.image && <img src={content[part].image} className="max-h-30 m-4 dark:invert-100"/>}
            </div>
            {/* ============================================================================ */}
            </div>

            <div>
            {/* =============================== MATH INPUT ================================= */}
            <div className="flex">
                { !props.preview ? (
                    content?.[part]?.answer?.map((_: any, idx: number) => (
                        <MathInput
                            key={idx}
                            index={idx}
                            setInputs={setInputs}
                            onEnter={onCheck}   // <- Enter now checks
                        />
                    ))
                ) :(<></>)
                }
                
                <div
                    className="h-10 w-10 rounded-full color-bg-accent flex items-center justify-center cursor-pointer hover:opacity-90"
                    onClick={onCheck}
                    title="Check"
                >
                    <LuCheck strokeWidth={3} size={30} className="color-txt-accent" />
                </div>

            </div>
            {/* ============================================================================ */}
            </div>

        </div>
        {/* ====================================================================================== */}


    </div>
    ) : (
        /* =========================== LOADING ANIMATION =========================== */
        <div className="w-full h-full flex justify-center items-center">
            <Lottie animationData={loadingAnim} loop={true} autoplay={true} 
                className="h-40 w-40" />
        </div>
        /* ============================================================================== */
    )
    }
    { /* ===================================================================================== */ }

            
        {/* =================================== QUESTION SIDEVIEWS ================================= */}
        {sideView === 'thread' ? (
            <div className="border-l border-light-grey dark:border-grey h-full w-150">
                <QThread
                    questionId={properties?.id ?? props.questions[props.position]?.id}
                    part={part}
                />
            </div>
        ) : null}

        {sideView === 'logtables' ? (
            <div className="border-l border-light-grey dark:border-grey h-full w-150">
                <LogTables pgNumber="10"/>
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
        {/* ====================================================================================== */}    
        
        {/* ================================== QUESTION SIDEBAR ================================== */}
        { !props.preview ? (
        <div className="h-full rounded-r-out p-4">

            {/* =============================== THREADS ICON ================================= */}
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
            {/* ============================================================================ */}

            {/* =============================== LOGTABLES ICON ================================= */}
            <div className={sideView == 'logtables' ? 'nav-item-selected mb-4' : 'nav-item mb-4'} 
                onClick={() => {
                    setSideView( (prev: any) => {
                        if (prev != 'logtables') return 'logtables'
                        else return '' 
                    });
                }}
            >
                <LuBookMarked strokeWidth={strokewidth} size={iconSize} 
                    className={sideView == 'logtables' ? 'nav-icon-selected' : 'nav-icon'}
                    fill={sideView == 'logtables' ? 'currentColor' : 'none'} />
            </div>
            {/* ================================================================================ */}
            
            { props.deckmode ? (
            /* =========================== SHARE ICON (DECK ONLY) =========================== */
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
            /* ============================================================================== */

            ) : (

            /* ================================ DECKS ICON ================================= */
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
            /* ============================================================================== */

            )
            }   
        </div>
        ) : (<></> /* Do not show sidebar in preview mode */)
        }
        {/* ====================================================================================== */}    
    </div>
    )
}
