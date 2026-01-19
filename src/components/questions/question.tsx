// Icons 
import { LuChevronRight, LuMessageSquareText, LuShare2, LuBookMarked, LuCheck, LuFilter, LuPencil, LuSearch, LuTimer, LuListOrdered, LuLayoutList} from "react-icons/lu";
import { IoIosArrowBack, IoIosArrowForward } from "react-icons/io";
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
import WrongAnswerNoti from "../math/wrongAnswerNoti";
import StreakDisplay from "../streakDisplay";
import Confetti from "../Confetti";
import ThemePicker, { ThemePickerButton } from "../ThemePicker";
//import DrawingCanvas from "./DrawingCanvas";
import TestDraw from "./test_draw";

// Style Imports 
import '../../styles/questions.css'
import '../../styles/navbar.css'
import useMaths from "../../hooks/useMaths";

// Sounds
import XPFly from "./XPFly";

// User Context
import { useContext } from "react";
import { UserContext } from "../../context/UserContext";
//import { OptionsContext } from "../../context/OptionsContext";
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
    friendsAnswered?: {
        [questionId: string]: Array<{
            uid: string;
            picture: string;
            username: string;
        }>;
    };
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

    const [ sideView, setSideView ] = useState<string>(props.deckmode ? 'viewQuestions' : '')  // filters | viewQuestions | questionParts | ''  
    const [ showSearch, setShowSearch ] = useState<boolean>(false)
    const [ showThemePicker, setShowThemePicker ] = useState<boolean>(false)

    const { toRoman } = useQuestions()
    const { isCorrect } = useMaths();

    // Auto-open questionParts panel when question has multiple parts
    useEffect(() => {
        if (!props.deckmode && Array.isArray(content) && content.length > 1) {
            setSideView('questionParts');
        } else if (!props.deckmode && Array.isArray(content) && content.length <= 1) {
            setSideView(prev => prev === 'questionParts' ? '' : prev);
        }
    }, [content, props.deckmode]);

    const [ viewFilter, setViewFilter ] = useState(false)

    const [isRight, setIsRight] = useState(false);   // result of last check
    const [showNoti, setShowNoti] = useState(false); // controls AnswerNoti
    const [showWrongNoti, setShowWrongNoti] = useState(false); // controls WrongAnswerNoti

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
    const partRefs = useRef<(HTMLDivElement | null)[]>([]);
    const cardContainerRef = useRef<HTMLDivElement>(null);
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
    //const { options } = useContext(OptionsContext)
    const [attempts, setAttempts] = useState(0);
    
    const [canReveal, setCanReveal] = useState(false);
    const [showSolution, setShowSolution] = useState(false); // overlay
    const [locked, setLocked] = useState(false);
    const [showConfetti, setShowConfetti] = useState(false);
    const [partsAnswered, setPartsAnswered] = useState<{
        [questionId: string]: { [partIndex: number]: boolean };
    }>({});

    // Auto-scroll to current part in the questionParts panel
    useEffect(() => {
        if (sideView === 'questionParts' && partRefs.current[part]) {
            partRefs.current[part]?.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest'
            });
        }
    }, [part, sideView]);

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

        const currentContent = content?.[part];
        const answerData = currentContent?.answer ?? [];
        
        // Flatten all allowed answers into one big pool to check against uniqueness
        // (Only needed if the boxes share the same pool of answers, like your screenshot)
        let allPossibleAnswers: string[] = [];
        answerData.forEach((ans: any) => {
             if(Array.isArray(ans)) allPossibleAnswers.push(...ans);
             else allPossibleAnswers.push(ans);
        });

        // Set to track which answer strings from the pool have been "used" by the user
        // This prevents the user from typing "root2" into both boxes
        const usedAnswers = new Set<number>(); 
        
        let correctCount = 0;

        // Loop through every input box the user filled
        for (let i = 0; i < inputs.length; i++) {
            const userInput = inputs[i];
            const allowedForThisBox = answerData[i]; // allowed answers for specific box

            let isMatch = false;

            // 1. If this box expects a specific single string (Classic behavior)
            if (typeof allowedForThisBox === 'string') {
                if (isCorrect([userInput], [allowedForThisBox])) {
                    isMatch = true;
                }
            } 
            // 2. If this box accepts ANY from a list (Your current case)
            else if (Array.isArray(allowedForThisBox)) {
                
                // We must find a match in the allowed list that hasn't been used yet
                for (let k = 0; k < allowedForThisBox.length; k++) {
                    const potentialAnswer = allowedForThisBox[k];
                    
                    // Check if math is correct
                    if (isCorrect([userInput], [potentialAnswer])) {
                        
                        // To be strict, we should check if this specific answer was already used 
                        // by a previous box (e.g. don't type the same root twice).
                        // However, since we are iterating allowedForThisBox (which is just strings), 
                        // we need to check if the *userInput* has already been counted.
                        
                        // Simple uniqueness check:
                        // Find the index of this answer in the 'allPossibleAnswers' pool to track it globally
                        const globalIndex = allPossibleAnswers.findIndex(pa => isCorrect([userInput], [pa]));
                        
                        if (globalIndex !== -1 && !usedAnswers.has(globalIndex)) {
                             usedAnswers.add(globalIndex);
                             isMatch = true;
                             break; // Stop checking other possibilities for this box
                        }
                    }
                }
            }

            if (isMatch) correctCount++;
        }

        // Final Verification
        // Using inputs.length ensures that if there are 2 boxes, we need 2 successes.
        const isSuccess = (correctCount === inputs.length) && (inputs.length === answerData.length);

        // --- Standard Success/Fail Logic ---
        const tags = properties?.tags ?? [];
        onCheck(inputs, answerData, questionId, tags);

        if (isSuccess) {
            setAttempts(0); setCanReveal(true); setLocked(true); setIsRight(true); setShowNoti(true); setShowConfetti(true);
            setPartsAnswered(prev => ({ ...prev, [questionId]: { ...prev[questionId], [part]: true } }));
            return;
        }

        setShowWrongNoti(true);
        setAttempts((a) => {
            const n = a + 1;
            if (n >= 3) {
                setCanReveal(true); setLocked(true);
                setPartsAnswered(prev => ({ ...prev, [questionId]: { ...prev[questionId], [part]: false } }));
            }
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
          setShowConfetti(false);
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
        setPart(0);

        const questions = Array.isArray(props.questions) ? props.questions : [];
        const q = questions[props.position] ?? {};

        const safeContent = (q.content ?? []).map((p: any) => {
            let finalAnswers: any[] = [];
            let finalPrefixes: any[] = [];
            
            // Logic: Just grab the raw answer data. 
            // If it's a string, keep it as a string. If it's an array, keep it as an array.
            if (Array.isArray(p?.inputs) && p.inputs.length > 0) {
                finalAnswers = p.inputs.map((i: any) => i.answer);
                
                finalPrefixes = p.inputs.map((i: any) => 
                    i.prefix ?? { before: i.before, after: i.after }
                );
            } else {
                // Fallback for old content structure
                finalAnswers = Array.isArray(p?.answer) ? p.answer : [];
                finalPrefixes = Array.isArray(p?.prefix) ? p.prefix : [];
            }

            return {
                question: p?.question ?? '',
                answer: finalAnswers,
                prefix: finalPrefixes,
                inputs: p?.inputs ?? [],
                orderMatters: p?.ordermatters,
                image: p?.image ?? '',
                logtables: p?.logTables ?? null,
            };
        });

        setContent(safeContent);
        setProperties(q.properties ?? {});
        setQuestionId(q.id ?? '');

    }, [props.position, props.questions]);
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

    // Helper variables to parse the "2516" string from DB
    const msCode = properties?.markingScheme ? String(properties.markingScheme) : "";
    const msYear = msCode.length >= 2 ? msCode.substring(0, 2) : "25"; // Default to 25 if missing
    const msPage = msCode.length > 2 ? msCode.substring(2) : "1";      // Default to 1 if missing

    return (
    <div className="flex flex-col h-full w-full items-center justify-between p-4">
        {/* Confetti celebration on correct answer */}
        <Confetti show={showConfetti} onComplete={() => setShowConfetti(false)} />
        
                  {showSearch ? (
        <QSearch
          setShowSearch={setShowSearch}
          questions={props.questions}
          position={props.position}
          setPosition={props.setPosition ?? null}
        />
      ) : null}

        {/* Theme Picker Modal */}
        <ThemePicker show={showThemePicker} setShow={setShowThemePicker} />
        <ThemePickerButton onClick={() => setShowThemePicker(true)} />

        { showNoti && isRight ? (
        <AnswerNoti
            visible={true}
            message={winPlaceholder}
            onNext={() => {
            setShowNoti(false);
            setIsRight(false);
            handleNextQuestion();
          }}
        />
        ) : null }

        { showWrongNoti ? (
        <WrongAnswerNoti
            visible={true}
            message={losePlaceholder}
            attemptsLeft={3 - attempts}
            onDismiss={() => setShowWrongNoti(false)}
        />
        ) : null }

      {showSolution ? (
        <div
          className="fixed inset-0 z-[500] color-bg-grey-10 flex items-center justify-center transition-opacity duration-300"
          onClick={handleCloseSolution}
        >
          <div
            className="color-bg rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col transition-transform duration-300 scale-100"
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
              <MarkingScheme year={msYear} pgNumber={msPage} />
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

      <div className="flex w-full" ref={rankRef}>
          <RankBar rank={rank} progress={progress} />
      </div>

<div className="flex h-[90%] w-full mt-4 justify-center items-center relative">
  <div className="color-bg-grey-5 mx-4 w-10 h-10 min-w-[2.5rem] min-h-[2.5rem] aspect-square flex items-center group relative justify-center rounded-full hover:scale-95 duration-250 transition-all"
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
          <IoIosArrowBack size={36} className="color-txt-sub" style={{ verticalAlign: 'middle' }}/>

          <span className="tooltip">previous</span>
      </div> 
  <div className="h-full w-full flex flex-col justify-center items-center">
     
    <div className="flex justify-start items-end w-35/36 h-[90%]">
    { //============================= QUESTIONS CONTAINER ==================================// 
    props.questions[props.position]? ( 
    <div 
        ref={cardContainerRef}
        data-tutorial-id="question-card"
        className={`card-container h-full items-end justify-start ${ (sideView == '' || sideView == 'filters') ? 'w-full' : 'w-7/12'}  
        transition-all duration-250 shrink-0 self-start justify-self-start origin-left relative`}>
                {/* ================================= DRAWING CANVAS OVERLAY ================================ */}
    {/* <DrawingCanvas containerRef={cardContainerRef} enabled={options.drawingEnabled !== false} /> */}
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
  
            
            <div className="h-full ">
                  <div className='flex flex-row justify-between w-full h-full '>
                      <div className='w-full h-full'>
                          {/* ================================ HEADING =================================== */}

                          <p className="txt-bold color-txt-accent">{properties?.name}
                              <span className="txt-sub mx-2">{properties?.tags?.join?.(", ")}</span>

                              { user.uid == "gJIqKYlc1OdXUQGZQkR4IzfCIoL2" || user.uid == "NkN9UBqoPEYpE21MC89fipLn0SP2" ? (
                                Array.isArray(content?.[part]?.inputs) && content[part].inputs.length ? (
                                  content[part].inputs.map((input: any, idx: number) => (
                                    Array.isArray(input.answer) ? input.answer.map((ans: any, aidx: number) => (
                                      <span key={aidx} className="txt-sub">{`ANS: ${ans}`}</span>
                                    )) : <span key={idx} className="txt-sub">{`ANS: ${input.answer}`}</span>
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

                          <div className="w-full h-3/4 overflow-y-auto scrollbar-minimal px-2 py-2 ">
                              <RenderMath text={content?.[part]?.question ?? ''} className="txt text" />
                              {content?.[part]?.image &&
                              <div className="w-100 h-auto relative">
                                  <img src={content?.[part].image} className="max-h-30 image-invert  brightness-0"/>
                              </div>
                              }
                              {/* Proof/Show That Indicator */}
                              {(!Array.isArray(content?.[part]?.inputs) || content[part]?.inputs.length === 0 || (Array.isArray(content[part]?.inputs) && content[part].inputs.every((input: any) => !input.answer || (Array.isArray(input.answer) ? input.answer.length === 0 : input.answer == null)))) && (
                                <div className="mt-4 flex items-center justify-center">
                                  <span className="px-6 py-2 rounded-full color-bg-accent color-txt-accent font-semibold text-base block text-center">
                                    This question contains a proof which CertChamps currently cannot check.
                                    <div className="w-full flex justify-center">
                                      <span className="block mt-1 text-center">We trust you to try it yourself! Good luck!</span>
                                    </div>
                                  </span>
                                </div>
                              )}
                              {(Array.isArray(content?.[part]?.inputs) && content[part].inputs.length === 1 && typeof content[part].inputs[0]?.answer === 'string' && content[part].inputs[0].answer.trim().toUpperCase() === 'NULL') && (
                                <div className="mt-4 flex items-center justify-center">
                                  <span className="px-4 py-2 rounded-full color-bg-accent color-txt-accent font-semibold text-base">
                                    Introduction / Info only — no answer required for this part.
                                  </span>
                                </div>
                              )}
                              {(Array.isArray(content?.[part]?.inputs) && content[part].inputs.length === 1 && typeof content[part].inputs[0]?.answer === 'string' && content[part].inputs[0].answer.trim().toUpperCase() === 'DIAGRAM') && (
                                <div className="mt-4 flex items-center justify-center">
                                  <span className="px-4 py-2 rounded-full color-bg-accent color-txt-accent font-semibold text-base">
                                    This part requires a diagram — no answer input needed.
                                  </span>
                                </div>
                              )}
                          </div>
                          {/* ============================================================================ */}
                      </div>

                      <div>           
                        <StreakDisplay streak={streak}/>
                      </div>            


                  </div>

            {/* ============================== QUESTION CONTENT =========================== */}
            
            
            {/* ============================================================================ */}
            </div>

                      {canReveal && !showSolution ? (
              <div className="absolute bottom-[8.5%] right-6">
                <button
                  className="px-4 py-2 rounded-2xl blue-btn w-full
                             hover:opacity-90" 
                  onClick={handleOpenSolution}
                >
                  Show Marking Scheme
                </button>
              </div>
            ) : null}

            <div>
            {/* =============================== MATH INPUT ================================= */}
            

            {/* Attempts indicator - single one per question */}
            {!props.preview && attempts > 0 && (
              <div className="flex justify-start mb-2">
                <div 
                  className={`text-xs font-medium px-2 py-1 rounded-full ${(3 - attempts) === 2 ? 'color-bg-grey-5 color-txt-sub' : (3 - attempts) === 1 ? 'color-bg-accent color-txt-accent' : 'color-bg-accent color-txt-accent'}`}
                  style={{
                    animation: `pulse-opacity ${(3 - attempts) === 2 ? '0s' : (3 - attempts) === 1 ? '1s' : '0s'} ease-in-out infinite`
                  }}
                >
                  {(3 - attempts) > 0 
                    ? `${3 - attempts} attempt${(3 - attempts) !== 1 ? 's' : ''} remaining` 
                    : 'No attempts remaining'}
                </div>
              </div>
            )}

            <div className="flex items-center w-3/4 space-y-5 flex-wrap">
              {!props.preview &&
                (() => {
                  const answers = Array.isArray(content?.[part]?.answer)
                    ? content[part].answer
                    : [];

                  if (!Array.isArray(answers) || answers.length === 0) return null;

                  const prefixes = Array.isArray(content?.[part]?.prefix)
                    ? content[part].prefix
                    : [];

                  const getPrefixPair = (prefixItem: any): [string, string] | string => {
                    if (Array.isArray(prefixItem)) {
                      return [String(prefixItem[0] ?? ''), String(prefixItem[1] ?? '')];
                    }
                    if (prefixItem && typeof prefixItem === 'object' && 'before' in prefixItem) {
                      return [String(prefixItem.before ?? ''), String(prefixItem.after ?? '')];
                    }
                    return prefixItem ?? '';
                  };

                  // ---- FIXED: prevent crash when firstAnswer is not a string ----
                  const firstAnswer = answers[0];
                  const firstAnswerStr = typeof firstAnswer === 'string' ? firstAnswer : String(firstAnswer ?? '');

                  // ---- SINGLE INPUT CASE ----
                  if (
                    answers.length === 1 &&
                    firstAnswer != null &&
                    firstAnswerStr.toUpperCase() !== 'NULL' &&
                    firstAnswerStr.toUpperCase() !== 'DIAGRAM'
                  ) {
                    const pfx =
                      prefixes.length >= 2
                        ? [String(prefixes[0] ?? ''), String(prefixes[1] ?? '')]
                        : getPrefixPair(prefixes[0]);

                    return (
                      <div key={0} className={locked ? 'pointer-events-none opacity-50' : ''}>
                        <MathInput
                          index={0}
                          prefix={pfx}
                          setInputs={setInputs}
                          onEnter={handleCheck}
                          attempts={attempts}
                        />
                      </div>
                    );
                  }

                  // ---- MULTIPLE INPUT CASE ----
                  return answers.map((ans, idx) =>
                    ans != null && ans !== 'null' && String(ans).toUpperCase() !== 'NULL' ? (
                      <div key={idx} className={locked ? 'pointer-events-none opacity-50' : ''}>
                        <MathInput
                          index={idx}
                          prefix={getPrefixPair(prefixes[idx])}
                          setInputs={setInputs}
                          onEnter={handleCheck}
                          attempts={attempts}
                        />
                      </div>
                    ) : null
                  );
                })()}

              {Array.isArray(content?.[part]?.answer) &&
                content[part].answer.length > 0 &&
                content[part].answer[0] != null &&
                String(content[part].answer[0]).toUpperCase() !== 'NULL' &&
                String(content[part].answer[0]).toUpperCase() !== 'DIAGRAM' && (
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

            {/* ============================================================================ */}

  
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
            <div className="h-full w-5/12" data-tutorial-id="sideview-threads">
                <QThread
                    questionId={properties?.id ?? props.questions[props.position]?.id}
                    part={part} 
                />
            </div>
        ) : null}

        {sideView === 'logtables' ? (
          <div className="h-full w-5/12 flex items-center justify-center">
            <LogTables pgNumber={content?.[part]?.logtables ? String(content[part].logtables) : "null"}/>
          </div>
        ) : null}

        {sideView === 'timer' ? (
            <div className="h-full w-5/12" data-tutorial-id="sideview-timer">
                <Timer/>
            </div>
        ) : null}

        {sideView === 'marking_scheme' ? (
            <div className="h-full w-5/12">
                <MarkingScheme year={msYear} pgNumber={msPage}/>
            </div>
        ) : null}

        {sideView === 'decks' ? (
            <div className="h-full w-5/12" data-tutorial-id="sideview-decks">
                <ViewDecks question={properties?.id}/>
            </div>
        ) : null}

        {sideView === 'share' ? (
            <div className="h-full w-5/12">
                <SharePanel/>
            </div>
        ) : null}

        {sideView === 'canvas' ? (
            <div className="h-full w-5/12">
                <TestDraw/>
            </div>
        ) : null}

        {sideView === 'viewQuestions' ? (
          <div className="h-full w-5/12 overflow-hidden">
            <ViewQuestionsList
              questions={props.questions}
              currentIndex={props.position}
              currentPart={part}
              onSelect={(idx, partIdx) => {
                props.setPosition?.(idx);
                if (partIdx !== undefined) {
                  setPart(partIdx);
                }
              }}
              questionsAnswered={props.questionsAnswered}
              partsAnswered={partsAnswered}
              friendsAnswered={props.friendsAnswered}
              deckMode={props.deckmode}
            />
          </div>
        ) : null}

        {sideView === 'questionParts' ? (
          <div className="h-full w-5/12 overflow-hidden">
            <div className="w-full h-full rounded-2xl p-4 flex flex-col overflow-hidden">
              <p className="txt-heading-colour   mb-4">Question Parts</p>
              <div className="flex-1 overflow-y-auto scrollbar-minimal pr-2">
                {Array.isArray(content) && content.length > 0 ? (
                  content.map((p: any, idx: number) => (
                    <div 
                      key={idx}
                      ref={(el) => { partRefs.current[idx] = el; }}
                      className={`mb-4 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                        part === idx 
                          ? 'color-bg-grey-5' 
                          : 'hover:color-bg-grey-5/50'
                      }`}
                      onClick={() => { setPart(idx); setInputs([]); }}
                    >
                      {content.length > 1 && (
                        <p className={`font-bold mb-2 ${part === idx ? 'color-txt-accent' : 'color-txt-main'}`}>
                          {toRoman(idx + 1)})
                        </p>
                      )}
                      <div className="color-txt-sub">
                        <RenderMath text={p?.question ?? ''} className="txt leading-relaxed" />
                      </div>
                      {p?.image && (
                        <img
                          src={p.image}
                          alt={`Question part ${idx + 1}`}
                          className="mt-3 max-w-[220px] max-h-[190px] object-contain"
                          style={{ display: 'block', marginLeft: 'auto', marginRight: 'auto' }}
                        />
                      )}
                      {idx < content.length - 1 && (
                        <div className="h-0 border-t border-white/10 mt-4"></div>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="color-txt-sub text-sm">No parts available</p>
                )}
              </div>
            </div>
          </div>
        ) : null}
        {/* ====================================================================================== */}    
        </div>

        {/* ================================== QUESTION SIDEBAR ================================== */}
        { !props.preview ? (
        <div className="flex w-full justify-center items-center rounded-r-out h-auto z">



            <div className="border-2 color-shadow  flex my-2 px-3 rounded-4xl shadow-[0px_2px_0px_0px]" data-tutorial-id="question-sidebar">
            {/* =============================== THREADS ICON ================================= */}
            <div
                data-tutorial-id="sidebar-threads"
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
            <div 
                data-tutorial-id="sidebar-logtables"
                className={sideView == 'logtables' ? 'sidebar-selected group' : 'sidebar group'} 
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

            {/* =============================== QUESTION PARTS ICON ================================= */}
            {Array.isArray(content) && content.length > 1 && (
            <div className={sideView == 'questionParts' ? 'sidebar-selected group' : 'sidebar group'} 
                onClick={() => {
                    setSideView( (prev: any) => {
                        if (prev != 'questionParts') return 'questionParts'
                        else return '' 
                    });
                }}
            >
                <LuLayoutList strokeWidth={strokewidth} size={iconSize} 
                    className={sideView == 'questionParts' ? 'nav-icon-selected  icon-anim' : 'nav-icon icon-anim'}
                    fill={sideView == 'questionParts' ? 'currentColor' : 'none'} />

                 <span className="tooltip">all parts</span>
            </div>
            )}
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
            <div 
                data-tutorial-id="sidebar-decks"
                className={sideView == 'decks' ? 'sidebar-selected  group' : 'sidebar  group'} 
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

            <div 
                data-tutorial-id="sidebar-timer"
                className={sideView == 'timer' ? 'sidebar-selected group' : 'sidebar group'} 
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
            <div 
                data-tutorial-id="sidebar-filter"
                className={viewFilter ? 'sidebar-selected group' : 'sidebar group'} 
                onMouseDown={(e) => {
                    e.stopPropagation();
                    setViewFilter(prev => !prev);
                }}

            >
                <LuFilter strokeWidth={strokewidth} size={iconSize} 
                    className={viewFilter ? 'nav-icon-selected  icon-anim' : 'nav-icon icon-anim'}
                    fill={viewFilter ? 'currentColor' : 'none'} />

                 <span className="tooltip">filter</span>
                 <Filter  viewFilter={viewFilter} setViewFilter={setViewFilter} setFilters={props.setFilters}/>
            </div>
            {/* ================================================================================ */}


            {/* ===================================DRAWING ICON================================= */}
             <div 
                data-tutorial-id="sidebar-decks"
                className={sideView == 'canvas' ? 'sidebar-selected  group' : 'sidebar  group'} 
                onClick={() => {
                    setSideView( (prev: any) => {
                        if (prev != 'canvas') return 'canvas'
                        else return '' 
                    });
                }}
            >
                <LuPencil strokeWidth={strokewidth} size={iconSize} 
                    className={sideView == 'canvas' ? 'nav-icon-selected  icon-anim' : 'nav-icon icon-anim'}
                    fill={sideView == 'canvas' ? 'currentColor' : 'none'} />

                 <span className="tooltip">decks</span>
                 
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

            
        </div>
        ) : (<></> /* Do not show sidebar in preview mode */)
        }
</div>
        <div className="color-bg-grey-5 mx-4 w-10 h-10 min-w-[2.5rem] min-h-[2.5rem] aspect-square flex items-center group relative justify-center rounded-full hover:scale-95 duration-250 transition-all"
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
                <IoIosArrowForward size={36} className="color-txt-sub" style={{ verticalAlign: 'middle' }}/>

                <span className="tooltip">next</span>
            </div> 
        {/* ====================================================================================== */}    
        </div>
    </div>
    )
}
