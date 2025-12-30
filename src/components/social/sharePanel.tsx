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
import { LuCheck, LuShare2 } from 'react-icons/lu';

const getRankName = (rankNumber: number): string => {
    const ranks = ['Novice', 'Apprentice', 'Scholar', 'Expert', 'Master', 'Grandmaster'];
    return ranks[rankNumber - 1] || 'Novice';
};


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
    <div className="w-full h-full flex flex-col overflow-y-auto scrollbar-minimal px-6 gap-3">
        <div className="">
            <h3 className="txt-heading-colour text-xl">Share this deck</h3>
        </div>

        {   
            friends ? (
            //==================================== Friends ===================================//
            
            friends?.length > 0 ? (
                friends?.map((friend: any) => (
                    <div 
                        key={friend.uid}
                        className="flex items-center justify-between w-full color-bg-grey-5 rounded-in p-4 hover:opacity-80 transition-opacity duration-200"
                    >
                        {/* =========================== Friends Info =================================== */}
                        <div className="flex items-center gap-4 flex-1">
                            <img 
                                src={friend.picture} 
                                alt={friend.username}
                                className="w-12 h-12 rounded-full object-cover flex-shrink-0 color-shadow"
                            />
                            <div className="flex flex-col gap-1">
                                <span className="txt-bold">{friend.username}</span>
                                <span className="txt-sub text-xs opacity-70">{getRankName(friend.rank || 1)}</span>
                            </div>
                        </div>
                        {/* =========================================================================== */}

                        {/* =========================== SHARE BUTTON =================================== */}
                        { friend.sent ? (
                            <div className="flex items-center gap-2 color-bg-accent color-txt-accent rounded-in px-4 py-2 text-sm font-semibold">
                                <LuCheck size={16} />
                                <span>Sent</span>
                            </div>
                        ) : (
                            <button 
                                onClick={() => {
                                    shareDeck(friend, id, setFriends);
                                }}
                                className="flex items-center gap-2 blue-btn px-4 py-2 text-sm font-semibold hover:opacity-80 transition-all duration-200 cursor-pointer w-auto"
                            >
                                <LuShare2 size={16} />
                                <span>Share</span>
                            </button>
                        )}
                        {/* ========================================================================== */}
                    </div>
                ))
            ) : (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <div className="text-4xl opacity-40">👥</div>
                    <p className="txt-sub text-center">No friends to share with yet</p>
                </div>
            )
            //================================================================================//

            ) : (
                /* =========================== LOADING ANIMATION =========================== */
                <div className="w-full h-full flex justify-center items-center py-12">
                    <Lottie animationData={loadingAnim} loop={true} autoplay={true} 
                        className="h-40 w-40" />
                </div>
                /* ========================================================================= */

            )
        }
        
    </div>
    )
}