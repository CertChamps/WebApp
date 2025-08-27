import { arrayUnion, doc, updateDoc, Timestamp, addDoc, collection, deleteDoc, getDoc} from "firebase/firestore";
import { db }from '../../firebase'
import { UserContext } from "../context/UserContext";
import { useContext } from "react";



const useDeckHandler = () => {

    const { user, setUser } = useContext(UserContext) 

    // ========================= CREATE DECK ============================ //
    const createDeck = async (name: string, description: string, questions: any[], color: string) => {

        try {
            // add deck to database 
            const docRef = await addDoc(collection(db, 'user-data', user.uid, 'decks'), 
                {name, description, questions, timestamp: Timestamp.now(), questionsCompleted: [], 
                    color, timeElapsed: 0
                }
            )


            // add deck to context
            setUser( ( prev: any ) => ({
                ...prev,
                decks: [
                ...(prev.decks || []),
                { name, description, questions, timestamp: Timestamp.now(), questionsCompleted: [],
                    color, id: docRef.id, timeElapsed: 0
                }
                ]
            }))

          
        }
        catch (err) {
            // log any errors
            console.log(err)
        }
    }
    // ================================================================== //

    
    // ========================= DELTE DECK ============================ //
    const deleteDeck = async (deckID: any) => {

        try {
            // delete deck from database 
            await deleteDoc(doc(db, 'user-data', user.uid, 'decks', deckID))

            // remove from userContext
            setUser((prev: any) => ({
                ...prev, 
                decks: prev.decks.filter((deck: any) => deck.id != deckID)
            }))
          
        }
        catch (err) {
            // log any errors
            console.log(err)
        }
    }
    // ================================================================== //

    // ========================= ADD QUESTION TO DECK ============================ //
    const addQuestiontoDeck = (questions: any[], deckID: any) => {

        try {
            // add question on firebase
            updateDoc(doc(db, 'user-data', user.uid, 'decks', deckID), {
                questions: arrayUnion(...questions)
            })


            // add question to context
            setUser((prev: any) => ({
                ...prev,
                decks: prev.decks.map((deck: any) =>
                    // using timestamp to identify decks
                    deck.id == deckID 
                        ? { ...deck, questions: [...(deck.questions || []), ...questions] }
                        : deck
                )
            }))
        }
        catch (err) {
            // log any errors
            console.log(err)
        }
    }
    // ================================================================== //

    //========================================SHARING DECKS=================================================// 
    const shareDeck = async (friend: any, deckID: any, setFriends: React.Dispatch<React.SetStateAction<any>>) => {
        try {
            // get friend reference 
            const friendRef = (await getDoc(doc(db, 'user-data', friend.uid))).ref

            // send notification to friend 
            updateDoc( friendRef, {
            notifications: arrayUnion({
            type: 'deck-share',
            from: user.uid, 
            timestamp: Timestamp.now(), 
            deckID
            })
            })

            setFriends((prev: any) =>
            prev.map((f: any) =>
                f.uid === friend.uid ? { ...f, sent: true } : f
            )
            );
        }
        catch (err) {
            // log any errors 
            console.log(err)
        }
    }
    //===========================================================================================================// 

    //========================================ADDING DECKS TO PERSONAL COLLECTION=================================================// 
    const addtoDecks = async (name: any, description: any, questions: string[]) => {

        try {
            const docRef = await addDoc(collection(db, 'user-data', user.uid, 'decks'), {
                name, description, questions,
                timestamp: Timestamp.now(),
                questionsCompleted: [],
                color: '#FFFFFF', 
                timeElapsed: 0
            })

            // add deck to user's context 
            setUser((prev: any) => ({
                ...prev,
                decks: [
                ...(prev.decks || []),
                {
                    name,
                    description,
                    questions,
                    timestamp: Timestamp.now(),
                    questionsCompleted: [],
                    color: '#FFFFFF',
                    id: docRef.id, 
                    timeElapsed: 0
                }
                ]
            }));
        } catch (err) {
        console.log(err)
        }
    }
    //===========================================================================================================// 

    //========================================SAVE PROGRESS YOU HAVE MADE ON A DECK=================================================//
    const saveProgress = async (questionsCompleted: any, deckID: any, timeElapsed: any) => {
    try {

        // Create new updated deck
        const updatedDeck = {
        ...user.decks.find((deck: any) => deck.id == deckID),
        questionsCompleted,
        timeElapsed
        };

        // Reconstruct decks array with updated deck at the beginning
        const decks = [
        updatedDeck,
        ...user.decks.filter((deck: any) => deck.id != deckID),
        ];

        console.log(decks)

        // Update user context
        setUser((prev: any) => ({
        ...prev,
        decks,
        }));

        // Update Firestore
        updateDoc(doc(db, 'user-data', user.uid, 'decks', deckID), {
            questionsCompleted,
            timeElapsed
        });
    } catch (err) {
        console.error('Failed to save progress:', err);
    }
    };

    //===========================================================================================================// 


    //======================================== GET DECK BY ID ==================================================//
    const getDeckbyID = async (id: any, userID: any) => {

        try {
            // Get the deck from the database 
            const deck = (await getDoc(doc(db, 'user-data', userID, 'decks', id))).data()
        
            return deck
        }
        catch (err) {
            console.log(err) 
            return null
        }

    }
    //=========================================================================================================// 

    return { createDeck, deleteDeck, addQuestiontoDeck, shareDeck, addtoDecks, saveProgress, getDeckbyID }
}

export default useDeckHandler