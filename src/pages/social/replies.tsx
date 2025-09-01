// React
import { useContext, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

// Components
import FriendsBar from "../../components/social/FriendsList";

// Firebase
import { db, storage } from "../../../firebase";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";


// Contexts
import { UserContext } from "../../context/UserContext"

export default function Replies() {
  // Passing between files
  const { state } = useLocation() as { state?: { id?: string } };
  const id = state?.id;

  // Setup replies
  const [post, setPost] = useState<any>(null);
  const [replies, setReplies] = useState<any[]>([]);
  const [newReply, setNewReply] = useState('');
  const [displayImageUrl, setDisplayImageUrl] = useState<string | null>(null);

  // Contexts
  const { user } = useContext(UserContext);

  //====================FETCH POST======================
  useEffect(() => {
    setDisplayImageUrl(null) // DELTE THIS  
    const fetchPost = async () => {
      if (!id) return;

      const postRef = doc(db, "posts", id);
      const postSnap = await getDoc(postRef);
      if (!postSnap.exists()) return;

      const postData = postSnap.data();

      // Fetch author profile
      let username = "Unknown";
      let userImage: string | null = null;
      try {
        const userQ = query(
          collection(db, "user-data"),
          where("uid", "==", postData.userId)
        );
        const userSnap = await getDocs(userQ);
        if (!userSnap.empty) {
          const u = userSnap.docs[0].data();
          username = u.username ?? "Unknown";
          if (u.picture) {
            userImage = await getDownloadURL(ref(storage, u.picture));
          }
        }
      } catch (e) {
        console.warn("Failed to load author profile:", e);
      }

      setPost({
        id: postSnap.id,
        ...postData,
        username,
        userImage,
      });
    };

    fetchPost();
  }, [id]);
  //====================================================

  //====================FETCH REPLIES======================
  useEffect(() => {
    if (!id) return;

    const q = query(
      collection(db, "posts", id, "replies"),
      orderBy("timestamp", "asc")
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const replyData = await Promise.all(
        snapshot.docs.map(async (docSnap) => {
          const reply = docSnap.data();
          const userId = reply.userId;

          // Fetch reply author
          const userQ = query(
            collection(db, "user-data"),
            where("uid", "==", userId)
          );
          const userSnap = await getDocs(userQ);

          let username = "Unknown";
          let userImage = null;

          if (!userSnap.empty) {
            const userData = userSnap.docs[0].data();
            username = userData.username;
            try {
              userImage = await getDownloadURL(ref(storage, userData.picture));
            } catch (err) {
              console.warn("Image error:", err);
            }
          }

          return {
            id: docSnap.id,
            content: reply.content,
            timestamp: reply.timestamp,
            username,
            userImage,
          };
        })
      );

      setReplies(replyData);
    });

    return () => unsubscribe();
  }, [id]);
  //=======================================================

  //====================SEND REPLY======================
  const handleSendReply = async () => {
    if (!newReply.trim()) return;
  
    try {
      await addDoc(collection(db, 'posts', Array.isArray(id) ? id[0] : id, 'replies'), {
        content: newReply.trim(),
        timestamp: serverTimestamp(),
        userId: user.uid,
      });
  
      setNewReply('');
      console.log('Reply sent successfully!');
    } catch (error) {
      console.error('Error sending reply:', error);
    }
  };
  //====================================================


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

// State for placeholder
const [randomPlaceholder, setRandomPlaceholder] = useState("");

//This will just pick a random placeholder whenever the screen renders
useEffect(() => {
    const randomIndex = Math.floor(Math.random() * placeholders.length);
    setRandomPlaceholder(placeholders[randomIndex]);
}, []);
//=======================================================================

  // Date
  const formattedDate =
    post?.timestamp?.toDate?.()?.toLocaleDateString() ?? "Unknown date";

  return (
    <div className="flex w-full">
      <div className="flex-1 p-4">
        {/* Original Post */}
        {post && (
          <div className="bg-white p-4 mb-4 rounded">
            <div className="flex items-center mb-3">
              {post.userImage && (
                <img
                  src={post.userImage}
                  alt={post.username}
                  className="w-10 h-10 rounded-full mr-3 object-cover"
                />
              )}
              <span className="font-bold">{post.username}</span>
            </div>
            <p className="mb-2">{post.content}</p>
            {displayImageUrl && (
              <img
                src={displayImageUrl}
                alt="Post content"
                className="w-full max-w-lg rounded-lg object-cover"
              />
            )}
            <div className="text-sm text-gray-500">{formattedDate}</div>
          </div>
        )}

        {/* Replies */}
        <h2 className="text-lg font-semibold mb-2">Replies</h2>
        {replies.length > 0 ? (
          replies.map((reply) => (
            <div
              key={reply.id}
              className="p-3 rounded mb-2"
            >
              <div className="flex items-center mb-2">
                {reply.userImage && (
                  <img
                    src={reply.userImage}
                    alt={reply.username}
                    className="w-8 h-8 rounded-full mr-2 object-cover"
                  />
                )}
                <span className="font-semibold">{reply.username}</span>
              </div>
              <p>{reply.content}</p>
            </div>
          ))
        ) : (
          <p>No replies yet.</p>
        )}

        <div className="sticky bottom-0 left-0 border-t border-light-grey dark:border-grey bg-white dark:bg-black p-3 z-10">
        <textarea
          value={newReply}
          onChange={(e) => setNewReply(e.target.value)}
          //   onKeyDown={handleKeyDown}
          placeholder={randomPlaceholder}
          rows={3}
          className="w-full p-3 rounded-xl border-2 border-light-grey dark:border-grey bg-button dark:bg-button-dark text-black dark:text-white focus:outline-none resize-none"
        />
            
        <div className="flex justify-end gap-2 mt-2">
          <button
            type="button"
            // onClick={cancelReply}
            className="px-3 py-1 txt-sub text-grey dark:text-light-grey hover:text-black dark:hover:text-white"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={handleSendReply}
            disabled={!newReply.trim()}
            className="px-4 py-2 rounded-xl bg-blue text-white disabled:opacity-50 hover:bg-blue-light"
          >
            Send
          </button>
        </div>
      </div>
      
      </div>
    </div>
  );
}