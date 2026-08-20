// React
import { useContext, useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom";

// Components
import PostCard from "../../components/social/PostCard"
import NotificationBell from "../../components/social/NotificationBell";

// Hooks
import { UserContext } from '../../context/UserContext';

// Firebase
import { db }from '../../../firebase'
import { addDoc, collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, where } from 'firebase/firestore';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';

// CSS
import { LuChevronDown, LuImage, LuSearch, LuUsers } from "react-icons/lu";
import "../../styles/social.css"
import ProGate from "../../components/ProGate"
import { canUseAceFeature } from "../../lib/contentAccess";

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
    const pageMenuRef = useRef<HTMLDivElement | null>(null);
    const [pageMenuOpen, setPageMenuOpen] = useState(false);

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

    useEffect(() => {
        function handleOutside(e: MouseEvent) {
            if (pageMenuRef.current && !pageMenuRef.current.contains(e.target as Node)) {
                setPageMenuOpen(false);
            }
        }
        document.addEventListener("mousedown", handleOutside);
        return () => document.removeEventListener("mousedown", handleOutside);
    }, []);
    //=======================================================================

    // -----------------------------------LISTEN TO REAL TIME CHANGES OF USER---------------------------------------//
    const cancelReply = () => {
        setMessage('');
        setPostError('')
    };
    //=======================================================================


    if (!canUseAceFeature(user, "social")) {
        return (
            <div className="relative flex w-full h-full overflow-hidden">
                <div className="flex w-full h-full filter blur-[2px] pointer-events-none select-none opacity-85">
                    <div className="w-full h-full p-6 space-y-4">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="rounded-xl color-bg-grey-5 p-6 space-y-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full color-bg-grey-10" />
                                    <div className="h-3 w-24 rounded color-bg-grey-10" />
                                </div>
                                <div className="h-3 w-full rounded color-bg-grey-10" />
                                <div className="h-3 w-3/4 rounded color-bg-grey-10" />
                            </div>
                        ))}
                    </div>
                </div>
                <ProGate />
            </div>
        );
    }

    return (
        <div className="flex w-full h-full">
            <div className="flex-1 min-w-0 h-full overflow-y-scroll scrollbar-minimal">
                <div className="px-6 pt-4 pb-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div ref={pageMenuRef} className="relative">
                            <h1 className="text-3xl sm:text-4xl font-black leading-none color-txt-main">
                                <button
                                    type="button"
                                    onClick={() => setPageMenuOpen((open) => !open)}
                                    aria-expanded={pageMenuOpen}
                                    aria-haspopup="listbox"
                                    aria-label="Switch community page"
                                    className="inline-flex items-center gap-2 cursor-pointer"
                                >
                                    Discussion
                                    <LuChevronDown
                                        size={22}
                                        className={`color-txt-sub transition-transform duration-200 ${pageMenuOpen ? "rotate-180" : ""}`}
                                    />
                                </button>
                            </h1>
                            {pageMenuOpen && (
                                <div
                                    role="listbox"
                                    className="absolute left-0 top-full mt-2 z-20 min-w-[12rem] rounded-xl color-bg shadow-md border border-color-border p-1.5 flex flex-col gap-1"
                                >
                                    <button
                                        type="button"
                                        role="option"
                                        aria-selected={false}
                                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg color-txt-sub hover:color-txt-main hover:color-bg-grey-5 text-sm font-semibold cursor-pointer"
                                        onClick={() => {
                                            setPageMenuOpen(false);
                                            navigate("/discover");
                                        }}
                                    >
                                        <LuSearch size={15} />
                                        Discover
                                    </button>
                                    <button
                                        type="button"
                                        role="option"
                                        aria-selected
                                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg color-bg-accent color-txt-accent text-sm font-semibold cursor-pointer"
                                        onClick={() => setPageMenuOpen(false)}
                                    >
                                        <LuUsers size={15} />
                                        Discussion
                                    </button>
                                </div>
                            )}
                        </div>
                        <NotificationBell />
                    </div>
                </div>
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
        </div>
    )
}
