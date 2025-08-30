import { useContext, useEffect, useState } from 'react'
import { UserContext } from '../context/UserContext'
import { updateDoc, arrayRemove, arrayUnion, doc, Timestamp } from 'firebase/firestore';
import { db }from '../../firebase'
import useFetch from './useFetch';



export default function useNotifications() {

    const { user, setUser } = useContext(UserContext)
    
    const { fetchUser } = useFetch()
    const [ notis, setNotis ] = useState<any>()


    //======================== USE EFFECT FOR NOTIS ==============================================//
    useEffect(() => {
        const processNotifications = async () => {
            if (user.notifications) {
                const notiPromises = user.notifications.map(async (noti: any) => {
                    // FRIEND REQUEST NOTIFICATIONS 
                    if (noti.type == 'friend-request') {
                        const { username, picture } = await fetchUser(noti.from)
                        const timeago = timeAgoFormatter(noti.timestamp)
                        return {
                            ...noti,
                            username,
                            picture,
                            timeago
                        }
                    }
                    // DECK SHARE NOTIFICATIONS 
                    else if (noti.type == 'deck-share') {
                        const { username, picture } = await fetchUser(noti.from)
                        const timeago = timeAgoFormatter(noti.timestamp)
                        return {
                            ...noti,
                            username,
                            picture,
                            timeago,
                            deckID: noti.deckID
                        }
                    }
                    return noti
                })
                const notisArr = await Promise.all(notiPromises)
                setNotis(notisArr)
            } else {
                setNotis([])
            }
        }
        processNotifications()
    }, [user])
    // ============================================================================================//

    //======================== CALCULATING TIME SINCE NOTI =======================================//
    function timeAgoFormatter(timestamp: Timestamp): string {
     
        const now = new Date(); // current date
        const date = timestamp.toDate(); // convert timestamps to date 

        // get the difference in seconds and round down
        const seconds = Math.floor((now.getTime() - date.getTime()) / 1000); 

        // display second 
        if (seconds < 5) return 'just now';
        if (seconds < 60) return `${seconds} s`;

        // displaying minutes 
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes} m` //inute${minutes === 1 ? '' : 's'} ago`;

        // displaying hours 
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours} h` //${hours === 1 ? '' : 's'} ago`;

        // displaying days
        const days = Math.floor(hours / 24);
        return `${days} day${days === 1 ? '' : 's'} ago`;
    }
    // ============================================================================================//

    //======================== REMOVING NOTIFICATIONS =======================================//
    const removeNotification = async (noti: any) => {
        try {
           
            // Remove notfication and store in an updated array 
            const updatedNotifications = user.notifications.filter(
                (n: any) => n.timestamp?.seconds !== noti.timestamp?.seconds || n.timestamp?.nanoseconds !== noti.timestamp?.nanoseconds
            );

            // update local and server
            setUser((prev: any) => ({ ...prev, notifications: updatedNotifications}));

            await updateDoc(doc(db, 'user-data', user.uid), { notifications: updatedNotifications });
            
            // FRIEND REQUESTS - removing pending users 
            if (noti.type == 'friend-request') {
                // Remove user from your pendingFriends locally 
                setUser((prev: any) => ({
                    ...prev,
                    pendingFriends: prev.pendingFriends?.filter((id: string) => id !== noti.from)
                }));
                 // Remove user from your pendingFriends server
                await updateDoc(doc(db, 'user-data', user.uid), { pendingFriends: arrayRemove(noti.from) }) // remove user from your pending
                await updateDoc(doc(db, 'user-data', noti.from), { pendingFriends: arrayRemove(user.uid) }) // remove you from user pending
            }
          

        }
        catch (error) {
            console.log(error)
        }
    }
    //============================================================================================//

    //======================== ADDING FRIENDS ==================================================//
    const addFriend = async (noti: any) => {
        try {
            // remove notification: 
            removeNotification(noti)

            // add friend to both accounts (server)
            updateDoc(doc(db, 'user-data', user.uid), {friends: arrayUnion(noti.from)})
            updateDoc(doc(db, 'user-data', noti.from), {friends: arrayUnion(user.uid)})

            // add friend to accont local 
           setUser( (prev: any) => ({...prev, friends: [...prev.friends, noti.from]}))
        }
        catch (error) {
            console.log(error)
        }
    }
    //============================================================================================//



    return {removeNotification, addFriend, notis, timeAgoFormatter}
}