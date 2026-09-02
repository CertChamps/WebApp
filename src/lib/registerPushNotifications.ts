import { Capacitor } from "@capacitor/core";
import { arrayRemove, arrayUnion, doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";

let startedForUid: string | null = null;
let listenersBound = false;
let currentToken: string | null = null;

async function saveToken(uid: string, token: string) {
  if (!token || (currentToken === token && startedForUid === uid)) return;
  currentToken = token;
  startedForUid = uid;
  try {
    await updateDoc(doc(db, "user-data", uid), {
      fcmTokens: arrayUnion(token),
    });
  } catch (err) {
    console.warn("Failed to save push token:", err);
  }
}

export async function registerPushNotifications(uid?: string | null) {
  if (!uid || !Capacitor.isNativePlatform()) return;

  try {
    const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");
    const permission = await FirebaseMessaging.requestPermissions();
    if (permission.receive !== "granted") return;

    if (!listenersBound) {
      await FirebaseMessaging.addListener("tokenReceived", ({ token }) => {
        if (startedForUid && token) void saveToken(startedForUid, token);
      });
      await FirebaseMessaging.addListener("notificationActionPerformed", () => {
        if (!window.location.hash.startsWith("#/discover")) {
          window.location.hash = "#/discover";
        }
      });
      listenersBound = true;
    }

    const { token } = await FirebaseMessaging.getToken();
    if (token) await saveToken(uid, token);
  } catch (err) {
    console.warn("Push registration failed:", err);
  }
}

export async function unregisterPushNotifications(uid?: string | null) {
  if (!uid || !Capacitor.isNativePlatform() || !currentToken) {
    startedForUid = null;
    currentToken = null;
    return;
  }
  const token = currentToken;
  startedForUid = null;
  currentToken = null;
  try {
    await updateDoc(doc(db, "user-data", uid), {
      fcmTokens: arrayRemove(token),
    });
  } catch (err) {
    console.warn("Failed to remove push token:", err);
  }
}
