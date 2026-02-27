import { useState, useEffect, useRef } from 'react'
import Fuse from 'fuse.js'
import useFetch from './useFetch'
import useQuestions from './useQuestions'

type Deck = {
	id: string
	name?: string
	description?: string
	color?: string
	questions?: string[]
	timestamp?: any
	createdBy?: string
	topics?: string[]
}

type SortByType = 'dateCreated' | 'name' | 'questions'

const MAIN_TOPICS = [
	'Algebra', 'Area & Volume', 'Calculus', 'Complex Numbers',
	'Financial Maths', 'Coordinate Geometry', 'Probability',
	'Sequences & Series', 'Statistics', 'Trigonometry',
	'Geometry', 'First Year Algebra'
]

export default function useMyDeckFilter(userId?: string) {
	// Filter states
	const [search, setSearch] = useState('')
	const [sortBy, setSortBy] = useState<SortByType>('dateCreated')
	const [selectedTopics, setSelectedTopics] = useState<string[]>([])

	// Deck data states
	const [allDecks, setAllDecks] = useState<Deck[]>([])
	const [filteredDecks, setFilteredDecks] = useState<Deck[]>([])
	const [isLoading, setIsLoading] = useState(true)
	const [isFiltering, setIsFiltering] = useState(false)

	// Fuse.js instance
	const fuse = useRef<Fuse<Deck> | null>(null)

	const { fetchUserDecks } = useFetch()
	const { getQuestionById } = useQuestions({ collectionPaths: ['questions/certchamps'] })

	// Fuse.js options
	const fuseOptions = {
		keys: ['name', 'description'],
		threshold: 0.4,
		isCaseSensitive: false
	}

	// Fetch topics for a deck based on its questions
	const fetchDeckTopics = async (deck: Deck): Promise<string[]> => {
		if (!deck.questions || deck.questions.length === 0) return []

		try {
			const questionPromises = deck.questions.slice(0, 10).map(async (qId: string) => {
				return await getQuestionById(qId)
			})
			const questions = await Promise.all(questionPromises)

			const topicsSet = new Set<string>()
			questions.forEach((q: any) => {
				const tags = q?.properties?.tags || []
				tags.forEach((tag: string) => {
					if (MAIN_TOPICS.includes(tag)) {
						topicsSet.add(tag)
					}
				})
			})

			return Array.from(topicsSet)
		} catch (error) {
			console.error("Error fetching deck topics:", error)
			return []
		}
	}

	// Initial fetch of user decks
	const fetchAllDecks = async () => {
		if (!userId) {
			setIsLoading(false)
			return
		}

		setIsLoading(true)

		try {
			const userDecks = await fetchUserDecks(userId)

			if (!userDecks || userDecks.length === 0) {
				setAllDecks([])
				setFilteredDecks([])
				setIsLoading(false)
				return
			}

			// Fetch topics for each deck
			const decksWithTopics = await Promise.all(
				userDecks.map(async (deck: Deck) => {
					const topics = await fetchDeckTopics(deck)
					return { ...deck, topics }
				})
			)

			setAllDecks(decksWithTopics)
			setFilteredDecks(decksWithTopics)

			// Initialize Fuse.js
			fuse.current = new Fuse(decksWithTopics, fuseOptions)
		} catch (error) {
			console.error("Error fetching user decks:", error)
		} finally {
			setIsLoading(false)
		}
	}

	// Refetch decks
	const refetchDecks = async () => {
		await fetchAllDecks()
	}

	// Apply filters whenever filter states change
	useEffect(() => {
		if (allDecks.length === 0 && !isLoading) {
			setFilteredDecks([])
			return
		}

		if (allDecks.length === 0) return

		setIsFiltering(true)

		let results: Deck[] = []

		// Apply search filter using Fuse.js
		if (search.trim() && fuse.current) {
			const fuseResults = fuse.current.search(search)
			results = fuseResults.map(result => result.item)
		} else {
			results = [...allDecks]
		}

		// Apply topics filter
		if (selectedTopics.length > 0) {
			results = results.filter(deck => {
				const deckTopics = deck.topics || []
				return selectedTopics.some(topic => deckTopics.includes(topic))
			})
		}

		// Apply sorting
		results.sort((a, b) => {
			switch (sortBy) {
				case 'name':
					return (a.name || '').localeCompare(b.name || '')
				case 'questions':
					return (b.questions?.length || 0) - (a.questions?.length || 0)
				case 'dateCreated':
				default:
					const aTime = a.timestamp?.seconds || 0
					const bTime = b.timestamp?.seconds || 0
					return bTime - aTime
			}
		})

		// Small delay to show filtering state for better UX
		setTimeout(() => {
			setFilteredDecks(results)
			setIsFiltering(false)
		}, 150)

	}, [search, sortBy, selectedTopics, allDecks, isLoading])

	// Initial fetch
	useEffect(() => {
		fetchAllDecks()
	}, [userId])

	return {
		// Filter states
		search,
		setSearch,
		sortBy,
		setSortBy,
		selectedTopics,
		setSelectedTopics,
		
		// Data
		filteredDecks,
		allDecks,
		
		// Loading states
		isLoading,
		isFiltering,
		
		// Actions
		refetchDecks,
		
		// Constants
		availableTopics: MAIN_TOPICS
	}
}
