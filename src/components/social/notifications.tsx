import { useMemo } from "react"
import { LuCheck, LuGift, LuUserPlus, LuX } from "react-icons/lu"
import { useNavigate } from "react-router-dom"

import useNotifications from "../../hooks/useNotifications"

function postTitleNode(title?: string) {
  const trimmed = title?.trim()
  if (!trimmed) return "your post"
  return <span className="font-bold">{`"${trimmed}"`}</span>
}

function NotificationCopy({ noti }: { noti: any }) {
  const name = noti.fromName || noti.username || "Someone"
  const Name = <span className="font-bold">{name}</span>
  const post = postTitleNode(noti.postTitle)
  const reason = typeof noti.reason === "string" && noti.reason.trim() ? noti.reason.trim() : "No reason given"

  if (noti.type === "friend-request") return <>{Name} sent you a friend request</>
  if (noti.type === "deck-share") return <>{Name} sent you a deck</>
  if (noti.type === "post-comment") return <>{Name} commented on your post {post}</>
  if (noti.type === "post-rating") {
    const raw = typeof noti.rating === "number" ? noti.rating : Number(noti.rating)
    const score = Number.isFinite(raw) ? Math.round(raw) : null
    const outOfFive = score && score >= 1 && score <= 5 ? score : null
    return (
      <>
        {Name} rated your post {post}
        {outOfFive ? <> {outOfFive}/5</> : null}
      </>
    )
  }
  if (noti.type === "post-approved") return <>Your post {post} is now on Discover</>
  if (noti.type === "post-rejected") return <>Your post {post} was not approved. Reason: {reason}</>
  if (noti.type === "post-removed") return <>Your post {post} was removed</>
  return <>You have a new notification</>
}

function Avatar({ noti }: { noti: any }) {
  if (noti.picture) {
    return (
      <img
        src={noti.picture}
        alt=""
        className="w-8 h-8 rounded-full object-cover shrink-0"
      />
    )
  }
  if (noti.type === "post-approved") {
    return (
      <div className="w-8 h-8 rounded-full color-bg-grey-5 flex items-center justify-center shrink-0">
        <LuCheck size={16} className="color-txt-accent" strokeWidth={2.5} />
      </div>
    )
  }
  if (noti.type === "post-rejected" || noti.type === "post-removed") {
    return (
      <div className="w-8 h-8 rounded-full color-bg-grey-5 flex items-center justify-center shrink-0">
        <LuX size={16} className="color-txt-accent" strokeWidth={2.5} />
      </div>
    )
  }
  if (noti.type === "deck-share") {
    return (
      <div className="w-8 h-8 rounded-full color-bg-grey-5 flex items-center justify-center shrink-0">
        <LuGift size={15} className="color-txt-sub" />
      </div>
    )
  }
  return (
    <div className="w-8 h-8 rounded-full color-bg-grey-5 flex items-center justify-center shrink-0">
      <LuUserPlus size={15} className="color-txt-sub" />
    </div>
  )
}

function notiDate(noti: any): Date | null {
  const ts = noti.timestamp
  if (ts?.toDate) return ts.toDate()
  if (typeof ts?.seconds === "number") return new Date(ts.seconds * 1000)
  return null
}

function sectionFor(noti: any): string {
  const date = notiDate(noti)
  if (!date) return "Older"
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfYesterday = new Date(startOfToday)
  startOfYesterday.setDate(startOfYesterday.getDate() - 1)
  const startOfWeek = new Date(startOfToday)
  startOfWeek.setDate(startOfWeek.getDate() - 6)
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)

  if (date >= startOfToday) return "Today"
  if (date >= startOfYesterday) return "Yesterday"
  if (date >= startOfWeek) return "This week"
  if (date >= startOfThisMonth) return "This month"
  if (date >= startOfLastMonth) return "Last month"
  return "Older"
}

const SECTION_ORDER = ["Today", "Yesterday", "This week", "This month", "Last month", "Older"]

export default function Notifications({ onClose }: { onClose?: () => void }) {
  const { notis = [], addFriend } = useNotifications()
  const navigate = useNavigate()

  const sections = useMemo(() => {
    const grouped = new Map<string, any[]>()
    for (const noti of notis) {
      const key = sectionFor(noti)
      const list = grouped.get(key) ?? []
      list.push(noti)
      grouped.set(key, list)
    }
    return SECTION_ORDER
      .filter((name) => (grouped.get(name) ?? []).length > 0)
      .map((name) => ({ name, items: grouped.get(name) ?? [] }))
  }, [notis])

  const openNotification = (noti: any) => {
    if (noti.type === "deck-share" && noti.deckID) {
      onClose?.()
      navigate(`/decks/${noti.deckID}`)
      return
    }
    if (noti.postId && String(noti.type ?? "").startsWith("post-")) {
      onClose?.()
      navigate(`/discover?resource=${encodeURIComponent(noti.postId)}`)
    }
  }

  if (!notis || notis.length === 0) {
    return (
      <div className="px-3 py-4">
        <p className="text-sm color-txt-sub">No notifications</p>
      </div>
    )
  }

  return (
    <div className="w-full max-h-[70vh] overflow-y-auto scrollbar-minimal">
      {sections.map((section) => (
        <div key={section.name}>
          <p className="px-3 pt-3 pb-1 text-xs font-semibold color-txt-sub">{section.name}</p>
          {section.items.map((noti: any, index: number) => {
            const key = noti.id ?? `${noti.type ?? "n"}-${noti.timestamp?.seconds ?? index}`
            const unread = noti.read !== true
            const clickable = Boolean(noti.postId) || (noti.type === "deck-share" && noti.deckID)
            return (
              <div
                key={key}
                role={clickable ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={() => {
                  if (clickable) openNotification(noti)
                }}
                onKeyDown={(e) => {
                  if (!clickable) return
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    openNotification(noti)
                  }
                }}
                className={`flex items-start gap-3 px-3 py-3 cursor-pointer ${
                  unread ? "color-bg-accent" : ""
                } hover:color-bg-grey-5 active:color-bg-grey-5`}
              >
                <Avatar noti={noti} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm color-txt-main leading-snug line-clamp-3">
                    <NotificationCopy noti={noti} />
                  </p>
                  <p className="text-xs color-txt-sub mt-1">{noti.timeago || "just now"}</p>
                </div>
                {noti.type === "friend-request" && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      addFriend(noti)
                    }}
                    className="text-sm color-txt-accent cursor-pointer shrink-0 self-start"
                  >
                    Add
                  </button>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
