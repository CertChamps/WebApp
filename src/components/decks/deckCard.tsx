import '../../styles/decks.css'
import { useContext, useEffect, useState } from 'react'
import { db } from '../../../firebase'
import { getDoc, doc } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import { UserContext } from '../../context/UserContext'
import useFetch from '../../hooks/useFetch'
import logo from '../../assets/icon.png'
import icon from '../../assets/logo.png'

type Deck = {
	id: string
	name?: string
	description?: string
	color?: string
	questions?: any[]
	timestamp?: any
	createdBy?: string
}

type DeckCardProps = {
	deck: Deck
	questionId?: string
	onAddQuestion?: (deckId: string, questionId: string) => void
	className?: string
}

export default function DeckCard({ deck, questionId, onAddQuestion }: DeckCardProps) {
	const { user } = useContext(UserContext)
	const { fetchUsernameByID, fetchUserImage } = useFetch()
	const navigate = useNavigate()
	const [creatorName, setCreatorName] = useState<string>('')
	const [creatorImage, setCreatorImage] = useState<string | null>(null)

	const hasQuestion = Boolean(questionId)
	const resolvedColor = (deck.color || '#FFFFFF') + '30'
	const resolvedTrans = (deck.color || '#FFFFFF') + '30'
	const [deckProgress, setDeckProgress] = useState(0)
	const [isMyDeck, setIsMyDeck] = useState(false)

	// Loading the username of the deck creator 
	useEffect(() => {
		const loadCreatorName = async () => {
			if (deck.createdBy) {
				const name = deck.createdBy === "CertChamps" ? "CertChamps" : await fetchUsernameByID(deck.createdBy)
				setCreatorName(name)

				const image = deck.createdBy === "CertChamps" ? "CertChamps" : await fetchUserImage(deck.createdBy)
				setCreatorImage(image)
			}
		}
		loadCreatorName()
	}, [deck.createdBy, fetchUsernameByID, fetchUserImage])
	// Calculating number of questions that the user has completeted in the deck 
	useEffect(() => {

		const getProgress  = async () => {
			const completedRef = await getDoc(doc(db, 'decks', deck.id, 'usersAdded', user?.uid))
			const completedCount = completedRef.data()?.questionsCompleted.length

			const questionsRef = await getDoc(doc(db, 'decks', deck.id))
			const questionsCount = questionsRef.data()?.questions.length

			console.log("Deck Progress:", completedCount/questionsCount)
			setDeckProgress(completedCount / questionsCount || 0)
		}
		
		const getOwnership = async () => {
			if (!user?.uid) {
				setIsMyDeck(false)
				return
			}
			
			const userAddedRef = await getDoc(doc(db, 'decks', deck.id, 'usersAdded', user.uid))
			setIsMyDeck(userAddedRef.exists())
		}

		getProgress()
		getOwnership()
		

	}, [deck])


	// Navigating to deck viewer
	const handleNavigate = () => {

		if (!user?.uid) return

		navigate(`/decks/${deck.id}`)

	}

	const createdDate = deck.timestamp?.seconds
		? new Date(deck.timestamp.seconds * 1000).toLocaleDateString()
		: ''

	return (
		<>
	
			<div className="deck flex flex-col" onClick={handleNavigate}>
			{/*========================================= DECK BORDER COLOUR =============================================== */}
		<div 
			className={deck?.createdBy === 'CertChamps' ? 'color-border-gradient' : 'color-border'}
			style={{ '--border-color': resolvedTrans } as React.CSSProperties}>
		</div>
		{/*========================================= CertChamps Logo =============================================== */}
		{deck?.createdBy === 'CertChamps' && (
			<img src={icon} alt="CertChamps" className="absolute top-2 right-2 w-7 h-7 object-contain z-50 rounded-full" />
		)}
			{/*========================================= DECK COLOR OVERLAY=============================================== */}
			<div className='color-overlay' style={{ backgroundImage: `linear-gradient(to bottom, ${resolvedColor}, transparent)` }}></div>

			{/*========================================= DECK IMAGE=============================================== */}
			<div className="image" style={{ backgroundColor: resolvedColor }}></div>


			{/*========================================= DECK BG OVERLAY =============================================== */}
			<div className='bg-overlay bg-gradient-bg-fade'  ></div>

			{/*========================================= Information =============================================== */}
			<div className='flex w-full z-50 mt-18 px-3 items-center'>
				<img src={ deck?.createdBy === 'CertChamps' ? logo : creatorImage || undefined} alt={creatorName || "Creator"} className="w-10 h-10 rounded-full" />
				<div className='flex flex-col ml-3'>
					<span className='txt-heading-colour'>{deck?.name}</span>
				<span className={deck?.createdBy === 'CertChamps' ? 'txt gradient-text' : 'txt color-txt-sub'}>{creatorName || 'Unknown Creator'}</span>
				</div>
				<div className='ml-auto flex flex-col items-end justify-end h-full'>
					<span className='txt color-txt-sub'>{deck?.questions?.length} question{deck?.questions?.length !== 1 ? 's' : ''}</span>
				</div>
			</div>


			{/*========================================= Description =============================================== */}

			<div className='px-4 mt-2 h-12 overflow-hidden'>
				<p className='txt color-txt-sub line-clamp-2'>{deck?.description || 'No description provided.'}</p>
			</div>

			{hasQuestion ? (
				<span
					className="cursor-target blue-btn cursor-pointer mt-2 w-40 text-center"
					onClick={(e) => {
						e.stopPropagation()
						if (questionId && onAddQuestion) onAddQuestion(deck.id, questionId)
					}}
				>
					Add to deck
				</span>
			) : null}
		</div> 
		</>
	)
}

