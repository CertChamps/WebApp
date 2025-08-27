import { useContext } from "react"
import { UserContext } from "../context/UserContext"
import { collection, query, where, getDocs, updateDoc, arrayUnion, doc, limit, orderBy, Timestamp } from 'firebase/firestore';
import { db }from '../../firebase'
import useFetch from "./useFetch";

export default function useFriends() {
    
    const { user, setUser } = useContext(UserContext)
    const { fetchImage } = useFetch()

    const getSearch = async (search: string) => {
        try {
            //const searchLower = search.toLowerCase() // lowercase search for non case sensitivity 

            // Search for users on firebase and get docs 
            const snapshot = query( collection(db, 'user-data'),  where('username', '>=', search),
            where('username', '<=', search + '\uf8ff'), limit(20), orderBy('rank', 'desc') )
            const users = await getDocs(snapshot)

             const userPromises = users.docs.map(async (userDoc) => {
                const userData = userDoc.data(); // get user data 

                // do not include yourself
                if ( userData.uid == user.uid ) 
                    return null 
                // do not include your existing friends
                else if ( user.friends.some( (friend: any) => friend.uid == userData.uid) )
                    return null 
                //do not include pending friends 
                else if ( user.pendingFriends.some( (pendingFriend: string) => pendingFriend == userData.uid) )
                    return null 
                //include everyone else 
                else {
                     // get url of image and return user object 
                    const imageUrl = await fetchImage(userData.picture);
                    return { ...userData, picture: imageUrl, uid: userDoc.id, sent: false };
                }

               
            });

            const usersWithPics = await Promise.all(userPromises);
            const filteredUsers = usersWithPics.filter(user => user !== null);

            return filteredUsers
        }
        catch (error) {
            console.log(error)
        }
    }

    //============================== SENDING FRIEND REQUESTS =================================//
    const sendFriendRequest = async (username: string) => {
        try {   

            // Get Reference to friend from username
            const snapshot = query( collection(db, 'user-data'), where('username', '==', username))
            const frienddocs = (await getDocs(snapshot)).docs[0]
            const friendref = frienddocs.ref

            // remove locally
            setUser( (prev : any) => ({...prev, pendingFriends: [...prev.pendingFriends, frienddocs.data().uid] }) )
           
            // Send notification to user on firebase and add yourself to user's pending friends
            updateDoc(friendref,
                {notifications: arrayUnion({
                    type: 'friend-request', 
                    from: user.uid,
                    timestamp: Timestamp.now()}),
                pendingFriends: arrayUnion(user.uid)
                })

            // Add user to your pending friends (local and server)
            updateDoc(doc(db, 'user-data', user.uid), 
                {pendingFriends: arrayUnion(frienddocs.data().uid)})

        }
        catch (error) {
            console.log(error) 
        }
    }
    //==========================================================================================//

    return { getSearch, sendFriendRequest }
}