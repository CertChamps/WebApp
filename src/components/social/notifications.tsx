import type { ReactNode } from "react"
import { LuX, LuUserPlus, LuGift, LuMessageCircle, LuStar, LuTrash2, LuBan } from "react-icons/lu"
import { useNavigate } from "react-router-dom"

import useNotifications from "../../hooks/useNotifications"

function NotificationRow({
  picture,
  icon,
  title,
  subtitle,
  actions,
  onDismiss,
}: {
  picture?: string | null
  icon?: ReactNode
  title: string
  subtitle: string
  actions?: ReactNode
  onDismiss: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 w-full color-bg-grey-5 rounded-in p-4 hover:opacity-80 transition-opacity duration-200">
      <div className="flex items-center gap-4 flex-1 min-w-0">
        {picture ? (
          <img
            src={picture}
            alt=""
            className="w-8 h-8 rounded-full object-cover flex-shrink-0 border color-shadow"
          />
        ) : icon ? (
          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 color-bg border color-shadow color-txt-sub">
            {icon}
          </div>
        ) : null}

        <div className="flex-1 min-w-0">
          <p className="txt-bold truncate">{title}</p>
          <p className="txt-sub text-sm truncate">{subtitle}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        {actions}
        <button
          type="button"
          onClick={onDismiss}
          className="color-txt-sub hover:opacity-60 transition-opacity duration-200 p-1"
          aria-label="Dismiss notification"
        >
          <LuX size={18} />
        </button>
      </div>
    </div>
  )
}

function quotedTitle(title?: string) {
  const trimmed = title?.trim()
  return trimmed ? ` “${trimmed}”` : ""
}

export default function Notifications() {
  const { notis = [], addFriend, removeNotification } = useNotifications()
  const navigate = useNavigate()

  if (!notis || notis.length === 0) {
    return (
      <div className="w-full h-full flex flex-col p-6">
        <h3 className="txt-heading-colour text-xl mb-4">Your Notifications</h3>
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <p className="txt-sub text-center">All clear! No notifications</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col overflow-y-auto scrollbar-minimal p-6 gap-3">
      <h3 className="txt-heading-colour text-xl mb-2">Your Notifications</h3>

      {notis.map((noti: any) => {
        const key = noti.id ?? noti.from ?? noti.timestamp?.seconds ?? Math.random().toString(36).slice(2)

        if (noti.type === "friend-request") {
          return (
            <NotificationRow
              key={key}
              picture={noti.picture}
              title={noti.username}
              subtitle="sent you a friend request"
              onDismiss={() => removeNotification(noti)}
              actions={
                <button
                  type="button"
                  onClick={() => addFriend(noti)}
                  className="flex items-center gap-2 color-bg-accent color-txt-accent rounded-in px-4 py-2 text-xs font-semibold hover:opacity-80 transition-all duration-200 cursor-pointer whitespace-nowrap !w-auto"
                >
                  <LuUserPlus size={14} />
                  <span>Add Friend</span>
                </button>
              }
            />
          )
        }

        if (noti.type === "deck-share") {
          return (
            <NotificationRow
              key={key}
              picture={noti.picture}
              title={noti.username}
              subtitle="sent you a deck"
              onDismiss={() => removeNotification(noti)}
              actions={
                <button
                  type="button"
                  onClick={() => navigate(`/decks/${noti.deckID}`)}
                  className="flex items-center gap-2 color-bg-accent color-txt-accent rounded-in px-4 py-2 text-xs font-semibold hover:opacity-80 transition-all duration-200 cursor-pointer whitespace-nowrap !w-auto"
                >
                  <LuGift size={14} />
                  <span>View Deck</span>
                </button>
              }
            />
          )
        }

        if (noti.type === "post-comment") {
          return (
            <NotificationRow
              key={key}
              picture={noti.picture}
              icon={<LuMessageCircle size={16} />}
              title={noti.username || "Someone"}
              subtitle={`commented on your post${quotedTitle(noti.postTitle)}`}
              onDismiss={() => removeNotification(noti)}
            />
          )
        }

        if (noti.type === "post-rating") {
          return (
            <NotificationRow
              key={key}
              picture={noti.picture}
              icon={<LuStar size={16} />}
              title={noti.username || "Someone"}
              subtitle={`rated your post${quotedTitle(noti.postTitle)}`}
              onDismiss={() => removeNotification(noti)}
            />
          )
        }

        if (noti.type === "post-removed") {
          return (
            <NotificationRow
              key={key}
              icon={<LuTrash2 size={16} />}
              title="Post removed"
              subtitle={`Your post${quotedTitle(noti.postTitle)} has been removed`}
              onDismiss={() => removeNotification(noti)}
            />
          )
        }

        if (noti.type === "post-rejected") {
          return (
            <NotificationRow
              key={key}
              icon={<LuBan size={16} />}
              title="Post rejected"
              subtitle={`Your post${quotedTitle(noti.postTitle)} has been rejected`}
              onDismiss={() => removeNotification(noti)}
            />
          )
        }

        return (
          <NotificationRow
            key={key}
            title="New Notification"
            subtitle="You have a new notification"
            onDismiss={() => removeNotification(noti)}
          />
        )
      })}
    </div>
  )
}
