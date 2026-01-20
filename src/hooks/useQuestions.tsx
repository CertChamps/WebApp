import { collection, getDocs, doc, query, orderBy, getDoc, where } from 'firebase/firestore'
import { db } from '../../firebase'
import { useState, useRef, useEffect } from 'react'
import useFetch from './useFetch'

type QuestionLocation = {
    id: string
    path: string
}

type QuestionProps = {
    setQuestions: React.Dispatch<React.SetStateAction<any>>
    filters: string[]
    // Can be full collection paths OR parent document paths
    collectionPaths: string[] 
    // The field name in your parent doc that lists subcollections (default: 'sections')
    sectionFieldName?: string 
}

export default function useQuestions(props?: QuestionProps) {

    const { fetchImage } = useFetch()
    const [allQuestions, setAllQuestions] = useState<any[]>([])
    
    // Cache resolved paths (the actual collections we query)
    const resolvedPathsCache = useRef<string[] | null>(null)
    // Cache actual question IDs
    const allIdsCache = useRef<QuestionLocation[] | null>(null)

    // Helper: Expand parent documents into their subcollection paths
    const resolvePaths = async (inputs: string[]): Promise<string[]> => {
        // If we already resolved them, return cached version
        if (resolvedPathsCache.current) return resolvedPathsCache.current

        const fieldName = props?.sectionFieldName || 'sections'
        const finalPaths: string[] = []

        await Promise.all(inputs.map(async (inputPath) => {
            const segments = inputPath.split('/').filter(Boolean)
            
            // If odd segments (e.g. "col/doc/subcol"), it's already a collection.
            if (segments.length % 2 !== 0) {
                finalPaths.push(inputPath)
                return
            }

            // If even segments (e.g. "col/doc"), it's a Parent Document.
            // We must fetch it to find out what subcollections it has.
            try {
                const docRef = doc(db, inputPath)
                const snapshot = await getDoc(docRef)
                
                if (snapshot.exists()) {
                    const data = snapshot.data()
                    const sections = data?.[fieldName]

                    if (Array.isArray(sections)) {
                        // Expand: "questions/certchamps" + "algebra" -> "questions/certchamps/algebra"
                        sections.forEach(section => {
                            finalPaths.push(`${inputPath}/${section}`)
                        })
                    } else {
                        console.warn(`Document ${inputPath} exists but has no '${fieldName}' array.`)
                    }
                } else {
                    console.warn(`Parent document ${inputPath} does not exist. Cannot find subcollections.`)
                }
            } catch (err) {
                console.error(`Error resolving path ${inputPath}:`, err)
            }
        }))

        resolvedPathsCache.current = finalPaths
        return finalPaths
    }

    const getRandomQuestion = async (idExclude: string = ''): Promise<QuestionLocation> => {
        const rawPaths = props?.collectionPaths || []
        if (rawPaths.length === 0) throw new Error("No paths provided")

        // Step 0 — Resolve Paths (Expand headings to subcollections)
        const targetPaths = await resolvePaths(rawPaths)

        if (targetPaths.length === 0) {
            throw new Error("No valid collection paths found after resolving parents.")
        }

        const filters = (props?.filters || []).slice(0, 10)

        // Step 1 — Get all IDs from ALL resolved paths
        if (!allIdsCache.current) {
            const fetchPromises = targetPaths.map(async (path) => {
                const coll = collection(db, path)
                const snap = await getDocs(query(coll, orderBy('__name__')))
                return snap.docs.map(d => ({ id: d.id, path: path }))
            })

            const results = await Promise.all(fetchPromises)
            allIdsCache.current = results.flat()
        }

        const allLocations = (allIdsCache.current || []).filter(loc => loc.id !== idExclude)

        if (allLocations.length === 0) throw new Error("No questions available")

        // Step 2 — If no filters → pure random
        if (filters.length === 0) {
            const randomIndex = Math.floor(Math.random() * allLocations.length)
            return allLocations[randomIndex]
        }

        // Step 3 — Apply filters across resolved paths
        const CHUNK_SIZE = 10
        const filterChunks: string[][] = []
        for (let i = 0; i < filters.length; i += CHUNK_SIZE) {
            filterChunks.push(filters.slice(i, i + CHUNK_SIZE))
        }

        const matchingLocationsSet = new Map<string, QuestionLocation>()
        
        const queryPromises = []
        for (const path of targetPaths) {
            const coll = collection(db, path)
            for (const chunk of filterChunks) {
                const q = query(coll, where("tags", "array-contains-any", chunk))
                queryPromises.push(getDocs(q).then(snap => ({ snap, path })))
            }
        }

        const queryResults = await Promise.all(queryPromises)

        queryResults.forEach(({ snap, path }) => {
            snap.docs.forEach(d => {
                if (d.id !== idExclude) {
                    matchingLocationsSet.set(d.id, { id: d.id, path })
                }
            })
        })

        const matchingLocations = Array.from(matchingLocationsSet.values())

        if (matchingLocations.length > 0) {
            const randomIndex = Math.floor(Math.random() * matchingLocations.length)
            return matchingLocations[randomIndex]
        }

        console.warn("No question matched filters, returning random one")
        const randomIndex = Math.floor(Math.random() * allLocations.length)
        return allLocations[randomIndex]
    }

    const fetchQuestion = async (id: string, path: string) => {
        try {
            const docRef = doc(db, path, id)
            const docSnap = await getDoc(docRef)
            
            if (!docSnap.exists()) {
                throw new Error(`Question ${id} not found in ${path}`)
            }
            
            const properties = docSnap.data()
            const contentSnap = await getDocs(collection(db, path, id, "content"))

            const contentPromises = contentSnap.docs.map(async (doc: any) => {
                const data = doc.data()
                if (data.image) {
                    try {
                        data.image = await fetchImage(data.image)
                    } catch (e) { console.error(e) }
                }
                return data
            })

            const content = await Promise.all(contentPromises)
            return { id, path, properties, content }
        } catch (error) {
            console.error(error)
            throw error
        }
    }

    const loadQuestions = async (id?: string) => {
        try {
            let question = null

            if (id) {
                // If ID is provided, we still need to know WHICH collection it is in.
                // We resolve paths first to know where to look.
                const rawPaths = props?.collectionPaths || []
                const targetPaths = await resolvePaths(rawPaths)
                
                let foundPath = null
                
                // Naive search: check all resolved paths for this ID
                // (Ideally, pass the path if known to avoid this loop)
                for (const p of targetPaths) {
                    // Check if it's already in our cache to save a network call
                    const cached = allIdsCache.current?.find(x => x.id === id && x.path === p)
                    if (cached) {
                        foundPath = p
                        break
                    }
                    
                    // Otherwise, try a lightweight fetch check
                    const ref = doc(db, p, id)
                    const snap = await getDoc(ref)
                    if (snap.exists()) {
                        foundPath = p
                        break
                    }
                }

                if (!foundPath) throw new Error("Could not locate question ID in any configured path")
                question = await fetchQuestion(id, foundPath)
            } else {
                const randomLoc = await getRandomQuestion('')
                question = await fetchQuestion(randomLoc.id, randomLoc.path)
            }

            props?.setQuestions?.((prev: any) => [...prev, question])
        } catch (error) {
            console.error("Error loading question:", error)
            throw error
        }
    }

    const fetchAllQuestions = async () => {
        try {
            const rawPaths = props?.collectionPaths || []
            const targetPaths = await resolvePaths(rawPaths)

            const allPromises = targetPaths.map(async (path) => {
                const questionsSnap = await getDocs(collection(db, path))
                return Promise.all(questionsSnap.docs.map(async (docSnap) => {
                    const id = docSnap.id
                    const properties = docSnap.data()
                    const contentSnap = await getDocs(collection(db, path, id, "content"))
                    
                    const content = await Promise.all(contentSnap.docs.map(async (cDoc) => {
                        const data = cDoc.data()
                        if (data.image) data.image = await fetchImage(data.image).catch(e => data.image)
                        return data
                    }))
                    return { id, path, properties, content }
                }))
            })

            const results = await Promise.all(allPromises)
            const flattened = results.flat()
            setAllQuestions(flattened)
            return flattened
        } catch (error) {
            console.error(error)
            throw error
        }
    }

    // ... toRoman, clearCache remain same ...
    function toRoman(n: number): string | null {
        const map: Record<number, string> = {
            1: 'i', 2: 'ii', 3: 'iii', 4: 'iv', 5: 'v',
            6: 'vi', 7: 'vii', 8: 'viii', 9: 'ix', 10: 'x',
        }
        return map[n] ?? null
    }

    const clearCache = () => {
        allIdsCache.current = null
        resolvedPathsCache.current = null
    }

    // ADD THIS EFFECT HERE:
    useEffect(() => {
        // When filters or paths change, we must clear the cache 
        // so resolvePaths and getRandomQuestion fetch fresh data.
        clearCache();
    }, [props?.filters, props?.collectionPaths]);

    return { getRandomQuestion, fetchQuestion, loadQuestions, toRoman, fetchAllQuestions, allQuestions, clearCache }
}