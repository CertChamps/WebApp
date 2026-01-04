// Icons
import { LuX, LuUserPlus, LuGift } from "react-icons/lu"

// Hooks
import useNotifications from "../../hooks/useNotifications"
import { useNavigate } from "react-router-dom"

export default function Notifications() {
  //================================= State, Hooks, and Context ================================//
  const { notis = [], addFriend, removeNotification } = useNotifications()
  const navigate = useNavigate()
  //==========================================================================================//

  if (!notis || notis.length === 0) {
    return (
      <div className="w-full h-full flex flex-col p-6">
        <h3 className="txt-heading-colour text-xl mb-4">Your Notifications</h3>
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          {/* <div className="text-4xl opacity-40">🔔</div> */}
          <p className="txt-sub text-center">All clear! No notifications</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col overflow-y-auto scrollbar-minimal p-6 gap-3">
      <h3 className="txt-heading-colour text-xl mb-2">Your Notifications</h3>

      {notis.map((noti: any) => {
        const key = noti.id ?? noti.from ?? Math.random().toString(36).slice(2)

        //============================ FRIEND NOTIFICATIONS =================================//
        if (noti.type === "friend-request") {
          return (
            <div 
              key={key} 
              className="flex items-center justify-between gap-4 w-full color-bg-grey-5 rounded-in p-4 hover:opacity-80 transition-opacity duration-200"
            >
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <img
                  src={noti.picture}
                  alt={noti.username}
                  className="w-8 h-8 rounded-full object-cover flex-shrink-0 color-shadow"
                />

                <div className="flex-1 min-w-0">
                  <p className="txt-bold">{noti.username}</p>
                  <p className="txt-sub text-sm">sent you a friend request</p>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                <button 
                  onClick={() => addFriend(noti)}
                  className="flex items-center gap-2 color-bg-accent color-txt-accent rounded-in px-4 py-2 text-xs font-semibold hover:opacity-80 transition-all duration-200 cursor-pointer whitespace-nowrap !w-auto"
                >
                  <LuUserPlus size={14} />
                  <span>Add Friend</span>
                </button>
                <button
                  onClick={() => removeNotification(noti)}
                  className="color-txt-sub hover:opacity-60 transition-opacity duration-200 p-1"
                >
                  <LuX size={18} />
                </button>
              </div>
            </div>
          )
        }
        //==================================================================================//

        //============================ DECK NOTIFICATIONS =================================//
        if (noti.type === "deck-share") {
          return (
            <div 
              key={key} 
              className="flex items-center justify-between gap-4 w-full border-b-1 color-shadow p-4 hover:opacity-80 transition-opacity duration-200"
            >
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <img
                  src={noti.picture}
                  alt={noti.username}
                  className="w-8 h-8 rounded-full object-cover flex-shrink-0 color-shadow"
                />

                <div className="flex-1 min-w-0">
                  <p className="txt-bold">{noti.username}</p>
                  <p className="txt-sub text-sm">sent you a deck</p>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                <button
                  onClick={() =>
                    navigate(`/decks/${noti.deckID}`)
                  }
                  className="flex items-center gap-2 color-bg-accent color-txt-accent rounded-in px-4 py-2 text-xs font-semibold hover:opacity-80 transition-all duration-200 cursor-pointer whitespace-nowrap !w-auto"
                >
                  <LuGift size={14} />
                  <span>View Deck</span>
                </button>
                <button
                  onClick={() => removeNotification(noti)}
                  className="color-txt-sub hover:opacity-60 transition-opacity duration-200 p-1"
                >
                  <LuX size={18} />
                </button>
              </div>
            </div>
          )
        }
        //==================================================================================//

        // Unknown notification type — render a generic item (optional)
        return (
          <div 
            key={key} 
            className="flex items-center justify-between gap-4 w-full color-bg-grey-5 rounded-in p-4 hover:opacity-80 transition-opacity duration-200"
          >
            <div className="flex-1 min-w-0">
              <p className="txt-bold">New Notification</p>
              <p className="txt-sub text-sm">You have a new notification</p>
            </div>
            <button
              onClick={() => removeNotification(noti)}
              className="flex-shrink-0 color-txt-sub hover:opacity-60 transition-opacity duration-200 p-1"
            >
              <LuX size={18} />
            </button>
          </div>
        )
      })}
    </div>
  )
}