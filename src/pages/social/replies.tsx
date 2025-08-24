// Replies.tsx
import { useEffect, useState } from "react";
import FriendsBar from "../../components/social/FriendsBar";
import { db, storage } from "../../../firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";
import { useLocation } from "react-router-dom";

export default function Replies() {
  const { state } = useLocation() as { state?: { id?: string } };
  const id = state?.id;

  const [post, setPost] = useState<any>(null);
  const [displayImageUrl, setDisplayImageUrl] = useState<string | null>(null);

  useEffect(() => {
    const fetchPost = async () => {
      if (!id) return;

      const postRef = doc(db, "posts", id);
      const postSnap = await getDoc(postRef);
      if (!postSnap.exists()) return;

      const postData = postSnap.data();

      // Fetch author profile from user-data (like you do in Social)
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
        ...postData, // includes content, timestamp, imageUrl, etc.
        username,
        userImage,
      });
    };

    fetchPost();
  }, [id]);

  // Load attached post image (note: imageUrl, not imageURL)
  useEffect(() => {
    const run = async () => {
      if (!post?.imageUrl) {
        setDisplayImageUrl(null);
        return;
      }
      try {
        const url = await getDownloadURL(ref(storage, post.imageUrl));
        setDisplayImageUrl(url);
      } catch (err) {
        console.error("Error fetching image:", err);
        setDisplayImageUrl(null);
      }
    };
    run();
  }, [post?.imageUrl]);

  const formattedDate =
    post?.timestamp?.toDate?.()?.toLocaleDateString() ?? "Unknown date";

  return (
    <div className="flex w-full">
      <div className="w-64 overflow-y-auto">
        <FriendsBar />
      </div>

      <div className="bg-white p-4 mb-4 w-full">
        <div className="flex items-center mb-3">
          {post?.userImage && (
            <img
              src={post.userImage}
              alt={post?.username ?? "User"}
              className="w-10 h-10 rounded-full mr-3 object-cover border border-light-grey dark:border-grey"
            />
          )}
          <span className="txt-bold text-black dark:text-white">
            {post?.username ?? "Unknown"}
          </span>
        </div>

        <div className="mb-3">
          <p className="txt text-black dark:text-white mb-2">
            {post?.content}
          </p>
          {displayImageUrl && (
            <img
              src={displayImageUrl}
              alt="Post content"
              className="w-full max-w-lg rounded-lg object-cover border border-light-grey dark:border-grey"
            />
          )}
        </div>

        <div className="flex justify-between items-center text-grey dark:text-light-grey txt-sub">
          <span>{formattedDate}</span>
        </div>
      </div>
    </div>
  );
}