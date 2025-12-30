import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore'
import Lottie from 'lottie-react'
import loadingAnim from '../assets/animations/loading.json'
import useFetch from "../hooks/useFetch"
import DeckCard from '../components/decks/deckCard'
import PostCard from '../components/social/PostCard'
import { db } from '../../firebase'
import '../styles/profile.css'
import '../styles/decks.css'
import '../styles/social.css'

export default function ProfileViewer() {

    const { userID } = useParams()
    const navigate = useNavigate()
    const [user, setUser] = useState<any>()
    const [friends, setFriends] = useState<any>()
    const [decks, setDecks] = useState<any>()
    const [posts, setPosts] = useState<any[]>([])
    const [showFriendsModal, setShowFriendsModal] = useState(false)
    const [activeTab, setActiveTab] = useState<'decks' | 'posts'>('decks')
    const { fetchFriends, fetchUser, fetchUserDecks } = useFetch()

    const rankNames = ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Master"]
    const formatRankName = (rank?: number) => {
        if (!rank || rank < 1) return "Unranked"
        return rankNames[Math.min(rankNames.length - 1, rank - 1)] || "Unranked"
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
            setDecks(dcks)
            setPosts(pst)
        }

        fetchInfo()
    }, [userID])

    if (!user) {
        return (
            <div className="profile-loading">
                <Lottie animationData={loadingAnim} loop={true} autoplay={true} 
                    className="h-40 w-40" />
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
                    <div className="profile-rank-badge">
                        {formatRankName(user.rank)}
                    </div>
                </div>
                <div className="profile-stats">
                    <div className="profile-stat-card">
                        <div className="profile-stat-value">{decks?.length || 0}</div>
                        <div className="profile-stat-label">Decks</div>
                    </div>
                    <div 
                        className="profile-stat-card cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => setShowFriendsModal(true)}
                    >
                        <div className="profile-stat-value">{friends?.length || 0}</div>
                        <div className="profile-stat-label">Friends</div>
                    </div>
                    <div className="profile-stat-card">
                        <div className="profile-stat-value">{(user.xp || 0).toLocaleString()}</div>
                        <div className="profile-stat-label">XP</div>
                    </div>
                </div>
            </div>

            {/* ==================== TABS ==================== */}
            <div className="profile-tabs">
                <button
                    className={`profile-tab ${activeTab === 'decks' ? 'profile-tab-active' : ''}`}
                    onClick={() => setActiveTab('decks')}
                >
                    Decks
                </button>
                <button
                    className={`profile-tab ${activeTab === 'posts' ? 'profile-tab-active' : ''}`}
                    onClick={() => setActiveTab('posts')}
                >
                    Posts
                </button>
            </div>

            {/* ==================== DECKS SECTION ==================== */}
            {activeTab === 'decks' && (
                <div className='p-4'>
                    {decks && decks.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {decks.map((deck: any) => (
                                <DeckCard key={deck.id} deck={deck} />
                            ))}
                        </div>
                    ) : (
                        <p className="color-txt-sub">No decks created yet</p>
                    )}
                </div>
            )}

            {/* ==================== POSTS SECTION ==================== */}
            {activeTab === 'posts' && (
                <div className="p-4">
                    {posts && posts.length > 0 ? (
                        <div className="space-y-4">
                            {posts.map((post: any) => (
                                <PostCard
                                    key={post.id}
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