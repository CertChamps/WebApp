// Icons
import { LuX } from "react-icons/lu"

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
      <div className="">
        <p className="txt-heading-colour m-4">Your Notifications</p>
        <div className="my-3 mx-4 px-4 pb-3 ">
          <p className="color-txt-main">All clear! No notifications</p>
        </div>
      </div>
    )
  }

  return (
    <div className="">
      <p className="txt-heading-colour m-4">Your Notifications</p>

      {notis.map((noti: any) => {
        const key = noti.id ?? noti.from ?? Math.random().toString(36).slice(2)

        //============================ FRIEND NOTIFICATIONS =================================//
        if (noti.type === "friend-request") {
          return (
            <div key={key} className="my-3 mx-4 px-4 pb-3 flex border-b-2 color-shadow">
              <img
                src={noti.picture}
                className="w-8 h-8 rounded-full object-cover inline mx-2"
              />

              <div className="w-full flex justify-between items-start">
                <div className="flex-1">
                  <p className="color-txt-main inline flex-1">{`${noti.username} sent you a friend request`}</p>
                  <div className="my-1">
                    <p className="blue-btn inline" onClick={() => addFriend(noti)}>
                      Add Friend
                    </p>
                  </div>
                </div>

                <div className="mx-2">
                  <LuX
                    className="inline hover:opacity-50 duration-200 transition-all m-1 color-txt-sub"
                    onClick={() => removeNotification(noti)}
                  />
                  <p className="txt-sub inline m-0.5">{noti.timeago}</p>
                </div>
              </div>
            </div>
          )
        }
        //==================================================================================//

        //============================ DECK NOTIFICATIONS =================================//
        if (noti.type === "deck-share") {
          return (
            <div key={key} className="my-3 mx-4 px-4 pb-3 flex border-b-2 color-shadow">
              <img
                src={noti.picture}
                className="w-8 h-8 rounded-full object-cover inline mx-2"
              />

              <div className="w-full flex justify-between items-start">
                <div className="flex-1">
                  <p className="color-txt-main inline flex-1">{`${noti.username} sent you a deck`}</p>
                  <div className="my-1">
                    <p
                      className="blue-btn inline"
                      onClick={() =>
                        navigate(`/decks/${noti.from}/${noti.deckID}/preview`)
                      }
                    >
                      View Deck
                    </p>
                  </div>
                </div>

                <div className="mx-2">
                  <LuX
                    className="inline hover:opacity-50 duration-200 transition-all m-1 color-txt-sub"
                    onClick={() => removeNotification(noti)}
                  />
                  <p className="txt-sub inline m-0.5">{noti.timeago}</p>
                </div>
              </div>
            </div>
          )
        }
        //==================================================================================//

        // Unknown notification type — render a generic item (optional)
        return (
          <div key={key} className="my-3 mx-4 px-4 pb-3 flex border-b-2 color-shadow">
            <p className="color-txt-main">You have a new notification</p>
            <div className="mx-2">
              <LuX
                className="inline hover:opacity-50 duration-200 transition-all m-1 color-txt-sub"
                onClick={() => removeNotification(noti)}
              />
              <p className="txt-sub inline m-0.5">{noti.timeago}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}