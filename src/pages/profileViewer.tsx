import { useEffect, useState, useContext } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { addDoc, collection, doc, getDoc, getDocs, increment, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, where } from 'firebase/firestore'
import useFetch from "../hooks/useFetch"
import PostCard from '../components/social/PostCard'
import { LuBookOpen, LuBookmark, LuCirclePlay, LuExternalLink, LuFileText, LuLayers, LuLoader, LuMessageCircle, LuX } from 'react-icons/lu'
import { db } from '../../firebase'
import { UserContext } from '../context/UserContext'
import '../styles/profile.css'
import '../styles/decks.css'
import '../styles/social.css'
import ActivityHeatmap from '../components/profile/ActivityHeatmap'

const MAX_COMMENT = 500

type ProfileDiscoverPost = {
    id: string
    title: string
    description: string
    websiteUrl: string
    resourceSource: 'website' | 'pdf'
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

type ProfileDiscoverComment = {
    id: string
    userId: string
    username: string
    userPicture: string | null
    text: string
    timestamp: number | null
}

function getTimestampSeconds(value: any): number | null {
    if (!value) return null
    if (typeof value.seconds === 'number') return value.seconds
    if (typeof value.toMillis === 'function') return Math.floor(value.toMillis() / 1000)
    return null
}

function displayHostname(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, '')
    } catch {
        return url
    }
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
    const [selectedDiscoverPost, setSelectedDiscoverPost] = useState<ProfileDiscoverPost | null>(null)
    const [discoverComments, setDiscoverComments] = useState<ProfileDiscoverComment[]>([])
    const [discoverCommentText, setDiscoverCommentText] = useState('')
    const [discoverCommentSubmitting, setDiscoverCommentSubmitting] = useState(false)
    const [discoverRatingSubmitting, setDiscoverRatingSubmitting] = useState(false)
    const [discoverUserRating, setDiscoverUserRating] = useState<number | null>(null)
    const [showFriendsModal, setShowFriendsModal] = useState(false)
    const { fetchFriends, fetchUser, fetchUserDecks } = useFetch()

    const rankNames = ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Master"]
    const formatRankName = (rank?: number) => {
        if (!rank || rank < 1) return "Unranked"
        return rankNames[Math.min(rankNames.length - 1, rank - 1)] || "Unranked"
    }

    const formatStudyTime = (seconds?: number) => {
        if (seconds == null || seconds < 0) return "00:00:00"
        const h = Math.floor(seconds / 3600)
        const m = Math.floor((seconds % 3600) / 60)
        const s = seconds % 60
        return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":")
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

    const updateDiscoverPost = (postId: string, patch: Partial<ProfileDiscoverPost>) => {
        setDiscoverPosts((current) => current.map((post) => post.id === postId ? { ...post, ...patch } : post))
        setSelectedDiscoverPost((current) => current?.id === postId ? { ...current, ...patch } : current)
    }

    const handleDiscoverSave = async (post: ProfileDiscoverPost) => {
        if (!currentUser?.uid) {
            setSelectedDiscoverPost(post)
            return
        }

        const likeRef = doc(db, 'discover-notes', post.id, 'likes', currentUser.uid)
        const resourceRef = doc(db, 'discover-notes', post.id)
        try {
            let didLike = false
            await runTransaction(db, async (transaction) => {
                const likeSnap = await transaction.get(likeRef)
                if (likeSnap.exists()) return
                didLike = true
                transaction.set(likeRef, {
                    userId: currentUser.uid,
                    timestamp: serverTimestamp(),
                })
                transaction.update(resourceRef, {
                    likeCount: increment(1),
                })
            })
            if (didLike) updateDiscoverPost(post.id, { likeCount: post.likeCount + 1 })
        } catch (err) {
            console.error('Profile Discover save error:', err)
        }
    }

    const handleDiscoverRate = async (value: number) => {
        if (!currentUser?.uid || !selectedDiscoverPost || discoverRatingSubmitting) return
        setDiscoverRatingSubmitting(true)
        const ratingRef = doc(db, 'discover-notes', selectedDiscoverPost.id, 'ratings', currentUser.uid)
        const resourceRef = doc(db, 'discover-notes', selectedDiscoverPost.id)
        try {
            let nextAverage = selectedDiscoverPost.ratingAverage ?? 0
            let nextCount = selectedDiscoverPost.ratingCount ?? 0
            await runTransaction(db, async (transaction) => {
                const resourceSnap = await transaction.get(resourceRef)
                const ratingSnap = await transaction.get(ratingRef)
                const data = resourceSnap.data() as any | undefined
                const currentAverage = data?.ratingAverage ?? 0
                const currentCount = data?.ratingCount ?? 0
                const previousValue = ratingSnap.exists() ? ratingSnap.data()?.value : null
                nextCount = typeof previousValue === 'number' ? currentCount : currentCount + 1
                const currentTotal = currentAverage * currentCount
                const nextTotal = typeof previousValue === 'number'
                    ? currentTotal - previousValue + value
                    : currentTotal + value
                nextAverage = nextCount > 0 ? Math.round((nextTotal / nextCount) * 10) / 10 : 0

                transaction.set(ratingRef, {
                    userId: currentUser.uid,
                    value,
                    timestamp: serverTimestamp(),
                })
                transaction.update(resourceRef, {
                    ratingAverage: nextAverage,
                    ratingCount: nextCount,
                })
            })
            setDiscoverUserRating(value)
            updateDiscoverPost(selectedDiscoverPost.id, { ratingAverage: nextAverage, ratingCount: nextCount })
        } catch (err) {
            console.error('Profile Discover rating error:', err)
        } finally {
            setDiscoverRatingSubmitting(false)
        }
    }

    const handleAddDiscoverComment = async () => {
        if (!currentUser?.uid || !selectedDiscoverPost || discoverCommentSubmitting) return
        const text = discoverCommentText.trim()
        if (!text) return
        setDiscoverCommentSubmitting(true)
        try {
            await addDoc(collection(db, 'discover-notes', selectedDiscoverPost.id, 'comments'), {
                userId: currentUser.uid,
                username: currentUser.username ?? '',
                userPicture: currentUser.picture ?? null,
                text: text.slice(0, MAX_COMMENT),
                timestamp: serverTimestamp(),
            })
            await runTransaction(db, async (transaction) => {
                transaction.update(doc(db, 'discover-notes', selectedDiscoverPost.id), {
                    commentCount: increment(1),
                })
            })
            updateDiscoverPost(selectedDiscoverPost.id, { commentCount: selectedDiscoverPost.commentCount + 1 })
            setDiscoverCommentText('')
        } catch (err) {
            console.error('Profile Discover comment error:', err)
        } finally {
            setDiscoverCommentSubmitting(false)
        }
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
            
            // Filter decks based on whether viewing own profile or another user's
            const isOwnProfile = currentUser?.uid === userID
            if (isOwnProfile) {
                // Show all decks (public and private) for own profile
                setDecks(dcks)
            } else {
                // Only show public decks for other users' profiles
                const publicDecks = dcks?.filter((deck: any) => deck.visibility === true) || []
                setDecks(publicDecks)
            }
            
            setPosts(pst)
            setDiscoverPosts(discoverPst)
        }

        fetchInfo()
    }, [userID, currentUser?.uid])

    useEffect(() => {
        if (!selectedDiscoverPost) {
            setDiscoverComments([])
            setDiscoverUserRating(null)
            setDiscoverCommentText('')
            return
        }

        const commentsQuery = query(
            collection(db, 'discover-notes', selectedDiscoverPost.id, 'comments'),
            orderBy('timestamp', 'asc'),
            limit(100)
        )
        const unsubComments = onSnapshot(commentsQuery, (snap) => {
            setDiscoverComments(
                snap.docs.map((d) => {
                    const data = d.data() as any
                    return {
                        id: d.id,
                        userId: data.userId ?? '',
                        username: data.username ?? 'Unknown',
                        userPicture: data.userPicture ?? null,
                        text: data.text ?? '',
                        timestamp: getTimestampSeconds(data.timestamp),
                    }
                })
            )
        })

        let cancelled = false
        if (currentUser?.uid) {
            getDoc(doc(db, 'discover-notes', selectedDiscoverPost.id, 'ratings', currentUser.uid)).then((snap) => {
                if (!cancelled) {
                    const value = snap.data()?.value
                    setDiscoverUserRating(typeof value === 'number' ? value : null)
                }
            })
        } else {
            setDiscoverUserRating(null)
        }

        return () => {
            cancelled = true
            unsubComments()
        }
    }, [selectedDiscoverPost?.id, currentUser?.uid])

    if (!user) {
        return (
            <div className="profile-main">
                <div className="profile-skeleton">
                    <div className="profile-skeleton-header">
                        <div className="skeleton-avatar" />
                        <div className="skeleton-lines">
                            <div className="skeleton-line w-40" />
                            <div className="skeleton-line w-28" />
                        </div>
                        <div className="skeleton-stats">
                            <div className="skeleton-pill" />
                            <div className="skeleton-pill" />
                            <div className="skeleton-pill" />
                        </div>
                    </div>
                    <div className="profile-skeleton-tabs">
                        <div className="skeleton-tab" />
                        <div className="skeleton-tab" />
                    </div>
                    <div className="profile-skeleton-cards">
                        {[...Array(6)].map((_, idx) => (
                            <div key={idx} className="skeleton-card" />
                        ))}
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="profile-main">
            {/* ==================== PROFILE HEADER ==================== */}
            <div className="profile-viewer-header">
                <img 
                    src={user.picture} 
                    alt={user.username}
                    className="profile-avatar"
                />
                <div className="profile-header-info">
                    <h1 className="profile-username">{user.username}</h1>
                    <p className="profile-email">{user.email}</p>
                    {/* <div className="profile-rank-badge">
                        {formatRankName(user.rank)}
                    </div> */}
                </div>
                <div className="profile-stats">
                    <div 
                        className="profile-stat-card cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => setShowFriendsModal(true)}
                    >
                        <div className="profile-stat-label">Friends</div>
                        <div className="profile-stat-value profile-stat-value-main">{friends?.length || 0}</div>
                    </div>
                    <div className="profile-stat-card">
                        <div className="profile-stat-label">Total study time</div>
                        <div className="profile-stat-value profile-stat-value-main tabular-nums">{formatStudyTime(user?.totalStudySeconds)}</div>
                    </div>
                </div>
            </div>
            {/* ==================== ACTIVITY HEATMAP ==================== */}
            {userID && <ActivityHeatmap uid={userID} />}

            {/* ==================== DISCOVER POSTS SECTION ==================== */}
            <div className="p-4 pt-0">
                <h2 className="text-lg font-bold color-txt-sub mb-3">Discover Posts</h2>
                {discoverPosts.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {discoverPosts.map((post) => {
                            const resourceType = post.resourceTypes?.[0] ?? post.resourceType ?? 'Resource'
                            const tags = [post.subjectLabel, ...(post.levels ?? []), ...(post.topics ?? [])].filter(Boolean).slice(0, 3)
                            const sourceName = post.siteName || displayHostname(post.websiteUrl)

                            return (
                                <article
                                    key={post.id}
                                    className="group rounded-2xl color-bg-grey-5 overflow-hidden flex flex-col hover:shadow-md transition-shadow"
                                >
                                    <button
                                        type="button"
                                        onClick={() => post.websiteUrl && window.open(post.websiteUrl, '_blank', 'noopener,noreferrer')}
                                        disabled={!post.websiteUrl}
                                        className="block w-full aspect-video color-bg-grey-10 overflow-hidden relative cursor-pointer disabled:cursor-default"
                                        aria-label={`Visit ${post.title}`}
                                    >
                                        {post.thumbnailUrl && post.thumbnailUrl !== post.faviconUrl ? (
                                            <img
                                                src={post.thumbnailUrl}
                                                alt={post.title}
                                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                                                loading="lazy"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex flex-col items-center justify-center gap-3 color-txt-sub color-bg-grey-10 px-5 text-center">
                                                {post.faviconUrl ? (
                                                    <img
                                                        src={post.faviconUrl}
                                                        alt=""
                                                        className="w-14 h-14 rounded-2xl object-contain color-bg p-2 shadow-sm"
                                                        loading="lazy"
                                                    />
                                                ) : post.resourceSource === 'pdf' ? (
                                                    <LuFileText size={34} />
                                                ) : resourceType === 'Videos' ? (
                                                    <LuCirclePlay size={34} />
                                                ) : resourceType === 'Flashcards' ? (
                                                    <LuLayers size={34} />
                                                ) : (
                                                    <LuBookOpen size={34} />
                                                )}
                                                <span className="text-sm font-semibold line-clamp-2">
                                                    {sourceName || post.subjectLabel}
                                                </span>
                                            </div>
                                        )}
                                        <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full color-bg color-txt-main text-xs font-bold">
                                            {post.resourceSource === 'pdf' ? 'PDF' : resourceType}
                                        </span>
                                    </button>

                                    <div className="p-4 flex flex-col flex-1 gap-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <h3 className="text-base font-semibold color-txt-main line-clamp-2">
                                                {post.title}
                                            </h3>
                                        </div>

                                        <p className="color-txt-sub text-sm line-clamp-3">{post.description}</p>

                                        <div className="flex flex-wrap gap-2">
                                            {tags.map((tag) => (
                                                <span
                                                    key={`${post.id}-${tag}`}
                                                    className="px-2.5 py-1 rounded-full color-bg text-xs font-semibold color-txt-sub"
                                                >
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>

                                        <div className="mt-auto flex items-center justify-between gap-3 pt-2">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <button
                                                    type="button"
                                                    onClick={() => userID && navigate(`/viewProfile/${userID}`)}
                                                    className="flex items-center gap-2 min-w-0 cursor-pointer group/author"
                                                >
                                                    {user.picture ? (
                                                        <img
                                                            src={user.picture}
                                                            alt=""
                                                            className="w-6 h-6 rounded-full object-cover shrink-0"
                                                        />
                                                    ) : (
                                                        <div className="w-6 h-6 rounded-full color-bg-grey-10 shrink-0" />
                                                    )}
                                                    <span className="text-xs color-txt-sub truncate group-hover/author:color-txt-main">
                                                        {user.username || 'Unknown'}
                                                        {post.timestamp ? ` · ${timeAgo(post.timestamp)}` : ''}
                                                    </span>
                                                </button>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => post.websiteUrl && window.open(post.websiteUrl, '_blank', 'noopener,noreferrer')}
                                                disabled={!post.websiteUrl}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg color-bg-accent color-txt-accent text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer shrink-0 disabled:opacity-70 disabled:cursor-default"
                                                title={post.websiteUrl ? displayHostname(post.websiteUrl) : 'Preview card'}
                                            >
                                                <LuExternalLink size={13} />
                                                {post.websiteUrl
                                                    ? post.resourceSource === 'pdf' ? 'Open PDF' : 'Visit'
                                                    : 'Preview'}
                                            </button>
                                        </div>

                                        <div className="flex items-center justify-between gap-3 border-t border-color-border/60 pt-3 text-xs color-txt-sub">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <span className="inline-flex items-center gap-1.5">
                                                    {post.ratingAverage && post.ratingAverage > 0 ? `${post.ratingAverage.toFixed(1)} ★` : 'No ratings'}
                                                    {post.ratingCount ? ` (${post.ratingCount})` : ''}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => handleDiscoverSave(post)}
                                                    className="inline-flex items-center gap-1.5 hover:color-txt-main transition-colors cursor-pointer"
                                                >
                                                    <LuBookmark size={14} />
                                                    {post.likeCount}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedDiscoverPost(post)}
                                                    className="inline-flex items-center gap-1.5 hover:color-txt-main transition-colors cursor-pointer"
                                                >
                                                    <LuMessageCircle size={14} />
                                                    {post.commentCount}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </article>
                            )
                        })}
                    </div>
                ) : (
                    <p className="color-txt-sub">No Discover posts yet</p>
                )}
            </div>

            {/* ==================== POSTS SECTION ==================== */}
            <div className="p-4 pt-0">
                <h2 className="text-lg font-bold color-txt-sub mb-3">Posts</h2>
                {posts && posts.length > 0 ? (
                    <div className="space-y-4">
                        {posts.map((post: any) => (
                            <PostCard
                                key={post.id}
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
                        ))}
                    </div>
                ) : (
                    <p className="color-txt-sub">No posts yet</p>
                )}
            </div>

            {selectedDiscoverPost && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                    onClick={() => setSelectedDiscoverPost(null)}
                >
                    <div
                        className="w-full max-w-3xl rounded-2xl color-bg shadow-md max-h-[90vh] overflow-y-auto scrollbar-minimal"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr]">
                            <div className="color-bg-grey-5">
                                <div className="aspect-video md:aspect-auto md:h-full min-h-[220px] color-bg-grey-10 flex items-center justify-center overflow-hidden">
                                    {selectedDiscoverPost.thumbnailUrl && selectedDiscoverPost.thumbnailUrl !== selectedDiscoverPost.faviconUrl ? (
                                        <img
                                            src={selectedDiscoverPost.thumbnailUrl}
                                            alt=""
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="flex flex-col items-center gap-3 color-txt-sub px-5 text-center">
                                            {selectedDiscoverPost.faviconUrl ? (
                                                <img
                                                    src={selectedDiscoverPost.faviconUrl}
                                                    alt=""
                                                    className="w-16 h-16 rounded-2xl object-contain color-bg p-2 shadow-sm"
                                                />
                                            ) : selectedDiscoverPost.resourceSource === 'pdf' ? (
                                                <LuFileText size={34} />
                                            ) : (
                                                <LuBookOpen size={34} />
                                            )}
                                            <span className="font-semibold">
                                                {selectedDiscoverPost.siteName || displayHostname(selectedDiscoverPost.websiteUrl)}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="p-5 sm:p-6 space-y-5">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0">
                                        <h2 className="text-xl font-bold color-txt-main">
                                            {selectedDiscoverPost.title}
                                        </h2>
                                        <p className="text-sm color-txt-sub mt-1">
                                            {selectedDiscoverPost.subjectLabel ?? 'General'} · {(selectedDiscoverPost.resourceTypes?.length ? selectedDiscoverPost.resourceTypes : [selectedDiscoverPost.resourceType ?? 'Resource']).join(', ')}
                                            {selectedDiscoverPost.levels?.length ? ` · ${selectedDiscoverPost.levels.join(', ')}` : ''}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedDiscoverPost(null)}
                                        className="color-txt-sub hover:color-txt-main cursor-pointer"
                                        aria-label="Close"
                                    >
                                        <LuX size={20} />
                                    </button>
                                </div>

                                <p className="text-sm color-txt-sub">{selectedDiscoverPost.description}</p>

                                <div className="flex flex-wrap gap-2">
                                    {[selectedDiscoverPost.subjectLabel, ...(selectedDiscoverPost.levels ?? []), ...(selectedDiscoverPost.topics ?? [])]
                                        .filter(Boolean)
                                        .slice(0, 6)
                                        .map((tag) => (
                                            <span
                                                key={`${selectedDiscoverPost.id}-modal-${tag}`}
                                                className="px-2.5 py-1 rounded-full color-bg-grey-5 text-xs font-semibold color-txt-sub"
                                            >
                                                {tag}
                                            </span>
                                        ))}
                                </div>

                                <div className="flex flex-wrap items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => selectedDiscoverPost.websiteUrl && window.open(selectedDiscoverPost.websiteUrl, '_blank', 'noopener,noreferrer')}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl color-bg-accent color-txt-accent text-sm font-semibold hover:opacity-90 cursor-pointer"
                                    >
                                        <LuExternalLink size={15} />
                                        {selectedDiscoverPost.resourceSource === 'pdf' ? 'Open PDF' : 'Visit resource'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleDiscoverSave(selectedDiscoverPost)}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl color-bg-grey-5 color-txt-main text-sm font-semibold hover:opacity-90 cursor-pointer"
                                    >
                                        <LuBookmark size={15} />
                                        Save · {selectedDiscoverPost.likeCount}
                                    </button>
                                </div>

                                <div className="rounded-xl color-bg-grey-5 p-4 space-y-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <h3 className="font-bold color-txt-main">Rate this resource</h3>
                                            <p className="text-xs color-txt-sub">
                                                {selectedDiscoverPost.ratingCount
                                                    ? `${selectedDiscoverPost.ratingAverage?.toFixed(1)} average from ${selectedDiscoverPost.ratingCount} ratings`
                                                    : 'No ratings yet'}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            {[1, 2, 3, 4, 5].map((value) => (
                                                <button
                                                    type="button"
                                                    key={value}
                                                    disabled={discoverRatingSubmitting || !currentUser?.uid}
                                                    onClick={() => handleDiscoverRate(value)}
                                                    className={`text-xl cursor-pointer disabled:cursor-not-allowed ${
                                                        (discoverUserRating ?? 0) >= value ? 'color-txt-accent' : 'color-txt-sub'
                                                    }`}
                                                    aria-label={`Rate ${value} stars`}
                                                >
                                                    ★
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <h3 className="font-bold color-txt-main">Comments</h3>
                                    <div className="space-y-3 max-h-56 overflow-y-auto scrollbar-minimal pr-1">
                                        {discoverComments.length === 0 ? (
                                            <p className="text-sm color-txt-sub">
                                                No comments yet. Add context for the next student.
                                            </p>
                                        ) : (
                                            discoverComments.map((comment) => (
                                                <div key={comment.id} className="rounded-xl color-bg-grey-5 p-3">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        {comment.userPicture ? (
                                                            <img
                                                                src={comment.userPicture}
                                                                alt=""
                                                                className="w-6 h-6 rounded-full object-cover"
                                                            />
                                                        ) : (
                                                            <div className="w-6 h-6 rounded-full color-bg-grey-10" />
                                                        )}
                                                        <span className="text-xs font-semibold color-txt-main">
                                                            {comment.username || 'Unknown'}
                                                        </span>
                                                        <span className="text-xs color-txt-sub">
                                                            {comment.timestamp ? timeAgo(comment.timestamp) : ''}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm color-txt-sub whitespace-pre-wrap">
                                                        {comment.text}
                                                    </p>
                                                </div>
                                            ))
                                        )}
                                    </div>

                                    <div className="space-y-2">
                                        <textarea
                                            value={discoverCommentText}
                                            onChange={(e) => setDiscoverCommentText(e.target.value.slice(0, MAX_COMMENT))}
                                            placeholder="Was it helpful? What topic is it best for?"
                                            rows={3}
                                            className="w-full rounded-xl color-bg-grey-5 color-txt-main px-4 py-3 text-sm outline-none resize-none placeholder:color-txt-sub"
                                        />
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="text-xs color-txt-sub">
                                                {discoverCommentText.length}/{MAX_COMMENT}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={handleAddDiscoverComment}
                                                disabled={discoverCommentSubmitting || !discoverCommentText.trim() || !currentUser?.uid}
                                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl color-bg-accent color-txt-accent text-sm font-semibold hover:opacity-90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {discoverCommentSubmitting && <LuLoader size={14} className="animate-spin" />}
                                                Comment
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ==================== FRIENDS MODAL ==================== */}
            {showFriendsModal && (
                <div className="profile-modal-overlay" onClick={() => setShowFriendsModal(false)}>
                    <div className="profile-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="profile-modal-header">
                            <h2 className="profile-modal-title">Friends ({friends?.length || 0})</h2>
                            <button 
                                className="profile-modal-close"
                                onClick={() => setShowFriendsModal(false)}
                            >
                                ✕
                            </button>
                        </div>
                        <div className="profile-modal-content">
                            {friends && friends.length > 0 ? (
                                <div className="profile-friends-list">
                                    {friends.map((friend: any) => (
                                        <div 
                                            key={friend.uid}
                                            className="profile-friend-card"
                                            onClick={() => {
                                                navigate(`/viewProfile/${friend.uid}`)
                                                setShowFriendsModal(false)
                                            }}
                                        >
                                            <img 
                                                src={friend.picture} 
                                                alt={friend.username}
                                                className="profile-friend-avatar"
                                            />
                                            <div className="profile-friend-info">
                                                <div className="profile-friend-name">{friend.username}</div>
                                                <div className="profile-friend-label">{formatRankName(friend.rank)}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="profile-section-empty">No friends yet</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
