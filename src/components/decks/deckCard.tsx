import '../../styles/decks.css'
import { useContext, useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserContext } from '../../context/UserContext'
import useFetch from '../../hooks/useFetch'
import useQuestions from '../../hooks/useQuestions'
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
	image?: string
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
	const { fetchQuestion } = useQuestions()
	const navigate = useNavigate()
	const [creatorName, setCreatorName] = useState<string>('')
	const [creatorImage, setCreatorImage] = useState<string | null>(null)
	const [imageUrl, setImageUrl] = useState<string | null>(null)

	const hasQuestion = Boolean(questionId)
	const resolvedColor = (deck.color || '#FFFFFF') + '30'

	const [topicCounts, setTopicCounts] = useState<{ topic: string; count: number }[]>([])
	const [showAllTopics, setShowAllTopics] = useState(false)
	const dropdownRef = useRef<HTMLDivElement>(null)

	// Close dropdown when clicking outside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
				setShowAllTopics(false)
			}
		}

		if (showAllTopics) {
			document.addEventListener('mousedown', handleClickOutside)
		}

		return () => {
			document.removeEventListener('mousedown', handleClickOutside)
		}
	}, [showAllTopics])

	// Fetch topics from questions in the deck
	useEffect(() => {
		const loadTopics = async () => {
			if (!deck.questions || deck.questions.length === 0) {
				setTopicCounts([])
				return
			}

			// Main topics only (no sub-topics)
			const mainTopics = [
				'Algebra', 'Area & Volume', 'Calculus', 'Complex Numbers',
				'Financial Maths', 'Coordinate Geometry', 'Probability',
				'Sequences & Series', 'Statistics', 'Trigonometry',
				'Geometry', 'First Year Algebra'
			]

			try {
				const questionPromises = deck.questions.map(async (qId: string) => {
					return await fetchQuestion(qId)
				})
				const questions = await Promise.all(questionPromises)
				
				// Count topic occurrences (main topics only)
				const counts: Record<string, number> = {}
				questions.forEach((q: any) => {
					const tags = q?.properties?.tags || []
					tags.forEach((tag: string) => {
						if (mainTopics.includes(tag)) {
							counts[tag] = (counts[tag] || 0) + 1
						}
					})
				})

				// Convert to array and sort by count (descending)
				const sortedTopics = Object.entries(counts)
					.map(([topic, count]) => ({ topic, count }))
					.sort((a, b) => b.count - a.count)

				setTopicCounts(sortedTopics)
			} catch (error) {
				console.error("Error loading topics:", error)
			}
		}

		loadTopics()
	}, [deck.questions])

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

	// Load deck image URL if image path exists
	useEffect(() => {
		const loadDeckImage = async () => {
			if (deck.image) {
				try {
					const { getStorage, ref, getDownloadURL } = await import('firebase/storage')
					const storage = getStorage()
					const imageRef = ref(storage, deck.image)
					const url = await getDownloadURL(imageRef)
					setImageUrl(url)
				} catch (error) {
					console.warn("Failed to load deck image:", error)
					setImageUrl(null)
				}
			}
		}
		loadDeckImage()
	}, [deck.image])

	// Calculating number of questions that the user has completeted in the deck 
	useEffect(() => {
		// Fetch deck progress and ownership info
		// This effect no longer performs any visible updates
	}, [deck])


	// Navigating to deck viewer
	const handleNavigate = () => {

		if (!user?.uid) return

		navigate(`/decks/${deck.id}`)

	}

	return (
		<>
	
			<div className={`deck flex flex-col ${showAllTopics ? 'z-[999] relative' : ''}`} onClick={handleNavigate}>
			{/*========================================= DECK BORDER COLOUR =============================================== */}
		<div 
			className={deck?.createdBy === 'CertChamps' ? 'color-border-gradient' : 'color-border'}>

		</div>
		{/*========================================= CertChamps Logo =============================================== */}
		{deck?.createdBy === 'CertChamps' && (
			<img src={icon} alt="CertChamps" className="absolute top-2 right-2 w-7 h-7 object-contain z-50 rounded-full" />
		)}
			{/*========================================= DECK COLOR OVERLAY=============================================== */}
			<div className='color-overlay' style={{ backgroundImage: `linear-gradient(to bottom, ${resolvedColor}, transparent)` }}></div>

			{/*========================================= DECK IMAGE=============================================== */}
			{imageUrl ? (
				<img
					src={imageUrl}
					alt={deck.name}
					className="image object-cover"
				/>
			) : (
				<div className="image" style={{ backgroundColor: resolvedColor }}></div>
			)}


			{/*========================================= DECK BG OVERLAY =============================================== */}
			<div className='bg-overlay bg-gradient-bg-fade'  ></div>

			{/*========================================= Information =============================================== */}
			<div className='flex w-full z-50 mt-21 px-3 items-center'>
				<img src={ deck?.createdBy === 'CertChamps' ? logo : creatorImage || undefined} alt={creatorName || "Creator"} className="w-10 h-10 rounded-full" />
				<div className='flex flex-col ml-3'>
					<span className='txt-heading-colour'>{deck?.name}</span>
				<span className={deck?.createdBy === 'CertChamps' ? 'txt gradient-text' : 'txt color-txt-sub'}>{creatorName || 'Unknown Creator'}</span>
				</div>
				<div className='ml-auto flex flex-col items-end justify-end h-full'>
					<span className='txt color-txt-sub'>{deck?.questions?.length} question{deck?.questions?.length !== 1 ? 's' : ''}</span>
				</div>
			</div>

			{/*========================================= Topics =============================================== */}
			{topicCounts.length > 0 && (
				<div className='px-4 mt-2 flex flex-wrap gap-1 items-center relative z-50' ref={dropdownRef}>
					{topicCounts.slice(0, 3).map(({ topic }) => (
						<span key={topic} className='blue-btn color-bg-grey-5 text-xs font-semibold px-2 py-0.5 w-auto'>
							{topic}
						</span>
					))}
					{topicCounts.length > 3 && (
						<>
							<span
								className='blue-btn color-bg-grey-5 text-[8px] font-semibold px-2 py-1 w-auto cursor-pointer hover:scale-105 transition-transform'
								onClick={(e) => {
									e.stopPropagation()
									setShowAllTopics(!showAllTopics)
								}}
							>
								...
							</span>
							{/* Dropdown for all topics */}
							<div
								className={`absolute left-4 top-full mt-1 color-bg rounded-lg shadow-lg p-3 z-50 flex flex-wrap gap-1 max-w-3xl transition-all duration-200 ease-out origin-top ${
									showAllTopics
										? 'opacity-100 scale-100 translate-y-0'
										: 'opacity-0 scale-95 -translate-y-2 pointer-events-none'
								}`}
							>
								{topicCounts.map(({ topic }) => (
									<span key={topic} className='blue-btn color-bg-grey-5 text-xs font-semibold px-2 py-0.5 w-auto'>
										{topic}
									</span>
								))}
							</div>
						</>
					)}
				</div>
			)}

			{/*========================================= Description =============================================== */}

			<div className='px-4 mt-1.5 h-12 overflow-hidden z-50'>
				<p className='txt-sub color-txt-sub line-clamp-2'>{deck?.description || 'No description provided.'}</p>
			</div>

			{hasQuestion ? (
				<span
					className="cursor-target blue-btn cursor-pointer mx-4 mb-2 w-30 text-center txt-sub color-txt-accent font-semibold"
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

