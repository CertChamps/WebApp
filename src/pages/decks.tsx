import '../styles/decks.css'
import { useContext, useEffect, useState, type ChangeEvent } from 'react'
import { UserContext } from '../context/UserContext'
import { LuSearch, LuCheck, LuOctagon } from 'react-icons/lu'
import useDeckHandler from '../hooks/useDeckHandler'
import CreateDeckModal from '../components/decks/createDeckModal'
import DeckCard from '../components/decks/deckCard'
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

	const [search, setSearch] = useState('')
	const [showCreateModal, setShowCreateModal] = useState(false)
	const [isVisible, setIsVisible] = useState(false)

	const [userDecks, setUserDecks] = useState<any>([])
	const [publicDecks, setPublicDecks] = useState<any>([])
	const [certChampsDecks, setCertChampsDecks] = useState<any>([])
	const [isLoading, setIsLoading] = useState(true)
	const [feedbackState, setFeedbackState] = useState<'idle' | 'success' | 'error'>('idle')
	const [feedbackExiting, setFeedbackExiting] = useState(false)
	const [errorMessage, setErrorMessage] = useState('')

	const { createDeck } = useDeckHandler()
	const { fetchUserDecks, fetchPublicDecks, fetchCertChampsDecks } = useFetch()

	const getDecks = async () => {
		setIsLoading(true)
		
		// Fetch user decks from firestore
		const usrDecks = await fetchUserDecks(user?.uid)
		setUserDecks(usrDecks)
		
		const pblcDecks = await fetchPublicDecks()
		setPublicDecks(pblcDecks)
		
		const ccDecks = await fetchCertChampsDecks()
		setCertChampsDecks(ccDecks)

		setIsLoading(false)
	}

	useEffect(() => {
		getDecks()
	}, [user?.uid])

	const handleCreateDeck = async (name: string, description: string, questionIds: string[], visibility: boolean, color: string, isOfficial: boolean) => {
		try {
			await createDeck(name, description, questionIds, visibility, color, isOfficial)
			setFeedbackState('success')
			
			// Refetch decks after successful creation
			await getDecks()
			
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

			{isLoading ? (
				<div className="flex-1 w-full scrollbar-minimal h-full overflow-y-hidden">
					{/* My Decks Skeleton */}
					<div className='py-4 w-full'>
						<div className="h-8 color-bg-grey-5 rounded w-48 ml-4 mb-4 animate-pulse"></div>
						<div className='w-full h-40 relative'>
							<div className="deck-grid w-full relative p-4 mr-10">
								{[...Array(5)].map((_, i) => (
									<div key={i} className="w-60 h-32 color-bg rounded-out animate-pulse flex flex-col justify-between p-4">
										<div className="h-4 color-bg-grey-5 rounded w-3/4"></div>
										<div className="h-3 color-bg-grey-5 rounded w-1/2"></div>
										<div className="h-3 color-bg-grey-5 rounded w-2/3"></div>
									</div>
								))}
							</div>
						</div>
					</div>
					
					{/* Newly Added Skeleton */}
					<div className='py-4 w-full'>
						<div className="h-8 color-bg-grey-5 rounded w-48 ml-4 mb-4 animate-pulse"></div>
						<div className='w-full h-40 relative'>
							<div className="deck-grid w-full relative p-4 mr-10">
								{[...Array(5)].map((_, i) => (
									<div key={i} className="w-60 h-32 color-bg rounded-out animate-pulse flex flex-col justify-between p-4">
										<div className="h-4 color-bg-grey-5 rounded w-3/4"></div>
										<div className="h-3 color-bg-grey-5 rounded w-1/2"></div>
										<div className="h-3 color-bg-grey-5 rounded w-2/3"></div>
									</div>
								))}
							</div>
						</div>
					</div>

					{/* The Real Deal Skeleton */}
					<div className='py-4 w-full'>
						<div className="h-8 color-bg-grey-5 rounded w-48 ml-4 mb-4 animate-pulse"></div>
						<div className='w-full h-40 relative'>
							<div className="deck-grid w-full relative p-4 mr-10">
								{[...Array(5)].map((_, i) => (
									<div key={i} className="w-60 h-32 color-bg rounded-out animate-pulse flex flex-col justify-between p-4">
										<div className="h-4 color-bg-grey-5 rounded w-3/4"></div>
										<div className="h-3 color-bg-grey-5 rounded w-1/2"></div>
										<div className="h-3 color-bg-grey-5 rounded w-2/3"></div>
									</div>
								))}
							</div>
						</div>
					</div>
				</div>
			) : (
			<div className="flex-1  w-full scrollbar-minimal">
				{/*================================== "My Decks" Section ============================== */}
				<div className='py-2 w-full '>
				<h2 className="txt-heading-colour text-2xl inline ml-4">My Decks</h2>
				<h2 className="txt-sub inline mx-2 hover:opacity-50 duration-200 transition-all cursor-pointer">view all</h2>
				{userDecks?.length === 0 ? (
					<p className="color-txt-sub">You have not created any decks yet.</p>
				) : (
					<div className='w-full h-40 relative '>
						<div className='gradient'></div>
						<div className="deck-grid w-full relative p-4 mr-10">
							{ userDecks?.map((deck: any) => (
								<DeckCard key={deck.id} deck={deck} />
							)) }
						</div>
					</div>
				)}
			</div>
			{/*==================================================================================== */}

			{/*================================== "Newly Added" Section ============================== */}
			<div className='py-2 w-full scrollbar-minimal'>
				
				<h2 className="txt-heading-colour text-2xl inline ml-4">Newly Added</h2>
				<h2 className="txt-sub inline mx-2 hover:opacity-50 duration-200 transition-all cursor-pointer">view all</h2>
				{publicDecks?.length === 0 ? (
					<p className="color-txt-sub">No newly added decks available.</p>
				) : (
					<div className='w-full h-40 relative'>
						<div className='gradient'></div>
						<div className="deck-grid w-full relative p-4 mr-10">
							{ publicDecks?.map((deck: any) => (
								<DeckCard key={deck.id} deck={deck} />
							)) }
						</div>
					</div>
				)}
			</div>
			{/*==================================================================================== */}

			
			{/*================================== "CertChamps" Section ============================== */}
			<div className='py-2 w-full scrollbar-minimal'>
				
				<h2 className="txt-heading-colour text-2xl inline ml-4">The Real Deal</h2>
				<h2 className="txt-sub inline mx-2 hover:opacity-50 duration-200 transition-all cursor-pointer">view all</h2>
				{certChampsDecks?.length === 0 ? (
					<p className="color-txt-sub">No newly added decks available.</p>
				) : (
					<div className='w-full h-40 relative'>
						<div className='gradient'></div>
						<div className="deck-grid w-full relative p-4 mr-10">
							{ certChampsDecks?.map((deck: any) => (
								<DeckCard key={deck.id} deck={deck} />
							)) }
						</div>
					</div>
				)}
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
			)}
			
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

