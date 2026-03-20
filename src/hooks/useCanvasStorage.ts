import { useCallback, useContext, useRef } from "react";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db, storage } from "../../firebase";
import { UserContext } from "../context/UserContext";

type Point = { x: number; y: number; pressure: number };
type Stroke = { points: Point[]; tool: "pen" | "eraser" };

export type SavedCanvasData = {
	strokes: Stroke[];
	feedbackOverlay: unknown | null;
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
		async (questionId: string, strokes: Stroke[], feedbackOverlay: unknown | null = null) => {
			if (!user?.uid || !questionId) return;

			// Cancel any in-flight save for this question
			const prev = savingRef.current.get(questionId);
			if (prev) prev.abort();
			const controller = new AbortController();
			savingRef.current.set(questionId, controller);

			try {
				const path = `question-data/${user.uid}/${questionId}.json`;
				const payload: SavedCanvasData = { strokes, feedbackOverlay };
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
				if (Array.isArray(parsed)) return { strokes: parsed as Stroke[], feedbackOverlay: null };
				if (parsed && typeof parsed === "object") {
					const obj = parsed as { strokes?: unknown; feedbackOverlay?: unknown };
					if (Array.isArray(obj.strokes)) {
						return { strokes: obj.strokes as Stroke[], feedbackOverlay: obj.feedbackOverlay ?? null };
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

	return { saveCanvas, loadCanvas };
}
