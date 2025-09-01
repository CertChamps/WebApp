// React
import { useContext, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

// Components
import '../../styles/social.css'

// Firebase
import { db, storage } from "../../../firebase";
import { collection,getDocs, onSnapshot, orderBy, query, where, doc, getDoc, serverTimestamp, addDoc,} from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";

// Contexts
import { UserContext } from "../../context/UserContext"

export default function QReplies() {
  // Passing between files
  const { state } = useLocation() as {
    state?: { id?: string; flashcardId?: string; replyId?: string };
  };
  const flashcardId = state?.flashcardId;
  const replyId = state?.replyId;

  // Setup replies
  const [replies, setReplies] = useState<any[]>([]);
  const [author, setAuthor] = useState<{
    username: string;
    userImage: string | null;
  }>({
    username: "Unknown",
    userImage: null,
  });
  const [newReply, setNewReply] = useState('');

  // Contexts
  const { user } = useContext(UserContext);

  // ================= Fetch the "parent reply" to get its author =================
  useEffect(() => {
    const fetchAuthor = async () => {
      if (!flashcardId || !replyId) return;

      try {
        // Get the parent reply doc
        const parentReplyRef = doc(
          db,
          "certchamps-questions",
          flashcardId,
          "replies",
          replyId
        );
        const parentSnap = await getDoc(parentReplyRef);

        if (parentSnap.exists()) {
          const parentData = parentSnap.data();
          const userId = parentData.userId;

          // Fetch user profile using `id` (userId)
          const userQ = query(
            collection(db, "user-data"),
            where("uid", "==", userId)
          );
          const userSnap = await getDocs(userQ);

          if (!userSnap.empty) {
            const u = userSnap.docs[0].data();
            let userImage: string | null = null;
            if (u.picture) {
              try {
                userImage = await getDownloadURL(ref(storage, u.picture));
              } catch (err) {
                console.warn("Image error:", err);
              }
            }

            setAuthor({
              username: u.username ?? "Unknown",
              userImage,
            });
          }
        }
      } catch (err) {
        console.error("Error fetching parent reply author:", err);
      }
    };

    fetchAuthor();
  }, [flashcardId, replyId]);
  // ==============================================================================


  // ================= Fetch nested replies in real-time =================
  useEffect(() => {
    if (!flashcardId || !replyId) return;

    const q = query(
      collection(
        db,
        "certchamps-questions",
        flashcardId,
        "replies",
        replyId,
        "replies"
      ),
      orderBy("timestamp", "asc")
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const replyData = await Promise.all(
        snapshot.docs.map(async (docSnap) => {
          const reply = docSnap.data();
          const userId = reply.userId;

          // Fetch reply author using `id` (userId)
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
  }, [flashcardId, replyId]);
  // =====================================================================


  //=========================SENDING THE REPLY=================================================
  const handleSendReply = async () => {
    if (!newReply.trim()) return;

    try {
      await addDoc(
        collection(
          db,
          'certchamps-questions',
          flashcardId!,
          'replies',
          replyId!,
          'replies'
        ),
        {
          content: newReply.trim(),
          timestamp: serverTimestamp(),
          userId: user.uid,
        }
      );

      setNewReply('');
      console.log('Sub-reply sent successfully!');
    } catch (error) {
      console.error('Error sending sub-reply:', error);
    }
  };
  //===========================================================================================

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

  return (
    <div className="flex justify-center w-full">
      <div className="w-2/3">
        {/* Flashcard Question (just show ID + author info) */}
        <div className="bg-white p-4 mb-4rounded">
          <div className="flex items-center mb-3">
            {author.userImage && (
              <img
                src={author.userImage}
                alt={author.username}
                className="w-10 h-10 rounded-full mr-3 object-cover"
              />
            )}
            <span className="font-bold">{author.username}</span>
          </div>
          <p>Flashcard Question ID: {flashcardId}</p>
        </div>

        {/* Replies */}
        <h2 className="text-lg font-semibold mb-2">Replies</h2>
        {replies.length > 0 ? (
          replies.map((reply) => (
            <div
              key={reply.id}
              className="p-3 border rounded mb-2 bg-gray-50 dark:bg-gray-800"
            >
              <div className="flex items-center mb-2">
                {reply.userImage && (
                  <img
                    src={reply.userImage}
                    alt={reply.username}
                    className="w-8 h-8 rounded-full mr-2 object-cover border"
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