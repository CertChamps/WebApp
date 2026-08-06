import { useCallback, useContext } from "react";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db, storage } from "../../firebase";
import { UserContext } from "../context/UserContext";
import type { CanvasTextBox } from "../components/questions/CanvasTextBoxLayer";

type Point = { x: number; y: number; pressure: number };
type Stroke = { points: Point[]; tool: "pen" | "eraser" };

/** An attached image/PDF-page placed on the canvas (world coordinates). */
export type CanvasObject = {
  id: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** When true, object is shown in the side panel instead of on the board. */
  pinnedToSide?: boolean;
};

export type SavedCanvasData = {
  version: 2;
  strokes: Stroke[];
  feedbackOverlay: unknown | null;
  objects: CanvasObject[];
  textBoxes: CanvasTextBox[];
};

const EXT_FROM_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
};

/** Firebase uploads cannot be aborted; serializing by ID prevents stale saves winning races. */
const saveQueueById = new Map<string, Promise<void>>();

function validTextBoxes(value: unknown): CanvasTextBox[] {
  if (!Array.isArray(value)) return [];
  const boxes: CanvasTextBox[] = [];
  const ids = new Set<string>();
  for (const item of value.slice(0, 200)) {
    if (!item || typeof item !== "object") continue;
    const box = item as Partial<CanvasTextBox>;
    const numeric = [box.x, box.y, box.width, box.height, box.fontSize];
    if (typeof box.id !== "string" || typeof box.text !== "string" ||
      !numeric.every((number) => typeof number === "number" && Number.isFinite(number))) continue;
    const [x, y, width, height, fontSize] = numeric as number[];
    const id = box.id.slice(0, 128);
    if (!id || ids.has(id)) continue;
    ids.add(id);
    boxes.push({
      id,
      text: box.text.slice(0, 100_000),
      x: Math.max(-1_000_000, Math.min(1_000_000, x)),
      y: Math.max(-1_000_000, Math.min(1_000_000, y)),
      width: Math.max(120, Math.min(10_000, width)),
      height: Math.max(48, Math.min(10_000, height)),
      fontSize: Math.max(8, Math.min(256, fontSize)),
      colorIndex:
        typeof (box as { colorIndex?: unknown }).colorIndex === "number" &&
        Number.isFinite((box as { colorIndex: number }).colorIndex)
          ? Math.max(0, Math.min(2, Math.round((box as { colorIndex: number }).colorIndex)))
          : 0,
      fontWeight: box.fontWeight === "bold" ? "bold" : "normal",
      fontStyle: box.fontStyle === "italic" ? "italic" : "normal",
      listStyle: box.listStyle === "bullet" ? "bullet" : "none",
    });
  }
  return boxes;
}

/**
 * Saves canvas payloads in Storage and lightweight metadata in Firestore.
 * Legacy stroke arrays and v1 object payloads remain readable.
 */
export function useCanvasStorage() {
  const { user } = useContext(UserContext);

  const saveCanvas = useCallback(async (
    questionId: string,
    strokes: Stroke[],
    feedbackOverlay: unknown | null = null,
    objects: CanvasObject[] = [],
    textBoxes: CanvasTextBox[] = [],
  ) => {
    if (!user?.uid || !questionId) return;
    const uid = user.uid;
    const queueKey = `${uid}:${questionId}`;
    const previous = saveQueueById.get(queueKey) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(async () => {
      const path = `question-data/${uid}/${questionId}.json`;
      const payload: SavedCanvasData = { version: 2, strokes, feedbackOverlay, objects, textBoxes };
      const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      await uploadBytes(ref(storage, path), blob);
      await setDoc(doc(db, "user-data", uid, "question-data", questionId), {
        storagePath: path,
        strokeCount: strokes.length,
        objectCount: objects.length,
        textBoxCount: textBoxes.length,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    });
    saveQueueById.set(queueKey, next);
    try {
      await next;
    } catch (error) {
      console.error("[useCanvasStorage] save failed:", error);
      throw error;
    } finally {
      if (saveQueueById.get(queueKey) === next) saveQueueById.delete(queueKey);
    }
  }, [user?.uid]);

  const loadCanvas = useCallback(async (questionId: string): Promise<SavedCanvasData | null> => {
    if (!user?.uid || !questionId) return null;
    try {
      const path = `question-data/${user.uid}/${questionId}.json`;
      const url = await getDownloadURL(ref(storage, path));
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`Canvas download failed (${response.status})`);
      const parsed = await response.json() as unknown;
      if (Array.isArray(parsed)) {
        return { version: 2, strokes: parsed as Stroke[], feedbackOverlay: null, objects: [], textBoxes: [] };
      }
      if (parsed && typeof parsed === "object") {
        const value = parsed as { strokes?: unknown; feedbackOverlay?: unknown; objects?: unknown; textBoxes?: unknown };
        if (!Array.isArray(value.strokes)) throw new Error("Canvas payload is invalid");
        return {
          version: 2,
          strokes: value.strokes as Stroke[],
          feedbackOverlay: value.feedbackOverlay ?? null,
          objects: Array.isArray(value.objects) ? value.objects as CanvasObject[] : [],
          textBoxes: validTextBoxes(value.textBoxes),
        };
      }
      throw new Error("Canvas payload is invalid");
    } catch (error) {
      if ((error as { code?: string })?.code === "storage/object-not-found") return null;
      console.error("[useCanvasStorage] load failed:", error);
      throw error;
    }
  }, [user?.uid]);

  const uploadCanvasAsset = useCallback(async (questionId: string, blob: Blob): Promise<string> => {
    if (!user?.uid || !questionId) throw new Error("Not signed in");
    const contentType = blob.type && blob.type !== "application/octet-stream" ? blob.type : "image/jpeg";
    const ext = EXT_FROM_MIME[contentType] ?? "jpg";
    const assetId = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const path = `question-data/${user.uid}/${questionId}/assets/${assetId}.${ext}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, blob, { contentType });
    return getDownloadURL(storageRef);
  }, [user?.uid]);

  return { saveCanvas, loadCanvas, uploadCanvasAsset };
}
