// Icons 
import { LuChevronRight, LuMessageSquareText, LuShare2, LuBookMarked, LuCheck, LuFilter, LuArrowLeft, LuArrowRight, LuSearch, LuTimer } from "react-icons/lu";
import { TbCards } from "react-icons/tb";

// Hooks 
import useQuestions from "../../hooks/useQuestions";
import { useEffect, useRef, useState } from "react";
import useRank from "../../hooks/useRank"

// Components
import Lottie  from 'lottie-react';
import loadingAnim from '../../assets/animations/loading.json';
import RenderMath from "./../math/mathdisplay";
import MathInput from "./../math/mathinput";
import QThread from "../../components/questions/q_thread"
import ViewDecks from "./../viewDecks";
import SharePanel from "../social/sharePanel";
import LogTables from "../../components/logtables"
import MarkingScheme from "../../components/marking_scheme"
import Timer from "../../components/timer"
import QSearch from "./qSearch";
import RankBar from "../../components/rankbar";
import AnswerNoti from "../math/answerNoti";
import StreakDisplay from "../streakDisplay";

// Style Imports 
import '../../styles/questions.css'
import '../../styles/navbar.css'
import useMaths from "../../hooks/useMaths";

// Sounds
import correctSound from "../../assets/sounds/Click-Bounce_Success.wav";
import incorrectSound from "../../assets/sounds/Click-Bounce_Failure.wav";
import XPFly from "./XPFly";

// User Context
import { useContext } from "react";
import { UserContext } from "../../context/UserContext";
import Filter from "../filter";
import { FcAnswers } from "react-icons/fc";

// Component Props
type questionsProps = {
    questions: any[];
    position: number;
    setPosition: (n: number | ((p: number) => number)) => void;
    nextQuestion: () => Promise<void> | void;
    deckmode?: boolean;
    preview?: boolean;
    setFilters: React.Dispatch<React.SetStateAction<any>>;
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
    const [ showSearch, setShowSearch ] = useState<boolean>(false)

    const { toRoman } = useQuestions()
    const { isCorrect } = useMaths();

    const [ viewFilter, setViewFilter ] = useState(false)

    const [isRight, setIsRight] = useState(false);   // result of last check
    const [showNoti, setShowNoti] = useState(false); // controls AnswerNoti

    const [xpFlyers, setXpFlyers] = useState<
        {
            id: number;
            to: { x: number; y: number };
            amount: number;      // chunk size, e.g., 10
            delay: number;       // stagger start
            pitchIndex: number;  // for sound ladder
        }[]
    >([]);

    const rankRef = useRef<HTMLDivElement>(null);
    const { rank, progress, setProgress, xp, streak, onCheck } = useRank({rankRef, setIsRight, setShowNoti, xpFlyers, setXpFlyers});

    const { user, setUser } = useContext(UserContext)

    const [displayedXP, setDisplayedXP] = useState(user?.xp ?? 0);

    // Keep displayedXP in sync when user.xp changes from context (e.g. on page load)
    useEffect(() => {
        setDisplayedXP(user?.xp ?? 0);
        console.log(user.xp)
    }, [user?.xp]);

    //=========================================== Constants =====================================//
    const iconSize = 40
    const strokewidth = 1.75

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
            answer:   Array.isArray(p?.answer)   ? p.answer   : [],
            prefix:   Array.isArray(p?.prefix)   ? p.prefix   : [],   // <-- add
            orderMatters: p?.ordermatters,                    // <-- optional
            image:    p?.image ?? '',
            logtables: p?.logTables ? p.logTables : 1
        }));

        // Set the question state 
        setContent(safeContent)
        setProperties(q.properties ?? {})

    }, [props.position, props.questions])
    //==========================================================================================//


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

    console.log("Resolved image path:", content?.[part]?.image);
    //==========================================================================================//


    return (
    <div className="flex flex-col h-full w-full items-end justify-end p-4">
    <AnswerNoti visible={showNoti && isRight} onNext={goNextFromNoti} />

    <div className="flex justify-start items-end w-full h-[90%]">
    { //============================= QUESTIONS CONTAINER ====================================// 
    props.questions[props.position]? ( 
    <div className={`card-container h-full items-end justify-start ${ (sideView == '' || sideView == 'filters') ? 'w-full' : 'w-7/12'}  
        transition-all duration-250 shrink-0 self-start justify-self-start origin-left relative`}>
                {/* ================================= XP FLYER OVERLAY ================================ */}
    <div className="pointer-events-none h-full w-full absolute flex justify-center items-center z-[300]">
    {xpFlyers.map((fly) => (
        <XPFly
        key={fly.id}
        amount={fly.amount}
        to={fly.to}          // viewport coords
        delay={fly.delay}
        pitchIndex={fly.pitchIndex}
        onDone={(chunk) => {
            setDisplayedXP((prev) => prev + chunk);
            setXpFlyers((prev) => prev.filter((f) => f.id !== fly.id));
        }}
        // ⬇️ you can still pass jitter or custom colors if needed
        />
    ))}
    </div>
        <div className="p-8 flex flex-1 flex-col justify-between h-full">
            { showSearch ? <QSearch  setShowSearch={setShowSearch} 
                questions={props.questions} position={props.position} setPosition={props.setPosition ?? null} /> : <></> } 

            <div className="h-full">
            {/* ================================ HEADING =================================== */}
            {/* ======================================== RANKBAR ========================================== */}
            <div className="flex" ref={rankRef}>
                <RankBar rank={rank} progress={progress} />
                <StreakDisplay streak={streak}/>
            </div>

            <p className="txt-bold color-txt-accent">{properties?.name}
                <span className="txt-sub mx-2">{properties?.tags?.join?.(", ")}</span>
                {content?.[part]?.answer?.length ? (
                    content?.[part].answer.map((ans: any) => (
                         <span key={ans} className="txt-sub">{`ANS: ${ans}`}</span>
                    ))
                ) : null}
            </p>
            {/* ============================================================================ */}

            
            {/* ============================= PART NAVIGATION ===============================*/}
            <div className="flex">
                {Array.isArray(content) && content?.length > 1 && content?.map((_: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-center h-10" onClick={() => { setPart(idx); setInputs([]) }}>
                        <p className={`part-number ${part === idx ? 'bg-white/5' : 'hover:bg-white/10'}`}>
                            {toRoman(idx + 1)}
                        </p>
                        <LuChevronRight className={`${idx + 1 === content?.length ? 'invisible' : 'visible'} color-txt-sub`} />
                    </div>
                ))}
            </div> 
            {/* ============================================================================ */}


            {/* ============================== QUESTION CONTENT =========================== */}
            <div className="w-2/3 m-4 ">
                <RenderMath text={content?.[part]?.question ?? ''} className="txt text-xl" />
                {content?.[part]?.image &&
                <div className="w-100 h-auto relative">
                    <img src={content?.[part].image} className="max-h-30 invert brightness-0"/>
                </div>
                }
            </div>
            {/* ============================================================================ */}
            </div>

            <div>
            {/* =============================== MATH INPUT ================================= */}
            <div className="flex">
                { !props.preview ? (
                    (() => {
                        const answers = content?.[part]?.answer ?? [];
                        const prefixes = Array.isArray(content?.[part]?.prefix) ? content?.[part]?.prefix : [];

                        if (answers.length === 1) {
                            // One box; surround with two prefixes if provided
                            const pfx =
                                prefixes.length >= 2
                                    ? [String(prefixes[0] ?? ''), String(prefixes[1] ?? '')]
                                    : (Array.isArray(prefixes[0]) ? prefixes[0] : (prefixes[0] ?? ''));
                            return (
                                <MathInput
                                    key={0}
                                    index={0}
                                    prefix={pfx}
                                    setInputs={setInputs}
                                    onEnter={() => onCheck(inputs, answers)}
                                />
                            );
                        }

                        // Multiple boxes; pass per-index prefix (string or [before, after])
                        return answers.map((_: any, idx: number) => (
                            <MathInput
                                key={idx}
                                index={idx}
                                prefix={Array.isArray(prefixes[idx]) ? prefixes[idx] : (prefixes[idx] ?? '')}
                                setInputs={setInputs}
                                onEnter={() => onCheck(inputs, answers)}
                            />
                        ));
                    })()
                ) : (<></>)
                }
                {
                    (content?.[part]?.answer?.length ?? 0) > 0 ? (
                        <div
                            id="check-btn"
                            className="h-10 w-10 rounded-full color-bg-accent flex items-center justify-center cursor-pointer hover:opacity-90 ml-2"
                            onClick={() => onCheck(inputs, content?.[part]?.answer)}
                            title="Check"
                        >
                            <LuCheck strokeWidth={3} size={30} className="color-txt-accent" />
                        </div>
                    ) : (<></>) 
                }
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

        <div className="flex-1"></div>  
        {/* =================================== QUESTION SIDEVIEWS ================================= */}
        {sideView === 'thread' ? (
            <div className="h-full w-5/12">
                <QThread
                    questionId={properties?.id ?? props.questions[props.position]?.id}
                    part={part} 
                />
            </div>
        ) : null}

        {sideView === 'logtables' ? (
            <div className="h-full w-5/12">
                <LogTables pgNumber={(parseInt(content?.[part].logtables) + 0).toString()}/>
            </div>
        ) : null}

        {sideView === 'marking_scheme' ? (
            <div className="h-full w-5/12">
                <MarkingScheme year="25" pgNumber="1"/>
            </div>
        ) : null}

        {sideView === 'timer' ? (
            <div className="h-full w-5/12">
                <Timer/>
            </div>
        ) : null}

        {sideView === 'decks' ? (
            <div className="h-full w-5/12">
                <ViewDecks question={properties?.id}/>
            </div>
        ) : null}

        {sideView === 'share' ? (
            <div className="h-full w-5/12">
                <SharePanel/>
            </div>
        ) : null}
        {/* ====================================================================================== */}    
        </div>

        {/* ================================== QUESTION SIDEBAR ================================== */}
        { !props.preview ? (
        <div className="flex w-full justify-center items-center rounded-r-out h-auto z">

            <div className="color-bg-grey-5 mx-4 w-10 h-10 flex items-center group relative 
                justify-center rounded-full hover:scale-95 duration-250 transition-all">
                <LuArrowLeft strokeWidth={strokewidth} size={32} className="color-txt-sub"/>

                <span className="tooltip">previous</span>
            </div>

            <div className="border-2 color-shadow color-bg-grey-5 flex my-2 px-3 rounded-full">
            {/* =============================== THREADS ICON ================================= */}
            <div
                className={sideView == 'thread' ? "sidebar-selected group" : "sidebar group"}
                onClick={() => {
                    setSideView( (prev: any) => {
                        if (prev != 'thread') return 'thread'
                        else return ''
                    });
                }}
            >
                <LuMessageSquareText strokeWidth={strokewidth} size={iconSize} 
                    className={sideView == 'thread' ? 'nav-icon-selected icon-anim' : 'nav-icon icon-anim'}
                    fill={sideView == 'thread' ? 'currentColor' : 'none'} /> 

                <span className="tooltip">threads</span>
            </div>
            {/* ============================================================================ */}

            {/* =============================== LOGTABLES ICON ================================= */}
            <div className={sideView == 'logtables' ? 'sidebar-selected group' : 'sidebar group'} 
                onClick={() => {
                    setSideView( (prev: any) => {
                        if (prev != 'logtables') return 'logtables'
                        else return '' 
                    });
                }}
            >
                <LuBookMarked strokeWidth={strokewidth} size={iconSize} 
                    className={sideView == 'logtables' ? 'nav-icon-selected  icon-anim' : 'nav-icon icon-anim'}
                    fill={sideView == 'logtables' ? 'currentColor' : 'none'} />

                 <span className="tooltip">logbook</span>
            </div>
            {/* ================================================================================ */}

            <div className={sideView == 'marking_scheme' ? 'sidebar-selected group' : 'sidebar group'} 
                onClick={() => {
                    setSideView( (prev: any) => {
                        if (prev != 'marking_scheme') return 'marking_scheme'
                        else return '' 
                    });
                }}
            >
                <LuBookMarked strokeWidth={strokewidth} size={iconSize} 
                    className={sideView == 'marking_scheme' ? 'nav-icon-selected  icon-anim' : 'nav-icon icon-anim'}
                    fill={sideView == 'marking_scheme' ? 'currentColor' : 'none'} />

                 <span className="tooltip">Marking Scheme</span>
            </div>
            
            { props.deckmode ? (
            /* =========================== SHARE ICON (DECK ONLY) =========================== */
            <div className={sideView == 'share' ? 'sidebar-selected  group' : 'sidebar group'} 
                onClick={() => {
                    setSideView( (prev: any) => {
                        if (prev != 'share') return 'share'
                        else return '' 
                    }); 
                }}
            >
                <LuShare2 strokeWidth={strokewidth} size={iconSize} 
                    className={sideView == 'share' ? 'nav-icon-selected  icon-anim' : 'nav-icon icon-anim'}
                    fill={sideView == 'share' ? 'currentColor' : 'none'} />
                
                 <span className="tooltip">share</span>
            </div>
            /* ============================================================================== */

            ) : (

            /* ================================ DECKS ICON ================================= */
            <div className={sideView == 'decks' ? 'sidebar-selected  group' : 'sidebar  group'} 
                onClick={() => {
                    setSideView( (prev: any) => {
                        if (prev != 'decks') return 'decks'
                        else return '' 
                    });
                }}
            >
                <TbCards strokeWidth={strokewidth} size={iconSize} 
                    className={sideView == 'decks' ? 'nav-icon-selected  icon-anim' : 'nav-icon icon-anim'}
                    fill={sideView == 'decks' ? 'currentColor' : 'none'} />

                 <span className="tooltip">decks</span>
                 
            </div>
            /* ============================================================================== */

            )
            }   

            <div className={sideView == 'timer' ? 'sidebar-selected group' : 'sidebar group'} 
                onClick={() => {
                    setSideView( (prev: any) => {
                        if (prev != 'timer') return 'timer'
                        else return '' 
                    });
                }}
            >
                <LuTimer strokeWidth={strokewidth} size={iconSize} 
                    className={sideView == 'timer' ? 'nav-icon-selected  icon-anim' : 'nav-icon icon-anim'}
                    fill={sideView == 'timer' ? 'currentColor' : 'none'} />

                 <span className="tooltip">Timer</span>
            </div>

            {/* =============================== FILTER ICON ================================= */}
            <div className={viewFilter ? 'sidebar-selected group' : 'sidebar group'} 
                onClick={() => {
                    if (!viewFilter )
                        setViewFilter(true)
                }}

            >
                <LuFilter strokeWidth={strokewidth} size={iconSize} 
                    className={viewFilter ? 'nav-icon-selected  icon-anim' : 'nav-icon icon-anim'}
                    fill={viewFilter ? 'currentColor' : 'none'} />

                 <span className="tooltip">filter</span>
                 <Filter  viewFilter={viewFilter} setViewFilter={setViewFilter} setFilters={props.setFilters}/>
            </div>
            {/* ================================================================================ */}

            {/* =============================== SEARCH ICON ================================= */}
            <div className={showSearch ? 'sidebar-selected group' : 'sidebar group'} 
                onClick={() => {
                    setShowSearch( v => !v)
                }}
            >
                <LuSearch strokeWidth={strokewidth} size={iconSize} 
                    className={showSearch ? 'nav-icon-selected  icon-anim' : 'nav-icon icon-anim'}
                    fill={showSearch ? 'currentColor' : 'none'} />

                 <span className="tooltip">search</span>
            </div>
            {/* ================================================================================ */}
            
            </div>

            <div className="color-bg-grey-5 mx-4 w-10 h-10 flex items-center group relative 
                justify-center rounded-full hover:scale-95 duration-250 transition-all"
                onClick={() => { setInputs([]);
      
                    // Next part if available
                    if ((content?.length ?? 0) > part + 1) {
                    setPart((p) => p + 1);
                    return;
                    }
                
                    // Otherwise ask parent to move to the next question
                    
                    props.nextQuestion();
                }}
                >
                <LuArrowRight strokeWidth={strokewidth} size={32} className="color-txt-sub"/>

                <span className="tooltip">next</span>
            </div>
        </div>
        ) : (<></> /* Do not show sidebar in preview mode */)
        }
        {/* ====================================================================================== */}    
    </div>
    )
}
