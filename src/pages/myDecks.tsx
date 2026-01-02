import '../styles/decks.css'
import { useContext, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserContext } from '../context/UserContext'
import { LuArrowLeft, LuCheck, LuOctagon } from 'react-icons/lu'
import useDeckHandler from '../hooks/useDeckHandler'
import useMyDeckFilter from '../hooks/useMyDeckFilter'
import CreateDeckModal from '../components/decks/createDeckModal'
import DeckCard from '../components/decks/deckCard'
import MyDeckFilter from '../components/decks/myDeckFilter'

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
  @keyframes fadeOut {
    from {
      opacity: 1;
      transform: scale(1);
    }
    to {
      opacity: 0;
      transform: scale(0.8);
    }
  }
`

export default function MyDecks() {
	const { user } = useContext(UserContext)
	const navigate = useNavigate()

	const [showCreateModal, setShowCreateModal] = useState(false)
	const [isVisible, setIsVisible] = useState(false)

	// Use the my deck filter hook
	const {
		search,
		setSearch,
		sortBy,
		setSortBy,
		selectedTopics,
		setSelectedTopics,
		filteredDecks,
		isLoading,
		isFiltering,
		refetchDecks,
		availableTopics
	} = useMyDeckFilter(user?.uid)

	const [feedbackState, setFeedbackState] = useState<'idle' | 'success' | 'error'>('idle')
	const [feedbackExiting, setFeedbackExiting] = useState(false)
	const [errorMessage, setErrorMessage] = useState('')

	const { createDeck } = useDeckHandler()

	const handleCreateDeck = async (name: string, description: string, questionIds: string[], visibility: boolean, color: string, isOfficial: boolean, imageFile?: File | null) => {
		try {
			await createDeck(name, description, questionIds, visibility, color, isOfficial, imageFile)
			setFeedbackState('success')
			
			// Refetch decks after successful creation
			await refetchDecks()
			
			// Keep feedback visible for 2 seconds, then fade out
			setTimeout(() => {
				setFeedbackExiting(true)
				setTimeout(() => {
					setFeedbackState('idle')
					setFeedbackExiting(false)
				}, 500)
			}, 2000)
		} catch (err) {
			setFeedbackState('error')
			setErrorMessage(err instanceof Error ? err.message : 'Failed to create deck')
			
			// Reset error state after 3 seconds
			setTimeout(() => {
				setFeedbackState('idle')
				setErrorMessage('')
			}, 3000)
		}
	}

	return (
		<div className="w-full h-full flex flex-col overflow-x-hidden p-4 scrollbar-minimal">
			{/*==================== Top bar with back button and create deck button ======================= */}
			<div className='topBar flex-shrink-0 flex items-center gap-4'>
				<button
					type="button"
					className="flex items-center gap-2 txt hover:opacity-70 transition-opacity cursor-pointer"
					onClick={() => navigate('/decks')}
				>
					<LuArrowLeft size={24} />
					<span className="txt-bold">Back</span>
				</button>

				<h1 className="txt-heading-colour text-2xl flex-1 text-center">My Decks</h1>
				
				<button
					type="button"
					className="blue-btn cursor-pointer"
					onClick={() => {
						setShowCreateModal(true)
					}}>
					Create Deck
				</button>
			</div>
			{/*==================================================================================== */}

			{/*================================== Filter Section ============================== */}
			<div className="flex gap-4 px-4 mt-6 flex-1 min-h-0">
				{/* Filter Panel */}
				<MyDeckFilter
					search={search}
					setSearch={setSearch}
					sortBy={sortBy}
					setSortBy={setSortBy}
					selectedTopics={selectedTopics}
					setSelectedTopics={setSelectedTopics}
					availableTopics={availableTopics}
				/>

				{/* Decks Display Area */}
				<div className="flex-1 overflow-y-auto scrollbar-minimal">
					{isLoading || isFiltering ? (
						<div className="flex flex-wrap gap-4 p-4">
							{[...Array(6)].map((_, i) => (
								<div key={i} className="w-60 h-48 color-bg rounded-out animate-pulse flex flex-col p-4">
									<div className="h-10 w-10 color-bg-grey-5 rounded-full mb-2"></div>
									<div className="h-4 color-bg-grey-5 rounded w-3/4 mb-2"></div>
									<div className="h-3 color-bg-grey-5 rounded w-1/2 mb-3"></div>
									<div className="flex gap-1 mb-2">
										<div className="h-5 color-bg-grey-5 rounded w-16"></div>
										<div className="h-5 color-bg-grey-5 rounded w-12"></div>
									</div>
									<div className="h-3 color-bg-grey-5 rounded w-full mb-1"></div>
									<div className="h-3 color-bg-grey-5 rounded w-2/3"></div>
								</div>
							))}
						</div>
					) : filteredDecks?.length === 0 ? (
						<div className="flex flex-col items-center justify-center h-full">
							<p className="txt text-center text-lg mb-2">No decks found</p>
							<p className="txt-sub text-center text-sm mb-4">
								{search || selectedTopics.length > 0 
									? "Try adjusting your filters or search term" 
									: "You haven't created any decks yet"}
							</p>
							<button
								type="button"
								className="blue-btn cursor-pointer"
								onClick={() => setShowCreateModal(true)}
							>
								Create Your First Deck
							</button>
						</div>
					) : (
						<div className="flex flex-wrap gap-4 p-4">
							{filteredDecks?.map((deck: any) => (
								<div key={deck.id}>
									<DeckCard deck={deck} />
								</div>
							))}
						</div>
					)}
				</div>
			</div>
			{/*==================================================================================== */}

			{/*================================ Create Deck Modal ================================= */}
			{showCreateModal && (
				<CreateDeckModal
					setShowCreateModal={setShowCreateModal}
					isVisible={isVisible}
					setIsVisible={setIsVisible}
					createDeck={handleCreateDeck}
				/>
			)}
			{/*==================================================================================== */}
			
			{/* Feedback Display */}
			{feedbackState !== 'idle' && (
				<div
					className="fixed bottom-8 left-1/2 -translate-x-1/2 p-4 rounded-out flex items-center justify-center gap-3 z-[9999] color-bg color-shadow"
					style={{
						animation: feedbackExiting ? 'fadeOut 0.5s ease-out forwards' : 'scaleIn 0.3s ease-out'
					}}
				>
					{feedbackState === 'success' && (
						<>
							<LuCheck className="color-txt-accent" size={24} strokeWidth={3} />
							<span className="color-txt-main font-semibold">Deck created successfully!</span>
						</>
					)}
					{feedbackState === 'error' && (
						<>
							<LuOctagon className="text-red-500" size={24} strokeWidth={2} />
							<div className="flex flex-col">
								<span className="text-red-600 font-semibold">Failed to create deck</span>
								<span className="text-red-500 text-sm">{errorMessage}</span>
							</div>
						</>
					)}
				</div>
			)}
			
			<style>{styleSheet}</style>
		</div>
	)
}
