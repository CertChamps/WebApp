import '../../styles/decks.css'
import { useContext, useEffect, useState } from 'react'
import { db } from '../../../firebase'
import { getDoc, doc } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import { UserContext } from '../../context/UserContext'
import useFetch from '../../hooks/useFetch'

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
	const { fetchUsernameByID } = useFetch()
	const navigate = useNavigate()
	const [creatorName, setCreatorName] = useState<string>('')

	const hasQuestion = Boolean(questionId)
	const resolvedColor = deck.color || '#FFFFFF'
	const [deckProgress, setDeckProgress] = useState(0)
	const [isMyDeck, setIsMyDeck] = useState(false)

	// Loading the username of the deck creator 
	useEffect(() => {
		const loadCreatorName = async () => {
			if (deck.createdBy) {
				const name = deck.createdBy === "CertChamps" ? "CertChamps" : await fetchUsernameByID(deck.createdBy)
				setCreatorName(name)
			}
		}
		loadCreatorName()
	}, [deck.createdBy, fetchUsernameByID])

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
			<style>
				{`
					@keyframes gradient {
						0%, 100% {
							background-position: 0% 50%;
						}
						50% {
							background-position: 100% 50%;
						}
					}
				`}
			</style>
			<div className="deck flex flex-col" onClick={handleNavigate}>
				<div className="color-strip" style={{ backgroundColor: resolvedColor }} />

			<div className="deck-txt">
				<div>
					<span className="txt-heading-colour">{deck.name || 'Untitled deck'}</span>
					{deck.createdBy === "CertChamps" ? (
						<span 
							className="mx-2 font-bold bg-gradient-to-r from-[#e1a853] via-[#f0db65] to-[#e1a853] bg-clip-text text-transparent animate-[gradient_3s_ease-in-out_infinite]"
							style={{ 
								backgroundSize: '200% 100%',
								animation: 'gradient 3s ease-in-out infinite'
							}}
						>
							By {creatorName}
						</span>
					) : (
						<span className="txt-sub mx-2">By {creatorName}</span>
					)}
				</div>
				<span className="txt-sub">{createdDate}</span>
			</div>

			<div className="deck-txt mb-1">
				<span className="txt max-w-2/3">{deck.description || 'No description provided.'}</span>
				<span className="txt">
					{(deck.questions?.length || 0)} question{(deck.questions?.length || 0) !== 1 ? 's' : ''}
				</span>
			</div>

		
				{isMyDeck ? (
				<div className='mt-auto w-full rounded-full h-2 relative'>
					<div
						className="color-bg-accent rounded-full h-2 absolute top-0 left-0 z-10 transition-all duration-300"
						style={{ width: `${Math.floor(deckProgress * 100)}%` }}
					/>
					<div
						className="color-bg-accent rounded-full h-2 absolute top-0 left-0 z-10 transition-all duration-300"
						style={{ width: `${Math.floor(deckProgress * 100)}%` }}
					/>
					<div
						className="color-bg-accent rounded-full h-2 absolute top-0 left-0 z-10 transition-all duration-300"
						style={{ width: `${Math.floor(deckProgress * 100)}%` }}
					/>
					<div className='w-full color-bg-grey-5 rounded-full h-2 absolute top-0 left-0'/>
				</div>
				):(
					<div className='w-full color-bg-grey-5 rounded-full h-2 absolute top-0 left-0'/>
				)
				}
			
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

