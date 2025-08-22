// React
import React, { useState, useEffect, useContext } from 'react';

// Icons
import { LuUserPlus } from "react-icons/lu";

// Hooks
import { UserContext } from '../../context/UserContext';

// Firebase
import { db }from '../../../firebase'
import { doc, getDoc } from 'firebase/firestore';
import { getDownloadURL, getStorage, ref } from 'firebase/storage';

type Friend = {
    uid: string;
    username: string;
    picture: string;
};

const FriendsBar = () => {
    const [userFriends, setUserFriends] = useState<Friend[]>([]);
    const { user } = useContext(UserContext);

    // ====================================== GET FRIENDS FROM DATABASE =================================== //
    useEffect (() => {
        const fetchFriends = async () => {
            setUserFriends([]);

            if(!user.friends) {
                return
            }
            
            const friendPromises = user.friends.map(async (friendId: string) => {
                try {
                    const friendDoc = await getDoc(doc(db, 'user-data', friendId));
                    const friendData = friendDoc.data();
                    
                    if(!friendData) return null;

                    // get profile pic url
                    const storage = getStorage();
                    const imageRef = ref(storage, friendData.picture);
                    const picture = await getDownloadURL(imageRef);

                    return {
                        uid: friendData.uid,
                        username: friendData.username,
                        picture
                    }
                } catch(err) {
                    console.log(err);
                    return null;
                }
            });

            const friends = (await Promise.all(friendPromises)).filter(friend => friend !== null) as Friend[];
            setUserFriends(friends);
        }

        fetchFriends();
    },[user.friends]);

    return (
        <div className="fixed top-0 w-16 h-screen m-0
                        flex flex-col
                        bg-button dark:bg-button-dark border-r-2 border-light-grey dark:border-grey
                        overflow-y-auto scrollbar-hide">
            
            {/* ======================================== FRIENDS LIST ========================================== */}
            {userFriends.map((friend) => (
                <FriendsBarIcon 
                    key={friend.uid}
                    icon={
                        <img 
                            src={friend.picture} 
                            alt={friend.username}
                            className="w-10 h-10 rounded-full object-cover border-2 border-light-grey dark:border-grey"
                        />
                    }
                    tooltip={friend.username}
                    onClick={() => {
                        // go to friend profile
                    }}
                />
            ))}
            
            {/* ======================================== ADD FRIENDS BUTTON========================================== */}
            <FriendsBarIcon 
                icon={<LuUserPlus size={32}/>} 
                tooltip="Add Friends"
                onClick={() => {
                    // add friend
                }}
            />
        </div>
    )
}

const FriendsBarIcon: React.FC<{ 
    icon: React.ReactNode;
    tooltip?: string;
    onClick?: () => void;
}> = ({ icon, onClick }) => {
    return (
        <div 
            className="sidebar-icon"
            onClick={onClick}
        >
            {icon}
        </div>
    );
};

export default FriendsBar;