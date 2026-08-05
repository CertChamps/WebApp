/**
 * Firestore image-question catalogue written by migrate_images_to_firestore.py.
 *
 * Path:
 *   questions/{leavingcert|juniorcert}/subjects/{subject}/levels/{level}/questions/{id}
 *
 * Fields: year, paper, "paper type", topic, imagePath, questionName, fileName, source,
 *         markingSchemePath, markingSchemePaths (optional; backfilled by migrate script),
 *         audioPath, audioStartSec, audioStartLabel (optional; attach_audio_to_questions.py)
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  type QueryConstraint,
} from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";
import { db, storage } from "../../firebase";
import {
  DEFAULT_EXAM_CYCLE,
  getExamCycleConfig,
  type ExamCycleId,
} from "./examCycle";
import {
  getFirestoreSubjectIds,
  getStorageFolderName,
} from "../data/practiceHubSubjects";

export type CatalogueQuestion = {
  id: string;
  questionName: string;
  topic: string;
  subject: string;
  level: string;
  fileName: string;
  imagePath: string;
  year?: number;
  paper?: number;
  paperType?: string;
  /** Storage paths for marking scheme image(s), when backfilled. */
  markingSchemePaths?: string[];
  /** Listening audio Storage path (exam-audio/…), when attached. */
  audioPath?: string;
  /** Seek offset into the shared listening MP3 (seconds). */
  audioStartSec?: number;
  audioStartLabel?: string;
};

export type CatalogueTopic = {
  name: string;
  displayName: string;
  questionCount: number;
  thumbnailPath: string | null;
};

export type CataloguePaper = {
  /** Stable key: `${year}|${paper ?? "x"}|${paperType ?? ""}` */
  key: string;
  year: number;
  paper: number | null;
  paperType: string | null;
  label: string;
  questionCount: number;
  topics: string[];
};

type CacheEntry<T> = { data: T; ts: number };
const CACHE_TTL = 5 * 60 * 1000;

const subjectListCache = new Map<string, CacheEntry<string[]>>();
const levelListCache = new Map<string, CacheEntry<string[]>>();
const topicListCache = new Map<string, CacheEntry<CatalogueTopic[]>>();
const questionsCache = new Map<string, CacheEntry<CatalogueQuestion[]>>();
const resolvedSubjectCache = new Map<string, string>();

function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  return null;
}

function setCached<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T): T {
  cache.set(key, { data, ts: Date.now() });
  return data;
}

function prettifyName(raw: string): string {
  return raw
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Filename without extension, lowercased — used to spot cross-topic copies of the same image. */
export function catalogueFileStem(fileName: string): string {
  return fileName.replace(/\.[^.]+$/i, "").trim().toLowerCase();
}

/** Drop exact duplicate storage paths. */
export function dedupeCatalogueByImagePath(rows: CatalogueQuestion[]): CatalogueQuestion[] {
  const seen = new Set<string>();
  const out: CatalogueQuestion[] = [];
  for (const row of rows) {
    const key = row.imagePath.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

/**
 * Drop copies of the same exam image that were filed under multiple topics
 * (e.g. Algebra + Calculus both containing 2024_P1_Q5.png).
 * Keeps the first copy in topic-name order.
 */
export function dedupeCatalogueByFileStem(rows: CatalogueQuestion[]): CatalogueQuestion[] {
  const seen = new Set<string>();
  const out: CatalogueQuestion[] = [];
  const sorted = [...rows].sort(
    (a, b) =>
      a.topic.localeCompare(b.topic, undefined, { sensitivity: "base" }) ||
      a.fileName.localeCompare(b.fileName, undefined, { numeric: true, sensitivity: "base" })
  );
  for (const row of sorted) {
    const key = catalogueFileStem(row.fileName);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function normalise(s: string): string {
  return s.replace(/[-_\s]/g, "").toLowerCase();
}

function subjectsCollection(cycle: ExamCycleId) {
  const root = getExamCycleConfig(cycle).firestoreRoot;
  return collection(db, "questions", root, "subjects");
}

function levelDoc(cycle: ExamCycleId, subject: string, level: string) {
  const root = getExamCycleConfig(cycle).firestoreRoot;
  return doc(db, "questions", root, "subjects", subject, "levels", level);
}

function questionsCollection(cycle: ExamCycleId, subject: string, level: string) {
  const root = getExamCycleConfig(cycle).firestoreRoot;
  return collection(db, "questions", root, "subjects", subject, "levels", level, "questions");
}

/** Subject doc ids listed on the cycle root `sections` array. */
export async function listCatalogueSubjectIds(
  cycle: ExamCycleId = DEFAULT_EXAM_CYCLE
): Promise<string[]> {
  const cacheKey = cycle;
  const cached = getCached(subjectListCache, cacheKey);
  if (cached) return cached;

  const root = getExamCycleConfig(cycle).firestoreRoot;
  const snap = await getDoc(doc(db, "questions", root));
  const sections = snap.exists() ? snap.data()?.sections : undefined;
  const ids = Array.isArray(sections)
    ? sections.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    : [];

  // Fallback: enumerate subjects subcollection if sections empty
  if (ids.length === 0) {
    const all = await getDocs(subjectsCollection(cycle));
    const fromColl = all.docs.map((d) => d.id);
    return setCached(subjectListCache, cacheKey, fromColl);
  }
  return setCached(subjectListCache, cacheKey, ids);
}

/**
 * Map a UI slug / storage folder hint to the Firestore subject document id.
 */
export async function resolveCatalogueSubjectId(
  subjectHint: string,
  cycle: ExamCycleId = DEFAULT_EXAM_CYCLE
): Promise<string | null> {
  const hint = subjectHint.trim();
  if (!hint) return null;
  const cacheKey = `${cycle}:${hint}`;
  const cached = resolvedSubjectCache.get(cacheKey);
  if (cached) return cached;

  const available = await listCatalogueSubjectIds(cycle);
  const candidates = [
    ...getFirestoreSubjectIds(hint),
    getStorageFolderName(hint),
    hint,
  ];

  for (const c of candidates) {
    const exact = available.find((a) => a === c);
    if (exact) {
      resolvedSubjectCache.set(cacheKey, exact);
      return exact;
    }
  }

  const normHint = normalise(hint);
  const fuzzy =
    available.find((a) => normalise(a) === normHint) ??
    available.find((a) => {
      const n = normalise(a);
      return n.includes(normHint) || normHint.includes(n);
    });

  if (fuzzy) {
    resolvedSubjectCache.set(cacheKey, fuzzy);
    return fuzzy;
  }
  return null;
}

export async function listCatalogueLevels(
  subjectHint: string,
  cycle: ExamCycleId = DEFAULT_EXAM_CYCLE
): Promise<string[]> {
  const subject = await resolveCatalogueSubjectId(subjectHint, cycle);
  if (!subject) return [];

  const cacheKey = `${cycle}:${subject}`;
  const cached = getCached(levelListCache, cacheKey);
  if (cached) return cached;

  const root = getExamCycleConfig(cycle).firestoreRoot;
  const subjSnap = await getDoc(doc(db, "questions", root, "subjects", subject));
  let levels = Array.isArray(subjSnap.data()?.sections)
    ? (subjSnap.data()!.sections as string[]).filter((s) => typeof s === "string")
    : [];

  if (levels.length === 0) {
    const levelsSnap = await getDocs(
      collection(db, "questions", root, "subjects", subject, "levels")
    );
    levels = levelsSnap.docs.map((d) => d.id);
  }

  return setCached(levelListCache, cacheKey, levels);
}

/** Collect unique non-empty marking scheme storage paths from a question doc. */
function parseMarkingSchemePaths(data: Record<string, unknown>): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];
  const add = (value: unknown) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    paths.push(trimmed);
  };
  if (Array.isArray(data.markingSchemePaths)) {
    for (const entry of data.markingSchemePaths) add(entry);
  }
  add(data.markingSchemePath);
  return paths;
}

function parseQuestionDoc(
  id: string,
  data: Record<string, unknown>,
  fallbackSubject: string,
  fallbackLevel: string
): CatalogueQuestion | null {
  const imagePath = typeof data.imagePath === "string" ? data.imagePath.trim() : "";
  if (!imagePath) return null;

  const topic =
    typeof data.topic === "string" && data.topic.trim()
      ? data.topic.trim()
      : "Untagged";
  const fileName =
    typeof data.fileName === "string" && data.fileName.trim()
      ? data.fileName.trim()
      : imagePath.split("/").pop() ?? id;
  const questionName =
    typeof data.questionName === "string" && data.questionName.trim()
      ? data.questionName.trim()
      : prettifyName(fileName);

  const year = typeof data.year === "number" && Number.isFinite(data.year) ? data.year : undefined;
  const paper =
    typeof data.paper === "number" && (data.paper === 1 || data.paper === 2)
      ? data.paper
      : undefined;
  const paperTypeRaw = data["paper type"];
  const paperType =
    typeof paperTypeRaw === "string" && paperTypeRaw.trim()
      ? paperTypeRaw.trim()
      : undefined;
  const markingSchemePaths = parseMarkingSchemePaths(data);
  const audioPath =
    typeof data.audioPath === "string" && data.audioPath.trim()
      ? data.audioPath.trim()
      : undefined;
  const audioStartSec =
    typeof data.audioStartSec === "number" && Number.isFinite(data.audioStartSec)
      ? Math.max(0, data.audioStartSec)
      : undefined;
  const audioStartLabel =
    typeof data.audioStartLabel === "string" && data.audioStartLabel.trim()
      ? data.audioStartLabel.trim()
      : undefined;

  return {
    id,
    questionName,
    topic,
    subject:
      typeof data.subject === "string" && data.subject.trim()
        ? data.subject.trim()
        : fallbackSubject,
    level:
      typeof data.level === "string" && data.level.trim()
        ? data.level.trim()
        : fallbackLevel,
    fileName,
    imagePath,
    year,
    paper,
    paperType,
    ...(markingSchemePaths.length > 0 ? { markingSchemePaths } : {}),
    ...(audioPath ? { audioPath } : {}),
    ...(audioStartSec != null ? { audioStartSec } : {}),
    ...(audioStartLabel ? { audioStartLabel } : {}),
  };
}

/** All catalogue questions for a subject + level (optionally filtered by topic). */
export async function listCatalogueQuestions(
  subjectHint: string,
  level: string,
  opts?: {
    cycle?: ExamCycleId;
    topic?: string | null;
    year?: number | null;
    paper?: number | null;
  }
): Promise<CatalogueQuestion[]> {
  const cycle = opts?.cycle ?? DEFAULT_EXAM_CYCLE;
  const subject = await resolveCatalogueSubjectId(subjectHint, cycle);
  if (!subject) return [];

  const topicFilter = opts?.topic?.trim() || null;
  const yearFilter = opts?.year ?? null;
  const paperFilter = opts?.paper ?? null;

  const cacheKey = `${cycle}:${subject}:${level}:${topicFilter ?? "*"}`;
  let all = getCached(questionsCache, cacheKey);

  if (!all) {
    const constraints: QueryConstraint[] = [];
    if (topicFilter) constraints.push(where("topic", "==", topicFilter));

    const coll = questionsCollection(cycle, subject, level);
    const snap =
      constraints.length > 0
        ? await getDocs(query(coll, ...constraints))
        : await getDocs(coll);

    all = [];
    for (const d of snap.docs) {
      const parsed = parseQuestionDoc(d.id, d.data() as Record<string, unknown>, subject, level);
      if (parsed) all.push(parsed);
    }
    all.sort((a, b) =>
      a.fileName.localeCompare(b.fileName, undefined, { numeric: true, sensitivity: "base" })
    );
    setCached(questionsCache, cacheKey, all);
  }

  const filtered = all.filter((q) => {
    if (yearFilter != null && q.year !== yearFilter) return false;
    if (paperFilter != null && q.paper !== paperFilter) return false;
    return true;
  });

  // Collapse identical storage paths only. Cross-topic filename copies are kept
  // here so topic views still see each folder's files; paper browse dedupes later.
  return dedupeCatalogueByImagePath(filtered);
}

export async function listCatalogueTopics(
  subjectHint: string,
  level: string,
  cycle: ExamCycleId = DEFAULT_EXAM_CYCLE
): Promise<CatalogueTopic[]> {
  const subject = await resolveCatalogueSubjectId(subjectHint, cycle);
  if (!subject) return [];

  const cacheKey = `${cycle}:${subject}:${level}`;
  const cached = getCached(topicListCache, cacheKey);
  if (cached) return cached;

  const levelSnap = await getDoc(levelDoc(cycle, subject, level));
  const topicsFromDoc = Array.isArray(levelSnap.data()?.topics)
    ? (levelSnap.data()!.topics as unknown[]).filter((t): t is string => typeof t === "string")
    : [];

  // Always count from questions for accurate questionCount + thumbnail
  const questions = await listCatalogueQuestions(subject, level, { cycle });
  const byTopic = new Map<string, CatalogueQuestion[]>();
  for (const q of questions) {
    const list = byTopic.get(q.topic) ?? [];
    list.push(q);
    byTopic.set(q.topic, list);
  }

  const names =
    topicsFromDoc.length > 0
      ? topicsFromDoc
      : [...byTopic.keys()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  // Ensure topics that only appear in questions are included
  for (const name of byTopic.keys()) {
    if (!names.includes(name)) names.push(name);
  }

  const topics: CatalogueTopic[] = names.map((name) => {
    const qs = byTopic.get(name) ?? [];
    return {
      name,
      displayName: prettifyName(name),
      questionCount: qs.length,
      thumbnailPath: qs[0]?.imagePath ?? null,
    };
  });

  topics.sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" })
  );
  return setCached(topicListCache, cacheKey, topics);
}

export function paperGroupKey(
  year: number | undefined,
  paper: number | undefined,
  paperType: string | undefined
): string {
  return `${year ?? 0}|${paper ?? "x"}|${paperType ?? ""}`;
}

export function paperGroupLabel(
  year: number | undefined,
  paper: number | undefined,
  paperType: string | undefined
): string {
  if (!year) return "Unknown year";
  const parts = [String(year)];
  if (paper === 1 || paper === 2) parts.push(`Paper ${paper}`);
  if (paperType) parts.push(`(${paperType})`);
  return parts.join(" ");
}

/** Aggregate questions into paper groups for "browse by paper". */
export function buildCataloguePapers(questions: CatalogueQuestion[]): CataloguePaper[] {
  // Paper cards must not count the same exam image once per topic folder.
  const unique = dedupeCatalogueByFileStem(dedupeCatalogueByImagePath(questions));
  const map = new Map<string, CataloguePaper & { topicSet: Set<string> }>();

  for (const q of unique) {
    if (q.year == null || q.year <= 0) continue;
    const key = paperGroupKey(q.year, q.paper, q.paperType);
    let row = map.get(key);
    if (!row) {
      row = {
        key,
        year: q.year,
        paper: q.paper ?? null,
        paperType: q.paperType ?? null,
        label: paperGroupLabel(q.year, q.paper, q.paperType),
        questionCount: 0,
        topics: [],
        topicSet: new Set(),
      };
      map.set(key, row);
    }
    row.questionCount += 1;
    row.topicSet.add(q.topic);
  }

  return [...map.values()]
    .map(({ topicSet, ...rest }) => ({
      ...rest,
      topics: [...topicSet].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    }))
    .sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      const pa = a.paper ?? 99;
      const pb = b.paper ?? 99;
      if (pa !== pb) return pa - pb;
      return (a.paperType ?? "").localeCompare(b.paperType ?? "");
    });
}

export async function listCataloguePapers(
  subjectHint: string,
  level: string,
  cycle: ExamCycleId = DEFAULT_EXAM_CYCLE
): Promise<CataloguePaper[]> {
  const questions = await listCatalogueQuestions(subjectHint, level, { cycle });
  return buildCataloguePapers(questions);
}

export async function listCatalogueSubjectAvailability(
  cycle: ExamCycleId = DEFAULT_EXAM_CYCLE
): Promise<{ storageName: string; levels: string[] }[]> {
  const subjects = await listCatalogueSubjectIds(cycle);
  const out: { storageName: string; levels: string[] }[] = [];
  for (const subject of subjects) {
    try {
      const levels = await listCatalogueLevels(subject, cycle);
      if (levels.length > 0) out.push({ storageName: subject, levels });
    } catch {
      // skip broken subjects
    }
  }
  return out;
}

/** Resolve a download URL for a storage path (cached by browser HTTP cache). */
export async function resolveImageDownloadUrl(imagePath: string): Promise<string> {
  return getDownloadURL(ref(storage, imagePath));
}

/** Clear in-memory catalogue caches (e.g. after admin migration). */
export function clearCatalogueCaches(): void {
  subjectListCache.clear();
  levelListCache.clear();
  topicListCache.clear();
  questionsCache.clear();
  resolvedSubjectCache.clear();
}
