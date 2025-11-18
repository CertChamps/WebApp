import { collection, getDocs, doc, 
    query, orderBy, getDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { useState } from 'react'
import useFetch from './useFetch'

type questionProps = {
    setQuestions: React.Dispatch<React.SetStateAction<any>>
    filters: string[]
}

export default function useQuestions(props?: questionProps) {
    const { fetchImage } = useFetch()
    const [allQuestions, setAllQuestions] = useState<any[]>([])

    const getRandomQuestion = async (idExclude: string = '') => {
        const coll = collection(db, 'certchamps-questions')
        
        // Firestore array-contains-any limit: max 10 values
        const filters = (props?.filters || []).slice(0, 10)

        // Get all available IDs (single index read, efficient for collections < 10k docs)
        const allIdsSnap = await getDocs(query(coll, orderBy('__name__')))
        const allIds = allIdsSnap.docs.map(d => d.id).filter(id => id !== idExclude)
        
        if (allIds.length === 0) {
            throw new Error('No questions available')
        }

        // If no filters, return a pure random ID
        if (filters.length === 0) {
            const randomIndex = Math.floor(Math.random() * allIds.length)
            return allIds[randomIndex]
        }

        // With filters: shuffle and check sequentially for a match
        // This randomizes while respecting filters without reading every doc
        const shuffledIds = [...allIds].sort(() => Math.random() - 0.5)
        
        for (const candidateId of shuffledIds) {
            const docSnap = await getDoc(doc(db, 'certchamps-questions', candidateId))
            if (docSnap.exists()) {
                const data = docSnap.data()
                // Check if question has at least one matching tag
                const hasMatchingTag = data.tags?.some((tag: string) => filters.includes(tag))
                if (hasMatchingTag) {
                    return candidateId
                }
            }
        }

        // Fallback: return random if no match found after checking all
        console.warn('No question matched filters, returning random one')
        return allIds[Math.floor(Math.random() * allIds.length)]
    }

    const fetchQuestion = async (id: string) => {
        const properties = (await getDoc(doc(db, 'certchamps-questions', id))).data()

        const contentSnap = (await getDocs(collection(db, 'certchamps-questions', id, 'content'))).docs
        const contentPromises = contentSnap.map(async (doc: any) => {
            const data = doc.data()
            if (data.image) {
                const imageUrl = await fetchImage(data.image)
                data.image = imageUrl
            }
            return data
        })

        const content = await Promise.all(contentPromises)
        console.log("fetched question:", id); 
        return { id, properties, content }
    }

    const loadQuestions = async (id?: string) => {
        let question = null
        if (id) {
            question = await fetchQuestion(id)
        } else {
            const randomId = await getRandomQuestion('')
            question = await fetchQuestion(randomId)
        }

        props?.setQuestions?.((questions: any) => [...questions, question])
    }

    const fetchAllQuestions = async () => {
        // WARNING: Unbounded read. Use only for small collections or admin functions.
        const questionsSnap = await getDocs(collection(db, 'certchamps-questions'))

        const questions = await Promise.all(
            questionsSnap.docs.map(async (docSnap) => {
                const id = docSnap.id
                const properties = docSnap.data()

                const contentSnap = await getDocs(collection(db, 'certchamps-questions', id, 'content'))
                const contentPromises = contentSnap.docs.map(async (contentDoc: any) => {
                    const data = contentDoc.data()
                    if (data.image) {
                        const imageUrl = await fetchImage(data.image)
                        data.image = imageUrl
                    }
                    return data
                })
                const content = await Promise.all(contentPromises)

                return { id, properties, content }
            })
        )
        setAllQuestions(questions)
        return questions
    }

    function toRoman(n: number): string | null {
        const map: Record<number, string> = {
            1: 'i', 2: 'ii', 3: 'iii', 4: 'iv', 5: 'v',
            6: 'vi', 7: 'vii', 8: 'viii', 9: 'ix', 10: 'x',
        }
        return map[n] ?? null
    }

    return { getRandomQuestion, fetchQuestion, loadQuestions, toRoman, fetchAllQuestions, allQuestions }
}