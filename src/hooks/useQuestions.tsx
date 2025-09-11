import { collection, getCountFromServer, getDocs, doc, 
    query, where, limit, orderBy, getDoc } from 'firebase/firestore'
import { db }from '../../firebase'
import React from 'react'
import useFetch from './useFetch'

// Props Type 
type questionProps = {
    setQuestions: React.Dispatch<React.SetStateAction<any>>
    filters: any[]
}

export default function useQuestions( props?:questionProps ) {

    // ====================== HOOKS ========================= //
    const { fetchImage } = useFetch()

    // ====================== RETURN RANDOM NUMBER IN GIVEN RANGE ========================= //
    const getRandom = (range: number) => {

        // Return a random number between 0 and the range
        return Math.floor( Math.random() * ( range ) ) + 1

    }
    // ===================================================================================== //

    // ============================== GENERATE A CCQ ID =================================== //
    const generateID = (max: number) => { 

        // Generate a random number
        const index = getRandom(max).toString()

        // Generate a unique ID and return 
        const id = `CCQ${index.padStart(8, '0')}`
        return id

    } 
    // ===================================================================================== //


    // ============================== GET A RANDOM QUESTION FROM FIREBASE =================================== //
    const getRandomQuestion = async (idExclude: string) => {

        // Get number of questions in database
        let questionSnapshot = query(collection(db, 'certchamps-questions'));
        const questionCount = await getCountFromServer(questionSnapshot);

        // Generate an ID at random 
        const randomID = generateID(questionCount.data().count) 
        
        // -- QUERYING WITH FILTERS INVOLVED -- //
        if ( props?.filters && props?.filters.length > 0) {
            console.log(props.filters)
            // Query and retrive the question with the generated ID ( search up the database for questions )
            questionSnapshot = query(collection(db, 'certchamps-questions'), 
            where('id', '<=', randomID), // search DOWN the database by id 
            where('id', '!=', idExclude), // do not include ceratin id 
            where('tags', 'array-contains-any', props.filters), // abide to filters
            orderBy('id', 'desc'), limit(1) // only grab the bottom result 
            );
        

            // in the case no result is found search up the database
            if ((await getDocs(questionSnapshot)).empty) {
            
            questionSnapshot = query(collection(db, 'certchamps-questions'), 
            where('id', '>=', randomID), // search UP the database by id 
            where('id', '!=', idExclude), // do not include ceratin id 
            where('tags', 'array-contains-any', props.filters), // abide to filters
            orderBy('id', 'asc'), limit(1) // only grab the bottom result 
            );

            }
        } 

        // -- QUERYING WITHOUT FILTERS INVOLVED -- //
        else {
            // Query and retrive the question with the generated ID ( search up the database for questions )
            questionSnapshot = query(collection(db, 'certchamps-questions'), 
            where('id', '<=', randomID), // search DOWN the database by id 
            where('id', '!=', idExclude), // do not include ceratin id 
            orderBy('id', 'desc'), limit(1) // only grab the bottom result 
            );
        
            // in the case no result is found search up the database
            if ( (await getDocs(questionSnapshot)).empty ) {
            questionSnapshot = query(collection(db, 'certchamps-questions'), 
            where('id', '>=', randomID), // search UP the database by id 
            where('id', '!=', idExclude), // do not include ceratin id 
            orderBy('id', 'asc'), limit(1) // only grab the bottom result 
            );
            }
        } 
                
        // Return the ID of that question
        return ( (await getDocs(questionSnapshot)).docs[0].id )

    }
    // ================================================================================================= //

    // ============================== GET A QUESTION DATA FROM FIREBASE ================================ //
    const fetchQuestion = async (id: string) => {

        // Get the question properties 
        const properties = ( await getDoc( doc(db, "certchamps-questions", id) ) ).data()

        // Get the question content 
        const contentSnap = ( await getDocs( collection(db, "certchamps-questions", id, "content")) ).docs
        const contentPromises = contentSnap.map( async (doc : any ) => {

            // Get data
            const data = doc.data()

            // if data has image get its URL 
            if (data.image) {
                // get the url 
                const imageUrl = await fetchImage(data.image)

                // upate data 
                data.image = imageUrl
            }
            console.log(data)
            return data
            
        });  

        const content = await Promise.all(contentPromises);

        // Return the question
        return { id, properties, content } 
    }
    // ================================================================================================= //

    // ====================================== LOAD QUESTIONS =========================================== //
    const loadQuestions = async () => {
        
        // Load in a questions
        const question = await fetchQuestion(await getRandomQuestion('')) 

        // Add it into the questions array
        props?.setQuestions( (questions : any ) => [...questions, question])

    }
    // ================================================================================================= //

    // ================================= CONVERTS NUMBER TO ROMAN NUMERAL ====================================== //
    function toRoman(n: number): string | null {
        const map: Record<number, string> = {
            1: "i",
            2: "ii",
            3: "iii",
            4: "iv",
            5: "v",
            6: "vi",
            7: "vii",
            8: "viii",
            9: "ix",
            10: "x",
        };
    
        return map[n] ?? null;
    }
    // ========================================================================================================= //
    

    return { getRandomQuestion, fetchQuestion, loadQuestions, toRoman }


}