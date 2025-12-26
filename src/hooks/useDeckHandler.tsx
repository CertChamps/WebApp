import { arrayUnion, doc, updateDoc, Timestamp, addDoc, collection, deleteDoc, getDoc, setDoc} from "firebase/firestore";
import { db }from '../../firebase'
import { UserContext } from "../context/UserContext";
import { useContext } from "react";



const useDeckHandler = () => {

    const { user, setUser } = useContext(UserContext) 

    // ========================= CREATE DECK ============================ //
    const createDeck = async (name: string, description: string, questions: any[], visibility: boolean, color: string) => {

        try {
            // Add the deck to the database 
            const docRef = await addDoc(collection(db, 'decks'), {
                name, 
                description, 
                questions,
                visibility,
                color,
                likes: 0, 
                timestamp: Timestamp.now(),
                createdBy: user.uid
            });

            const docID = docRef.id;    
            
            // Add the user who added the deck to the usersAdded subcollection with their uid as the document ID
            await setDoc(doc(db, 'decks', docID, 'usersAdded', user.uid), {
                uid: user.uid,
                timestamp: Timestamp.now(),
                questionsCompleted: [],
                timeElapsed: 0,
                favourited: false
            }); 
            
        } catch (err) {
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
    const addtoDecks = async (deckID: string, userID: string ) => {

        try {
            await setDoc( doc(db, 'decks', deckID, 'usersAdded', userID), {
                uid: userID,
                timestamp: Timestamp.now(),
                questionsCompleted: [],
                timeElapsed: 0,
                favourited: false
            } )
            
        } catch (err) {
            console.log(err)
        }
    }
    //===========================================================================================================// 

    //========================================SAVE PROGRESS YOU HAVE MADE ON A DECK=================================================//
    const saveProgress = async (questionsCompleted: any, deckID: any, timeElapsed: any) => {
    try {
        // update the user's progress on the deck in the usersAdded subcollection
        const userDeckRef = doc(db, 'decks', deckID, 'usersAdded', user.uid);
        
        await updateDoc(userDeckRef, {

            questionsCompleted,
            timeElapsed
        });
    } catch (err) {
        console.error('Failed to save progress:', err);
    }
    };

    //===========================================================================================================// 


    //======================================== GET DECK BY ID ==================================================//
    const getDeckbyID = async (id: any) => {

        try {
            // Get the deck from the database 
            const deck = (await getDoc(doc(db, 'decks', id))).data()
        
            return deck
        }
        catch (err) {
            console.log(err) 
            return null
        }

    }
    //=========================================================================================================// 

        //======================================== GET USER SAVE DATA ==================================================//
    const getUsersDeckSaveData = async (id: any, userID: any) => {

        try {
            // Get the deck from the database 
            const deck = (await getDoc(doc(db, 'decks', id, 'usersAdded', userID))).data()
        
            return deck
        }
        catch (err) {
            console.log(err) 
            return null
        }

    }
    //=========================================================================================================// 


    return { createDeck, deleteDeck, addQuestiontoDeck, shareDeck, addtoDecks, saveProgress, getDeckbyID, getUsersDeckSaveData }
}

export default useDeckHandler