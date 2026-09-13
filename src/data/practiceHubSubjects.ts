import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { auth, db } from "../../firebase";
import { DEFAULT_EXAM_CYCLE, type ExamCycleId } from "../lib/examCycle";

/**
 * Leaving Cert subjects for Practice Hub.
 * id: slug used for filtering (paper.subject from Firestore may match or be mapped below).
 */

export type SubjectOption = { id: string; label: string };

export const ALL_SUBJECTS_OPTION: SubjectOption = { id: "all-subjects", label: "All subjects" };

export function isAllSubjectsResource(subjectId?: string | null, subjectLabel?: string | null) {
  const id = (subjectId ?? "").trim().toLowerCase();
  const label = (subjectLabel ?? "").trim().toLowerCase();
  return id === ALL_SUBJECTS_OPTION.id || label === "all subjects" || label === "general";
}

/** Slug from label for use as id (lowercase, hyphenated). */
function slug(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/\s*&\s*/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[()]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const LABELS = [
  "Accounting",
  "Agricultural Science",
  "Ancient Greek",
  "Applied Mathematics",
  "Arabic",
  "Art",
  "Biology",
  "Bulgarian",
  "Business",
  "Chemistry",
  "Classical Studies",
  "Computer Science",
  "Construction Studies",
  "Croatian",
  "Czech",
  "Danish",
  "Design & Communication Graphics",
  "Dutch",
  "Economics",
  "Engineering",
  "English",
  "Estonian",
  "Finnish",
  "French",
  "Geography",
  "German",
  "Hebrew Studies",
  "History (early modern)",
  "History (later modern)",
  "Home Economics",
  "Hungarian",
  "Irish",
  "Italian",
  "Japanese",
  "Latin",
  "Latvian",
  "Link Modules",
  "Lithuanian",
  "Maltese",
  "Mandarin Chinese",
  "Mathematics",
  "Modern Greek",
  "Music",
  "Physical Education",
  "Physics",
  "Physics and Chemistry",
  "Polish",
  "Politics and Society",
  "Portuguese",
  "Religious Education",
  "Romanian",
  "Russian",
  "Slovakian",
  "Slovenian",
  "Spanish",
  "Swedish",
  "Technology",
  "Ukrainian",
] as const;

export const PRACTICE_HUB_SUBJECTS: SubjectOption[] = LABELS.map((label) => ({
  id: slug(label),
  label,
}));

/** Map our subject id (slug) or Firestore subject doc id to possible backend values for filtering papers. */
export const SUBJECT_ID_TO_BACKEND: Record<string, string[]> = {
  mathematics: ["maths", "mathematics"],
  "applied-mathematics": ["applied-maths", "applied-mathematics", "applied maths"],
  /** Firestore document id under leavingcert/subjects (must match sections array). */
  "applied-maths": ["applied-maths"],
};

/** Map Firestore/backend subject id to display label (for dropdown when using sections from Firestore). */
const BACKEND_ID_TO_LABEL: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  PRACTICE_HUB_SUBJECTS.forEach((s) => {
    m[s.id] = s.label;
    SUBJECT_ID_TO_BACKEND[s.id]?.forEach((b) => (m[b] = s.label));
  });
  return m;
})();

export function getSubjectLabel(backendId: string): string {
  const label = BACKEND_ID_TO_LABEL[backendId];
  if (label) return label;
  return backendId
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Convert a backend/storage subject id to the canonical Practice Hub subject slug. */
export function getPracticeSubjectId(subjectId: string): string {
  const normalized = subjectId.trim().toLowerCase();
  if (PRACTICE_HUB_SUBJECTS.some((subject) => subject.id === normalized)) {
    return normalized;
  }
  const mapped = Object.entries(SUBJECT_ID_TO_BACKEND).find(([, backendIds]) =>
    backendIds.includes(normalized)
  );
  return mapped?.[0] ?? normalized;
}

export function subjectMatchesPaper(subjectId: string | null, paperSubject: string | undefined): boolean {
  if (!subjectId) return true;
  if (!paperSubject) return false;
  const normalized = paperSubject.toLowerCase().trim();
  const backend = SUBJECT_ID_TO_BACKEND[subjectId];
  if (backend) return backend.some((b) => b === normalized);
  return normalized === subjectId;
}

/**
 * Map UI subject slugs to Firebase Storage folder names under temp_images/leaving-cert/.
 * Only needed when the slug() output doesn't match the actual folder name in Storage.
 */
const SLUG_TO_STORAGE_FOLDER: Record<string, string> = {
  "applied-mathematics": "applied-maths",
  "design-communication-graphics": "design-and-communication-graphics",
};

/** Convert a UI subject slug to the corresponding Firebase Storage folder name. */
export function getStorageFolderName(subjectSlug: string): string {
  return SLUG_TO_STORAGE_FOLDER[subjectSlug] ?? subjectSlug;
}

/**
 * Map UI subject slugs to Firestore document IDs under questions/leavingcert/subjects/.
 * Only entries where the slug differs from the Firestore doc ID are needed.
 */
const SLUG_TO_FIRESTORE_IDS: Record<string, string[]> = {
  mathematics: ["maths"],
  "applied-mathematics": ["applied-maths"],
};

/**
 * Given a UI subject slug, return all Firestore subject doc IDs to query for papers.
 * Most slugs map 1:1, but some (like "mathematics" → "maths") need translation.
 */
export function getFirestoreSubjectIds(subjectSlug: string): string[] {
  return SLUG_TO_FIRESTORE_IDS[subjectSlug] ?? [subjectSlug];
}

const FAVOURITES_KEY = "practice-hub-subject-favourites";
export const FAVOURITES_CHANGED_EVENT = "practice-hub-favourites-changed";
const FAVOURITES_FIELD = "favouriteSubjects";

function cleanSubjectIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
}

function encodeFavouriteId(cycle: ExamCycleId, subjectId: string): string {
  return `${cycle}:${subjectId}`;
}

function parseFavouriteEntry(raw: string): { cycle: ExamCycleId; subjectId: string } {
  if (raw.startsWith("junior:")) return { cycle: "junior", subjectId: raw.slice("junior:".length) };
  if (raw.startsWith("leaving:")) return { cycle: "leaving", subjectId: raw.slice("leaving:".length) };
  return { cycle: "leaving", subjectId: raw };
}

export function subjectIdsForCycle(stored: string[], cycle: ExamCycleId): string[] {
  return [
    ...new Set(
      stored
        .map(parseFavouriteEntry)
        .filter((entry) => entry.cycle === cycle && entry.subjectId.length > 0)
        .map((entry) => entry.subjectId)
    ),
  ];
}

function toggleFavouriteForCycle(subjectId: string, cycle: ExamCycleId, stored: string[]): string[] {
  const already = stored.some((raw) => {
    const entry = parseFavouriteEntry(raw);
    return entry.cycle === cycle && entry.subjectId === subjectId;
  });
  const without = stored.filter((raw) => {
    const entry = parseFavouriteEntry(raw);
    return !(entry.cycle === cycle && entry.subjectId === subjectId);
  });
  if (already) return without;
  return [...without, encodeFavouriteId(cycle, subjectId)];
}

function getStoredFavouriteIds(): string[] {
  try {
    const raw = localStorage.getItem(FAVOURITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return cleanSubjectIds(parsed);
  } catch {
    return [];
  }
}

export function getFavouriteSubjectIds(cycle: ExamCycleId = "leaving"): string[] {
  return subjectIdsForCycle(getStoredFavouriteIds(), cycle);
}

export function setFavouriteSubjectIds(ids: string[], options: { syncRemote?: boolean } = {}): void {
  const cleanIds = [...new Set(ids)];
  try {
    localStorage.setItem(FAVOURITES_KEY, JSON.stringify(cleanIds));
    window.dispatchEvent(new Event(FAVOURITES_CHANGED_EVENT));
  } catch (_) {}

  if (options.syncRemote === false) return;
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  setDoc(doc(db, "user-data", uid), { [FAVOURITES_FIELD]: cleanIds }, { merge: true }).catch((err) => {
    console.error("Failed to sync favourite subjects:", err);
  });
}

export function toggleFavourite(
  id: string,
  _current: string[] = [],
  cycle: ExamCycleId = "leaving"
): string[] {
  const nextStored = toggleFavouriteForCycle(id, cycle, getStoredFavouriteIds());
  setFavouriteSubjectIds(nextStored);
  return subjectIdsForCycle(nextStored, cycle);
}

export function subjectMatchesFavourite(subject: string, favourites: string[]): boolean {
  const normalized = subject.toLowerCase().trim();
  return favourites.some((fav) => {
    if (fav === normalized) return true;
    const backend = SUBJECT_ID_TO_BACKEND[fav] ?? [];
    return backend.includes(normalized);
  });
}

export function useSyncedFavouriteSubjectIds(cycle: ExamCycleId = DEFAULT_EXAM_CYCLE): string[] {
  const [ids, setIds] = useState<string[]>(() => getFavouriteSubjectIds(cycle));
  const [uid, setUid] = useState<string | null>(() => auth.currentUser?.uid ?? null);

  useEffect(() => {
    return onAuthStateChanged(auth, (firebaseUser) => {
      setUid(firebaseUser?.uid ?? null);
    });
  }, []);

  useEffect(() => {
    const updateFromLocal = () => setIds(getFavouriteSubjectIds(cycle));
    window.addEventListener(FAVOURITES_CHANGED_EVENT, updateFromLocal);
    window.addEventListener("storage", updateFromLocal);

    if (!uid) {
      return () => {
        window.removeEventListener(FAVOURITES_CHANGED_EVENT, updateFromLocal);
        window.removeEventListener("storage", updateFromLocal);
      };
    }

    const unsubscribe = onSnapshot(doc(db, "user-data", uid), (snap) => {
      const data = snap.data();
      const hasRemoteFavourites =
        data != null && Object.prototype.hasOwnProperty.call(data, FAVOURITES_FIELD);
      const remote = cleanSubjectIds(data?.[FAVOURITES_FIELD]);
      if (hasRemoteFavourites) {
        setFavouriteSubjectIds(remote, { syncRemote: false });
        setIds(subjectIdsForCycle(remote, cycle));
        return;
      }

      const localStored = getStoredFavouriteIds();
      setIds(subjectIdsForCycle(localStored, cycle));
      if (localStored.length > 0) {
        setFavouriteSubjectIds(localStored);
      }
    });

    return () => {
      unsubscribe();
      window.removeEventListener(FAVOURITES_CHANGED_EVENT, updateFromLocal);
      window.removeEventListener("storage", updateFromLocal);
    };
  }, [cycle, uid]);

  return ids;
}
