import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";

const ADMIN_UIDS = new Set([
    "NkN9UBqoPEYpE21MC89fipLn0SP2",
    "gJIqKYlc1OdXUQGZQkR4IzfCIoL2",
    "AN3cIuQxmXfXb5kEmXuHcM5vWyH3",
]);
const ADMIN_EMAILS = new Set(["cian.brady@certchamps.ie"]);

const POST_TYPES = new Set([
    "post-comment",
    "post-rating",
    "post-approved",
    "post-rejected",
    "post-removed",
]);

const MODERATION_TYPES = new Set([
    "post-approved",
    "post-rejected",
    "post-removed",
]);

function bearerToken(req: { headers?: { authorization?: string } }): string | null {
    const value = req.headers?.authorization;
    if (typeof value !== "string") return null;
    const match = value.match(/^Bearer\s+(.+)$/i);
    return match?.[1]?.trim() || null;
}

function quotedPostTitle(title: unknown): string {
    const trimmed = typeof title === "string" ? title.trim().slice(0, 80) : "";
    return trimmed ? `"${trimmed}"` : "";
}

function ratingOutOfFive(value: unknown): number | null {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return null;
    const rounded = Math.round(n);
    if (rounded < 1 || rounded > 5) return null;
    return rounded;
}

function discoverNotificationCopy(input: {
    type: string;
    postTitle?: unknown;
    fromName?: unknown;
    reason?: unknown;
    rating?: unknown;
}): { title: string; body: string } {
    const quoted = quotedPostTitle(input.postTitle);
    const yourPost = quoted ? `Your post ${quoted}` : "Your post";
    const yourPostLower = quoted ? `your post ${quoted}` : "your post";
    const name = typeof input.fromName === "string" && input.fromName.trim()
        ? input.fromName.trim()
        : "Someone";
    const why = typeof input.reason === "string" && input.reason.trim()
        ? input.reason.trim().slice(0, 200)
        : "No reason given";
    const score = ratingOutOfFive(input.rating);

    if (input.type === "post-approved") {
        return { title: "Post approved", body: `${yourPost} is now on Discover` };
    }
    if (input.type === "post-rejected") {
        return { title: "Post not approved", body: `${yourPost} was not approved. Reason: ${why}` };
    }
    if (input.type === "post-removed") {
        return { title: "Post removed", body: `${yourPost} was removed` };
    }
    if (input.type === "post-comment") {
        return { title: "New comment", body: `${name} commented on ${yourPostLower}` };
    }
    if (input.type === "post-rating") {
        const rated = score ? `${name} rated ${yourPostLower} ${score}/5` : `${name} rated ${yourPostLower}`;
        return { title: "New rating", body: rated };
    }
    return { title: "Notification", body: "You have a new notification" };
}

function isAdminUser(decoded: admin.auth.DecodedIdToken, userData: admin.firestore.DocumentData | undefined): boolean {
    const email = (decoded.email ?? userData?.email ?? "").toLowerCase();
    return decoded.admin === true
        || userData?.isAdmin === true
        || ADMIN_UIDS.has(decoded.uid)
        || ADMIN_EMAILS.has(email);
}

async function sendPush(uid: string, title: string, body: string, data: Record<string, string>) {
    const userRef = admin.firestore().doc(`user-data/${uid}`);
    const snap = await userRef.get();
    const rawTokens = snap.data()?.fcmTokens;
    const tokens = Array.isArray(rawTokens)
        ? rawTokens.filter((token: unknown): token is string => typeof token === "string" && token.length > 8)
        : [];
    if (tokens.length === 0) return;

    const response = await admin.messaging().sendEachForMulticast({
        tokens,
        notification: { title, body },
        data,
        apns: {
            payload: {
                aps: {
                    sound: "default",
                    alert: { title, body },
                },
            },
        },
    });

    const invalid = response.responses.flatMap((result, index) => {
        if (result.success) return [];
        const code = result.error?.code ?? "";
        if (
            code === "messaging/registration-token-not-registered"
            || code === "messaging/invalid-registration-token"
            || code === "messaging/invalid-argument"
        ) {
            return [tokens[index]];
        }
        return [];
    });
    if (invalid.length > 0) {
        await userRef.update({
            fcmTokens: admin.firestore.FieldValue.arrayRemove(...invalid),
        }).catch((err) => {
            console.warn("Failed to remove invalid FCM tokens:", err);
        });
    }
}

export async function deliverDiscoverNotification(
    uid: string,
    notification: Record<string, unknown>
): Promise<void> {
    const type = typeof notification.type === "string" ? notification.type : "";
    const rating = ratingOutOfFive(notification.rating);
    const copy = discoverNotificationCopy({
        type,
        postTitle: notification.postTitle,
        fromName: notification.fromName,
        reason: notification.reason,
        rating,
    });
    const record = {
        type,
        from: typeof notification.from === "string" ? notification.from : null,
        fromName: typeof notification.fromName === "string" ? notification.fromName : null,
        postId: typeof notification.postId === "string" ? notification.postId : null,
        postTitle: typeof notification.postTitle === "string" ? notification.postTitle.slice(0, 80) : "",
        reason: typeof notification.reason === "string" ? notification.reason.slice(0, 200) : null,
        rating,
        title: copy.title,
        body: copy.body,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        timestamp: admin.firestore.Timestamp.now(),
        read: false,
    };

    await admin.firestore().doc(`user-data/${uid}`).update({
        notifications: admin.firestore.FieldValue.arrayUnion(record),
    });

    try {
        await sendPush(uid, copy.title, copy.body, {
            type,
            postId: record.postId ?? "",
            route: "/discover",
        });
    } catch (err) {
        console.warn("Push send failed:", err);
    }
}

async function notifyPostFromResource(
    postId: string,
    post: admin.firestore.DocumentData | undefined,
    type: string,
    extras: Record<string, unknown> = {},
) {
    const ownerId = typeof post?.userId === "string" ? post.userId : "";
    if (!ownerId) return;
    const actorId = typeof extras.from === "string" ? extras.from : "";
    if (actorId && actorId === ownerId && (type === "post-comment" || type === "post-rating")) {
        return;
    }
    await deliverDiscoverNotification(ownerId, {
        type,
        postId,
        postTitle: typeof post?.title === "string" ? post.title : "",
        ...extras,
    });
}

export const deliverUserNotification = functions.https.onRequest({
    cors: true,
    invoker: "public",
    region: "us-central1",
    timeoutSeconds: 15,
    memory: "256MiB",
}, async (req, res) => {
    if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
        return;
    }

    try {
        const token = bearerToken(req);
        if (!token) {
            res.status(401).json({ error: "Sign in required" });
            return;
        }
        const decoded = await admin.auth().verifyIdToken(token);
        const targetUid = typeof req.body?.uid === "string" ? req.body.uid.trim() : "";
        const notification = req.body?.notification;
        if (!targetUid || !notification || typeof notification !== "object") {
            res.status(400).json({ error: "uid and notification are required" });
            return;
        }

        const type = typeof notification.type === "string" ? notification.type : "";
        if (!POST_TYPES.has(type)) {
            res.status(400).json({ error: "Unsupported notification type" });
            return;
        }

        const callerDoc = await admin.firestore().doc(`user-data/${decoded.uid}`).get();
        const callerData = callerDoc.data();

        if (MODERATION_TYPES.has(type)) {
            if (!isAdminUser(decoded, callerData)) {
                res.status(403).json({ error: "Admin only" });
                return;
            }
        } else {
            const from = typeof notification.from === "string" ? notification.from : "";
            if (from !== decoded.uid) {
                res.status(403).json({ error: "Cannot send this notification" });
                return;
            }
            if (targetUid === decoded.uid) {
                res.status(200).json({ skipped: true });
                return;
            }
        }

        await deliverDiscoverNotification(targetUid, {
            ...notification,
            fromName: typeof notification.fromName === "string"
                ? notification.fromName
                : callerData?.username,
        });
        res.status(200).json({ ok: true });
    } catch (err) {
        console.error("deliverUserNotification error:", err);
        res.status(500).json({ error: "Failed to deliver notification" });
    }
});

export const onDiscoverCommentCreated = functions.firestore.onDocumentCreated({
    document: "discover-notes/{postId}/comments/{commentId}",
    region: "us-central1",
}, async (event) => {
    const comment = event.data?.data();
    if (!comment) return;
    const postId = event.params.postId;
    const postSnap = await admin.firestore().doc(`discover-notes/${postId}`).get();
    await notifyPostFromResource(postId, postSnap.data(), "post-comment", {
        from: typeof comment.userId === "string" ? comment.userId : null,
        fromName: typeof comment.username === "string" ? comment.username : null,
    });
});

export const onDiscoverRatingCreated = functions.firestore.onDocumentCreated({
    document: "discover-notes/{postId}/ratings/{ratingId}",
    region: "us-central1",
}, async (event) => {
    const rating = event.data?.data();
    if (!rating) return;
    const postId = event.params.postId;
    const actorId = typeof rating.userId === "string" ? rating.userId : event.params.ratingId;
    let fromName: string | null = null;
    if (actorId) {
        const actorSnap = await admin.firestore().doc(`user-data/${actorId}`).get();
        const username = actorSnap.data()?.username;
        fromName = typeof username === "string" ? username : null;
    }
    const postSnap = await admin.firestore().doc(`discover-notes/${postId}`).get();
    await notifyPostFromResource(postId, postSnap.data(), "post-rating", {
        from: actorId || null,
        fromName,
        rating: ratingOutOfFive(rating.value),
    });
});

export const onDiscoverResourceWritten = functions.firestore.onDocumentWritten({
    document: "discover-notes/{postId}",
    region: "us-central1",
}, async (event) => {
    const before = event.data?.before;
    const after = event.data?.after;
    const postId = event.params.postId;
    const beforeData = before?.exists ? before.data() : undefined;
    const afterData = after?.exists ? after.data() : undefined;

    if (afterData) {
        const beforeStatus = beforeData?.moderationStatus;
        const afterStatus = afterData.moderationStatus;
        if (afterStatus === "approved" && beforeStatus !== "approved") {
            await notifyPostFromResource(postId, afterData, "post-approved");
        }
        if (afterStatus === "rejected" && beforeStatus !== "rejected") {
            await notifyPostFromResource(postId, afterData, "post-rejected", {
                reason: typeof afterData.rejectionReason === "string" ? afterData.rejectionReason : null,
            });
        }
        return;
    }

    if (!beforeData) return;
    const status = beforeData.moderationStatus;
    if (status === "approved") {
        await notifyPostFromResource(postId, beforeData, "post-removed");
        return;
    }
    if (status === "pending") {
        await notifyPostFromResource(postId, beforeData, "post-rejected", {
            reason: typeof beforeData.rejectionReason === "string" ? beforeData.rejectionReason : null,
        });
    }
});
