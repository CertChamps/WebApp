// Icons
import { LuArrowLeft, LuTrash, LuPencil } from "react-icons/lu";

// Hooks 
import { useContext, useEffect, useState, useRef } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useStopwatch } from "../hooks/useStopwatch";
import useDeckHandler from "../hooks/useDeckHandler";
import useQuestions from "../hooks/useQuestions";
import useFetch from "../hooks/useFetch";

// Components 
import Question from "../components/questions/question";
import DeckPreview from "../components/decks/deckPreview";
import EditDeckModal from "../components/decks/editDeckModal";
import ConfirmationPrompt from "../components/prompts/confirmation";

// Context 
import { UserContext } from "../context/UserContext";

// Firebase
import { getStorage, ref, getDownloadURL } from "firebase/storage";

export default function DeckViewer () {

    // =========================== HOOKS, STATE, CONTEXT =========================== //
    const { id, "*": isPrev } = useParams()
    const isPreviewMode = isPrev === "preview"
    const { getDeckbyID , saveProgress, getUsersDeckSaveData, getFriendsAnswers, updateDeck, deleteDeck, removeUserFromDeck } = useDeckHandler()
    const { fetchQuestion } = useQuestions()
    const { fetchFriends } = useFetch()
    const navigate = useNavigate()
    const location = useLocation()

    const { user } = useContext(UserContext)

    const [deck, setDeck] = useState<any>()
    const [questions, setQuestions] = useState<any>([])
    const [position, setPosition] = useState<number>(0)
    const [questionsAnswered, setQuestionsAnswered] = useState<any>({})
    const [friendsAnswered, setFriendsAnswered] = useState<any>({})
    const [showEditModal, setShowEditModal] = useState(false)
    const [isEditVisible, setIsEditVisible] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [isOwner, setIsOwner] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
    const isInitialRender = useRef(true)

    // get stopwatch and start
    const { start, stop, secondsElapsed, setSecondsElapsed} = useStopwatch()

    // ============================ INITIALISATION ============================== //
    const fetchDeckData = async () => {
        try {
            // get the Deck Data 
            const deckData = await getDeckbyID(id) 

            // get the User Save Data 
            const saveData = await getUsersDeckSaveData(id, user?.uid)

            // Redirect to preview only if user is NOT in usersAdded
            if (!isPreviewMode && user?.uid && !saveData) {
                navigate(`/decks/${id}/preview`, { state: { fromPreview: true } })
                return
            }

            // Resolve image URL if deck has an image
            let imageUrl: string | undefined
            if (deckData?.image) {
                try {
                    const storage = getStorage()
                    const imageRef = ref(storage, deckData.image)
                    imageUrl = await getDownloadURL(imageRef)
                } catch (err) {
                    console.warn("Failed to get deck image:", err)
                }
            }

            // Concatenate all data 
            const init = {
                ...deckData,
                ...saveData,
                imageUrl
            }

            if (deckData?.createdBy === 'CertChamps') {
                setIsOwner(user?.uid === "NkN9UBqoPEYpE21MC89fipLn0SP2" || user?.uid === "gJIqKYlc1OdXUQGZQkR4IzfCIoL2")
            } else {
                setIsOwner(user?.uid === deckData?.createdBy)
            }


            setDeck(init)
            setSecondsElapsed(saveData?.timeElapsed ?? 0)
            
            // Initialize questionsAnswered from save data
            if (saveData?.questionsCompleted && Array.isArray(saveData.questionsCompleted)) {
                const answeredObj: any = {};
                saveData.questionsCompleted.forEach((qId: string) => {
                    answeredObj[qId] = true;
                });
                setQuestionsAnswered(answeredObj);
            }
            
            start()
            // Map to array of promises
            const questionPromises = (deckData?.questions || []).map(async (qID: string) => {
                return await fetchQuestion(qID);
            });

            const questionData = await Promise.all(questionPromises);
            const filteredData = questionData.filter((q: any) => q !== null); // remove any bad ones

            setQuestions(filteredData);

            // Fetch friends' answers for this deck
            if (user?.uid && id) {
                const friends = await fetchFriends(user.uid);
                console.log("Fetched friends:", friends);
                if (friends && friends.length > 0) {
                    const friendsData = await getFriendsAnswers(id, friends);
                    setFriendsAnswered(friendsData);
                }
            }
        } catch (error) {
            console.error("Error loading questions:", error); 
        }
    }

    // Refetch deck data (used after editing)
    const refetchDeck = async () => {
        setIsLoading(true)
        await fetchDeckData()
        setIsLoading(false)
    }

    useEffect(() => {
        fetchDeckData()
    }, [id, isPrev])
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

    // ============================= SAVE PROGRESS ============================== //
    // // Save progress on page leave
    useEffect(() => {
        if (isInitialRender.current) {
            isInitialRender.current = false;
            return;
        }

        const handleBeforeUnload = () => {
            const questionsCompletedArray = Object.keys(questionsAnswered).filter(
                qId => questionsAnswered[qId] === true
            );
            console.log("Saving progress before unload:", questionsCompletedArray, secondsElapsed);
            saveProgress(questionsCompletedArray, id, secondsElapsed);
        };

        handleBeforeUnload();
    }, [questionsAnswered]);
    // // ========================================================================== // 



    return (
    <div className="w-h-container flex-col overflow-clip relative">

        { /* ======================================= LOADING OVERLAY ==================================== */ }
        { isLoading && (
            <div className="absolute inset-0 color-bg-grey-10 z-40 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-3 border-transparent border-t-current border-r-current rounded-full animate-spin color-txt-accent" />
                    <span className="color-txt-main font-semibold">Updating deck...</span>
                </div>
            </div>
        )}
        { /* ====================================================================================== */ }

        { /* ======================================= TOP PANEL ==================================== */ }
        { !isPreviewMode ? (
            <div className="px-4 pt-4  w-full flex justify-between">

                { /* BACK BUTTON */ }
                <div className="hover:opacity-75 duration-100 transition-all color-txt-main cursor-pointer flex items-center" 
                    onClick={() => { navigate(-1); stop();}}>
                    <LuArrowLeft className="" size={24} />
                    <span className="mx-2">Back</span>
                </div>

                { /* TIMER */ }
                {/* { isPrev !== "preview" ? <span className="txt-heading-colour mx-8">{timeFormatted}</span> : <></>} */}

                { /* TITLE */ }
                <span className="txt-heading-colour mx-8">{deck?.name}</span>

                { /* RIGHT ACTIONS: EDIT + DELETE (no-op) */ }
                <div className="flex items-center gap-4 color-txt-main txt-sub">
                    <>
                        {isOwner   ? (
                            <>
                                <div 
                                    className="flex items-center gap-2 cursor-pointer hover:opacity-75 duration-100 transition-all"
                                    onClick={() => setShowEditModal(true)}
                                >
                                    <LuPencil size={20} />
                                    <span>Edit</span>
                                </div>
                                <div className="flex items-center gap-2 cursor-pointer hover:opacity-75 duration-100 transition-all"
                                    onClick={() => setShowDeleteConfirm(true)}>
                                    <LuTrash size={20} />
                                    <span>Delete</span>
                                </div>
                            </>
                        ) : (
                            <div className="flex items-center gap-2 cursor-pointer hover:opacity-75 duration-100 transition-all"
                            onClick={() => setShowRemoveConfirm(true)}>
                                <LuTrash size={20} />
                                <span>Remove</span>
                            </div>
                        )
                        }
                    </>
                </div>

            </div>
        ) : null }
        { /* ====================================================================================== */ }

        { /* ======================================= QUESTION ==================================== */ }
        { isPreviewMode ? (
            <DeckPreview 
                deck={deck} 
                questions={questions} 
                deckId={id as string}
                onBack={() => {
                    saveProgress([], id, secondsElapsed);
                    // Only navigate back 2 if the previous page in history contains "preview" (to avoid preview loop)
                    const navigationSteps = location.state?.fromPreview ? -2 : -1;
                    navigate(navigationSteps);
                    stop();
                }}
            />
        ) : (
            <Question
                questions={questions}
                position={position}
                setPosition={setPosition}
                nextQuestion={() => setPosition(prev => (prev < questions.length - 1 ? prev + 1 : 0))}
                setFilters={() => {}}
                deckmode
                preview={isPreviewMode}
                onQuestionAnswered={(questionId: string, isCorrect: boolean) => {
                    setQuestionsAnswered((prev: any) => ({
                        ...prev,
                        [questionId]: isCorrect
                    }));
                }}
                questionsAnswered={questionsAnswered}
                friendsAnswered={friendsAnswered}
            /> 
        )}
        { /* ====================================================================================== */ }

        { /* ======================================= EDIT MODAL ==================================== */ }
        { showEditModal && deck && (
            <EditDeckModal
                setShowEditModal={setShowEditModal}
                isVisible={isEditVisible}
                setIsVisible={setIsEditVisible}
                updateDeck={updateDeck}
                deck={{
                    id: id as string,
                    name: deck.name || '',
                    description: deck.description || '',
                    questions: deck.questions || [],
                    visibility: deck.visibility || false,
                    color: deck.color || '#FFFFFF',
                    image: deck.imageUrl || undefined,
                    createdBy: deck.createdBy || ''
                }}
                onUpdate={refetchDeck}
            />
        )}
        { /* ====================================================================================== */ }

        { /* ======================================= DELETE CONFIRMATION ==================================== */ }
        <ConfirmationPrompt
            open={showDeleteConfirm}
            title="Delete Deck"
            message="Are you sure you want to delete this deck? This action cannot be undone and will remove this deck for all users."
            confirmText="Delete"
            cancelText="Cancel"
            onConfirm={() => {
                deleteDeck(id);
                setShowDeleteConfirm(false);
            }}
            onCancel={() => setShowDeleteConfirm(false)}
        />
        { /* ====================================================================================== */ }

        { /* ======================================= REMOVE CONFIRMATION ==================================== */ }
        <ConfirmationPrompt
            open={showRemoveConfirm}
            title="Remove Deck"
            message="Are you sure you want to remove this deck? This action cannot be undone and will remove all deck progress from your account."
            confirmText="Remove"
            cancelText="Cancel"
            onConfirm={() => {
                removeUserFromDeck(id as string);
                setShowRemoveConfirm(false);
            }}
            onCancel={() => setShowRemoveConfirm(false)}
        />
        { /* ====================================================================================== */ }

    </div>
    )
}