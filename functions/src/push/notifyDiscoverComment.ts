import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { asString, loadUserPushTokens, sendExpoPush } from "./expoPush";

/**
 * Notify the Discover post author when someone comments on their resource.
 */
export const notifyAuthorOnDiscoverComment = onDocumentCreated(
    "discover-notes/{noteId}/comments/{commentId}",
    async (event) => {
        const snapshot = event.data;
        if (!snapshot) return;

        const comment = snapshot.data() ?? {};
        const noteId = event.params.noteId;
        const commenterUid = asString(comment.userId);
        const commenterName = asString(comment.username) || "Someone";
        const text = asString(comment.text);

        const noteSnap = await admin.firestore().doc(`discover-notes/${noteId}`).get();
        if (!noteSnap.exists) return;

        const note = noteSnap.data() ?? {};
        const authorUid = asString(note.userId);
        if (!authorUid || authorUid === commenterUid) return;

        const tokens = await loadUserPushTokens(authorUid);
        if (tokens.length === 0) {
            console.warn("No push tokens for discover author; skipping comment notify", authorUid);
            return;
        }

        const postTitle = asString(note.title) || "your post";
        const preview = text.length > 80 ? `${text.slice(0, 77)}...` : text;
        const body = preview
            ? `${commenterName} commented on "${postTitle}": ${preview}`
            : `${commenterName} commented on "${postTitle}"`;

        await sendExpoPush(
            tokens.map((to) => ({
                to,
                title: "New comment on your post",
                body,
                sound: "default",
                channelId: "discover",
                data: {
                    type: "discover-comment",
                    resourceId: noteId,
                },
            }))
        );
    }
);
