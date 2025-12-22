// Styles
import '../styles/decks.css'

// React
import { useContext, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

// Context
import { UserContext } from '../context/UserContext'

// Hooks
import useDeckHandler from '../hooks/useDeckHandler'

// Components
import { CirclePicker } from 'react-color'
import { LuTrash } from 'react-icons/lu'

export default function Decks() {
	const navigate = useNavigate()
	const { user } = useContext(UserContext)
	const { createDeck, deleteDeck } = useDeckHandler()

	const [view, setView] = useState<'decks' | 'create'>('decks')
	const [name, setName] = useState('')
	const [description, setDescription] = useState('')
	const [color, setColor] = useState('')

	const resolvedColor = useMemo(() => color || '#FFFFFF', [color])

	return (
		<div className="h-container items-start w-full overflow-y-scroll px-4">
			{view === 'decks' ? (
				<div className="w-full">
					{user?.decks?.map((deck: any) => (
						<div
							key={deck.id}
							className="deck"
							onClick={() => {
								navigate(`/decks/${user.uid}/${deck.id}`)
							}}
						>
							<div className="color-strip" style={{ backgroundColor: deck.color }} />

							<div className="deck-txt">
								<span className="txt-heading-colour">{deck.name}</span>
								<span className="txt-sub">
									{deck.timestamp ? new Date(deck.timestamp.seconds * 1000).toLocaleDateString() : ''}
								</span>
							</div>

							<div className="deck-txt">
								<span className="txt-sub">{deck.description}</span>
								<span className="txt-sub">
									{deck?.questions?.length} question{deck?.questions?.length !== 1 ? 's' : ''}
								</span>
							</div>

							<LuTrash
								className="color-txt-main inline cursor-pointer"
								onClick={(e: any) => {
									e.stopPropagation()
									deleteDeck(deck.id)
								}}
							/>
						</div>
					))}

					<div className="new-deck my-3" onClick={() => setView('create')}>
						<p className="color-txt-main text-center">New Deck</p>
					</div>
				</div>
			) : (
				<div className="w-full">
					<p className="cursor-pointer" onClick={() => setView('decks')}>
						Back
					</p>

					<input
						type="text"
						className="txtbox m-4"
						placeholder="Name"
						value={name}
						onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
					/>
					<input
						type="text"
						className="txtbox m-4"
						placeholder="Description"
						value={description}
						onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDescription(e.target.value)}
					/>

					<CirclePicker color={resolvedColor} onChangeComplete={(c: any) => setColor(c.hex)} />

					<span
						className="create-deck"
						onClick={() => {
							if (!name.trim()) return
							createDeck(name.trim(), description.trim(), [], resolvedColor)
							setName('')
							setDescription('')
							setColor('')
							setView('decks')
						}}
					>
						Create Deck
					</span>
				</div>
			)}
		</div>
	)
}

