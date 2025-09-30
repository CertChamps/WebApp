// Icons 
import { LuChevronRight, LuMessageSquareText, LuShare2, LuBookMarked, LuCheck, LuFilter, LuArrowLeft, LuArrowRight, LuSearch } from "react-icons/lu";
import { TbCards } from "react-icons/tb";

// Hooks 
import useQuestions from "../../hooks/useQuestions";
import { useEffect, useRef, useState } from "react";

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
import { db } from "../../../firebase";
import { doc, increment, updateDoc } from "firebase/firestore";
import Filter from "../filter";

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

    const { user, setUser } = useContext(UserContext)

    const [displayedXP, setDisplayedXP] = useState(user?.xp ?? 0);
    const [streak, setStreak] = useState<number>(user?.streak ?? 0);

    // Keep displayedXP in sync when user.xp changes from context (e.g. on page load)
    useEffect(() => {
        setDisplayedXP(user?.xp ?? 0);
    }, [user?.xp]);

    //=========================================== Constants =====================================//
    const iconSize = 40
    const strokewidth = 1.75

    //============================== Rank check for xp etc ======================================//
    // Given total XP, figure out current rank + how far they are inside that rank
    function getRankFromXP(xp: number) {
        const thresholds = [100, 300, 1000, 5000, 10000, 100000]; // XP required to finish each rank
        let rank = 0;
        let remainingXP = xp;
    
        for (let i = 0; i < thresholds.length; i++) {
            // threshold[i] is how much XP is needed to finish THIS rank
            if (remainingXP < thresholds[i]) {
                // We're still leveling INSIDE this rank
                const progress = (remainingXP / thresholds[i]) * 100;
                return { rank, progress, xpIntoRank: remainingXP, neededForNext: thresholds[i] };
            }
            // Otherwise: we leveled up, subtract it
            remainingXP -= thresholds[i];
            rank++;
        }
    
        // If we exceed max array, clamp at last rank
        return {
            rank: thresholds.length,
            progress: 100,
            xpIntoRank: thresholds[thresholds.length - 1],
            neededForNext: thresholds[thresholds.length - 1],
        };
    }

    const { rank, progress } = getRankFromXP(displayedXP);

    const getTotalXP = (rank: number) => {
        if (rank == 0) {
            return 100;
        } else if (rank == 1) {
            return 300;
        } else if (rank == 2) {
            return 1000;
        } else if (rank == 3) {
            return 5000;
        } else if (rank == 4) {
            return 10000;
        } else {
            return 100000;
        }
    } 

    // const XP_PER_RANK = getTotalXP(rank);
    // console.log(XP_PER_RANK) // just delete this 
    //==========================================================================================//

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
        }));

        // Set the question state 
        setContent(safeContent)
        setProperties(q.properties ?? {})

    }, [props.position, props.questions])
    //==========================================================================================//

    

    //===================================== Answer checking ===================================//
    async function onCheck() {
        const answers = content?.[part]?.answer ?? [];
        const ready =
            Array.isArray(inputs) &&
            inputs.length === answers.length &&
            inputs.every((v) => (v ?? "").toString().trim().length > 0);
        console.log("ORDERRR", content?.[part].orderMatters)
        const ok = ready ? isCorrect(inputs, answers, content?.[part]?.orderMatters) : false;
        // const reward = 10; unused
          
        // inside onCheck()
        if (ok) {
            playCorrectSound();
          
            setStreak((prev) => {
              const safePrev = prev ?? 0;
              const newStreak = safePrev + 1;
              const reward = newStreak * 10;
          
              awardXP(reward);
          
              setUser((prevU: any) => {
                if (!prevU) return prevU;
                return {
                  ...prevU,
                  xp: (prevU.xp ?? 0) + reward,
                  streak: newStreak,
                };
              });
          
              // Persist to Firestore safely
              if (user?.uid) {
                updateDoc(doc(db, "user-data", user.uid), {
                  xp: increment(reward),
                  streak: newStreak,
                }).catch((e) => console.error("XP update failed", e));
              }
          
              return newStreak;
            });
          } else {
            playIncorrectSound();
            setStreak(0);
          
            if (user?.uid) {
              updateDoc(doc(db, "user-data", user.uid), {
                streak: 0,
              }).catch((e) => console.error("Failed to reset streak", e));
            }
          
            setUser((prevU: any) =>
              prevU ? { ...prevU, streak: 0 } : prevU
            );
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

    function playIncorrectSound() {
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

    //====================================== XP Animation ======================================//
    function awardXP(amount: number, /* originEl?: HTMLElement | null unused */ ) {
            if (!rankRef.current) return;
            const targetBox = rankRef.current.getBoundingClientRect();
            const to = {
              x: targetBox.left + targetBox.width / 2,
              y: targetBox.top + 10,
            };
        
            // split into 10‑XP pips + optional remainder pip
            const chunkSize = 10;
            const chunks = Math.floor(amount / chunkSize);
            const rem = amount % chunkSize;
        
            const baseDelay = 0.08; // seconds between pips
            const now = Date.now();
        
            const newPips: typeof xpFlyers = [];
            for (let i = 0; i < chunks; i++) {
              newPips.push({
                id: now + i,
                to,
            amount: chunkSize,
               delay: i * baseDelay,
                pitchIndex: i, // ladder up
          });
            }
            if (rem > 0) {
              newPips.push({
                id: now + chunks,
                to,
                amount: rem,
                delay: chunks * baseDelay,
                pitchIndex: chunks,
              });
            }
            setXpFlyers((prev) => [...prev, ...newPips]);
          }
    //==========================================================================================//


    return (
    <div className="flex flex-col h-full w-full items-end justify-end p-4">
    <AnswerNoti visible={showNoti && isRight} onNext={goNextFromNoti} />

    {xpFlyers.map((fly) => (
        <XPFly
            key={fly.id}
            amount={fly.amount}
            to={fly.to} 
            delay={fly.delay}
            pitchIndex={fly.pitchIndex}
            onDone={(chunk) => {
                setDisplayedXP(prev => prev + chunk);
                setXpFlyers(prev => prev.filter(f => f.id !== fly.id));
            }}
        />
    ))}
    <div className="flex justify-start items-end w-full h-[90%]">
    { //============================= QUESTIONS CONTAINER ====================================// 
    props.questions[props.position]? ( 
    <div className={`card-container h-full items-end justify-start ${ (sideView == '' || sideView == 'filters') ? 'w-full' : 'w-7/12'}  
        transition-all duration-250 shrink-0 self-start justify-self-start origin-left`}>
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
                {content?.[part]?.image &&
                <div className="w-100 h-auto relative">
                    <img src={content[part].image} className="max-h-30 invert brightness-0"/>
                </div>
                }
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
                            prefix={content?.[part]?.prefix[idx] ?? '' }
                            setInputs={setInputs}
                            onEnter={onCheck}   // <- Enter now checks
                        />
                    ))
                ) :(<></>)
                }
                
                <div
                    id="check-btn"
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
                <LogTables pgNumber="10"/>
            </div>
        ) : null}

        {sideView === 'marking_scheme' ? (
            <div className="h-full w-5/12">
                <MarkingScheme year="25" pgNumber="1"/>
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
