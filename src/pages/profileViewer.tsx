import { useEffect, useState, useContext } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore'
import useFetch from "../hooks/useFetch"
import PostCard from '../components/social/PostCard'
import { db } from '../../firebase'
import { UserContext } from '../context/UserContext'
import '../styles/profile.css'
import '../styles/decks.css'
import '../styles/social.css'
import ActivityHeatmap from '../components/profile/ActivityHeatmap'

export default function ProfileViewer() {

    const { userID } = useParams()
    const navigate = useNavigate()
    const { user: currentUser } = useContext(UserContext)
    const [user, setUser] = useState<any>()
    const [friends, setFriends] = useState<any>()
    const [decks, setDecks] = useState<any>()
    const [posts, setPosts] = useState<any[]>([])
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

    useEffect(() => {
        const fetchInfo = async () => {
            const usr = await fetchUser(userID)
            const frnds = await fetchFriends(userID)
            const dcks = await fetchUserDecks(userID)
            const pst = await fetchUserPosts(userID)
            
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
        }

        fetchInfo()
    }, [userID, currentUser?.uid])

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

            {/* ==================== POSTS SECTION ==================== */}
            <div className="p-4">
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