// React
import { useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

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
import {
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";

// Contexts
import { UserContext } from "../../context/UserContext";

// Types
type PostDoc = {
  id: string;
  userId: string;
  content: string;
  timestamp: any;
  username: string;
  userImage: string | null;
  imageUrl?: string | null;
  isFlashcard?: boolean;
  flashcardId?: string;
  replyId?: string;
};

type ReplyDoc = {
  id: string;
  content: string;
  timestamp: any;
  username: string;
  userImage: string | null;
  imageUrl?: string | null;
};

export default function Replies() {
  // Passing to file
  const { state } = useLocation() as { state?: { id?: string } };
  const id = state?.id;

  // Contexts
  const { user } = useContext(UserContext);

  // Posts
  const [post, setPost] = useState<PostDoc | null>(null);
  const [replies, setReplies] = useState<ReplyDoc[]>([]);
  const [newReply, setNewReply] = useState("");
  const [attach, setAttach] = useState<File | null>(null);
  const [attachPreview, setAttachPreview] = useState<string | null>(null);

  // Flashcard context (only when isFlashcard)
  const [fcAuthor, setFcAuthor] = useState<{
    username: string;
    userImage: string | null;
  } | null>(null);
  const [question, setQuestion] = useState<any>(null);



  //==================== Used to fetch profile id (used throughout) ======================
  const fetchProfileByUid = async (uid: string) => {
    const userQ = query(collection(db, "user-data"), where("uid", "==", uid));
    const userSnap = await getDocs(userQ);
    if (userSnap.empty) return { username: "Unknown", userImage: null };
    const u = userSnap.docs[0].data();
    let userImage: string | null = null;
    try {
      if (u.picture) userImage = await getDownloadURL(ref(storage, u.picture));
    } catch {
      userImage = null;
    }
    return { username: u.username ?? "Unknown", userImage };
  };
  //======================================================================================



  //==================== Get URL path ======================
  const pathToUrl = async (p?: string | null) => {
    if (!p) return null;
    if (p.startsWith("http")) return p; // already a URL
    try {
      return await getDownloadURL(ref(storage, p));
    } catch (e) {
      console.warn("image url error", p, e);
      return null;
    }
  };
  //========================================================



  //==================== Load social post ======================
  useEffect(() => {
    const run = async () => {
      if (!id) return;

      const postRef = doc(db, "posts", id);
      const snap = await getDoc(postRef);
      if (!snap.exists()) return;
      const data = snap.data();

      const profile = await fetchProfileByUid(data.userId);

      const imageUrl = await pathToUrl(data.imageUrl);

      setPost({
        id: snap.id,
        userId: data.userId,
        content: data.content ?? "",
        timestamp: data.timestamp,
        username: profile.username,
        userImage: profile.userImage,
        imageUrl,                      // now a real URL
        isFlashcard: !!data.isFlashcard,
        flashcardId: data.flashcardId,
        replyId: data.replyId,
      });
    };
    run();
  }, [id]);
  //============================================================



  //==========If it's a flashcard post, fetch the context (author of the parent reply + the question)========
  useEffect(() => {
    const run = async () => {
      if (!post?.isFlashcard || !post.flashcardId || !post.replyId) {
        setFcAuthor(null);
        setQuestion(null);
        return;
      }
  
      // Parent reply author
      try {
        const parentRef = doc(
          db,
          "certchamps-questions",
          post.flashcardId,
          "replies",
          post.replyId
        );
        const parentSnap = await getDoc(parentRef);
        if (parentSnap.exists()) {
          const parentData = parentSnap.data();
          const profile = await fetchProfileByUid(parentData.userId);
          setFcAuthor(profile);
        }
      } catch {
        setFcAuthor(null);
      }
  
      // Fetch the actual question + image parts
      const parts = await fetchFlashcardContent(post.flashcardId);
      setQuestion(parts);
    };
  
    run();
  }, [post?.isFlashcard, post?.flashcardId, post?.replyId]);
  //=========================================================================================================



  //=====================Subscribe to replies (switch collection by isFlashcard)=============================
  useEffect(() => {
    if (!id || post === null) return;

    let unsub = () => {};
    const wire = async () => {
      if (post?.isFlashcard && post.flashcardId && post.replyId) {
        const qy = query(
          collection(
            db,
            "certchamps-questions",
            post.flashcardId,
            "replies",
            post.replyId,
            "replies"
          ),
          orderBy("timestamp", "asc")
        );

        unsub = onSnapshot(qy, async (snapshot) => {
          const rows = await Promise.all(
            snapshot.docs.map(async (d) => {
              const r = d.data();
              const profile = await fetchProfileByUid(r.userId);
              const img = await pathToUrl(r.imageUrl);
              return {
                id: d.id,
                content: r.content ?? "",
                timestamp: r.timestamp,
                username: profile.username,
                userImage: profile.userImage,
                imageUrl: img,                 // resolved URL
              } as ReplyDoc;
            })
          );
          setReplies(rows);
        });
      } else {
        const qy = query(
          collection(db, "posts", id, "replies"),
          orderBy("timestamp", "asc")
        );

        unsub = onSnapshot(qy, async (snapshot) => {
          const rows = await Promise.all(
            snapshot.docs.map(async (d) => {
              const r = d.data();
              const profile = await fetchProfileByUid(r.userId);
              const img = await pathToUrl(r.imageUrl);
              return {
                id: d.id,
                content: r.content ?? "",
                timestamp: r.timestamp,
                username: profile.username,
                userImage: profile.userImage,
                imageUrl: img,                 // resolved URL
              } as ReplyDoc;
            })
          );
          setReplies(rows);
        });
      }
    };

    wire();
    return () => unsub();
  }, [id, post]);
  //=========================================================================================================



  //=========================Upload helper==============================
  const uploadAttachment = async (file: File) => {
    const path = `user-uploads/${user.uid}/${Date.now()}-${file.name}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
  };
  //====================================================================



  //==================Send reply (handles both modes)===================
  const handleSendReply = async () => {
    const text = newReply.trim();
    if (!text && !attach) return;

    let imageUrl: string | null = null;
    if (attach) imageUrl = await uploadAttachment(attach);

    const payload: any = {
      content: text,
      timestamp: serverTimestamp(),
      userId: user.uid,
    };
    if (imageUrl) payload.imageUrl = imageUrl;

    if (post?.isFlashcard && post.flashcardId && post.replyId) {
      await addDoc(
        collection(
          db,
          "certchamps-questions",
          post.flashcardId,
          "replies",
          post.replyId,
          "replies"
        ),
        payload
      );
    } else if (id) {
      await addDoc(collection(db, "posts", id, "replies"), payload);
    }

    setNewReply("");
    setAttach(null);
    setAttachPreview(null);
  };
  //====================================================================

  

  const fetchFlashcardContent = async (flashcardId: string) => {
    const contentRef = collection(db, "certchamps-questions", flashcardId, "content");
    const snap = await getDocs(contentRef);
  
    const partsRaw = snap.docs
      .map((doc) => ({
        id: doc.id,
        question: doc.data().question ?? "",
        image: doc.data().image ?? "",
        rendered: doc.data().rendered ?? "", // optional
        answer: Array.isArray(doc.data().answer) ? doc.data().answer : [],
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  
    // resolve to download URLs
    const parts = await Promise.all(
      partsRaw.map(async (p) => ({
        ...p,
        image: (await pathToUrl(p.image)) ?? "",
        rendered: (await pathToUrl(p.rendered)) ?? "",
      }))
    );
  
    return parts;
  };



  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setAttach(f);
    setAttachPreview(URL.createObjectURL(f));
  };

  const formattedDate = useMemo(
    () => post?.timestamp?.toDate?.()?.toLocaleDateString() ?? "Unknown date",
    [post?.timestamp]
  );



  return (
    <div className="flex w-full">
      <div className="flex-1 p-4">
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

            {/* Flashcard context (optional header when isFlashcard) */}
            {post.isFlashcard && (
              <div className="mb-3 p-3 rounded bg-gray-50">
                <div className="flex items-center mb-2">
                  {fcAuthor?.userImage && (
                    <img
                      src={fcAuthor.userImage}
                      alt={fcAuthor.username}
                      className="w-8 h-8 rounded-full mr-2 object-cover"
                    />
                  )}
                  <span className="font-semibold">
                    {fcAuthor?.username ?? "Unknown"}
                  </span>
                </div>
                {Array.isArray(question) && question.length > 0 && (
                  <div className="mb-3 p-3 rounded bg-gray-50">
                    {question.map((part, idx) => (
                      <div key={part.id} className="mb-4">
                        <p className="font-semibold">Part {idx + 1}</p>
                        <p className="mb-2">{part.question}</p>
                        {part.image && (
                          <img
                            src={part.image}
                            alt={`Question part ${idx + 1}`}
                            className="w-full max-w-lg rounded-lg object-cover"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Original post body */}
            <p className="mb-2">{post.content}</p>
            {!post.isFlashcard && post.imageUrl && (
              <img
                src={post.imageUrl}
                alt="Post content"
                className="w-full max-w-lg rounded-lg object-cover"
              />
            )}
            <div className="text-sm text-gray-500">{formattedDate}</div>
          </div>
        )}

        <h2 className="text-lg font-semibold mb-2">Replies</h2>
        {replies.length > 0 ? (
          replies.map((reply) => (
            <div key={reply.id} className="p-3 rounded mb-2">
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
              <p className="mb-2">{reply.content}</p>
              {reply.imageUrl && (
                <img
                  src={reply.imageUrl}
                  alt="Reply attachment"
                  className="w-full max-w-md rounded-lg object-cover"
                />
              )}
            </div>
          ))
        ) : (
          <p>No replies yet.</p>
        )}

        {/* Composer */}
        <div className="sticky bottom-0 left-0 border-t border-light-grey dark:border-grey bg-white dark:bg-black p-3 z-10">
          <textarea
            value={newReply}
            onChange={(e) => setNewReply(e.target.value)}
            placeholder="Share your brilliance..."
            rows={3}
            className="w-full p-3 rounded-xl border-2 border-light-grey dark:border-grey bg-button dark:bg-button-dark text-black dark:text-white focus:outline-none resize-none"
          />
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept="image/*"
                onChange={onPickFile}
              />
              {attachPreview && (
                <div className="flex items-center gap-2">
                  <img
                    src={attachPreview}
                    alt="preview"
                    className="w-16 h-16 rounded object-cover border"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setAttach(null);
                      setAttachPreview(null);
                    }}
                    className="px-2 py-1 rounded bg-red-500 text-white"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setNewReply("");
                  setAttach(null);
                  setAttachPreview(null);
                }}
                className="px-3 py-1 txt-sub text-grey dark:text-light-grey hover:text-black dark:hover:text-white"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleSendReply}
                disabled={!newReply.trim() && !attach}
                className="px-4 py-2 rounded-xl bg-blue text-white disabled:opacity-50 hover:bg-blue-light"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}