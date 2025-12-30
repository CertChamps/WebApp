// Styles 
import '../styles/decks.css'

// Hooks
import { useContext, useEffect, useState } from "react"
import useDeckHandler from "../hooks/useDeckHandler"
import useFetch from "../hooks/useFetch"

// Context 
import { UserContext } from "../context/UserContext"

// Components 
import CreateDeckModal from "./decks/createDeckModal"
import DeckCard from "./decks/deckCard"

// Component Props 
type ViewDecksProps = {
    questionId?: string
    question?: string // backwards compatibility
}

export default function ViewDecks({ questionId, question }: ViewDecksProps) {

    //================================= State, Hooks, and Context ================================//
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [isVisible, setIsVisible] = useState(false)
    const [userDecks, setUserDecks] = useState<any[]>([])
    const [addedToDeck, setAddedToDeck] = useState<string | null>(null)

    const { user } = useContext(UserContext)
    const { createDeck, addQuestiontoDeck } = useDeckHandler()
    const { fetchUserDecks } = useFetch()
    //==========================================================================================//

    // Support both questionId and question props
    const currentQuestionId = questionId || question

    // Fetch user decks on mount and when modal closes
    useEffect(() => {
        const getDecks = async () => {
            if (user?.uid) {
                const decks = await fetchUserDecks(user.uid)
                setUserDecks(decks || [])
            }
        }
        getDecks()
    }, [user?.uid, showCreateModal])

    // Handler for adding question to a deck
    const handleAddQuestion = async (deckId: string, qId: string) => {
        await addQuestiontoDeck([qId], deckId)
        setAddedToDeck(deckId)
        
        // Clear feedback after 2 seconds
        setTimeout(() => {
            setAddedToDeck(null)
        }, 2000)
    }

    return (
        <div className="h-container items-start w-full overflow-y-auto scrollbar-minimal px-4">
            {/* Deck Cards */}
            <div className="w-full">
                {userDecks.length === 0 ? (
                    <p className="color-txt-sub text-center py-4">You have no decks yet. Create one below!</p>
                ) : (
                    <div className="flex flex-col gap-3">
                        {userDecks.map((deck: any) => (
                            <div key={deck.id} className="relative">
                                <DeckCard
                                    deck={deck}
                                    questionId={currentQuestionId}
                                    onAddQuestion={handleAddQuestion}
                                    className={addedToDeck === deck.id ? 'ring-2 ring-green-500' : ''}
                                />
                                {addedToDeck === deck.id && (
                                    <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full animate-pulse">
                                        Added!
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* New Deck Button */}
                <div 
                    className="new-deck my-3 cursor-pointer" 
                    onClick={() => setShowCreateModal(true)}
                >
                    <p className="color-txt-main text-center">New Deck</p>
                </div>
            </div>

            {/* Create Deck Modal */}
            {showCreateModal && (
                <CreateDeckModal
                    setShowCreateModal={setShowCreateModal}
                    isVisible={isVisible}
                    setIsVisible={setIsVisible}
                    createDeck={createDeck}
                />
            )}
        </div>
    )
}