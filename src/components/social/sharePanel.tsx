// Animations 
import loadingAnim from '../../assets/animations/loading.json';

// Hooks
import { useContext, useEffect, useState } from "react"
import { useParams } from "react-router-dom";
import useFetch from "../../hooks/useFetch"
import useDeckHandler from "../../hooks/useDeckHandler";

// Context
import { UserContext } from "../../context/UserContext";

// Components 
import Lottie  from 'lottie-react';


export default function SharePanel() {

    //================================= State, Hooks, and Context ================================//
    const { id } = useParams()
    const { fetchFriends } = useFetch()
    const { shareDeck } = useDeckHandler()

    const [friends, setFriends] = useState<any>()

    const { user } = useContext(UserContext)

    //===================================== Fetching Friends ===================================//
    useEffect(() => {
        const init_friends = async () => {

            // initialise friends 
            setFriends([]);

            // fetch all friends and set state 
            const userfriends = await fetchFriends(user.uid)
            setFriends(userfriends)

        }

        init_friends() // run function asynchronously 
    }, [])
    //==========================================================================================//


    return (
    <div className="w-h-container justify-start items-start flex-col overflow-y-scroll scrollbar-minimal p-4">

        {   
            friends ? (
            //==================================== Friends ===================================//
            
            friends?.map((friend: any) => (
                <div className="m-4">
                    {/* =========================== Friends Info =================================== */}

                    <img 
                        src={friend.picture} 
                        alt={friend.picture}
                        className="w-10 h-10 rounded-full object-cover inline"
                    />
                    <span className="txt-bold mx-4 inline">{friend.username}</span>
                    {/* =========================================================================== */}


                    {/* =========================== HARE BUTTON =================================== */}
                    { friend.sent ? (

                        <span className="blue-btn opacity-70 cursor-default inline">Sent!</span>

                        ) : (

                        <span className="blue-btn cursor-pointer inline" onClick={() => {
                            shareDeck(friend, id, setFriends);
                            }} >Share
                        </span>

                    )}
                    {/* ========================================================================== */}
                </div>
            )) 
            //================================================================================//

            ) : (
                /* =========================== LOADING ANIMATION =========================== */
                <div className="w-full h-full flex justify-center items-center">
                    <Lottie animationData={loadingAnim} loop={true} autoplay={true} 
                        className="h-40 w-40" />
                </div>
                /* ========================================================================= */

            )
        }
        
    </div>
    )
}