import '../styles/decks.css'
import { useContext, useEffect, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserContext } from '../context/UserContext'
import { LuSearch, LuCheck, LuOctagon } from 'react-icons/lu'
import useDeckHandler from '../hooks/useDeckHandler'
import useDeckFilter from '../hooks/useDeckFilter'
import CreateDeckModal from '../components/decks/createDeckModal'
import DeckCard from '../components/decks/deckCard'
import DeckFilter from '../components/decks/deckFilter'
import useFetch from '../hooks/useFetch'

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

export default function Decks() {
	const { user } = useContext(UserContext)
	const navigate = useNavigate()

	const [showCreateModal, setShowCreateModal] = useState(false)
	const [isVisible, setIsVisible] = useState(false)

	// Use the deck filter hook
	const {
		search,
		setSearch,
		selectedCategory,
		setSelectedCategory,
		sortBy,
		setSortBy,
		selectedTopics,
		setSelectedTopics,
		filteredDecks,
		isLoading,
		isFiltering,
		refetchDecks,
		availableTopics
	} = useDeckFilter(user?.uid)

	const [userDecks, setUserDecks] = useState<any>([])
	const [isLoadingUserDecks, setIsLoadingUserDecks] = useState(true)
	const [feedbackState, setFeedbackState] = useState<'idle' | 'success' | 'error'>('idle')
	const [feedbackExiting, setFeedbackExiting] = useState(false)
	const [errorMessage, setErrorMessage] = useState('')

	const { createDeck } = useDeckHandler()
	const { fetchUserDecks } = useFetch()

	const getUserDecks = async () => {
		setIsLoadingUserDecks(true)
		const usrDecks = await fetchUserDecks(user?.uid)
		setUserDecks(usrDecks)
		setIsLoadingUserDecks(false)
	}

	useEffect(() => {
		getUserDecks()
	}, [user?.uid])

	const handleCreateDeck = async (name: string, description: string, questionIds: string[], visibility: boolean, color: string, isOfficial: boolean, imageFile?: File | null) => {
		try {
			await createDeck(name, description, questionIds, visibility, color, isOfficial, imageFile)
			setFeedbackState('success')
			
			// Refetch decks after successful creation
			await getUserDecks()
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
			{/*==================== Top bar with search and create deck button ======================= */}
			<div className='topBar flex-shrink-0'>
				<div className="flex items-center txtbox w-full color-bg">
					<input
						type="text"
						placeholder="Search decks"
						className="w-full p-1 outline-none border-none"
						onChange={(e: ChangeEvent<HTMLInputElement>) => {
						setSearch(e.target.value);
						}}
						value={search}
						aria-label="Search friends"
						aria-controls="friends-search-dropdown"
					/>

					<LuSearch className="color-txt-sub" size={24} />
        		</div>
				
                <button
                    type="button"
                    className="ml-auto blue-btn cursor-pointer"
                    onClick={() => {
                        setShowCreateModal(true)
                    }}>
                    Create Deck
                </button>
			</div>
			{/*==================================================================================== */}

			<div className="flex-1  w-full scrollbar-minimal">
				{/*================================== "My Decks" Section ============================== */}
				<div className='py-2 w-full '>
				<h2 className="txt-heading-colour text-3xl inline ml-4">My Decks</h2>
				<h2 
					className="txt-sub inline mx-2 hover:opacity-50 duration-200 transition-all cursor-pointer"
					onClick={() => navigate('/decks/my-decks')}
				>
					view all
				</h2>
				{isLoadingUserDecks ? (
					<div className='w-full relative overflow-hidden'>
						<div className="deck-grid w-full relative p-4 mr-10 flex-nowrap">
							{[...Array(5)].map((_, i) => (
								<div key={i} className="w-60 min-w-60 h-48 color-bg rounded-out animate-pulse flex flex-col justify-between p-4">
									<div className="h-4 color-bg-grey-5 rounded w-3/4"></div>
									<div className="h-3 color-bg-grey-5 rounded w-1/2"></div>
									<div className="h-3 color-bg-grey-5 rounded w-2/3"></div>
								</div>
							))}
						</div>
					</div>
				) : userDecks?.length === 0 ? (
					<p className="color-txt-sub ml-4 mt-2">You have not created any decks yet.</p>
				) : (
					<div className='w-full relative overflow-hidden'>
						<div className='gradient'></div>
						<div className="deck-grid w-full relative p-4 mr-10 flex-nowrap overflow-y-hidden">
							{ userDecks?.map((deck: any) => (
								<DeckCard key={deck.id} deck={deck} />
							)) }
						</div>
					</div>
				)}
			</div>
			{/*==================================================================================== */}

			{/*================================== MARKETPLACE Section ============================== */}
			<div className='mt-2 mb-4 px-8 w-full flex items-center justify-around'>
				<div className='line '></div>
				<div className='min-w-80 px-2 '>
					<span className="block txt-heading-colour text-4xl  w-full text-center">MARKETPLACE</span>
				</div>
				<div className='line '></div>

			</div>
			{/*==================================================================================== */}
			
			{/*================================== "Filter Section" ============================== */}
			<div className="flex gap-2 px-4 mb-6 ">
				{/* Filter Panel */}
				<DeckFilter
					search={search}
					setSearch={setSearch}
					selectedCategory={selectedCategory}
					setSelectedCategory={setSelectedCategory}
					sortBy={sortBy}
					setSortBy={setSortBy}
					selectedTopics={selectedTopics}
					setSelectedTopics={setSelectedTopics}
					availableTopics={availableTopics}
				/>

				{/* Decks Display Area */}
				<div className="flex-1 overflow-y-auto scrollbar-minimal h-200">
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
							<p className="txt text-center text-sm mb-2">No decks found</p>
							<p className="txt-sub text-center text-xs">Try adjusting your filters or search term</p>
						</div>
					) : (
						<div className="flex flex-wrap gap-4 py-4 pl-4 ">
							{filteredDecks?.map((deck: any) => (
								<div key={deck.id} className=''>
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
			</div>
			
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

