import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { deleteObject, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "../../firebase";
import { UserContext } from "../context/UserContext";
import {
  buildWhiteboardTree,
  whiteboardCanvasId,
  type AttachedQuestion,
  type WhiteboardFolder,
  type WhiteboardPage,
} from "../data/whiteboards";

const FOLDERS_COLLECTION = "whiteboards-folders";
const PAGES_COLLECTION = "whiteboards-pages";

function newDocId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function toFolder(id: string, data: Record<string, unknown>): WhiteboardFolder {
  return {
    id,
    name: typeof data.name === "string" ? data.name : "Untitled folder",
    subject: typeof data.subject === "string" ? data.subject : "",
    parentId: typeof data.parentId === "string" ? data.parentId : null,
    colour: typeof data.colour === "string" ? data.colour : null,
    emoji: typeof data.emoji === "string" ? data.emoji : null,
    createdAt: typeof data.createdAt === "number" ? data.createdAt : 0,
    updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : 0,
  };
}

function toPage(id: string, data: Record<string, unknown>): WhiteboardPage {
  return {
    id,
    name: typeof data.name === "string" ? data.name : "Untitled page",
    subject: typeof data.subject === "string" ? data.subject : "",
    folderId: typeof data.folderId === "string" ? data.folderId : null,
    emoji: typeof data.emoji === "string" ? data.emoji : null,
    attachedQuestions: Array.isArray(data.attachedQuestions)
      ? (data.attachedQuestions as AttachedQuestion[])
      : [],
    createdAt: typeof data.createdAt === "number" ? data.createdAt : 0,
    updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : 0,
    lastOpenedAt: typeof data.lastOpenedAt === "number" ? data.lastOpenedAt : 0,
  };
}

export type CreatePageInput = {
  name: string;
  subject: string;
  folderId?: string | null;
  emoji?: string | null;
  attachedQuestions?: AttachedQuestion[];
};

export type CreateFolderInput = {
  name: string;
  subject: string;
  parentId?: string | null;
  colour?: string | null;
  emoji?: string | null;
};

/**
 * Live folders + pages for one subject of the Whiteboards tab, plus CRUD helpers.
 * Data lives under user-data/{uid}/whiteboards-folders and whiteboards-pages.
 */
export function useWhiteboards(subject: string | null) {
  const { user } = useContext(UserContext);
  const uid: string | undefined = user?.uid;

  const [folders, setFolders] = useState<WhiteboardFolder[]>([]);
  const [pages, setPages] = useState<WhiteboardPage[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(true);
  const [pagesLoading, setPagesLoading] = useState(true);

  useEffect(() => {
    if (!uid || !subject) {
      setFolders([]);
      setPages([]);
      setFoldersLoading(false);
      setPagesLoading(false);
      return;
    }
    setFoldersLoading(true);
    setPagesLoading(true);

    const foldersQuery = query(
      collection(db, "user-data", uid, FOLDERS_COLLECTION),
      where("subject", "==", subject)
    );
    const pagesQuery = query(
      collection(db, "user-data", uid, PAGES_COLLECTION),
      where("subject", "==", subject)
    );

    const unsubFolders = onSnapshot(
      foldersQuery,
      (snap) => {
        setFolders(snap.docs.map((d) => toFolder(d.id, d.data())));
        setFoldersLoading(false);
      },
      (err) => {
        console.error("[useWhiteboards] folders listen failed:", err);
        setFolders([]);
        setFoldersLoading(false);
      }
    );
    const unsubPages = onSnapshot(
      pagesQuery,
      (snap) => {
        setPages(snap.docs.map((d) => toPage(d.id, d.data())));
        setPagesLoading(false);
      },
      (err) => {
        console.error("[useWhiteboards] pages listen failed:", err);
        setPages([]);
        setPagesLoading(false);
      }
    );

    return () => {
      unsubFolders();
      unsubPages();
    };
  }, [uid, subject]);

  const loading = foldersLoading || pagesLoading;

  const tree = useMemo(() => buildWhiteboardTree(folders, pages), [folders, pages]);

  const recentItems = useMemo(() => {
    type RecentItem =
      | { type: "page"; page: WhiteboardPage; timestamp: number }
      | { type: "folder"; folder: WhiteboardFolder; timestamp: number };
    const items: RecentItem[] = [
      ...pages.map((page) => ({
        type: "page" as const,
        page,
        timestamp: Math.max(page.lastOpenedAt, page.updatedAt, page.createdAt),
      })),
      ...folders.map((folder) => ({
        type: "folder" as const,
        folder,
        timestamp: Math.max(folder.updatedAt, folder.createdAt),
      })),
    ];
    items.sort((a, b) => b.timestamp - a.timestamp);
    return items;
  }, [pages, folders]);

  // ============================= PAGES ============================= //

  const createPage = useCallback(
    async (input: CreatePageInput): Promise<WhiteboardPage> => {
      if (!uid) throw new Error("Not signed in");
      const now = Date.now();
      const page: WhiteboardPage = {
        id: newDocId("page"),
        name: input.name.trim() || "Untitled page",
        subject: input.subject,
        folderId: input.folderId ?? null,
        emoji: input.emoji ?? null,
        attachedQuestions: input.attachedQuestions ?? [],
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: now,
      };
      const { id, ...data } = page;
      await setDoc(doc(db, "user-data", uid, PAGES_COLLECTION, id), data);
      return page;
    },
    [uid]
  );

  const updatePage = useCallback(
    async (
      pageId: string,
      updates: Partial<Pick<WhiteboardPage, "name" | "folderId" | "emoji" | "attachedQuestions">>
    ) => {
      if (!uid) throw new Error("Not signed in");
      await updateDoc(doc(db, "user-data", uid, PAGES_COLLECTION, pageId), {
        ...updates,
        updatedAt: Date.now(),
      });
    },
    [uid]
  );

  const touchPageOpened = useCallback(
    async (pageId: string) => {
      if (!uid) return;
      try {
        await updateDoc(doc(db, "user-data", uid, PAGES_COLLECTION, pageId), {
          lastOpenedAt: Date.now(),
        });
      } catch {
        /* best-effort */
      }
    },
    [uid]
  );

  const deletePage = useCallback(
    async (page: WhiteboardPage) => {
      if (!uid) throw new Error("Not signed in");
      await deleteDoc(doc(db, "user-data", uid, PAGES_COLLECTION, page.id));
      // Best-effort cleanup of the saved canvas + uploaded custom assets.
      const canvasId = whiteboardCanvasId(page.id);
      void deleteDoc(doc(db, "user-data", uid, "question-data", canvasId)).catch(() => {});
      void deleteObject(ref(storage, `question-data/${uid}/${canvasId}.json`)).catch(() => {});
      page.attachedQuestions.forEach((attachment) => {
        if (attachment.source !== "custom" || !attachment.custom) return;
        void deleteObject(ref(storage, attachment.custom.questionPath)).catch(() => {});
        if (attachment.custom.markingSchemePath) {
          void deleteObject(ref(storage, attachment.custom.markingSchemePath)).catch(() => {});
        }
      });
    },
    [uid]
  );

  // ============================= FOLDERS ============================= //

  const createFolder = useCallback(
    async (input: CreateFolderInput): Promise<WhiteboardFolder> => {
      if (!uid) throw new Error("Not signed in");
      const now = Date.now();
      const folder: WhiteboardFolder = {
        id: newDocId("folder"),
        name: input.name.trim() || "Untitled folder",
        subject: input.subject,
        parentId: input.parentId ?? null,
        colour: input.colour ?? null,
        emoji: input.emoji ?? null,
        createdAt: now,
        updatedAt: now,
      };
      const { id, ...data } = folder;
      await setDoc(doc(db, "user-data", uid, FOLDERS_COLLECTION, id), data);
      return folder;
    },
    [uid]
  );

  const updateFolder = useCallback(
    async (
      folderId: string,
      updates: Partial<Pick<WhiteboardFolder, "name" | "parentId" | "colour" | "emoji">>
    ) => {
      if (!uid) throw new Error("Not signed in");
      await updateDoc(doc(db, "user-data", uid, FOLDERS_COLLECTION, folderId), {
        ...updates,
        updatedAt: Date.now(),
      });
    },
    [uid]
  );

  /** Deletes a folder and moves its contents up one level (safer than recursive delete). */
  const deleteFolder = useCallback(
    async (folder: WhiteboardFolder) => {
      if (!uid) throw new Error("Not signed in");
      const batch = writeBatch(db);
      const now = Date.now();
      folders
        .filter((f) => f.parentId === folder.id)
        .forEach((child) => {
          batch.update(doc(db, "user-data", uid, FOLDERS_COLLECTION, child.id), {
            parentId: folder.parentId,
            updatedAt: now,
          });
        });
      pages
        .filter((p) => p.folderId === folder.id)
        .forEach((page) => {
          batch.update(doc(db, "user-data", uid, PAGES_COLLECTION, page.id), {
            folderId: folder.parentId,
            updatedAt: now,
          });
        });
      batch.delete(doc(db, "user-data", uid, FOLDERS_COLLECTION, folder.id));
      await batch.commit();
    },
    [uid, folders, pages]
  );

  return {
    folders,
    pages,
    tree,
    recentItems,
    loading,
    createPage,
    updatePage,
    deletePage,
    touchPageOpened,
    createFolder,
    updateFolder,
    deleteFolder,
  };
}

/** Live single page (used by the Page View so sidebar edits stay in sync). */
export function useWhiteboardPage(pageId: string | null) {
  const { user } = useContext(UserContext);
  const uid: string | undefined = user?.uid;
  const [page, setPage] = useState<WhiteboardPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!uid || !pageId) {
      setPage(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setNotFound(false);
    const unsub = onSnapshot(
      doc(db, "user-data", uid, PAGES_COLLECTION, pageId),
      (snap) => {
        if (snap.exists()) {
          setPage(toPage(snap.id, snap.data()));
          setNotFound(false);
        } else {
          setPage(null);
          setNotFound(true);
        }
        setLoading(false);
      },
      (err) => {
        console.error("[useWhiteboardPage] listen failed:", err);
        setPage(null);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [uid, pageId]);

  return { page, loading, notFound };
}

/** Upload a user-supplied question / marking scheme file for a custom attachment. */
export async function uploadWhiteboardAsset(
  uid: string,
  attachmentId: string,
  kind: "question" | "marking-scheme",
  file: File
): Promise<{ storagePath: string; fileType: "pdf" | "image" }> {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  const ext = isPdf ? "pdf" : (file.name.split(".").pop() || "png").toLowerCase();
  const storagePath = `whiteboards/${uid}/attachments/${attachmentId}/${kind}.${ext}`;
  await uploadBytes(ref(storage, storagePath), file, {
    contentType: file.type || (isPdf ? "application/pdf" : "image/png"),
  });
  return { storagePath, fileType: isPdf ? "pdf" : "image" };
}
