// Icons 
import { LuChevronRight, LuMessageSquareText, LuShare2, LuBookMarked, LuCheck, LuFilter, LuArrowLeft, LuArrowRight, LuSearch, LuTimer, LuListOrdered} from "react-icons/lu";
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
import ViewQuestionsList from "./viewQuestionsList";
import RankBar from "../../components/rankbar";
import AnswerNoti from "../math/answerNoti";
import StreakDisplay from "../streakDisplay";

// Style Imports 
import '../../styles/questions.css'
import '../../styles/navbar.css'
import useMaths from "../../hooks/useMaths";

// Sounds
import XPFly from "./XPFly";

// User Context
import { useContext } from "react";
import { UserContext } from "../../context/UserContext";
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
    onQuestionAnswered?: (questionId: string, isCorrect: boolean) => void;
    questionsAnswered?: any;
};

export default function Question(props: questionsProps) {

    //================================= State, Hooks, and Context ================================//
    const [content, setContent] = useState<any>()
    const [properties, setProperties] = useState<any>()
    const [questionId, setQuestionId] = useState<string>('')
    const [part, setPart] = useState<number>(0) 
    const [inputs, setInputs] = useState<any[]>([])

    useEffect(() => {
        // console.log("inputs: ", inputs)
        // console.log("answers: ",content?.[part]?.answer)
        // console.log(isCorrect(inputs, content?.[part]?.answer))
    }, [inputs])

    const [ sideView, setSideView ] = useState<string>(props.deckmode ? 'viewQuestions' : '')  // filters | viewQuestions | ''  
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
    const { rank, progress, streak, onCheck } = useRank({
        rankRef, 
        setIsRight, 
        setShowNoti, 
        xpFlyers, 
        setXpFlyers,
        questionId: props.questions[props.position]?.id,
        onQuestionAnswered: props.onQuestionAnswered
    });

    const { user } = useContext(UserContext)
    const [attempts, setAttempts] = useState(0);
    
    const [canReveal, setCanReveal] = useState(false);
    const [showSolution, setShowSolution] = useState(false); // overlay
    const [locked, setLocked] = useState(false);

    //const [displayedXP, setDisplayedXP] = useState(user?.xp ?? 0);


    // Keep displayedXP in sync when user.xp changes from context (e.g. on page load)
    useEffect(() => {
       // setDisplayedXP(user?.xp ?? 0); 
    }, [user?.xp]);

    //=========================================== Constants =====================================//
    const iconSize = 40 + attempts - attempts 
    const strokewidth = 1.75

    // Check handler: shows overlay on correct; after 3 fails offers reveal button
   function handleCheck() {
          if (locked) return;
          const answers = content?.[part]?.answer ?? [];
          const correct = isCorrect(inputs, answers);
          // Pass question ID and tags to track completion
          const tags = properties?.tags ?? [];
          onCheck(inputs, answers, questionId, tags);
          if (correct) {
            setAttempts(0);
            setCanReveal(true); // show the button
            setLocked(true);    // disable further answering
            setIsRight(true);   // trigger AnswerNoti visuals
            setShowNoti(true);
            return;
          }
          setAttempts((a) => {
            const n = a + 1;
            if (n >= 3) setCanReveal(true);
            return n;
          });
        }
    
        function handleOpenSolution() {
          setShowSolution(true);
          setLocked(true); // once you choose to view, no more answering
       }

        function handleCloseSolution() {
          // keep it locked even if they close
          setShowSolution(false);
        }
    
        function handleNextQuestion() {
          setShowSolution(false);
          setLocked(false);
          setAttempts(0);
          setCanReveal(false);
          setInputs([]);
          // always go to next question (not just next part)
          if (props.nextQuestion) {
            props.nextQuestion();
          } else if (props.setPosition) {
            props.setPosition((p) =>
              Math.min(p + 1, (props.questions?.length ?? 1) - 1)
            );
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
        setQuestionId(q.id ?? '')

    }, [props.position, props.questions])
    //==========================================================================================//

    useEffect(() => {
        setInputs([]);
        setIsRight(false);
        setShowNoti(false);
        setAttempts(0);
        setCanReveal(false);
        setShowSolution(false);
        setLocked(false);
    }, [part]);
      
    useEffect(() => {
        setPart(0);
        setInputs([]);
        setIsRight(false);        // unused visually
        setShowNoti(false);       // unused visually
        setAttempts(0);
        setCanReveal(false);
        setShowSolution(false);
        setLocked(false);
    }, [props.position, props.questions]);

    //==========================================================================================//

    const Lplaceholders = [
      "Yeh I mean... decent attempt I guess",
      "Ah yes, the famous *close enough* theorem.",
      "I think Pythagoras just rolled in his grave",
      "You can't just invent new math...",
      "I mean the spirit was definitely there!...",
      "Just off the phone to Newton, he has no idea either",
      "I mean, I'm sure some other question had that answer",
      "Legend says the examiner is still trynna understand you",
      "bro... what?",
      "Atleast you didn't answer with 67",
      "Get it right next time or we'll start charging for CertChamps",
      "dy/dx = 0 or something idek bro",
      "I think you're cooked bro...",
      "Man lock in bro",
      "I won't tell your teacher if you don't...",
      "INSERT INSULT HERE",
      "Back to reels, is it?",
      "I spent all this time making this stupid app just for you to do that...",
      "Dude...",
      "Uhm.............................",
      "Hey, nice guy here, sorry about the other guys insults... better luck next time! <3",
      ""
    ];
    
    const [losePlaceholder, setLosePlaceholder] = useState("");

    //This will just pick a random placeholder whenever the screen renders
    useEffect(() => {
        const randomIndex = Math.floor(Math.random() * Lplaceholders.length);
        setLosePlaceholder(Lplaceholders[randomIndex]);
    }, []);

    const Wplaceholders = [
      "Alright... now that was awesome",
      "Hey... not bad for a rookie",
      "Polynomial? More like poly‑perfect.",
      "The limit of your brilliance as n → ∞.",
      "You just differentiated yourself from the rest.",
      "Even imaginary numbers think you’re real.",
      "HELL YEH BRO THAT WAS SICK!!!",
      "Would Euler shed a tear? Probably one of joy.",
      "That’s not PEMDAS — that’s P✨E✨R✨F✨E✨C✨T✨.",
      "Pretty sigma ngl",
      "It's giving academic",
      "This ur math era?",
      "Thank GOD the answer wasn't 67",
      "Bro's out here carrying the whole squad",
      "Pretty snazzy ngl",
      "I'm not paid enough for these placeholders man",
      "Oh get over yourself...",
      "Schrödinger? I hardly know her",
      "Oh hey... that was pretty neat... wanna be the sin to my cosine?",
      "SOMEONE is LOCKED in. WOW",
      "I showed this to ChatGPT and it filed a restraining order.",
      "Knock knock. Who's there? Perf. Perf who? Perfection<3",
      "That was pretty lit bro",
      "Would Einstein REALLY have done better?",
    ];
    
    const [winPlaceholder, setWinPlaceholder] = useState("");

    //This will just pick a random placeholder whenever the screen renders
    useEffect(() => {
        const randomIndex = Math.floor(Math.random() * Wplaceholders.length);
        setWinPlaceholder(Wplaceholders[randomIndex]);
    }, []);

    return (
    <div className="flex flex-col h-full w-full items-end justify-end p-4">
                  {showSearch ? (
        <QSearch
          setShowSearch={setShowSearch}
          questions={props.questions}
          position={props.position}
          setPosition={props.setPosition ?? null}
        />
      ) : null}

        { showNoti && isRight ? (
        <AnswerNoti
            visible={true}
            onNext={() => {
            setShowNoti(false);
            setIsRight(false);
            }}
        />
        ) : null }

      {showSolution ? (
        <div
          className="fixed inset-0 z-[500] color-bg-grey-5 backdrop-blur-sm
                     flex items-center justify-center p-4"
          onClick={handleCloseSolution}
        >
          <div
            className="color-bg rounded-2xl shadow-xl w-full max-w-4xl
                       max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-3">
              <div>
                <p className="color-txt-main txt-bold">Marking Scheme</p>
                <p className="color-txt-accent">{isRight ? winPlaceholder : losePlaceholder}</p>
              </div>
              <button
                className="color-txt-sub hover:opacity-80"
                onClick={handleCloseSolution}
                title="Close"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-auto scrollbar-minimal p-3 flex items-center justify-center">
              <MarkingScheme year="25" pgNumber="1" />
            </div>
            <div className="flex justify-end gap-3 p-3">
              <button
                className="px-4 py-2 rounded-full color-bg-grey-5 hover:opacity-90"
                onClick={handleCloseSolution}
              >
                Close
              </button>
              <button
                className="px-4 py-2 rounded-full color-bg-accent color-txt-accent txt-bold
                           hover:opacity-90"
                onClick={handleNextQuestion}
              >
                Next question
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
        onDone={() => {
            //setDisplayedXP((prev) => prev + chunk);
            setXpFlyers((prev) => prev.filter((f) => f.id !== fly.id));
        }}
        // ⬇️ you can still pass jitter or custom colors if needed
        />
    ))}
    </div>
        <div className="p-8 flex flex-1 flex-col justify-between h-full">
  

            <div className="h-full">
            {/* ================================ HEADING =================================== */}
            {/* ======================================== RANKBAR ========================================== */}
            <div className="flex" ref={rankRef}>
                <RankBar rank={rank} progress={progress} />
                <StreakDisplay streak={streak}/>
            </div>

            <p className="txt-bold color-txt-accent">{properties?.name}
                <span className="txt-sub mx-2">{properties?.tags?.join?.(", ")}</span>

                { user.uid == "gJIqKYlc1OdXUQGZQkR4IzfCIoL2" || user.uid == "NkN9UBqoPEYpE21MC89fipLn0SP2" ? ( 
                  content?.[part]?.answer?.length ? (
                    content?.[part].answer.map((ans: any) => (
                         <span key={ans} className="txt-sub">{`ANS: ${ans}`}</span>
                    ))
                  ) : null ) : null}
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
            <div className="w-full h-3/4 overflow-y-auto scrollbar-minimal px-2 py-2">
                <RenderMath text={content?.[part]?.question ?? ''} className="txt text-xl" />
                {content?.[part]?.image &&
                <div className="w-100 h-auto relative">
                    <img src={content?.[part].image} className="max-h-30 image-invert  brightness-0"/>
                </div>
                }
            </div>
            {/* ============================================================================ */}
            </div>

            <div>
            {/* =============================== MATH INPUT ================================= */}
            <div className="flex">
               {!props.preview &&
  (() => {
    /* ---------- 1.  bail-out conditions ---------- */
    const answers = content?.[part]?.answer;          // keep null/undefined
    if (!Array.isArray(answers) || answers.length === 0 || answers[0] == null) {
      return null;                                    // ← nothing to show
    }

    const prefixes = Array.isArray(content?.[part]?.prefix)
      ? content?.[part]?.prefix
      : [];

    /* ---------- 2.  single box ---------- */
    if (answers.length === 1) {
      const pfx =
        prefixes.length >= 2
          ? [String(prefixes[0] ?? ''), String(prefixes[1] ?? '')]
          : (Array.isArray(prefixes[0]) ? prefixes[0] : (prefixes[0] ?? ''));

      return (
        <div
          key={0}
          className={locked ? 'pointer-events-none opacity-50' : ''}
        >
          <MathInput
            index={0}
            prefix={pfx}
            setInputs={setInputs}
            onEnter={handleCheck}
          />
        </div>
      );
    }

    /* ---------- 3.  multiple boxes ---------- */
    return answers.map((ans, idx) =>
      ans != null && ans !== 'null' ? (
        <div
          key={idx}
          className={locked ? 'pointer-events-none opacity-50' : ''}
        >
          <MathInput
            index={idx}
            prefix={
              Array.isArray(prefixes[idx])
                ? prefixes[idx]
                : (prefixes[idx] ?? '')
            }
            setInputs={setInputs}
            onEnter={handleCheck}
          />
        </div>
      ) : null
    );
  })()}
                
               {(Array.isArray(content?.[part]?.answer) &&
  content[part].answer.length > 0 &&
  content[part].answer[0] != null) && (
  <div
    id="check-btn"
    className={`h-10 w-10 rounded-full color-bg-accent flex items-center
                justify-center ml-2 hover:opacity-90 ${
                  locked ? 'opacity-50 pointer-events-none' : 'cursor-pointer'
                }`}
    onClick={handleCheck}
    title="Check"
  >
    <LuCheck strokeWidth={3} size={30} className="color-txt-accent" />
  </div>
)}
            </div>
            {canReveal && !showSolution ? (
              <div className="mt-3">
                <button
                  className="px-4 py-2 rounded-full border-2 border-r-4 border-b-4 color-shadow
                             hover:opacity-90"
                  onClick={handleOpenSolution}
                >
                  Show Marking Scheme
                </button>
              </div>
            ) : null}
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

        {sideView === 'timer' ? (
            <div className="h-full w-5/12">
                <Timer/>
            </div>
        ) : null}

        `{sideView === 'marking_scheme' ? (
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

        {sideView === 'viewQuestions' ? (
          <div className="h-full w-5/12 overflow-hidden">
            <ViewQuestionsList
              questions={props.questions}
              currentIndex={props.position}
              onSelect={(idx) => props.setPosition?.(idx)}
              questionsAnswered={props.questionsAnswered}
            />
          </div>
        ) : null}
        {/* ====================================================================================== */}    
        </div>

        {/* ================================== QUESTION SIDEBAR ================================== */}
        { !props.preview ? (
        <div className="flex w-full justify-center items-center rounded-r-out h-auto z">

            <div className="color-bg-grey-5 mx-4 w-10 h-10 flex items-center group relative 
                justify-center rounded-full hover:scale-95 duration-250 transition-all"
                onClick={() => {
                    setInputs([]);

                    // Previous part if available
                    if (part > 0) {
                        setPart((p) => p - 1);
                        return;
                    }

                    // Otherwise ask parent to move to the previous question
                    const prevIndex = props.position - 1;
                    if (prevIndex >= 0) {
                        props.setPosition(prevIndex);
                    }
                }}>
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

            {props.deckmode ? (
            /* =============================== VIEW QUESTIONS ICON (DECK ONLY) ================================= */
            <div className={sideView == 'viewQuestions' ? 'sidebar-selected group' : 'sidebar group'} 
              onClick={() => {
                setSideView((prev) => {
                  if (prev !== 'viewQuestions') return 'viewQuestions';
                  return '';
                });
                setShowSearch(false);
              }}
            >
              <LuListOrdered strokeWidth={strokewidth} size={iconSize} 
                className={sideView == 'viewQuestions' ? 'nav-icon-selected  icon-anim' : 'nav-icon icon-anim'}
                fill={sideView == 'viewQuestions' ? 'currentColor' : 'none'} />

               <span className="tooltip">view questions</span>
            </div>
            /* ================================================================================ */
              ):(
            /* =============================== SEARCH ICON ================================= */
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
            /* ================================================================================ */
              )}
            </div>

            <div className="color-bg-grey-5 mx-4 w-10 h-10 flex items-center group relative 
                justify-center rounded-full hover:scale-95 duration-250 transition-all"
                onClick={() => { setInputs([]);
      
                    // Next part if available
                    if ((content?.length ?? 0) > part + 1) {
                    setPart((p) => p + 1);
                    return;
                    }
                
                    // For deck mode, skip correct answers
                    if (props.deckmode && props.questionsAnswered) {
                        let nextIndex = props.position + 1;
                        while (nextIndex < (props.questions?.length ?? 0)) {
                            const nextQuestionId = props.questions[nextIndex]?.id;
                            if (!props.questionsAnswered[nextQuestionId]) {
                                props.setPosition(nextIndex);
                                return;
                            }
                            nextIndex++;
                        }
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
