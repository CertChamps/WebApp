import '../../styles/decks.css'
import { useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserContext } from '../../context/UserContext'

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

export default function DeckCard({ deck, questionId, onAddQuestion, className }: DeckCardProps) {
	const { user } = useContext(UserContext)
	const navigate = useNavigate()

	const hasQuestion = Boolean(questionId)
	const resolvedColor = deck.color || '#FFFFFF'

	const handleNavigate = () => {

		if (!user?.uid) return

		if (deck.createdBy !== user.uid) {
			navigate(`/decks/${deck.id}/preview`)
			return
		}
		else {
		navigate(`/decks/${deck.id}`)
		}
	}

	const createdDate = deck.timestamp?.seconds
		? new Date(deck.timestamp.seconds * 1000).toLocaleDateString()
		: ''

	return (
		<div className="deck" onClick={handleNavigate}>
			<div className="color-strip" style={{ backgroundColor: resolvedColor }} />

			<div className="deck-txt">
				<span className="txt-heading-colour">{deck.name || 'Untitled deck'}</span>
				<span className="txt-sub">{createdDate}</span>
			</div>

			<div className="deck-txt">
				<span className="txt-sub">{deck.description || 'No description provided.'}</span>
				<span className="txt-sub">
					{(deck.questions?.length || 0)} question{(deck.questions?.length || 0) !== 1 ? 's' : ''}
				</span>
			</div>

			{hasQuestion ? (
				<span
					className="cursor-target blue-btn cursor-pointer my-2"
					onClick={(e) => {
						e.stopPropagation()
						if (questionId && onAddQuestion) onAddQuestion(deck.id, questionId)
					}}
				>
					Add to deck
				</span>
			) : null}
		</div>
	)
}

