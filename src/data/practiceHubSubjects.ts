/**
 * Leaving Cert subjects for Practice Hub.
 * id: slug used for filtering (paper.subject from Firestore may match or be mapped below).
 */

export type SubjectOption = { id: string; label: string };

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

export function getFavouriteSubjectIds(): string[] {
  try {
    const raw = localStorage.getItem(FAVOURITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function setFavouriteSubjectIds(ids: string[]): void {
  try {
    localStorage.setItem(FAVOURITES_KEY, JSON.stringify(ids));
  } catch (_) {}
}

export function toggleFavourite(id: string, current: string[]): string[] {
  const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
  setFavouriteSubjectIds(next);
  return next;
}
