import { Timestamp, arrayUnion, doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";

export type PostNotificationType =
  | "post-comment"
  | "post-rating"
  | "post-removed"
  | "post-rejected";

export async function notifyUser(
  uid: string | null | undefined,
  notification: Record<string, unknown>
) {
  if (!uid) return;
  try {
    await updateDoc(doc(db, "user-data", uid), {
      notifications: arrayUnion({
        ...notification,
        timestamp: Timestamp.now(),
      }),
    });
  } catch (err) {
    console.warn("Failed to send notification:", err);
  }
}

export function notifyPostOwner({
  ownerId,
  actorId,
  type,
  postId,
  postTitle,
}: {
  ownerId?: string | null;
  actorId?: string | null;
  type: PostNotificationType;
  postId: string;
  postTitle?: string | null;
}) {
  if (!ownerId) return;
  if (
    actorId &&
    ownerId === actorId &&
    (type === "post-comment" || type === "post-rating")
  ) {
    return;
  }

  void notifyUser(ownerId, {
    type,
    from: actorId ?? null,
    postId,
    postTitle: (postTitle ?? "").slice(0, 80),
  });
}
