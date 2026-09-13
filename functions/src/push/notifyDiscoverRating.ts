import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { asString, loadUserPushTokens, sendExpoPush } from "./expoPush";

/**
 * Notify the Discover post author when someone leaves a rating (first rating
 * from that user). Re-rates update the same doc and do not re-notify.
 */
export const notifyAuthorOnDiscoverRating = onDocumentCreated(
    "discover-notes/{noteId}/ratings/{ratingId}",
    async (event) => {
        const snapshot = event.data;
        if (!snapshot) return;

        const rating = snapshot.data() ?? {};
        const noteId = event.params.noteId;
        const raterUid = asString(rating.userId) || asString(event.params.ratingId);
        const value = typeof rating.value === "number" ? rating.value : Number(rating.value);

        const noteSnap = await admin.firestore().doc(`discover-notes/${noteId}`).get();
        if (!noteSnap.exists) return;

        const note = noteSnap.data() ?? {};
        const authorUid = asString(note.userId);
        if (!authorUid || authorUid === raterUid) return;

        const tokens = await loadUserPushTokens(authorUid);
        if (tokens.length === 0) {
            console.warn("No push tokens for discover author; skipping rating notify", authorUid);
            return;
        }

        let raterName = "Someone";
        if (raterUid) {
            const raterSnap = await admin.firestore().doc(`user-data/${raterUid}`).get();
            raterName = asString(raterSnap.data()?.username) || raterName;
        }

        const postTitle = asString(note.title) || "your post";
        const stars = Number.isFinite(value) && value > 0 ? `${Math.round(value)}★` : "a rating";
        const body = `${raterName} gave ${stars} to "${postTitle}"`;

        await sendExpoPush(
            tokens.map((to) => ({
                to,
                title: "New rating on your post",
                body,
                sound: "default",
                channelId: "discover",
                data: {
                    type: "discover-rating",
                    resourceId: noteId,
                },
            }))
        );
    }
);
