import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";
import cors from "cors";
import Stripe from "stripe";

const corsMiddleware = cors({ origin: true });

async function deleteDocumentTree(docRef: admin.firestore.DocumentReference): Promise<void> {
    const subcollections = await docRef.listCollections();
    for (const sub of subcollections) {
        const snapshot = await sub.get();
        await Promise.all(snapshot.docs.map((d) => deleteDocumentTree(d.ref)));
    }
    await docRef.delete();
}

async function cancelStripeSubscriptions(stripeCustomerId: string): Promise<void> {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) return;

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-02-24.acacia" });
    const subs = await stripe.subscriptions.list({
        customer: stripeCustomerId,
        status: "all",
        limit: 20,
    });

    await Promise.all(
        subs.data
            .filter((s) => s.status === "active" || s.status === "trialing" || s.status === "past_due")
            .map((s) => stripe.subscriptions.cancel(s.id))
    );
}

async function removeUidFromFriendLists(uid: string): Promise<void> {
    const db = admin.firestore();
    const [friendsSnap, pendingSnap] = await Promise.all([
        db.collection("user-data").where("friends", "array-contains", uid).get(),
        db.collection("user-data").where("pendingFriends", "array-contains", uid).get(),
    ]);

    const batch = db.batch();
    const touched = new Set<string>();

    for (const docSnap of [...friendsSnap.docs, ...pendingSnap.docs]) {
        if (touched.has(docSnap.id)) continue;
        touched.add(docSnap.id);
        batch.update(docSnap.ref, {
            friends: admin.firestore.FieldValue.arrayRemove(uid),
            pendingFriends: admin.firestore.FieldValue.arrayRemove(uid),
        });
    }

    if (touched.size > 0) {
        await batch.commit();
    }
}

async function deleteUserPosts(uid: string): Promise<void> {
    const db = admin.firestore();
    const postsSnap = await db.collection("posts").where("userId", "==", uid).get();
    await Promise.all(postsSnap.docs.map((d) => deleteDocumentTree(d.ref)));
}

async function deleteUserDecks(uid: string): Promise<void> {
    const db = admin.firestore();
    const decksSnap = await db.collection("decks").where("createdBy", "==", uid).get();
    await Promise.all(decksSnap.docs.map((d) => deleteDocumentTree(d.ref)));
}

async function removeDeckMemberships(uid: string): Promise<void> {
    const db = admin.firestore();
    const membershipSnap = await db.collectionGroup("usersAdded").where("uid", "==", uid).get();
    await Promise.all(membershipSnap.docs.map((d) => d.ref.delete()));
}

async function deleteUserStorage(uid: string): Promise<void> {
    const bucket = admin.storage().bucket();
    const prefixes = [`profile-photos/${uid}`, `user-uploads/${uid}/`, `decks/${uid}/`];
    await Promise.all(
        prefixes.map(async (prefix) => {
            try {
                await bucket.deleteFiles({ prefix });
            } catch (err) {
                console.warn(`deleteUserStorage: failed for ${prefix}`, err);
            }
        })
    );
}

async function deleteStripeSubscriptionMap(uid: string): Promise<void> {
    const db = admin.firestore();
    const mapSnap = await db.collection("stripe_subscriptions").where("uid", "==", uid).get();
    await Promise.all(mapSnap.docs.map((d) => d.ref.delete()));
}

export async function purgeUserAccount(uid: string): Promise<void> {
    const db = admin.firestore();
    const userRef = db.doc(`user-data/${uid}`);
    const userDoc = await userRef.get();
    const userData = userDoc.data();

    if (userData?.stripeCustomerId && typeof userData.stripeCustomerId === "string") {
        await cancelStripeSubscriptions(userData.stripeCustomerId);
    }

    await Promise.all([
        deleteUserPosts(uid),
        deleteUserDecks(uid),
        removeDeckMemberships(uid),
        removeUidFromFriendLists(uid),
        deleteStripeSubscriptionMap(uid),
    ]);

    await deleteUserStorage(uid);

    if (userDoc.exists) {
        await deleteDocumentTree(userRef);
    }

    await admin.auth().deleteUser(uid);
}

/** Permanently delete the signed-in user's Auth account and Firestore data. */
export const deleteAccount = functions.https.onRequest(
    {
        cors: true,
        secrets: ["STRIPE_SECRET_KEY"],
        timeoutSeconds: 300,
        memory: "512MiB",
    },
    (req, res) => {
        corsMiddleware(req, res, async () => {
            if (req.method !== "POST") {
                res.status(405).json({ error: "Method not allowed" });
                return;
            }

            try {
                const { idToken, confirmUsername } = (req.body || {}) as {
                    idToken?: string;
                    confirmUsername?: string;
                };

                if (!idToken) {
                    res.status(400).json({ error: "idToken is required" });
                    return;
                }

                let uid: string;
                try {
                    const decoded = await admin.auth().verifyIdToken(idToken);
                    uid = decoded.uid;
                } catch (e) {
                    console.error("deleteAccount: invalid idToken", e);
                    res.status(401).json({ error: "Invalid or expired session. Sign in again and retry." });
                    return;
                }

                const userRef = admin.firestore().doc(`user-data/${uid}`);
                const userDoc = await userRef.get();
                if (!userDoc.exists) {
                    res.status(404).json({ error: "Account data not found." });
                    return;
                }

                const storedUsername = String(userDoc.data()?.username ?? "").trim();
                const typedUsername = String(confirmUsername ?? "").trim();
                if (!typedUsername || typedUsername !== storedUsername) {
                    res.status(400).json({ error: "Username confirmation does not match your account." });
                    return;
                }

                await purgeUserAccount(uid);
                res.status(200).json({ success: true });
            } catch (err) {
                console.error("deleteAccount error:", err);
                const message = err instanceof Error ? err.message : "Failed to delete account";
                res.status(500).json({ error: message });
            }
        });
    }
);
