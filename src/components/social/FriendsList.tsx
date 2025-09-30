// React
import React, { useState, useEffect, useContext } from 'react';


// Hooks
import { UserContext } from '../../context/UserContext';

// Firebase
import { db }from '../../../firebase'
import { doc, getDoc } from 'firebase/firestore';
import { getDownloadURL, getStorage, ref } from 'firebase/storage';
import { useNavigate } from 'react-router-dom';

type Friend = {
    uid: string;
    username: string;
    picture: string;
};

const FriendsList = () => {
    const [userFriends, setUserFriends] = useState<Friend[]>([]);
    const { user } = useContext(UserContext);
    const navigate = useNavigate()

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
        <div className="friends-list">
            <span className="friends-text">
                Friends
            </span>
            
            {/* ======================================== FRIENDS LIST ========================================== */}
            {userFriends.map((friend) => (
                <FriendsBarIcon 
                    key={friend.uid}
                    icon={
                        <img 
                            src={friend.picture} 
                            alt={friend.username}
                            className="friend-image"
                        />
                    }
                    tooltip={friend.username}
                    username={friend.username}
                    onClick={() => {
                        navigate(`/viewProfile/${friend.uid}`)
                    }}
                />
                
            ))}
        </div>
    )
}

const FriendsBarIcon: React.FC<{ 
    icon: React.ReactNode;
    username: string;
    tooltip?: string;
    onClick?: () => void;
}> = ({ username, icon, onClick }) => {
    return (
        <div 
            className="friend-container"
            onClick={onClick}
        >
            {icon}
            <div className="friend-username">
                {username}
            </div>
        </div>
    );
};

export default FriendsList;