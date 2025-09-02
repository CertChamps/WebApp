import { useContext, useEffect, useState } from "react";
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
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "../../firebase";
import { UserContext } from "../context/UserContext";


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

export function useReplies(id: string) {
  //const { state } = useLocation() as { state?: { id?: string } };
  //const id = state?.id;
  const { user } = useContext(UserContext);
  
  const [post, setPost] = useState<PostDoc | null>(null);
  const [replies, setReplies] = useState<ReplyDoc[]>([]);
  const [newReply, setNewReply] = useState("");
  const [attach, setAttach] = useState<File | null>(null);
  const [attachPreview, setAttachPreview] = useState<string | null>(null);

  const [fcAuthor, setFcAuthor] = useState<{ username: string; userImage: string | null } | null>(null);
  const [question, setQuestion] = useState<any>(null);

  
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

    useEffect(() => {
        const randomIndex = Math.floor(Math.random() * placeholders.length);
        setRandomPlaceholder(placeholders[randomIndex]);
    }, [])
    // =========================================================================


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

  const pathToUrl = async (p?: string | null) => {
    if (!p) return null;
    if (p.startsWith("http")) return p;
    try {
      return await getDownloadURL(ref(storage, p));
    } catch {
      return null;
    }
  };

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
        imageUrl,
        isFlashcard: !!data.isFlashcard,
        flashcardId: data.flashcardId,
        replyId: data.replyId,
      });
    };
    run();
  }, [id]);

  useEffect(() => {
    const run = async () => {
      if (!post?.isFlashcard || !post.flashcardId || !post.replyId) {
        setFcAuthor(null);
        setQuestion(null);
        return;
      }
      try {
        const parentRef = doc(db, "certchamps-questions", post.flashcardId, "replies", post.replyId);
        const parentSnap = await getDoc(parentRef);
        if (parentSnap.exists()) {
          const parentData = parentSnap.data();
          const profile = await fetchProfileByUid(parentData.userId);
          setFcAuthor(profile);
        }
      } catch {
        setFcAuthor(null);
      }
      const parts = await fetchFlashcardContent(post.flashcardId);
      setQuestion(parts);
    };
    run();
  }, [post?.isFlashcard, post?.flashcardId, post?.replyId]);

  useEffect(() => {
    if (!id || post === null) return;
    let unsub = () => {};
    const wire = async () => {
      if (post?.isFlashcard && post.flashcardId && post.replyId) {
        const qy = query(
          collection(db, "certchamps-questions", post.flashcardId, "replies", post.replyId, "replies"),
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
                imageUrl: img,
              } as ReplyDoc;
            })
          );
          setReplies(rows);
        });
      } else {
        const qy = query(collection(db, "posts", id, "replies"), orderBy("timestamp", "desc"));
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
                imageUrl: img,
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

  const uploadAttachment = async (file: File) => {
    const path = `user-uploads/${user.uid}/${Date.now()}-${file.name}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
  };

  const handleSendReply = async () => {
    const text = newReply.trim();
    if (!text && !attach) return;
    let imageUrl: string | null = null;
    if (attach) imageUrl = await uploadAttachment(attach);
    const payload: any = { content: text, timestamp: serverTimestamp(), userId: user.uid };
    if (imageUrl) payload.imageUrl = imageUrl;
    if (post?.isFlashcard && post.flashcardId && post.replyId) {
      await addDoc(collection(db, "certchamps-questions", post.flashcardId, "replies", post.replyId, "replies"), payload);
    } else if (id) {
      await addDoc(collection(db, "posts", id, "replies"), payload);
    }
    setNewReply("");
    setAttach(null);
    setAttachPreview(null);
  };

  const fetchFlashcardContent = async (flashcardId: string) => {
    const contentRef = collection(db, "certchamps-questions", flashcardId, "content");
    const snap = await getDocs(contentRef);
    const partsRaw = snap.docs
      .map((doc) => ({
        id: doc.id,
        question: doc.data().question ?? "",
        image: doc.data().image ?? "",
        rendered: doc.data().rendered ?? "",
        answer: Array.isArray(doc.data().answer) ? doc.data().answer : [],
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
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


  return {
    post,
    replies,
    newReply,
    setNewReply,
    attachPreview,
    setAttach,
    setAttachPreview,
    onPickFile,
    handleSendReply,
    fcAuthor,
    question,
    randomPlaceholder
  };
}
