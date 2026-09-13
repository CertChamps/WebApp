import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { asString, collectExpoPushTokens, sendExpoPush } from "../push/expoPush";

/** Keep in sync with App `constants/discover.ts` and WebApp `constants/adminUids.ts`. */
const ADMIN_UIDS = [
    "NkN9UBqoPEYpE21MC89fipLn0SP2",
    "gJIqKYlc1OdXUQGZQkR4IzfCIoL2",
    "AN3cIuQxmXfXb5kEmXuHcM5vWyH3",
];

async function loadAdminPushTokens(): Promise<string[]> {
    const snapshots = await Promise.all(
        ADMIN_UIDS.map((uid) => admin.firestore().doc(`user-data/${uid}`).get())
    );
    const tokens = new Set<string>();
    for (const snap of snapshots) {
        for (const token of collectExpoPushTokens(snap.data())) {
            tokens.add(token);
        }
    }
    return [...tokens];
}

/**
 * When a Discover resource is submitted for moderation, ping every developer
 * device that has registered an Expo push token.
 */
export const notifyAdminsOnPendingDiscover = onDocumentCreated(
    "discover-notes/{noteId}",
    async (event) => {
        const snapshot = event.data;
        if (!snapshot) return;

        const data = snapshot.data() ?? {};
        if (asString(data.moderationStatus) !== "pending") return;

        const tokens = await loadAdminPushTokens();
        if (tokens.length === 0) {
            console.warn("No admin Expo push tokens registered; skipping moderation notify");
            return;
        }

        const title = asString(data.title) || "New Discover resource";
        const username = asString(data.username) || "someone";
        const noteId = event.params.noteId;

        await sendExpoPush(
            tokens.map((to) => ({
                to,
                title: "Discover needs moderation",
                body: `"${title}" by ${username}`,
                sound: "default",
                channelId: "moderation",
                data: {
                    type: "discover-moderation",
                    resourceId: noteId,
                },
            }))
        );
    }
);
