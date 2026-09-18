import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "../../firebase";

export type DiscoverAuthor = {
  uid: string;
  username: string;
  picture: string | null;
};

function fromUserDoc(uid: string, data: Record<string, unknown> | undefined): DiscoverAuthor | null {
  if (!data) return null;
  const username =
    (typeof data.username === "string" && data.username.trim()) ||
    (typeof data.displayName === "string" && data.displayName.trim()) ||
    "";
  const picture =
    (typeof data.picture === "string" && data.picture.trim()) ||
    (typeof data.photoURL === "string" && data.photoURL.trim()) ||
    null;
  return {
    uid,
    username: username || uid,
    picture,
  };
}

export async function lookupDiscoverAuthor(handle: string): Promise<DiscoverAuthor | null> {
  const trimmed = handle.trim();
  if (!trimmed) return null;

  const byId = await getDoc(doc(db, "user-data", trimmed));
  if (byId.exists()) {
    return fromUserDoc(byId.id, byId.data() as Record<string, unknown>);
  }

  const exact = await getDocs(
    query(collection(db, "user-data"), where("username", "==", trimmed), limit(5))
  );
  if (!exact.empty) {
    const snap = exact.docs[0];
    return fromUserDoc(snap.id, snap.data() as Record<string, unknown>);
  }

  if (trimmed !== trimmed.toLowerCase()) {
    const lowered = await getDocs(
      query(collection(db, "user-data"), where("username", "==", trimmed.toLowerCase()), limit(5))
    );
    if (!lowered.empty) {
      const snap = lowered.docs[0];
      return fromUserDoc(snap.id, snap.data() as Record<string, unknown>);
    }
  }

  return null;
}
