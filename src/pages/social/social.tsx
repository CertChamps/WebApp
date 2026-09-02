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
import { LuChevronDown, LuImage, LuSearch, LuUsers, LuX } from "react-icons/lu";
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
    const [composerOpen, setComposerOpen] = useState(false);
    const composerActive = composerOpen || Boolean(message.trim()) || Boolean(imagePreview);

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

            setMessage('');
            setImageFile(null);
            setImagePreview(null);
            setComposerOpen(false);
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
        setPostError('');
        setImageFile(null);
        setImagePreview(null);
        setComposerOpen(false);
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
        <div className="flex w-full h-full color-bg overflow-hidden">
            <main className="flex-1 min-w-0 h-full overflow-y-auto scrollbar-minimal">
                <div className="w-full px-6 pt-4 pb-6">
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

                    <div className="w-full mt-6">
                        <div className="rounded-2xl color-bg-grey-5 px-4 pt-3 pb-3">
                            <textarea
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                onFocus={() => setComposerOpen(true)}
                                placeholder={randomPlaceholder}
                                rows={composerActive ? 5 : 3}
                                className="w-full min-h-[5.5rem] bg-transparent color-txt-main text-[16px] leading-relaxed outline-none resize-none placeholder:color-txt-sub"
                            />
                            {imagePreview && (
                                <div className="relative w-fit mt-2 mb-3">
                                    <img
                                        src={imagePreview}
                                        alt="preview"
                                        className="h-28 rounded-xl object-cover"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setImageFile(null);
                                            setImagePreview(null);
                                        }}
                                        className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full color-bg color-txt-main cursor-pointer"
                                        aria-label="Remove image"
                                    >
                                        <LuX size={12} />
                                    </button>
                                </div>
                            )}
                            <div className="flex items-center justify-between gap-3 pt-1">
                                <div className="flex items-center gap-2 min-w-0">
                                    <label className="inline-flex items-center justify-center rounded-lg p-2 color-txt-sub hover:color-txt-main hover:color-bg-grey-10 cursor-pointer">
                                        <LuImage size={18} />
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
                                    {postError && (
                                        <p className="text-xs text-red-500 truncate">{postError}</p>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <button
                                        type="button"
                                        onClick={cancelReply}
                                        className="px-3 py-1.5 rounded-xl text-sm font-semibold color-txt-sub hover:color-txt-main cursor-pointer"
                                    >
                                        Clear
                                    </button>
                                    <button
                                        type="button"
                                        onClick={sendPost}
                                        disabled={!message.trim() && !imageFile}
                                        className="px-5 py-2 rounded-xl color-bg-accent color-txt-accent text-sm font-bold hover:opacity-90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Post
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="mt-2">
                            {posts.length === 0 ? (
                                <div className="rounded-2xl color-bg-grey-5 p-8 text-center space-y-2 mt-4">
                                    <h3 className="text-lg font-semibold color-txt-main">No posts yet</h3>
                                    <p className="text-sm color-txt-sub">Start the conversation above.</p>
                                </div>
                            ) : (
                                posts.map((post, index) => (
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
                                            imageURL={post.imageURL}
                                            onPressReplies={() => pageNavigate(`post/${post.id}`)}
                                        />
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}
