import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../../../firebase";

export type PredictionOwner = {
  uid: string;
  name: string;
};

/** Resolve the signed-in user who owns a saved prediction. */
export async function getCurrentPredictionOwner(): Promise<PredictionOwner | null> {
  const currentUser = auth.currentUser;
  if (!currentUser) return null;

  let name = currentUser.displayName?.trim() ?? "";
  try {
    const userSnap = await getDoc(doc(db, "user-data", currentUser.uid));
    const username = userSnap.data()?.username;
    if (typeof username === "string" && username.trim()) {
      name = username.trim();
    }
  } catch {
    // Fall back to Firebase Auth display name.
  }

  return { uid: currentUser.uid, name: name || "User" };
}
