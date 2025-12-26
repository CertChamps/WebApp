import '../styles/decks.css'
import { useContext, useEffect, useState, type ChangeEvent } from 'react'
import { UserContext } from '../context/UserContext'
import { LuSearch } from 'react-icons/lu'
import useDeckHandler from '../hooks/useDeckHandler'
import CreateDeckModal from '../components/decks/createDeckModal'
import DeckCard from '../components/decks/deckCard'
import useFetch from '../hooks/useFetch'


export default function Decks() {
	const { user } = useContext(UserContext)

	const [search, setSearch] = useState('')
	const [showCreateModal, setShowCreateModal] = useState(false)
	const [isVisible, setIsVisible] = useState(false)

	const [userDecks, setUserDecks] = useState<any>([])	
	const [publicDecks, setPublicDecks] = useState<any>([])	

	const { createDeck } = useDeckHandler()
	const { fetchUserDecks, fetchPublicDecks } = useFetch()

	useEffect(() => {

		const getDecks = async () => {
			// Fetch user decks from firestore
			const usrDecks = await fetchUserDecks(user?.uid)
			const pblcDecks = await fetchPublicDecks()
			setUserDecks(usrDecks)
			setPublicDecks(pblcDecks)
		}

		getDecks()
		
	}, [showCreateModal])


	return (
		<div className="w-full h-full ">
			{/*==================== Top bar with search and create deck button ======================= */}
			<div className='topBar'>
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

			{/*================================== "My Decks" Section ============================== */}
			<div className='p-4'>
				<h2 className="txt-heading-colour text-2xl inline">My Decks</h2>
				<h2 className="txt-sub inline mx-2 hover:opacity-50 duration-200 transition-all cursor-pointer">view all</h2>
				{userDecks?.length === 0 ? (
					<p className="color-txt-sub">You have not created any decks yet.</p>
				) : (
					<div className='w-full h-40 relative'>
						<div className='gradient'></div>
						<div className="deck-grid relative p-4">
							{ userDecks?.map((deck: any) => (
								<DeckCard key={deck.id} deck={deck} />
							)) }
						</div>
					</div>
				)}
			</div>
			{/*==================================================================================== */}

			{/*================================== "Newly Added" Section ============================== */}
			<div className='p-4'>
				<h2 className="txt-heading-colour text-2xl inline">Newly Added</h2>
				<h2 className="txt-sub inline mx-2 hover:opacity-50 duration-200 transition-all cursor-pointer">view all</h2>
				{publicDecks?.length === 0 ? (
					<p className="color-txt-sub">No newly added decks available.</p>
				) : (
					<div className='w-full h-40 relative'>
						<div className='gradient'></div>
						<div className="deck-grid relative p-4">
							{ publicDecks?.map((deck: any) => (
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
					createDeck={createDeck}
				/>

			)}
			{/*==================================================================================== */}
		</div>
	)
}

