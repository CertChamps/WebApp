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

// Add inline styles for animation
const styleSheet = `
  @keyframes scaleIn {
    from {
      opacity: 0;
      transform: scale(0.8);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
`

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
        <>
            <style>{styleSheet}</style>
            <div className="h-container items-start w-full overflow-y-auto scrollbar-minimal px-4">
                {/* Deck Cards */}
                <div className="w-full">
                    {userDecks.length === 0 ? (
                        <p className="color-txt-sub text-center py-4">You have no decks yet. Create one below!</p>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {userDecks.map((deck: any) => (
                                <div key={deck.id} className="relative transition-all duration-300">
                                    <DeckCard
                                        deck={deck}
                                        questionId={currentQuestionId}
                                        onAddQuestion={handleAddQuestion}
                                        className={addedToDeck === deck.id ? 'ring-2 color-shadow' : ''}
                                    />
                                    {addedToDeck === deck.id && (
                                        <div 
                                            className="absolute bottom-4 right-5 color-bg-accent color-txt-main text-xs font-semibold px-3 py-1.5 rounded-out color-shadow flex items-center gap-1.5"
                                            style={{
                                                animation: 'scaleIn 0.3s ease-out'
                                            }}
                                        >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                            </svg>
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
        </>
    )
}