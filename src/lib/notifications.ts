import { Timestamp, arrayUnion, doc, updateDoc } from "firebase/firestore";
import { auth, db } from "../../firebase";

export type PostNotificationType =
  | "post-comment"
  | "post-rating"
  | "post-approved"
  | "post-removed"
  | "post-rejected";

const DELIVER_NOTIFICATION_URL =
  "https://us-central1-certchamps-a7527.cloudfunctions.net/deliverUserNotification";

export function quotedPostTitle(title?: string | null): string {
  const trimmed = (title ?? "").trim();
  return trimmed ? `"${trimmed.slice(0, 80)}"` : "";
}

function ratingOutOfFive(value?: number | null): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < 1 || rounded > 5) return null;
  return rounded;
}

export function discoverNotificationCopy({
  type,
  postTitle,
  fromName,
  reason,
  rating,
}: {
  type: string;
  postTitle?: string | null;
  fromName?: string | null;
  reason?: string | null;
  rating?: number | null;
}): { title: string; body: string } {
  const quoted = quotedPostTitle(postTitle);
  const yourPost = quoted ? `Your post ${quoted}` : "Your post";
  const yourPostLower = quoted ? `your post ${quoted}` : "your post";
  const name = (fromName ?? "").trim() || "Someone";
  const why = (reason ?? "").trim() || "No reason given";
  const score = ratingOutOfFive(rating);

  if (type === "post-approved") {
    return {
      title: "Post approved",
      body: `${yourPost} is now on Discover`,
    };
  }
  if (type === "post-rejected") {
    return {
      title: "Post not approved",
      body: `${yourPost} was not approved. Reason: ${why}`,
    };
  }
  if (type === "post-removed") {
    return {
      title: "Post removed",
      body: `${yourPost} was removed`,
    };
  }
  if (type === "post-comment") {
    return {
      title: "New comment",
      body: `${name} commented on ${yourPostLower}`,
    };
  }
  if (type === "post-rating") {
    return {
      title: "New rating",
      body: score
        ? `${name} rated ${yourPostLower} ${score}/5`
        : `${name} rated ${yourPostLower}`,
    };
  }
  return {
    title: "Notification",
    body: "You have a new notification",
  };
}

export function notificationText(noti: {
  type?: string;
  body?: string;
  postTitle?: string;
  fromName?: string;
  username?: string;
  reason?: string;
  rating?: number | null;
}): string {
  if (typeof noti.body === "string" && noti.body.trim()) return noti.body.trim();
  if (noti.type === "friend-request") {
    return `${noti.username || "Someone"} sent you a friend request`;
  }
  if (noti.type === "deck-share") {
    return `${noti.username || "Someone"} sent you a deck`;
  }
  return discoverNotificationCopy({
    type: noti.type ?? "",
    postTitle: noti.postTitle,
    fromName: noti.fromName || noti.username,
    reason: noti.reason,
    rating: noti.rating,
  }).body;
}

export async function notifyUser(
  uid: string | null | undefined,
  notification: Record<string, unknown>
) {
  if (!uid) return;
  const payload = { ...notification };
  try {
    const idToken = await auth.currentUser?.getIdToken();
    if (idToken) {
      const response = await fetch(DELIVER_NOTIFICATION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ uid, notification: payload }),
      });
      if (response.ok) return;
      console.warn("deliverUserNotification failed:", await response.text());
    }
  } catch (err) {
    console.warn("deliverUserNotification error:", err);
  }

  try {
    await updateDoc(doc(db, "user-data", uid), {
      notifications: arrayUnion({
        ...payload,
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
  actorName,
  type,
  postId,
  postTitle,
  reason,
  rating,
}: {
  ownerId?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  type: PostNotificationType;
  postId: string;
  postTitle?: string | null;
  reason?: string | null;
  rating?: number | null;
}): Promise<void> {
  if (!ownerId) return Promise.resolve();
  if (
    actorId &&
    ownerId === actorId &&
    (type === "post-comment" || type === "post-rating")
  ) {
    return Promise.resolve();
  }

  const fromName = (actorName ?? "").trim();
  const score = ratingOutOfFive(rating);
  const copy = discoverNotificationCopy({
    type,
    postTitle,
    fromName,
    reason,
    rating: score,
  });

  return notifyUser(ownerId, {
    type,
    from: actorId ?? null,
    fromName: fromName || null,
    postId,
    postTitle: (postTitle ?? "").slice(0, 80),
    reason: (reason ?? "").trim().slice(0, 200) || null,
    rating: score,
    title: copy.title,
    body: copy.body,
  });
}
