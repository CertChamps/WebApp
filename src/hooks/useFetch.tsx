import { getStorage, ref, getDownloadURL } from "firebase/storage";
import { useContext } from "react";
import { UserContext } from "../context/UserContext";
import { db  }from '../../firebase'
import { collection, doc, getDoc, getDocs, query, where, collectionGroup, orderBy} from 'firebase/firestore';

export default function useFetch () {

    // Initalise Storage
    const storage = getStorage()

    // get user context 
    const {user} = useContext(UserContext)

    // ============================ FIREBASE STORAGE GET IMAGE FROM PATH ==================== //
    const fetchImage = async (path: string) => {

        try {
            // retrieve the image and return a useable url 
            const imageUrl = await getDownloadURL( ref(storage, path) )
            // console.log("✅ Image found: ", imageUrl)
            return imageUrl
        } 
        catch ( err: any) {
            console.log(`❌ Failed to load image for path: ${path}`, err.code, err.message)
            return null
        }

    }
    // ====================================================================================== //

    
    // =============================== FIREBASE GET ALL USER FRIENDS ======================== //
    const fetchFriends = async (userID: any, customprops?: any) => {

        // get the user
        const usr = await fetchUser(userID)


        if(!usr.friends) {
            return
        }
        
        const friendPromises = usr.friends.map(async (friendId: string) => {
            try {
                const friendDoc = await getDoc(doc(db, 'user-data', friendId));
                const friendData = friendDoc.data();
                
                if(!friendData) return null;

                // get profile pic url
                const picture = await fetchImage(friendData.picture);
 
                return {
                    ...friendData,
                    ...customprops,
                    picture
                }
            } catch(err) {
                console.log(err);
                return null;
            }
        });

        return (await Promise.all(friendPromises)).filter(friend => friend !== null)
    }
    // ====================================================================================== //

    // =============================== FIREBASE GET ALL USER FRIENDS ======================== //
    const fetchUser = async (id: any, customprops?: any) => {
        try {

            // get the user data
            const userData = (await getDoc(doc(db, 'user-data', id))).data()

            // get the image 
            const picture = await fetchImage(userData?.picture)

            return {
                ...userData,
                ...customprops, 
                picture
            }
            
        }
        catch ( err ) {
            console.log(err) 
            return null
        }
    }
    // ====================================================================================== //

    
    // =============================== FIREBASE GET ALL USER FRIENDS ======================== //
    const fetchUsernameByID = async (id: any, customprops?: any) => {
        try {

            // get the user data
            const userData = (await getDoc(doc(db, 'user-data', id))).data()

            return userData?.username || "Unknown User"
            
        }
        catch ( err ) {
            console.log(err) 
            return null
        }
    }
    // ====================================================================================== //

    // =============================== FIREBASE GET ALL USER DECKS ========================== //
    const fetchDecks = async (id: any) => {
        try {

            // Load User Decks and store in an array 
            const deckSnapshot = await getDocs(collection(db, "user-data", id, "decks"))
            const decks = deckSnapshot.docs.map( (doc: any) => ({
                id: doc.id,
                ...doc.data()
            }))

            return decks
            
        }
        catch ( err ) {
            console.log(err) 
            return null
        }    
    }
    // ====================================================================================== //

    // ============================= FETCH ALL USER DECKS =================================== //
    const fetchUserDecks = async (userID: any) => {
        try {
            // Initalise empty array
            const userDecks = [];  

            // Add all decks created by user to array
            const decksByUser = await getDocs( query( collection(db, "decks"), where("createdBy", "==", userID), orderBy("timestamp", "desc") ) )
            decksByUser.forEach( (deckDoc)  => {
                // add to the decks array 
                userDecks.push({
                    id: deckDoc.id, 
                    ...deckDoc.data()
                })
            })

            // Add all decks where a user is Added 
            const decksWithUser = await getDocs( query( collectionGroup(db, "usersAdded"), where("uid", "==", userID) ) )
            console.log(decksWithUser.size, userID);
            // go through each added user doc to get parent deck info
            for (const addedUserDoc of decksWithUser.docs) {
                const parentDeckRef = addedUserDoc.ref.parent.parent; // Get reference to the parent deck\

                if (parentDeckRef) {
                    const parentDeckDoc = await getDoc(parentDeckRef); // get parent deck document

                    if (parentDeckDoc.exists()) {
                        // add to the decks array 
                        userDecks.push({
                            id: parentDeckDoc.id,
                            ...parentDeckDoc.data()
                        });
                    }
                }
            }

            // Deduplicate decks by ID
            const uniqueDecks = Array.from(
                new Map(userDecks.map((deck: any) => [deck.id, deck])).values()
            );

            // Sort combined decks by timestamp, newest first
            uniqueDecks.sort((a: any, b: any) => {
                const aTime = a.timestamp?.seconds || 0;
                const bTime = b.timestamp?.seconds || 0;
                return bTime - aTime;
            });

            // Return all decks 
            return uniqueDecks;

        }
        catch ( err ) {
            console.log(err) 
            return null;
        }
    }

    // ============================= FETCH ALL USER DECKS =================================== //
    const fetchPublicDecks = async () => {
        try {
            // Initalise empty array
            const publicDecks: { id: any; }[] = [];  

            // Add all decks created by user to array
            const publicDeck = await getDocs( query( collection(db, "decks"), where("visibility", "==", true), where("createdBy", "!=", "CertChamps"), orderBy("timestamp", "desc") ) )
            publicDeck.forEach( (deckDoc)  => {
                // add to the decks array 
                publicDecks.push({
                    id: deckDoc.id, 
                    ...deckDoc.data()
                })
            })

            return publicDecks; 
        }
        catch ( err ) {
            console.log(err) 
            return null; 
        }
    }
    // ====================================================================================== //

    // =============================== FIREBASE GET ALL CERTCHAMPS DECKS ========================== //
    const fetchCertChampsDecks = async () => {
        try {
            // Initalise empty array
            const certChampsDecks: { id: any; }[] = [];

            // Add all decks created by CertChamps to array
            const certChampsDeck = await getDocs( query( collection(db, "decks"), where("createdBy", "==", "CertChamps"), orderBy("timestamp", "desc") ) )
            certChampsDeck.forEach( (deckDoc)  => {
                // add to the decks array 
                certChampsDecks.push({
                    id: deckDoc.id, 
                    ...deckDoc.data()
                })
            })

            return certChampsDecks;
        } catch ( err ) {
            console.log(err) 
            return null; 
        }
    }
    // ============================================================================================ //



    // =============================== FIREBASE GET ALL USER DECKS ========================== //
    const fetchPost = async (id: any) => {
        try {
            // initialise post Data 
            const postSnap = (await getDoc(doc(db, "posts", id)) )
            let postData = null 

            // Grab the post data 
            if(postSnap.exists())
                postData = postSnap.data();

            // Fetch author profile
            const userData = fetchUser(postData?.id)

            return({
                ...postData, 
                ...userData,
                id: postSnap.id, 
            })
        } 
        catch ( err ) {
            console.log(err)
            return null;
        }

    }
    // ====================================================================================== //


    return { fetchImage, fetchFriends, fetchUser, fetchDecks, fetchUserDecks, fetchPublicDecks, fetchPost, fetchUsernameByID, fetchCertChampsDecks }

}