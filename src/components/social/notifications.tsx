// Icons 
import { LuX } from "react-icons/lu"

// Hooks
import useNotifications from "../../hooks/useNotifications"
import { useNavigate } from 'react-router-dom';

export default function Notifications() {

    //================================= State, Hooks, and Context ================================//
    const {notis, addFriend, removeNotification} = useNotifications()
    const navigate = useNavigate()
    //==========================================================================================//

    return (
    <div>
    <p className="txt-heading-colour" >Your Notificiations</p>
    {   
        notis?.map( (noti : any) => {
            
            //============================ FRIEND NOTIFICATIONS =================================//s
            if ( noti.type == 'friend-request' ) {

                return (
                    <div  key={noti.from} className="my-5 ">
                        <img 
                            src={noti.picture}
                            className="w-8 h-8 rounded-full object-cover inline mx-2"
                        />
                        <p className="text-base inline text-2sxs">{`${noti.username} has sent you a new deck`}</p>
                        <span className="blue-btn inline mx-2" onClick={() => addFriend(noti)}>
                            Add</span>
                        <LuX className="inline hover:scale-110 duration-200 transition-all mx-2" onClick={() => removeNotification(noti)} />
                        <p className="txt-sub inline">{noti.timeago}</p>
                    </div>
                )
            } 
            //==================================================================================//

            //============================ DECK NOTIFICATIONS =================================//
            else if ( noti.type == 'deck-share' ) {

                return (
                    <div key={noti.from}  className="my-5 ">
                        <img
                            src={noti.picture}
                            className="w-8 h-8 rounded-full object-cover inline mx-2"
                        />
                        <p className="text-base inline text-2sxs">{`${noti.username} has sent you a new deck`}</p>
                        <p className="blue-btn inline mx-2" onClick={() => navigate(`/decks/${noti.from}/${noti.deckID}/preview`)}>
                            View Deck</p>
                        <LuX className="inline hover:scale-110 duration-200 transition-all mx-2" onClick={() => removeNotification(noti)} />
                        <p className="txt-sub inline">{noti.timeago}</p>
                    </div>
                )
            } 
            //==================================================================================//

            //============================ NO NOTIFICATIONS =================================//

            else {
                return (
                    <div >
                        <p>All clear! no notifications</p>
                    </div>
                )
            }
            //==================================================================================//

            
        })
    }
    </div>
    )
}