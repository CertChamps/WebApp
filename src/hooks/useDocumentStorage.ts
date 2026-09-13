import { useCallback, useContext, useRef } from "react";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "../../firebase";
import { UserContext } from "../context/UserContext";
import { documentContentStorageId, documentQuestionContentStorageId } from "../data/whiteboards";

export type SavedDocumentData = {
  version: 1;
  html: string;
  updatedAt: number;
};

const queueById = new Map<string, Promise<void>>();

function documentHasStudentText(html: string): boolean {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim().length > 0;
}

function contentStorageId(pageId: string, attachmentId?: string | null): string {
  return attachmentId
    ? documentQuestionContentStorageId(pageId, attachmentId)
    : documentContentStorageId(pageId);
}

/**
 * Stores rich document payloads in Firebase Storage so page metadata remains well
 * below Firestore's document-size limit. Writes are serialized per document to
 * prevent an older upload from completing after a newer edit.
 */
export function useDocumentStorage() {
  const { user } = useContext(UserContext);
  const mountedRef = useRef(true);
  mountedRef.current = true;

  const loadFromStorageId = useCallback(async (storageId: string): Promise<SavedDocumentData | null> => {
    if (!user?.uid || !storageId) return null;
    try {
      const url = await getDownloadURL(ref(storage, `question-data/${user.uid}/${storageId}.json`));
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error("Document download failed");
      const value = await response.json() as Partial<SavedDocumentData>;
      if (value.version !== 1 || typeof value.html !== "string") return null;
      return { version: 1, html: value.html, updatedAt: Number(value.updatedAt) || 0 };
    } catch (error) {
      if ((error as { code?: string })?.code === "storage/object-not-found") return null;
      console.error("[useDocumentStorage] load failed", error);
      throw error;
    }
  }, [user?.uid]);

  const loadDocument = useCallback(async (
    pageId: string,
    attachmentId?: string | null,
    options?: { fallbackToPage?: boolean },
  ): Promise<SavedDocumentData | null> => {
    if (!user?.uid || !pageId) return null;
    const stored = await loadFromStorageId(contentStorageId(pageId, attachmentId));
    if (stored) return stored;
    if (attachmentId && options?.fallbackToPage) {
      return loadFromStorageId(documentContentStorageId(pageId));
    }
    return null;
  }, [loadFromStorageId, user?.uid]);

  const saveDocument = useCallback(async (
    pageId: string,
    html: string,
    progressAliasId?: string | null,
    attachmentId?: string | null,
  ): Promise<void> => {
    if (!user?.uid || !pageId) throw new Error("Not signed in");
    const uid = user.uid;
    const storageId = contentStorageId(pageId, attachmentId);
    const queueKey = `${uid}:${storageId}`;
    const previous = queueById.get(queueKey) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(async () => {
      const payload: SavedDocumentData = { version: 1, html, updatedAt: Date.now() };
      const path = `question-data/${uid}/${storageId}.json`;
      await uploadBytes(ref(storage, path), new Blob([JSON.stringify(payload)], { type: "application/json" }));
      await setDoc(doc(db, "user-data", uid, "question-data", storageId), {
        storagePath: path,
        contentLength: html.length,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      if (progressAliasId && progressAliasId !== storageId && documentHasStudentText(html)) {
        await setDoc(doc(db, "user-data", uid, "question-data", progressAliasId), {
          strokeCount: 1,
          projectedFrom: storageId,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }
    });
    queueById.set(queueKey, next);
    try {
      await next;
    } finally {
      if (queueById.get(queueKey) === next) queueById.delete(queueKey);
    }
  }, [user?.uid]);

  return { loadDocument, saveDocument, mountedRef };
}
