// React
import { useContext, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom";

// Components
import FriendsList from "../../components/social/FriendsList"
import PostCard from "../../components/social/PostCard"

// Hooks
import { UserContext } from '../../context/UserContext';

// Firebase
import { db }from '../../../firebase'
import { addDoc, collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, where } from 'firebase/firestore';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import FriendsSearch from "../../components/social/friendsSearch";

// CSS
import { LuImage } from "react-icons/lu";
import "../../styles/social.css"

export default function Social() { 

    // Contexts
    const { user, setUser } = useContext(UserContext);

    // Setup posts
    const [posts, setPosts] = useState<{ id: string; [key: string]: any }[]>([]);
    const [message, setMessage] = useState('');

    // Friends
    const [userFriends, setUserFriends] = useState<any[]>([])

    // Image upload
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);

    // Error handling 
    const [postError, setPostError] = useState<string | null>(null);

    // ============================ NAVIGATING BETWEEN PAGES ===================================== //
    const [page, setPage ]= useState<string>('practice')
    console.log(userFriends, page) // DELETE THIS
    const navigate = useNavigate()
    
    const pageNavigate = (page: string, options?: { state?: any }) => {
        setPage(page);
        navigate(`/${page}`, options); // pass state properly
    };

    //==========================================SEND POST DUH=====================================================//
    const sendPost = async () => {
        if (!message.trim() && !imageFile) return;
        
        // handle post length limit 
        if (message.length > 500 ) {
            setPostError('Post exceeds 500 character limit.');
            return;
        }

        try {
            let uploadedUrl: string | null = null;
            if (imageFile) {
                const storage = getStorage();
                const path = `user-uploads/${user.uid}/${Date.now()}-${imageFile.name}`;
                const imageRef = ref(storage, path);
                await uploadBytes(imageRef, imageFile);
                uploadedUrl = await getDownloadURL(imageRef);
            }
            await addDoc(collection(db, 'posts'), {
                //the follow gets added to the doc
                userId: user.uid,
                content: message.trim(),
                timestamp: serverTimestamp(),
                imageUrl: uploadedUrl,
                likes: 0,
                isFlashcard: false
            });

            setMessage(''); //reset the text box
            setImageFile(null);
            setImagePreview(null);
            console.log('Post added!');
        } catch (error) {
            console.error('Error sending post:', error);
            setPostError('Error sending post. Please try again.');
        }
    };
    //==============================================================================================================//


    
    //=============================================The usual fetch from firebase======================================
    useEffect(() => {
        // -----------------------------------FETCHING POSTS FROM DATABASE---------------------------------------//
        const fetchPostsWithUserData = async () => {
            const q = query(collection(db, 'posts'), orderBy('timestamp', 'desc'), limit(50));
  
            const unsubscribe = onSnapshot(q, async (snapshot) => {
                const postData = await Promise.all(
                    snapshot.docs.map(async (docSnap) => {
                        const post = docSnap.data();
                        const userId = post.userId;
                        const postId = docSnap.id;
  
                        //Get user data from firebase
                        const userQ = query(collection(db, 'user-data'), where('uid', '==', userId));
                        const userSnap = await getDocs(userQ);
  
                        let username = "Unknown";
                        let userImage = null;
                        let rank = 0; 
  
                        if (!userSnap.empty) {
                            const userData = userSnap.docs[0].data();
                            username = userData.username;
                            rank = userData.rank;
                            try {
                                const storage = getStorage();
                                const imageRef = ref(storage, userData.picture);
                                userImage = await getDownloadURL(imageRef);
                            } catch (err) {
                                console.warn("Image error:", err);
                            }
                        }

                        //Get reply count for the post
                        let repliesSnap = await getDocs(
                            collection(db, 'posts', postId, 'replies')
                        );

                        let replyCount = repliesSnap.size;

                        //We want to set replyCount to the amount of flashcard replies if its a flashcard thread
                        if (post.flashcardId) {
                            //If it's a flashcard, fetch the flashcard data
                            // repliesSnap = await getDocs(collection(db, 'certchamps-questions', post.flashcardId, 'replies', post.replyId, 'replies'));
                            // replyCount = repliesSnap.size;
                        }

                        return {
                            id: docSnap.id,
                            content: post.content,
                            timestamp: post.timestamp,
                            userId: userId,
                            username,
                            rank,
                            userImage,
                            imageURL: post.imageUrl,
                            replyCount, // Add reply count to the returned object
                            isFlashcard: post.isFlashcard, // Add isFlashcard property
                            flashcardId: post.flashcardId, // Add flashcardId if it exists
                            replyId: post.replyId // Add practiceReplyId if it exists
                        };
                    })
                );

            setPosts(postData);
            });
  
            return () => unsubscribe();
        };
        //-------------------------------------------------------------------------------------------------------//

        //call the actual functions
        fetchPostsWithUserData();
    }, []);
    
    useEffect(() => {
        // -----------------------------------FETCHING FRIENDS FROM DATABASE---------------------------------------//
        const fetchFriends = async () => {

            // initialise friends - avoid duplicates on refresh 
            setUserFriends([])
            console.log('debug')

            user.friends.forEach( async (friend: string) => {
                try {
                    // get data for each friends
                    const friendData = ( await getDoc(doc(db, 'user-data', friend)) ).data()

                    // get url for user profile photo
                    const storage = getStorage(); 
                    const imageRef = ref(storage, friendData?.picture);
                    const picture = await getDownloadURL(imageRef);

                    // add to user friends 
                    setUserFriends( prev => [...prev, {username: friendData?.username, picture, uid: friendData?.uid}])
                }
                catch (err) {
                    console.log(err)
                }
            })

        }
        //-------------------------------------------------------------------------------------------------------//

        // call the actual function 
        fetchFriends();

    }, [])

    useEffect(() => {
        // -----------------------------------LISTEN TO REAL TIME CHANGES OF USER---------------------------------------//
        const unsubscribe = onSnapshot( doc(db, 'user-data', user.uid), (usr) => {

            // get the user data 
            const data = usr.data();

            if (data) {
                // update user context to view changes in the app immediately 
                setUser( (prev: any) => ({
                ...prev,
                friends: data.friends ?? [],
                notifications: data.notifications ?? []
                }));
            }
            },
            // Log any errors 
            (error) => {
                console.error("Firestore listener error:", error);
            }
        );

        return () => unsubscribe();
    }, []);
    //================================================================================================================


    //====================Random placeholders for textbox======================
    const placeholders = [
        "Confess your math sins.",
        "Type like no one’s judging.",
        "Unleash your inner genius!!!",
        "Got wisdom? Spill it.",
        "Your keyboard misses you.",
        "Type away, genius!",
        "Your thoughts matter here.",
        "Share your brilliance.",
        "Type it out, let’s see!",
        "Got a thought? Type it!",
        "Your keyboard is waiting.",
        "Type like you mean it!",
        "Let your thoughts flow.",
        "Type it, we’re listening.",
        "Your keyboard is your canvas.",
        "Type your way to greatness.",
        "Tell them how you love maths..."
    ];
      
    const [randomPlaceholder, setRandomPlaceholder] = useState("");

    //This will just pick a random placeholder whenever the screen renders
    useEffect(() => {
        const randomIndex = Math.floor(Math.random() * placeholders.length);
        setRandomPlaceholder(placeholders[randomIndex]);

        // -----------------------------------LISTEN TO REAL TIME CHANGES OF USER---------------------------------------//
        const unsubscribe = onSnapshot( doc(db, 'user-data', user.uid), (usr) => {

            // get the user data 
            const data = usr.data({serverTimestamps: "estimate"});

            if (data) {
                // update user context to view changes in the app immediately 
                setUser( (prev: any) => ({
                ...prev,
                friends: data.friends ?? [],
                notifications: data.notifications ?? []
                }));
            }
            },
            // Log any errors 
            (error) => {
                console.error("Firestore listener error:", error);
            }
        );

        return () => unsubscribe();

    }, []);
    //=======================================================================

    // -----------------------------------LISTEN TO REAL TIME CHANGES OF USER---------------------------------------//
    const cancelReply = () => {
        setMessage('');
        setPostError('')
    };
    //=======================================================================


    return (
        <div className="flex w-full h-full">
            <div className="w-2/3 h-full overflow-y-scroll scrollbar-minimal">          
                <div className="compose-post-container">
                    <div className="compose-post-text-wrapper"> 
                        <img 
                            src={user.picture}
                            className="compose-post-img"
                            />
                        <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            //   onKeyDown={handleKeyDown}
                            placeholder={randomPlaceholder}
                            //rows={3}
                            className={`compose-post-text-box`}
                        />
                    </div>
            
                    <div className="flex justify-between items-center gap-2 mt-2">
                    <div className="flex items-center gap-3">
                        <label className="color-txt-sub mx-2 hover:opacity-80 cursor-pointer">
                        <LuImage size={32} strokeWidth={1.5} />
                        <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            setImageFile(f);
                            setImagePreview(URL.createObjectURL(f));
                            }}
                        />
                        </label>
                        {imagePreview && (
                        <div className="flex items-center gap-2">
                            <img
                            src={imagePreview}
                            alt="preview"
                            className="w-16 h-16 rounded object-cover border"
                            />
                            <button
                            type="button"
                            onClick={() => {
                                setImageFile(null);
                                setImagePreview(null);
                            }}
                            className="px-2 py-1 rounded bg-red-500 text-white"
                            >
                            Remove
                            </button>
                        </div>
                        )}
                    </div>
                        <div>
                            {postError && <p className="text-red-500 text-sm mr-4 inline">{postError}</p>} 
                            <button
                                type="button"
                                onClick={cancelReply}
                                className="compose-post-clear-button"
                            >
                                Clear
                            </button>
                            <button
                                type="button"
                                onClick={sendPost}
                                disabled={!message.trim()}
                                className="cursor-target compose-post-send-button"
                            >
                                Post
                            </button>
                        </div>
                    </div>

                    <div className="my-4">
                        {/* This centers the posts within the available viewport */}
                        <div className="mx-auto w-full space-y-4">
                            {posts.map((post) => (
                                <PostCard
                                    key={post.id}
                                    userId={post.userId}
                                    rank={post.rank}
                                    content={post.content}
                                    userImage={post.userImage}
                                    username={post.username}
                                    time={post.timestamp}
                                    replyCount={post.replyCount}
                                    imageURL={post.imageURL}
                                    onPressReplies={() => {
                                        if (post.isFlashcard) {
                                            // For flashcards, pass both flashcardId and replyId if available
                                            //pageNavigate("social/q_replies", { state: { id: post.id, flashcardId: post.flashcardId, replyId: post.replyId } })
                                            pageNavigate(`post/${post.id}`)
                                        } else {
                                            // For regular posts
                                            //pageNavigate("social/replies", { state: { id: post.id } })
                                            pageNavigate(`post/${post.id}`)

                                        }
                                    }}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
                <div className="flex-1 h-full flex flex-col">
                    {/* scrollable top part */}
                    <div className="flex-1 overflow-y-auto scrollbar-minimal">
                        <div className="p-3">
                        <FriendsSearch />
                        </div>
                        <FriendsList />
                    </div>

                    {/* pinned footer */}
                    <div className="h-16 w-full p-4 shrink-0 flex flex-col items-center justify-center space-y-2 hover:opacity-90 mb-15">
                        {/* PayPal Donate Button */}
                        <div
                            dangerouslySetInnerHTML={{
                            __html: `
                                <form action="https://www.paypal.com/donate" method="post" target="_top">
                                <input type="hidden" name="hosted_button_id" value="LJ8UFQY4LPL3S" />
                                <input
                                    type="submit"
                                    value="Buy us a coffee ☕"
                                    style="
                                    background-color: #ffc439;
                                    border: none;
                                    color: #111;
                                    font-weight: 600;
                                    padding: 10px 20px;
                                    border-radius: 8px;
                                    cursor: pointer;
                                    "
                                />
                                </form>
                            `,
                            }}
                        />

                        {/* Discord Button */}
                        <a
                            href="https://discord.gg/E6N8ZTugUp"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center
                                    px-4 py-2 rounded-lg cursor-pointer
                                    text-white font-medium
                                    hover:opacity-90 active:opacity-80
                                    transition-opacity"
                            style={{ backgroundColor: '#5865F2' }}
                        >
                            <svg
                            className="w-5 h-5 mr-2"
                            fill="currentColor"
                            viewBox="0 0 24 24"
                            >
                            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
                            </svg>
                            Join Discord
                        </a>

                        <p className="text-center text-sm mx-2 text-gray-300">
                            Join our Discord to report bugs or suggest features!
                        </p>
                    </div>
                </div>
        </div>
    )
}