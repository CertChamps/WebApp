import { useCallback, useContext, useRef } from "react";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db, storage } from "../../firebase";
import { UserContext } from "../context/UserContext";

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
};

export type SavedCanvasData = {
	strokes: Stroke[];
	feedbackOverlay: unknown | null;
	objects: CanvasObject[];
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

/**
 * Hook to save/load drawing canvas strokes per question to Firebase.
 * - Strokes stored as JSON in Firebase Storage (avoids Firestore 1MB doc limit).
 * - Lightweight metadata written to Firestore for queryability.
 */
export function useCanvasStorage() {
	const { user } = useContext(UserContext);
	const savingRef = useRef<Map<string, AbortController>>(new Map());

	const saveCanvas = useCallback(
		async (
			questionId: string,
			strokes: Stroke[],
			feedbackOverlay: unknown | null = null,
			objects: CanvasObject[] = []
		) => {
			if (!user?.uid || !questionId) return;

			// Cancel any in-flight save for this question
			const prev = savingRef.current.get(questionId);
			if (prev) prev.abort();
			const controller = new AbortController();
			savingRef.current.set(questionId, controller);

			try {
				const path = `question-data/${user.uid}/${questionId}.json`;
				const payload: SavedCanvasData = { strokes, feedbackOverlay, objects };
				const json = JSON.stringify(payload);
				const blob = new Blob([json], { type: "application/json" });
				const storageRef = ref(storage, path);

				await uploadBytes(storageRef, blob);

				if (controller.signal.aborted) return;

				// Write lightweight metadata to Firestore
				const metaRef = doc(db, "user-data", user.uid, "question-data", questionId);
				await setDoc(
					metaRef,
					{
						storagePath: path,
						strokeCount: strokes.length,
						updatedAt: serverTimestamp(),
					},
					{ merge: true }
				);
			} catch (err: any) {
				if (err?.name === "AbortError" || controller.signal.aborted) return;
				console.error("[useCanvasStorage] save failed:", err);
			} finally {
				savingRef.current.delete(questionId);
			}
		},
		[user?.uid]
	);

	const loadCanvas = useCallback(
		async (questionId: string): Promise<SavedCanvasData | null> => {
			if (!user?.uid || !questionId) return null;
			try {
				const path = `question-data/${user.uid}/${questionId}.json`;
				const storageRef = ref(storage, path);
				// Use getDownloadURL + fetch instead of getBytes for cross-device/CORS compatibility
				const url = await getDownloadURL(storageRef);
				const res = await fetch(url);
				if (!res.ok) return null;
				const parsed = await res.json();
				if (Array.isArray(parsed)) return { strokes: parsed as Stroke[], feedbackOverlay: null, objects: [] };
				if (parsed && typeof parsed === "object") {
					const obj = parsed as { strokes?: unknown; feedbackOverlay?: unknown; objects?: unknown };
					if (Array.isArray(obj.strokes)) {
						return {
							strokes: obj.strokes as Stroke[],
							feedbackOverlay: obj.feedbackOverlay ?? null,
							objects: Array.isArray(obj.objects) ? (obj.objects as CanvasObject[]) : [],
						};
					}
				}
				return null;
			} catch (err: any) {
				// storage/object-not-found is expected for questions without saved drawings
				if (err?.code === "storage/object-not-found") return null;
				console.error("[useCanvasStorage] load failed:", err);
				return null;
			}
		},
		[user?.uid]
	);

	/**
	 * Upload an attachment (image / rendered PDF page) to Storage and return a
	 * durable download URL, so canvas JSON only stores a small reference.
	 */
	const uploadCanvasAsset = useCallback(
		async (questionId: string, blob: Blob): Promise<string> => {
			if (!user?.uid || !questionId) throw new Error("Not signed in");
			const contentType = blob.type && blob.type !== "application/octet-stream" ? blob.type : "image/jpeg";
			const ext = EXT_FROM_MIME[contentType] ?? "jpg";
			const assetId =
				typeof crypto !== "undefined" && "randomUUID" in crypto
					? crypto.randomUUID()
					: `${Date.now()}-${Math.random().toString(36).slice(2)}`;
			const path = `question-data/${user.uid}/${questionId}/assets/${assetId}.${ext}`;
			const storageRef = ref(storage, path);
			await uploadBytes(storageRef, blob, { contentType });
			return getDownloadURL(storageRef);
		},
		[user?.uid]
	);

	return { saveCanvas, loadCanvas, uploadCanvasAsset };
}
