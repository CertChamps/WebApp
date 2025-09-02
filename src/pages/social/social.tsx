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
import { addDoc, collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, serverTimestamp, where } from 'firebase/firestore';
import { getDownloadURL, getStorage, ref } from 'firebase/storage';
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
        if (!message.trim()) return; //.trim() removes whitespace so this just checks if the textbox has text in it if not it returns

        try {
            await addDoc(collection(db, 'posts'), {
                //the follow gets added to the doc
                userId: user.uid,
                content: message.trim(),
                timestamp: serverTimestamp(),
                imageUrl: null,
                likes: 0,
                isFlashcard: false
              });

            setMessage(''); //reset the text box
            console.log('Post added!');
            } catch (error) {
            console.error('Error sending post:', error);
        }
    };
    //==============================================================================================================//

    //=============================================The usual fetch from firebase======================================
    useEffect(() => {
        // -----------------------------------FETCHING POSTS FROM DATABASE---------------------------------------//
        const fetchPostsWithUserData = async () => {
            const q = query(collection(db, 'posts'), orderBy('timestamp', 'desc'));
  
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
                            repliesSnap = await getDocs(collection(db, 'certchamps-questions', post.flashcardId, 'replies', post.replyId, 'replies'));
                            replyCount = repliesSnap.size;
                        }

                        return {
                            id: docSnap.id,
                            content: post.content,
                            timestamp: post.timestamp,
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
    };
    //=======================================================================


    return (
        <div className="flex w-full h-full">
            <div className="w-2/3 h-full overflow-y-scroll">          
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
                        <LuImage size={32} strokeWidth={1.5} className="color-txt-sub mx-2 hover:opacity-80 cursor-pointer" />
                        <div>
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
                                            pageNavigate("social/q_replies", { state: { id: post.id, flashcardId: post.flashcardId, replyId: post.replyId } })
                                        } else {
                                            // For regular posts
                                            pageNavigate("social/replies", { state: { id: post.id } })
                                        }
                                    }}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
            <div className="flex-1 h-full" >
                {/* Sidebar with friends search */}
                <div className="w-auto p-3">
                    <FriendsSearch />
                </div>

                <FriendsList />
            </div>
        </div>
    )
}