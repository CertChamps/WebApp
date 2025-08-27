import { useContext, useEffect, useState } from "react"
import { useParams } from "react-router-dom";
import useFetch from "../../hooks/useFetch"
import Lottie  from 'lottie-react';
import loadingAnim from '../../assets/animations/loading.json';
import useDeckHandler from "../../hooks/useDeckHandler";
import { UserContext } from "../../context/UserContext";

export default function SharePanel() {

    const { id } = useParams()
    const [friends, setFriends] = useState<any>()
    const { fetchFriends } = useFetch()
    const { shareDeck } = useDeckHandler()
    const { user } = useContext(UserContext)

    useEffect(() => {
        const init_friends = async () => {
            setFriends([]);
            const userfriends = await fetchFriends(user.uid)
            setFriends(userfriends)
        }

        init_friends()
    }, [])

    return (
    <div className="w-h-container justify-start items-start flex-col overflow-y-scroll p-4">
        {   
            friends ? (
            friends?.map((friend: any) => (
                <div className="m-4">
                    <img 
                        src={friend.picture} 
                        alt={friend.picture}
                        className="w-10 h-10 rounded-full object-cover inline"
                    />
                    <span className="txt-bold mx-4 inline">{friend.username}</span>
                    {
                    friend.sent ? 
                        (
                        <span className="blue-btn opacity-70 cursor-default inline">Sent!</span>
                        ) : 
                        (
                        <span className="blue-btn cursor-pointer inline" onClick={() => {
                            shareDeck(friend, id, setFriends);
                            }} >Share</span>
                        )
                    }


                </div>
            )) 
            ) : (
                <div className="w-full h-full flex justify-center items-center">
                    <Lottie animationData={loadingAnim} loop={true} autoplay={true} 
                        className="h-40 w-40" />
                </div>
            )
        }
    </div>
    )
}