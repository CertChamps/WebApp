import { collection, getDocs, doc, 
    query, orderBy, getDoc, where } from 'firebase/firestore'
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
        const coll = collection(db, "questions", "certchamps", "sequences-and-series")
        const filters = (props?.filters || []).slice(0, 10)

        // Step 1 — Get all IDs once
        const allIdsSnap = await getDocs(query(coll, orderBy('__name__')))
        const allIds = allIdsSnap.docs.map(d => d.id).filter(id => id !== idExclude)

        if (allIds.length === 0) {
            throw new Error("No questions available")
        }

        // Step 2 — If no filters → pure random
        if (filters.length === 0) {
            const randomIndex = Math.floor(Math.random() * allIds.length)
            return allIds[randomIndex]
        }

        // Step 3 — Filter using Firestore, not JS
        const q = query(coll, where("tags", "array-contains-any", filters))
        const snap = await getDocs(q)

        const matchingIds = snap.docs.map(d => d.id).filter(id => id !== idExclude)

        // If Firestore found matches
        if (matchingIds.length > 0) {
            const randomIndex = Math.floor(Math.random() * matchingIds.length)
            return matchingIds[randomIndex]
        }

        console.warn("No question matched filters, returning random one")

        // Fallback — pure random
        const randomIndex = Math.floor(Math.random() * allIds.length)
        return allIds[randomIndex]
    }


    const fetchQuestion = async (id: string) => {
        const properties = (await getDoc(
            doc(db, "questions", "certchamps", "sequences-and-series", id)
        )).data()

        const contentSnap = (await getDocs(
            collection(db, "questions", "certchamps", "sequences-and-series", id, "content")
        )).docs

        const contentPromises = contentSnap.map(async (doc: any) => {
            const data = doc.data()
            if (data.image) {
                const imageUrl = await fetchImage(data.image)
                data.image = imageUrl
            }
            return data
        })

        const content = await Promise.all(contentPromises)
        console.log("fetched question:", id)
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
        const questionsSnap = await getDocs(
            collection(db, "questions", "certchamps", "sequences-and-series")
        )

        const questions = await Promise.all(
            questionsSnap.docs.map(async (docSnap) => {
                const id = docSnap.id
                const properties = docSnap.data()

                const contentSnap = await getDocs(
                    collection(db, "questions", "certchamps", "sequences-and-series", id, "content")
                )

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
