import { arrayUnion, doc, updateDoc, Timestamp, addDoc, collection, deleteDoc, getDoc, setDoc, getDocs} from "firebase/firestore";
import { db }from '../../firebase'
import { UserContext } from "../context/UserContext";
import { useContext } from "react";
import { useNavigate } from "react-router-dom";
import { getStorage, ref, uploadBytes } from "firebase/storage";



const useDeckHandler = () => {

    const { user } = useContext(UserContext) 
    const storage = getStorage();
    const navigate = useNavigate(); 

    // ========================= CREATE DECK ============================ //
    const createDeck = async (name: string, description: string, questions: any[], visibility: boolean, color: string, isOfficial?: boolean, imageFile?: File | null) => {

        try {
            let imagePath: string | null = null

            // Upload image if provided
            if (imageFile) {
                const fileName = `${Date.now()}-${imageFile.name}`
                const imageRef = ref(storage, `decks/${user.uid}/${fileName}`)
                await uploadBytes(imageRef, imageFile)
                imagePath = `decks/${user.uid}/${fileName}`
            }

            // Add the deck to the database 
            const docRef = await addDoc(collection(db, 'decks'), {
                name, 
                description, 
                questions,
                visibility,
                color: isOfficial ? '#e1a853' : color,
                likes: 0, 
                timestamp: Timestamp.now(),
                createdBy: isOfficial ? "CertChamps" : user.uid,
                ...(imagePath && { image: imagePath })
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
            // Delete the deck from the database
            await deleteDoc(doc(db, 'decks', deckID))

            // Delete all user-added subcollection documents
            const usersAddedSnapshot = await getDocs(collection(db, 'decks', deckID, 'usersAdded'));
            const deletePromises = usersAddedSnapshot.docs.map((userDoc) =>
                deleteDoc(doc(db, 'decks', deckID, 'usersAdded', userDoc.id))
            );
            await Promise.all(deletePromises);

            // navigate back to decks page 
            navigate('/decks')
        
          
        }
        catch (err) {
            // log any errors
            console.log(err)
        }
    }
    // ================================================================== //

    // ========================= ADD QUESTION TO DECK ============================ //
    const addQuestiontoDeck = async (questions: any[], deckID: any) => {

        try {
            // add question on firebase (using the new decks collection path)
            await updateDoc(doc(db, 'decks', deckID), {
                questions: arrayUnion(...questions)
            })
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

    //======================================== GET FRIENDS ANSWERS FOR A DECK ==================================================//
    const getFriendsAnswers = async (deckID: string, friends: Array<{ uid: string; username: string; picture: string }>) => {
        try {
            // Object to store which friends got each question correct
            // Format: { [questionId]: Array<{ uid, picture, username }> }
            const friendsAnswered: { [questionId: string]: Array<{ uid: string; picture: string; username: string }> } = {};

            // For each friend, get their deck progress
            const friendProgressPromises = friends.map(async (friend) => {
                try {
                    const friendDeckData = await getDoc(doc(db, 'decks', deckID, 'usersAdded', friend.uid));
                    
                    if (!friendDeckData.exists()) return null;

                    const data = friendDeckData.data();
                    const questionsCompleted = data?.questionsCompleted || [];

                    // questionsCompleted is an array of question IDs that the friend got correct
                    questionsCompleted.forEach((questionId: string) => {
                        if (!friendsAnswered[questionId]) {
                            friendsAnswered[questionId] = [];
                        }
                        friendsAnswered[questionId].push({
                            uid: friend.uid,
                            picture: friend.picture,
                            username: friend.username
                        });
                    });
                    
                    return data;
                } catch (err) {
                    console.log(`Error fetching progress for friend ${friend.uid}:`, err);
                    return null;
                }
            });

            await Promise.all(friendProgressPromises);
            console.log("Friend progress data:", friendsAnswered);
            return friendsAnswered;
        } catch (err) {
            console.error('Failed to fetch friends answers:', err);
            return {};
        }
    };
    //=========================================================================================================// 


    // ========================= UPDATE DECK ============================ //
    const updateDeck = async (deckID: string, name: string, description: string, questions: any[], visibility: boolean, color: string, isOfficial?: boolean, imageFile?: File | null, originalCreatedBy?: string) => {
        try {
            let imagePath: string | null = null

            // Upload image if provided
            if (imageFile) {
                const fileName = `${Date.now()}-${imageFile.name}`
                const imageRef = ref(storage, `decks/${user.uid}/${fileName}`)
                await uploadBytes(imageRef, imageFile)
                imagePath = `decks/${user.uid}/${fileName}`
            }

            // Determine createdBy - only update if isOfficial is explicitly set
            let createdByUpdate: { createdBy?: string } = {}
            if (isOfficial === true) {
                createdByUpdate = { createdBy: "CertChamps" }
            } else if (isOfficial === false && originalCreatedBy && originalCreatedBy !== "CertChamps") {
                // Revert to original creator if unchecking official and we have a valid original creator
                createdByUpdate = { createdBy: originalCreatedBy }
            } else if (isOfficial === false && (!originalCreatedBy || originalCreatedBy === "CertChamps")) {
                // If original was CertChamps or empty, set to current user
                createdByUpdate = { createdBy: user.uid }
            }

            // Update the deck in the database 
            await updateDoc(doc(db, 'decks', deckID), {
                name, 
                description, 
                questions,
                visibility,
                color,
                ...createdByUpdate,
                ...(imagePath && { image: imagePath })
            });
        } catch (err) {
            console.log(err)
            throw err
        }
    }
    // ================================================================== //

    // ========================= REMOVE USER FROM DECK ============================ //
    const removeUserFromDeck = async (deckID: string) => {
        try {
            // Update the deck in the database;
            await deleteDoc(doc(db, 'decks', deckID, 'usersAdded', user.uid));

            navigate('/decks')
        } catch (err) {
            console.log(err)
            throw err
        }
    }
    // ================================================================== //

    return { createDeck, deleteDeck, addQuestiontoDeck, shareDeck, addtoDecks, saveProgress, getDeckbyID, getUsersDeckSaveData, getFriendsAnswers, updateDeck, removeUserFromDeck }
}

export default useDeckHandler