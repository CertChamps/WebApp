import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { sendPush } from "../discover/deliverNotification";

/** Keep in sync with App `constants/discover.ts` and WebApp `constants/adminUids.ts`. */
const ADMIN_UIDS = [
    "NkN9UBqoPEYpE21MC89fipLn0SP2",
    "gJIqKYlc1OdXUQGZQkR4IzfCIoL2",
    "AN3cIuQxmXfXb5kEmXuHcM5vWyH3",
];

function asString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

/**
 * When a Discover resource is submitted for moderation, ping every admin
 * device that has registered an FCM token.
 */
export const notifyAdminsOnPendingDiscover = onDocumentCreated(
    "discover-notes/{noteId}",
    async (event) => {
        const snapshot = event.data;
        if (!snapshot) return;

        const data = snapshot.data() ?? {};
        if (asString(data.moderationStatus) !== "pending") return;

        const title = asString(data.title) || "New Discover resource";
        const username = asString(data.username) || "someone";
        const noteId = event.params.noteId;

        await Promise.all(ADMIN_UIDS.map((uid) =>
            sendPush(uid, "Discover needs moderation", `"${title}" by ${username}`, {
                type: "discover-moderation",
                resourceId: noteId,
                route: "/admin/discover-moderation",
            })
        ));
    }
);
