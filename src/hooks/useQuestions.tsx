import { collection, getDocs, doc, query, orderBy, getDoc, where } from 'firebase/firestore'
import { db } from '../../firebase'
import { useState, useRef, useEffect } from 'react'
import useFetch from './useFetch'

type QuestionLocation = {
    id: string
    path: string
}

type QuestionProps = {
    setQuestions?: React.Dispatch<React.SetStateAction<any>>
    filters?: Record<string, string[]>
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
        console.log("Resolved Paths:", finalPaths);

        return finalPaths
    }

// Inside useQuestions.tsx

    const getRandomQuestion = async (idExclude: string = ''): Promise<QuestionLocation> => {
        const targetPaths = await resolvePaths(props?.collectionPaths || []);
        

        // props.filters is now Record<string, string[]>
        const localizedFilters: Record<string, string[]> = props?.filters || {};

        const queryPromises = targetPaths.map(async (path) => {
            // Extract setId from path: "questions/certchamps/algebra" -> "certchamps"
            const segments = path.split('/');
            const setId = segments[1]; 

            // Get tags specifically for THIS set
            const tagsForThisSet = (localizedFilters && setId in localizedFilters) ? localizedFilters[setId] : [];
            const coll = collection(db, path);

            if (tagsForThisSet.length > 0) {
                // ONLY fetch questions from this path that match these tags
                const q = query(coll, where("tags", "array-contains-any", tagsForThisSet.slice(0, 10)));
                const snap = await getDocs(q);
                return snap.docs.map(d => ({ id: d.id, path }));
            } else {
                // No tags for this set? Fetch all IDs from this path
                const snap = await getDocs(query(coll, orderBy('__name__')));
                return snap.docs.map(d => ({ id: d.id, path }));
            }
        });

        const results = await Promise.all(queryPromises);
        const flattened = results.flat().filter(loc => loc.id !== idExclude);

        if (flattened.length === 0) throw new Error("No questions match these localized filters.");

        const randomIndex = Math.floor(Math.random() * flattened.length);
        return flattened[randomIndex];
    };

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

    /** Fetch a question by id only; resolves path from collectionPaths. Use when you have only the question id (e.g. from a deck). */
    const getQuestionById = async (id: string) => {
        const rawPaths = props?.collectionPaths || ['questions/certchamps']
        const targetPaths = await resolvePaths(rawPaths)
        for (const p of targetPaths) {
            const cached = allIdsCache.current?.find((x) => x.id === id && x.path === p)
            if (cached) return fetchQuestion(id, p)
            const ref = doc(db, p, id)
            const snap = await getDoc(ref)
            if (snap.exists()) return fetchQuestion(id, p)
        }
        throw new Error(`Could not locate question ${id} in any configured path`)
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
            // 1. Get the base paths (e.g., ["questions/certchamps", "questions/exam-papers"])
            // We use the raw paths because we want EVERY question in these sets
            const rawPaths = props?.collectionPaths || []
            
            // 2. Resolve paths expands parent docs into their section subcollections
            // (e.g. "questions/certchamps" becomes ["questions/certchamps/algebra", "questions/certchamps/calculus"])
            const targetPaths = await resolvePaths(rawPaths)

            const allPromises = targetPaths.map(async (path) => {
                const coll = collection(db, path);
                
                // NO QUERY, NO WHERE, NO FILTERS
                // This gets every document in the collection
                const questionsSnap = await getDocs(coll);
                
                console.log(`Fetched ${questionsSnap.docs.length} questions from ${path}`);

                return Promise.all(questionsSnap.docs.map(async (docSnap) => {
                    const id = docSnap.id
                    const properties = docSnap.data()
                    
                    // Fetch the content sub-collection
                    const contentSnap = await getDocs(collection(db, path, id, "content"))
                    
                    const content = await Promise.all(contentSnap.docs.map(async (cDoc) => {
                        const data = cDoc.data()
                        if (data.image) {
                            try {
                                data.image = await fetchImage(data.image)
                            } catch (e) { console.warn("Image fail:", e) }
                        }
                        return data
                    }))
                    return { id, path, properties, content }
                }))
            })

            const results = await Promise.all(allPromises)
            const flattened = results.flat()
            
            setAllQuestions(flattened)
            console.log("✅ BULK FETCH COMPLETE. Total Questions:", flattened.length);
            return flattened
        } catch (error) {
            console.error("Critical error in fetchAllQuestions:", error)
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

    return { getRandomQuestion, fetchQuestion, getQuestionById, loadQuestions, toRoman, fetchAllQuestions, allQuestions, clearCache }
}