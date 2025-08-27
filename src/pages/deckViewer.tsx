import { useContext, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import useDeckHandler from "../hooks/useDeckHandler";
import useQuestions from "../hooks/useQuestions";
import Question from "../components/question";
import { LuArrowLeft, LuTrash } from "react-icons/lu";
import { useStopwatch } from "../hooks/useStopwatch";
import { UserContext } from "../context/UserContext";

export default function DeckViewer () {
    // ================================ HOOKS =================================== //
    const { userID, id, "*": isPrev } = useParams()
    const { user } = useContext(UserContext)
    const { getDeckbyID , deleteDeck, saveProgress, addtoDecks} = useDeckHandler()
    const { fetchQuestion } = useQuestions()
    const navigate = useNavigate()

    const [deck, setDeck] = useState<any>()
    const [questions, setQuestions] = useState<any>([])
    const [position, setPosition] = useState(0)

    // get stopwatch and start
    const {timeFormatted, start, stop, secondsElapsed, setSecondsElapsed} = useStopwatch()

    // ============================ INITIALISATION ============================== //
    useEffect(() => {

        // Automatically bring user to preview mode if does not own deck 
        if (!isPrev && !user?.decks?.some( (deck:any) => deck.id === id)) {
            navigate(`/decks/${userID}/${id}/preview`);
        }

        // Initialise the Deck ========================
        const init_deck = async () => {
            try {
                
                // set the deck
                const init = await getDeckbyID(id, userID) 
                setDeck(init)
                setSecondsElapsed(init?.timeElapsed)
                start()
                // Map to array of promises
                const questionPromises = init?.questions.map(async (qID: string) => {
                    return await fetchQuestion(qID);
                });

                const questionData = await Promise.all(questionPromises);
                const filteredData = questionData.filter(q => q !== null); // remove any bad ones

                setQuestions(filteredData);
            } catch (error) {
                console.error("Error loading questions:", error);
            }
        };
        // ============================================

        init_deck()

    }, [])
    // ========================================================================== // 

    // =============================== KEYPRESS ================================= //
    useEffect(() => {
        // keypress function ==========================
        const onKeyDown = (e: any) => {
            
            // manually going to next question
            if(e.which === 13){
                setPosition(prev => {
                    if (prev < questions.length - 1) {
                        return prev + 1;
                    } else {
                        return 0; // Optionally loop back to start
                    }
                });
            }      
        }

        // key press event listening
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)

    }, [questions, position])
    // ========================================================================== // 



    return (
    <div className="w-h-container flex-col">

        <div>
            <LuArrowLeft className="hover:scale-110 duration-200 transition-all color-txt-main inline" 
                onClick={() => {
                    if(isPrev === "preview") 
                        saveProgress([], id, secondsElapsed); 
                    navigate('/practice'); stop();}}/>
            { isPrev !== "preview" ? <span className="txt-heading-colour mx-8">{timeFormatted}</span> : <></>}
            <span className="txt-heading-colour mx-8">{deck?.name}</span>
            { isPrev !== "preview" ? <LuTrash className="hover:scale-110 duration-200 transition-all color-txt-main inline" 
                onClick={() => {deleteDeck(id); navigate('/practice'); stop()}}/> : <></>}



        </div>

        <Question questions={questions} position={position} deckmode preview={isPrev === "preview"}/> 

        { isPrev === "preview" ? <span className="blue-btn w-1/2 m-auto" onClick={() => {
                addtoDecks(deck.name, deck.description, deck.questions);
                navigate('/practice')
        }}>Add to Decks</span> : <></>}

    </div>
    )
}