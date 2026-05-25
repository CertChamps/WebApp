/**
 * Persistent IndexedDB cache for exam-paper PDF blobs (Firebase Storage paths).
 * Survives app restarts on iPad; complements the in-memory LRU in useExamPapers.
 */

const DB_NAME = "certchamps_papers";
const DB_VERSION = 1;
const STORE = "blobs";
const META_STORE = "meta";
/** Max papers stored on disk (~15 × ~5MB typical). Oldest evicted by lastAccess. */
const MAX_ENTRIES = 15;

type MetaRow = { path: string; lastAccess: number; size: number };

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "path" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("paper blob IDB blocked"));
  });
}

async function touchMeta(db: IDBDatabase, path: string, size: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readwrite");
    tx.objectStore(META_STORE).put({ path, lastAccess: Date.now(), size } satisfies MetaRow);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function evictIfNeeded(db: IDBDatabase): Promise<void> {
  const all = await new Promise<MetaRow[]>((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readonly");
    const req = tx.objectStore(META_STORE).getAll();
    req.onsuccess = () => resolve((req.result as MetaRow[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  if (all.length <= MAX_ENTRIES) return;
  all.sort((a, b) => a.lastAccess - b.lastAccess);
  const toRemove = all.slice(0, all.length - MAX_ENTRIES);
  await Promise.all(
    toRemove.map(
      (row) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction([STORE, META_STORE], "readwrite");
          tx.objectStore(STORE).delete(row.path);
          tx.objectStore(META_STORE).delete(row.path);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        })
    )
  );
}

/** Remove a cached entry (e.g. corrupt PDF). */
export async function removePaperBlobFromCache(storagePath: string): Promise<void> {
  if (!storagePath || typeof indexedDB === "undefined") return;
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE, META_STORE], "readwrite");
      tx.objectStore(STORE).delete(storagePath);
      tx.objectStore(META_STORE).delete(storagePath);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn("[paperBlobStorage] remove failed", storagePath, err);
  }
}

/** Load a cached PDF blob by Firebase storage path, or null if missing. */
export async function loadPaperBlobFromCache(storagePath: string): Promise<Blob | null> {
  if (!storagePath || typeof indexedDB === "undefined") return null;
  try {
    const db = await openDB();
    const blob = await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(storagePath);
      req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (blob) {
      const db2 = await openDB();
      await touchMeta(db2, storagePath, blob.size);
      db2.close();
    }
    return blob;
  } catch (err) {
    console.warn("[paperBlobStorage] load failed", storagePath, err);
    return null;
  }
}

/** Persist a PDF blob; evicts oldest entries when over limit. */
export async function savePaperBlobToCache(storagePath: string, blob: Blob): Promise<void> {
  if (!storagePath || typeof indexedDB === "undefined") return;
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(blob, storagePath);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    await touchMeta(db, storagePath, blob.size);
    await evictIfNeeded(db);
    db.close();
  } catch (err) {
    console.warn("[paperBlobStorage] save failed", storagePath, err);
  }
}
