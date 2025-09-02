import { getStorage, ref, getDownloadURL } from "firebase/storage";
import { db  }from '../../firebase'
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';

export default function useFetch () {

    // Initalise Storage
    const storage = getStorage()

    // ============================ FIREBASE STORAGE GET IMAGE FROM PATH ==================== //
    const fetchImage = async (path: string) => {

        try {
            // retrieve the image and return a useable url 
            const imageUrl = await getDownloadURL( ref(storage, path) )
            return imageUrl
        } 
        catch ( err ) {
            console.log(err)
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


    return { fetchImage, fetchFriends, fetchUser, fetchDecks, fetchPost }

}