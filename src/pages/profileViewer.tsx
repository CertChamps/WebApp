import { useEffect, useState, useContext } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore'
import useFetch from "../hooks/useFetch"
import PostCard from '../components/social/PostCard'
import DiscoverMediaPreview from '../components/discover/DiscoverMediaPreview'
import { LuClock, LuMessageCircle, LuSearch, LuSettings, LuUsers, LuX, LuStar } from 'react-icons/lu'
import { db } from '../../firebase'
import { UserContext } from '../context/UserContext'
import ActivityHeatmap from '../components/profile/ActivityHeatmap'

type ProfileDiscoverPost = {
    id: string
    title: string
    description: string
    websiteUrl: string
    resourceSource: 'website' | 'pdf'
    pdfPath?: string | null
    thumbnailUrl: string
    faviconUrl?: string | null
    siteName?: string
    subjectLabel?: string
    resourceType?: string
    resourceTypes?: string[]
    levels?: string[]
    topics?: string[]
    likeCount: number
    commentCount: number
    ratingAverage: number
    ratingCount: number
    timestamp: number | null
    moderationStatus?: string
}

type ProfileTab = "discover" | "posts"

function getTimestampSeconds(value: any): number | null {
    if (!value) return null
    if (typeof value.seconds === 'number') return value.seconds
    if (typeof value.toMillis === 'function') return Math.floor(value.toMillis() / 1000)
    return null
}

function timeAgo(seconds: number | null): string {
    if (!seconds) return ''
    const diff = Math.floor(Date.now() / 1000 - seconds)
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
    return new Date(seconds * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function ProfileViewer() {
    const { userID } = useParams()
    const navigate = useNavigate()
    const { user: currentUser } = useContext(UserContext)
    const [user, setUser] = useState<any>()
    const [friends, setFriends] = useState<any>()
    const [_decks, setDecks] = useState<any>()
    const [posts, setPosts] = useState<any[]>([])
    const [discoverPosts, setDiscoverPosts] = useState<ProfileDiscoverPost[]>([])
    const [showFriendsModal, setShowFriendsModal] = useState(false)
    const [activeTab, setActiveTab] = useState<ProfileTab>("discover")
    const { fetchFriends, fetchUser, fetchUserDecks } = useFetch()
    const isOwnProfile = currentUser?.uid === userID

    const rankNames = ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Master"]
    const formatRankName = (rank?: number) => {
        if (!rank || rank < 1) return "Unranked"
        return rankNames[Math.min(rankNames.length - 1, rank - 1)] || "Unranked"
    }

    const formatStudyTime = (seconds?: number) => {
        if (seconds == null || seconds <= 0) return "0h"
        const h = Math.floor(seconds / 3600)
        const m = Math.floor((seconds % 3600) / 60)
        if (h > 0 && m > 0) return `${h}h ${m}m`
        if (h > 0) return `${h}h`
        return `${m}m`
    }

    const fetchUserPosts = async (uid: string | undefined) => {
        if (!uid) return []

        const postQuery = query(collection(db, 'posts'), where('userId', '==', uid), orderBy('timestamp', 'desc'))
        const postSnap = await getDocs(postQuery)
        const author = await fetchUser(uid)

        const postsWithMeta = await Promise.all(
            postSnap.docs.map(async (docSnap) => {
                const post = docSnap.data()

                let replyCount = 0
                try {
                    const repliesSnap = await getDocs(collection(db, 'posts', docSnap.id, 'replies'))
                    replyCount = repliesSnap.size

                    if (post.flashcardId && post.replyId) {
                        const flashRepliesSnap = await getDocs(
                            collection(db, 'certchamps-questions', post.flashcardId, 'replies', post.replyId, 'replies')
                        )
                        replyCount = flashRepliesSnap.size
                    }
                } catch (err) {
                    console.log(err)
                }

                return {
                    id: docSnap.id,
                    ...post,
                    userId: uid,
                    username: author?.username,
                    rank: author?.rank,
                    userImage: author?.picture,
                    replyCount
                }
            })
        )

        return postsWithMeta
    }

    const fetchUserDiscoverPosts = async (uid: string | undefined): Promise<ProfileDiscoverPost[]> => {
        if (!uid) return []

        const discoverQuery = query(
            collection(db, 'discover-notes'),
            where('userId', '==', uid)
        )
        const discoverSnap = await getDocs(discoverQuery)

        return discoverSnap.docs
            .map((docSnap) => {
                const data = docSnap.data() as any
                return {
                    id: docSnap.id,
                    title: data.title ?? '',
                    description: data.description ?? '',
                    websiteUrl: data.websiteUrl ?? '',
                    resourceSource: data.resourceSource === 'pdf' ? 'pdf' as const : 'website' as const,
                    pdfPath: data.pdfPath ?? null,
                    thumbnailUrl: data.thumbnailUrl ?? '',
                    faviconUrl: data.faviconUrl ?? null,
                    siteName: data.siteName ?? '',
                    subjectLabel: data.subjectLabel ?? undefined,
                    resourceType: data.resourceType ?? undefined,
                    resourceTypes: Array.isArray(data.resourceTypes) ? data.resourceTypes : [],
                    levels: Array.isArray(data.levels) ? data.levels : [],
                    topics: Array.isArray(data.topics) ? data.topics : [],
                    likeCount: typeof data.likeCount === 'number' ? data.likeCount : 0,
                    commentCount: typeof data.commentCount === 'number' ? data.commentCount : 0,
                    ratingAverage: typeof data.ratingAverage === 'number' ? data.ratingAverage : 0,
                    ratingCount: typeof data.ratingCount === 'number' ? data.ratingCount : 0,
                    timestamp: getTimestampSeconds(data.timestamp),
                    moderationStatus: data.moderationStatus ?? 'approved',
                }
            })
            .filter((post) => post.moderationStatus === 'approved')
            .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
    }

    useEffect(() => {
        const fetchInfo = async () => {
            const usr = await fetchUser(userID)
            const frnds = await fetchFriends(userID)
            const dcks = await fetchUserDecks(userID)
            const pst = await fetchUserPosts(userID)
            const discoverPst = await fetchUserDiscoverPosts(userID).catch((err) => {
                console.error('Profile Discover posts load error:', err)
                return []
            })

            setUser(usr)
            setFriends(frnds)

            const ownProfile = currentUser?.uid === userID
            if (ownProfile) {
                setDecks(dcks)
            } else {
                const publicDecks = dcks?.filter((deck: any) => deck.visibility === true) || []
                setDecks(publicDecks)
            }

            setPosts(pst)
            setDiscoverPosts(discoverPst)
        }

        fetchInfo()
    }, [userID, currentUser?.uid])

    if (!user) {
        return (
            <div className="flex w-full h-full color-bg overflow-hidden">
                <div className="flex-1 min-w-0 h-full overflow-y-auto scrollbar-minimal px-6 pt-4 pb-6 space-y-6 animate-pulse">
                    <div className="flex items-center gap-5">
                        <div className="w-20 h-20 rounded-full color-bg-grey-10" />
                        <div className="flex-1 space-y-3">
                            <div className="h-7 w-40 rounded color-bg-grey-10" />
                            <div className="h-4 w-56 rounded color-bg-grey-10" />
                        </div>
                    </div>
                    <div className="h-[140px] w-full rounded-xl color-bg-grey-10" />
                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {[...Array(4)].map((_, idx) => (
                            <div key={idx} className="rounded-xl color-bg-grey-5 overflow-hidden">
                                <div className="aspect-[16/10] color-bg-grey-10" />
                                <div className="px-2.5 py-2 space-y-1.5">
                                    <div className="h-3.5 w-3/4 rounded color-bg-grey-10" />
                                    <div className="h-3 w-1/2 rounded color-bg-grey-10" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="flex w-full h-full color-bg overflow-hidden">
            <main className="flex-1 min-w-0 h-full overflow-y-auto scrollbar-minimal">
                <div className="w-full px-6 pt-4 pb-8 space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-5">
                        {user.picture ? (
                            <img
                                src={user.picture}
                                alt={user.username}
                                className="w-20 h-20 rounded-full object-cover shrink-0"
                            />
                        ) : (
                            <div className="w-20 h-20 rounded-full color-bg-grey-10 shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-3 min-w-0">
                                <h1 className="text-3xl sm:text-4xl font-black leading-none color-txt-main truncate">
                                    {user.username}
                                </h1>
                                {isOwnProfile && (
                                    <button
                                        type="button"
                                        onClick={() => navigate("/user/settings")}
                                        className="inline-flex items-center justify-center rounded-lg p-2 color-txt-sub hover:color-txt-main hover:color-bg-grey-5 cursor-pointer"
                                        aria-label="Settings"
                                    >
                                        <LuSettings size={18} />
                                    </button>
                                )}
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowFriendsModal(true)}
                                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl color-bg-grey-5 text-sm cursor-pointer hover:opacity-90"
                                >
                                    <LuUsers size={15} className="color-txt-sub" />
                                    <span className="font-bold color-txt-main">{friends?.length || 0}</span>
                                    <span className="color-txt-sub">Friends</span>
                                </button>
                                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl color-bg-grey-5 text-sm">
                                    <LuClock size={15} className="color-txt-sub" />
                                    <span className="font-bold color-txt-main tabular-nums">
                                        {formatStudyTime(user?.totalStudySeconds)}
                                    </span>
                                    <span className="color-txt-sub">Studied</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {userID && (
                        <section className="space-y-3">
                            <h2 className="text-lg font-bold color-txt-main">Activity</h2>
                            <ActivityHeatmap uid={userID} />
                        </section>
                    )}

                    <div className="flex items-center gap-1">
                        {([
                            { id: "discover" as const, label: "Discover", count: discoverPosts.length },
                            { id: "posts" as const, label: "Posts", count: posts.length },
                        ]).map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveTab(tab.id)}
                                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold cursor-pointer ${
                                    activeTab === tab.id
                                        ? "color-bg-accent color-txt-accent"
                                        : "color-txt-sub hover:color-txt-main hover:color-bg-grey-5"
                                }`}
                            >
                                {tab.label}
                                <span className="text-[11px] opacity-80">{tab.count}</span>
                            </button>
                        ))}
                    </div>

                    {activeTab === "discover" ? (
                        discoverPosts.length > 0 ? (
                            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                                {discoverPosts.map((post) => {
                                    const resourceType = post.resourceTypes?.[0] ?? post.resourceType ?? "Resource"
                                    const tags = [post.subjectLabel, ...(post.levels ?? []), ...(post.topics ?? [])].filter(Boolean).slice(0, 3)
                                    const rating = post.ratingAverage && post.ratingAverage > 0 ? post.ratingAverage : null

                                    return (
                                        <article
                                            key={post.id}
                                            className="group relative flex flex-col cursor-pointer p-2 hover:z-10"
                                            onClick={() => navigate(`/discover?resource=${post.id}`)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" || e.key === " ") {
                                                    e.preventDefault()
                                                    navigate(`/discover?resource=${post.id}`)
                                                }
                                            }}
                                            role="button"
                                            tabIndex={0}
                                        >
                                            <div
                                                className="absolute inset-0 rounded-xl color-bg-grey-5 pointer-events-none opacity-60 scale-100 group-hover:opacity-100 group-hover:scale-[1.015]"
                                                style={{ transition: "scale 150ms ease-out, opacity 150ms ease-out, transform 150ms ease-out" }}
                                                aria-hidden
                                            />
                                            <div className="relative z-10 flex flex-col">
                                                <div className="relative aspect-[16/10] rounded-lg color-bg-grey-10 overflow-hidden">
                                                    <DiscoverMediaPreview
                                                        resource={{
                                                            title: post.title,
                                                            websiteUrl: post.websiteUrl,
                                                            resourceSource: post.resourceSource,
                                                            pdfPath: post.pdfPath,
                                                            thumbnailUrl: post.thumbnailUrl,
                                                            faviconUrl: post.faviconUrl,
                                                        }}
                                                        variant="thumb"
                                                    />
                                                    <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full color-bg color-txt-main text-xs font-bold">
                                                        {post.resourceSource === "pdf" ? "PDF" : resourceType}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2 min-w-0 px-0.5 pt-2">
                                                    {user.picture ? (
                                                        <img
                                                            src={user.picture}
                                                            alt=""
                                                            className="w-8 h-8 rounded-full object-cover shrink-0"
                                                        />
                                                    ) : (
                                                        <div className="w-8 h-8 rounded-full color-bg-grey-10 shrink-0" />
                                                    )}
                                                    <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <span className="text-[11px] color-txt-sub truncate">
                                                                {user.username || "Unknown"}
                                                            </span>
                                                            {post.timestamp ? (
                                                                <span className="text-[11px] color-txt-sub shrink-0">
                                                                    {timeAgo(post.timestamp)}
                                                                </span>
                                                            ) : null}
                                                            {rating && (
                                                                <span className="inline-flex items-center gap-0.5 shrink-0 ml-auto text-xs font-semibold color-txt-sub">
                                                                    <LuStar size={12} fill="currentColor" className="color-txt-accent" />
                                                                    {rating.toFixed(1)}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <h3 className="text-sm font-bold color-txt-main truncate">
                                                            {post.title}
                                                        </h3>
                                                    </div>
                                                </div>
                                                {tags.length > 0 && (
                                                    <div className="flex flex-wrap gap-1 px-0.5 pt-1.5">
                                                        {tags.map((tag) => (
                                                            <span
                                                                key={`${post.id}-${tag}`}
                                                                className="px-2 py-0.5 rounded-full color-bg text-[11px] font-semibold color-txt-sub"
                                                            >
                                                                {tag}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </article>
                                    )
                                })}
                            </div>
                        ) : (
                            <div className="rounded-2xl color-bg-grey-5 p-8 text-center space-y-3">
                                <div className="mx-auto w-12 h-12 rounded-full color-bg-accent flex items-center justify-center color-txt-accent">
                                    <LuSearch size={22} />
                                </div>
                                <h3 className="text-lg font-semibold color-txt-main">No Discover posts yet</h3>
                                <p className="text-sm color-txt-sub">
                                    {isOwnProfile ? "Share a resource from Discover to show it here." : "This student hasn't shared any resources yet."}
                                </p>
                            </div>
                        )
                    ) : posts.length > 0 ? (
                        <div>
                            {posts.map((post: any, index: number) => (
                                <div key={post.id}>
                                    {index > 0 && <div className="h-px color-bg-grey-10" />}
                                    <PostCard
                                        userId={post.userId}
                                        rank={post.rank}
                                        content={post.content}
                                        userImage={post.userImage}
                                        username={post.username}
                                        time={post.timestamp}
                                        replyCount={post.replyCount}
                                        imageURL={post.imageUrl}
                                        onPressReplies={() => navigate(`/post/${post.id}`)}
                                    />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-2xl color-bg-grey-5 p-8 text-center space-y-3">
                            <div className="mx-auto w-12 h-12 rounded-full color-bg-accent flex items-center justify-center color-txt-accent">
                                <LuMessageCircle size={22} />
                            </div>
                            <h3 className="text-lg font-semibold color-txt-main">No posts yet</h3>
                            <p className="text-sm color-txt-sub">
                                {isOwnProfile ? "Share something in Discussion and it will show up here." : "This student hasn't posted in Discussion yet."}
                            </p>
                        </div>
                    )}
                </div>
            </main>

            {showFriendsModal && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                    onClick={() => setShowFriendsModal(false)}
                >
                    <div
                        className="w-full max-w-md rounded-2xl color-bg max-h-[80vh] overflow-hidden flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-5 py-4">
                            <h2 className="text-lg font-bold color-txt-main">
                                Friends · {friends?.length || 0}
                            </h2>
                            <button
                                type="button"
                                className="inline-flex items-center justify-center rounded-lg p-1.5 color-txt-sub hover:color-txt-main hover:color-bg-grey-5 cursor-pointer"
                                onClick={() => setShowFriendsModal(false)}
                                aria-label="Close"
                            >
                                <LuX size={18} />
                            </button>
                        </div>
                        <div className="overflow-y-auto scrollbar-minimal flex-1 px-2 pb-3">
                            {friends && friends.length > 0 ? (
                                <div className="flex flex-col">
                                    {friends.map((friend: any) => (
                                        <button
                                            type="button"
                                            key={friend.uid}
                                            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:color-bg-grey-5 transition-colors cursor-pointer"
                                            onClick={() => {
                                                navigate(`/viewProfile/${friend.uid}`)
                                                setShowFriendsModal(false)
                                            }}
                                        >
                                            {friend.picture ? (
                                                <img
                                                    src={friend.picture}
                                                    alt={friend.username}
                                                    className="w-10 h-10 rounded-full object-cover shrink-0"
                                                />
                                            ) : (
                                                <div className="w-10 h-10 rounded-full color-bg-grey-10 shrink-0" />
                                            )}
                                            <div className="min-w-0">
                                                <div className="text-sm font-bold color-txt-main truncate">{friend.username}</div>
                                                <div className="text-xs color-txt-sub">{formatRankName(friend.rank)}</div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <p className="px-3 py-8 text-sm color-txt-sub text-center">No friends yet</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
