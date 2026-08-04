import { useEffect, useRef, useState } from "react";
import { ref, listAll, getDownloadURL } from "firebase/storage";
import { storage } from "../../firebase";
import {
  DEFAULT_EXAM_CYCLE,
  type ExamCycleId,
} from "../lib/examCycle";
import {
  listCatalogueLevels,
  listCataloguePapers,
  listCatalogueQuestions,
  listCatalogueSubjectAvailability,
  listCatalogueTopics,
  resolveImageDownloadUrl,
  dedupeCatalogueByFileStem,
  type CataloguePaper,
  type CatalogueQuestion,
} from "../lib/firestoreImageCatalogue";

const MARKING_SCHEME_BASE = "marking-schemes/leaving-cert";

const markingSchemeFileCache = new Map<string, CacheEntry<MarkingSchemeFile[]>>();
const markingSchemeLevelFileCache = new Map<string, CacheEntry<MarkingSchemeFile[]>>();

export type ImageTopic = {
  name: string;
  displayName: string;
  path: string;
  questionCount: number;
  thumbnailUrl: string | null;
};

export type ImageQuestion = {
  name: string;
  displayName: string;
  storagePath: string;
  downloadUrl: string;
  /** Firestore catalogue metadata (when loaded from Firestore). */
  year?: number;
  paper?: number;
  paperType?: string;
  topic?: string;
  catalogueId?: string;
  /** Storage paths for marking scheme image(s), when present on the catalogue doc. */
  markingSchemePaths?: string[];
};

export type GroupedImageQuestion = {
  key: string;
  displayName: string;
  images: ImageQuestion[];
  year?: number;
  paper?: number;
  paperType?: string;
  topic?: string;
  /** Aggregated marking scheme paths from catalogue (preferred over Storage listing). */
  markingSchemePaths?: string[];
};

export type ImageSubjectAvailability = {
  storageName: string;
  levels: string[];
};

export type ImagePaperGroup = CataloguePaper;

type CacheEntry<T> = { data: T; ts: number };
const CACHE_TTL = 5 * 60 * 1000;

const levelCache = new Map<string, CacheEntry<string[]>>();
const topicCache = new Map<string, CacheEntry<ImageTopic[]>>();
const questionCache = new Map<string, CacheEntry<ImageQuestion[]>>();
const paperCache = new Map<string, CacheEntry<ImagePaperGroup[]>>();
let subjectAvailabilityCache: CacheEntry<ImageSubjectAvailability[]> | null = null;

function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  return null;
}

/** Lists subjects that have image questions in Firestore (levels non-empty). */
export async function listImageSubjectAvailability(
  cycle: ExamCycleId = DEFAULT_EXAM_CYCLE
): Promise<ImageSubjectAvailability[]> {
  if (
    subjectAvailabilityCache &&
    subjectAvailabilityCache.ts &&
    Date.now() - subjectAvailabilityCache.ts < CACHE_TTL &&
    (subjectAvailabilityCache as CacheEntry<ImageSubjectAvailability[]> & { cycle?: string }).cycle ===
      cycle
  ) {
    return subjectAvailabilityCache.data;
  }

  const available = await listCatalogueSubjectAvailability(cycle);
  subjectAvailabilityCache = { data: available, ts: Date.now() };
  (subjectAvailabilityCache as CacheEntry<ImageSubjectAvailability[]> & { cycle?: string }).cycle =
    cycle;
  for (const s of available) {
    levelCache.set(`${cycle}:${s.storageName}`, { data: s.levels, ts: Date.now() });
  }
  return available;
}

export function useImageSubjectAvailability(
  cycle: ExamCycleId = DEFAULT_EXAM_CYCLE
): {
  subjects: ImageSubjectAvailability[];
  loading: boolean;
  error: string | null;
} {
  const [subjects, setSubjects] = useState<ImageSubjectAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listImageSubjectAvailability(cycle)
      .then((result) => {
        if (!cancelled) setSubjects(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setSubjects([]);
        setError(err instanceof Error ? err.message : "Failed to load subjects");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cycle]);

  return { subjects, loading, error };
}

function stripExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}

function prettifyName(raw: string): string {
  return stripExtension(raw)
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Try stripping a trailing separator (space/underscore/dash) + digits from a
 * filename without extension, e.g. "2013_3_Q9_2" → "2013_3_Q9".
 */
function tryStripSuffix(nameWithoutExt: string): string {
  return nameWithoutExt.replace(/[\s_-]+\d+$/, "");
}

/** year + optional P1/P2 + Q number — ignores part letters / SAMPLE / DEFERRED. */
const EXAM_CORE_RE =
  /(?<year>(?:19|20)\d{2})(?:_P(?<paper>[12]))?.*?[_-]?Q(?<q>\d+)/i;

export type ExamCore = { year: string; paper: string; q: string };

export function extractExamCore(stem: string): ExamCore | null {
  if (!stem) return null;
  const m = EXAM_CORE_RE.exec(stem);
  if (!m?.groups?.year || !m.groups.q) return null;
  return {
    year: m.groups.year,
    paper: m.groups.paper ?? "",
    q: m.groups.q,
  };
}

function examCoresEqual(a: ExamCore | null, b: ExamCore | null): boolean {
  return !!a && !!b && a.year === b.year && a.paper === b.paper && a.q === b.q;
}

function isImageMarkingSchemeName(name: string): boolean {
  return !/\.pdf$/i.test(name);
}

/** Extract the trailing part number (0 if no suffix matched). */
function getPartNumber(nameWithoutExt: string, groupKey: string): number {
  if (nameWithoutExt === groupKey) return 0;
  const match = nameWithoutExt.match(/[\s_-]+(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

/** Natural sort comparison for filenames like Q1, Q2, Q10. */
function naturalCompare(a: string, b: string): number {
  const pa = a.split(/(\d+)/);
  const pb = b.split(/(\d+)/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const sa = pa[i] ?? "";
    const sb = pb[i] ?? "";
    const na = parseInt(sa, 10);
    const nb = parseInt(sb, 10);
    if (!isNaN(na) && !isNaN(nb)) {
      if (na !== nb) return na - nb;
    } else {
      const cmp = sa.localeCompare(sb);
      if (cmp !== 0) return cmp;
    }
  }
  return 0;
}

/**
 * Groups images that belong to the same question. Uses a two-pass approach:
 * first tries stripping a trailing number suffix, then only commits to the
 * grouping if multiple files share that base key or a file with the exact base
 * name exists. This avoids false positives like stripping "_9" from "Q9".
 */
export function groupImageQuestions(flat: ImageQuestion[]): GroupedImageQuestion[] {
  // Exact same storage object twice → keep one
  const pathSeen = new Set<string>();
  const uniqueFlat = flat.filter((q) => {
    const key = q.storagePath.trim().toLowerCase();
    if (!key || pathSeen.has(key)) return false;
    pathSeen.add(key);
    return true;
  });

  const bareNames = uniqueFlat.map((q) => stripExtension(q.name));
  const bareNameSet = new Set(bareNames);

  const tentativeKeyCount = new Map<string, number>();
  for (const bare of bareNames) {
    const k = tryStripSuffix(bare);
    tentativeKeyCount.set(k, (tentativeKeyCount.get(k) ?? 0) + 1);
  }

  const map = new Map<string, ImageQuestion[]>();
  const keyOrder: string[] = [];

  for (let i = 0; i < uniqueFlat.length; i++) {
    const q = uniqueFlat[i];
    const bare = bareNames[i];
    const tentativeKey = tryStripSuffix(bare);
    const stripped = tentativeKey !== bare;

    const shouldGroup =
      stripped &&
      ((tentativeKeyCount.get(tentativeKey) ?? 0) > 1 || bareNameSet.has(tentativeKey));

    const key = shouldGroup ? tentativeKey : bare;

    if (!map.has(key)) {
      map.set(key, []);
      keyOrder.push(key);
    }
    map.get(key)!.push(q);
  }

  keyOrder.sort(naturalCompare);

  return keyOrder.map((key) => {
    const images = map.get(key)!;
    // Within a multipart group, collapse duplicate part filenames from other topics
    const stemSeen = new Set<string>();
    const dedupedImages = images.filter((img) => {
      const stem = stripExtension(img.name).toLowerCase();
      if (stemSeen.has(stem)) return false;
      stemSeen.add(stem);
      return true;
    });
    dedupedImages.sort(
      (a, b) =>
        getPartNumber(stripExtension(a.name), key) -
        getPartNumber(stripExtension(b.name), key)
    );
    const head = dedupedImages[0];
    const markingSchemePaths = collectMarkingSchemePaths(dedupedImages);
    return {
      key,
      displayName: prettifyName(key),
      images: dedupedImages,
      year: head?.year,
      paper: head?.paper,
      paperType: head?.paperType,
      topic: head?.topic,
      ...(markingSchemePaths.length > 0 ? { markingSchemePaths } : {}),
    };
  });
}

function collectMarkingSchemePaths(
  images: Array<{ markingSchemePaths?: string[] }>
): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const img of images) {
    for (const p of img.markingSchemePaths ?? []) {
      const trimmed = p.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      paths.push(trimmed);
    }
  }
  return paths;
}

async function catalogueToImageQuestions(rows: CatalogueQuestion[]): Promise<ImageQuestion[]> {
  const results = await Promise.allSettled(
    rows.map(async (q): Promise<ImageQuestion> => {
      const downloadUrl = await resolveImageDownloadUrl(q.imagePath);
      return {
        name: q.fileName,
        displayName: q.questionName,
        storagePath: q.imagePath,
        downloadUrl,
        year: q.year,
        paper: q.paper,
        paperType: q.paperType,
        topic: q.topic,
        catalogueId: q.id,
        ...(q.markingSchemePaths?.length
          ? { markingSchemePaths: q.markingSchemePaths }
          : {}),
      } satisfies ImageQuestion;
    })
  );

  return results
    .filter((r): r is PromiseFulfilledResult<ImageQuestion> => r.status === "fulfilled")
    .map((r) => r.value);
}

export async function listLevelsForSubject(
  subject: string,
  cycle: ExamCycleId = DEFAULT_EXAM_CYCLE
): Promise<string[]> {
  const key = `${cycle}:${subject}`;
  const cached = getCached(levelCache, key);
  if (cached) return cached;

  const levels = await listCatalogueLevels(subject, cycle);
  levelCache.set(key, { data: levels, ts: Date.now() });
  return levels;
}

export async function listTopicsForSubjectLevel(
  subject: string,
  level: string,
  cycle: ExamCycleId = DEFAULT_EXAM_CYCLE
): Promise<ImageTopic[]> {
  const key = `${cycle}:${subject}/${level}`;
  const cached = getCached(topicCache, key);
  if (cached) return cached;

  const topics = await listCatalogueTopics(subject, level, cycle);
  const mapped: ImageTopic[] = await Promise.all(
    topics.map(async (t) => {
      let thumbnailUrl: string | null = null;
      if (t.thumbnailPath) {
        try {
          thumbnailUrl = await resolveImageDownloadUrl(t.thumbnailPath);
        } catch {
          thumbnailUrl = null;
        }
      }
      return {
        name: t.name,
        displayName: t.displayName,
        path: t.name,
        questionCount: t.questionCount,
        thumbnailUrl,
      };
    })
  );

  topicCache.set(key, { data: mapped, ts: Date.now() });
  return mapped;
}

export type MarkingSchemeFile = {
  name: string;
  storagePath: string;
};

/** Marking schemes: prefer Firestore catalogue paths; Storage listing is a fallback. */
export async function listMarkingSchemeFilesForTopic(
  subject: string,
  level: string,
  topic: string,
  cycle: ExamCycleId = DEFAULT_EXAM_CYCLE
): Promise<MarkingSchemeFile[]> {
  const msBase =
    cycle === "junior"
      ? "marking-schemes/junior-cycle"
      : MARKING_SCHEME_BASE;

  const key = `ms/${cycle}/${subject}/${level}/${topic}`;
  const cached = getCached(markingSchemeFileCache, key);
  if (cached) return cached;

  try {
    const folderRef = ref(storage, `${msBase}/${subject}/${level}-level/${topic}`);
    try {
      const result = await listAll(folderRef);
      const files = result.items.map((item) => ({
        name: item.name,
        storagePath: item.fullPath,
      }));
      if (files.length > 0) {
        markingSchemeFileCache.set(key, { data: files, ts: Date.now() });
        return files;
      }
    } catch {
      // fall through to level-wide search
    }

    const levelKey = `ms-level/${cycle}/${subject}/${level}`;
    const cachedLevelFiles = getCached(markingSchemeLevelFileCache, levelKey);
    if (cachedLevelFiles) {
      markingSchemeFileCache.set(key, { data: cachedLevelFiles, ts: Date.now() });
      return cachedLevelFiles;
    }

    const levelRef = ref(storage, `${msBase}/${subject}/${level}-level`);
    const levelResult = await listAll(levelRef);
    const nestedResults = await Promise.all(
      levelResult.prefixes.map(async (prefix) => {
        try {
          const nested = await listAll(ref(storage, prefix.fullPath));
          return nested.items.map((item) => ({
            name: item.name,
            storagePath: item.fullPath,
          }));
        } catch {
          return [] as MarkingSchemeFile[];
        }
      })
    );
    const levelFiles = [
      ...levelResult.items.map((item) => ({ name: item.name, storagePath: item.fullPath })),
      ...nestedResults.flat(),
    ];
    markingSchemeLevelFileCache.set(levelKey, { data: levelFiles, ts: Date.now() });
    markingSchemeFileCache.set(key, { data: levelFiles, ts: Date.now() });
    return levelFiles;
  } catch (err) {
    // Partial / missing Storage trees must not break practice UI
    console.warn("[marking-schemes] Storage list failed; catalogue paths may still work:", err);
    markingSchemeFileCache.set(key, { data: [], ts: Date.now() });
    return [];
  }
}

/** Build MarkingSchemeFile entries from storage path strings. */
export function markingSchemeFilesFromPaths(paths: string[]): MarkingSchemeFile[] {
  const seen = new Set<string>();
  const files: MarkingSchemeFile[] = [];
  for (const raw of paths) {
    const storagePath = raw?.trim();
    if (!storagePath || seen.has(storagePath)) continue;
    seen.add(storagePath);
    files.push({
      name: storagePath.split("/").pop() || storagePath,
      storagePath,
    });
  }
  return files;
}

/**
 * Resolve marking schemes for a grouped question.
 * Prefers Firestore catalogue paths (survives partial Storage listing failures);
 * falls back to filename matching against a Storage-listed pool.
 */
export function getMarkingSchemeFilesForGroupedQuestion(
  allFiles: MarkingSchemeFile[],
  grouped: GroupedImageQuestion
): MarkingSchemeFile[] {
  const fromCatalogue = markingSchemeFilesFromPaths([
    ...(grouped.markingSchemePaths ?? []),
    ...grouped.images.flatMap((img) => img.markingSchemePaths ?? []),
  ]);
  if (fromCatalogue.length > 0) return fromCatalogue;

  if (allFiles.length === 0) return [];

  const imageFiles = allFiles.filter((f) => isImageMarkingSchemeName(f.name));
  const groupKey = grouped.key;
  const partPrefix = `${groupKey}_`;
  const groupCore = extractExamCore(groupKey);

  const matched = imageFiles.filter((f) => {
    const bare = stripExtension(f.name);
    if (bare === groupKey || bare.startsWith(partPrefix)) return true;
    return examCoresEqual(groupCore, extractExamCore(bare));
  });

  matched.sort((a, b) => {
    const pa = getPartNumber(stripExtension(a.name), groupKey);
    const pb = getPartNumber(stripExtension(b.name), groupKey);
    return pa - pb || naturalCompare(a.name, b.name);
  });

  return matched;
}

export async function resolveMarkingSchemeUrls(
  files: MarkingSchemeFile[]
): Promise<ImageQuestion[]> {
  if (files.length === 0) return [];

  const results = await Promise.allSettled(
    files.map(async (f): Promise<ImageQuestion> => {
      const path = f.storagePath?.trim();
      if (!path) throw new Error("empty marking scheme path");
      const downloadUrl = await getDownloadURL(ref(storage, path));
      return {
        name: f.name,
        displayName: prettifyName(f.name),
        storagePath: path,
        downloadUrl,
      };
    })
  );

  const resolved = results
    .filter((r): r is PromiseFulfilledResult<ImageQuestion> => r.status === "fulfilled")
    .map((r) => r.value);

  if (resolved.length < files.length) {
    console.warn(
      `[marking-schemes] resolved ${resolved.length}/${files.length} URLs (missing or inaccessible files skipped)`
    );
  }

  return resolved;
}

export async function listQuestionsForTopic(
  subject: string,
  level: string,
  topic: string,
  cycle: ExamCycleId = DEFAULT_EXAM_CYCLE
): Promise<ImageQuestion[]> {
  const key = `${cycle}:${subject}/${level}/${topic}`;
  const cached = getCached(questionCache, key);
  if (cached) return cached;

  const rows = await listCatalogueQuestions(subject, level, { cycle, topic });
  const questions = await catalogueToImageQuestions(rows);
  questionCache.set(key, { data: questions, ts: Date.now() });
  return questions;
}

export async function listQuestionsForPaper(
  subject: string,
  level: string,
  year: number,
  paper: number | null,
  cycle: ExamCycleId = DEFAULT_EXAM_CYCLE
): Promise<ImageQuestion[]> {
  const key = `${cycle}:${subject}/${level}/paper:${year}:${paper ?? "x"}`;
  const cached = getCached(questionCache, key);
  if (cached) return cached;

  const rows = await listCatalogueQuestions(subject, level, {
    cycle,
    year,
    paper: paper ?? null,
  });
  // Same exam scan often lives under several topic folders — show once on paper view.
  const questions = await catalogueToImageQuestions(dedupeCatalogueByFileStem(rows));
  questionCache.set(key, { data: questions, ts: Date.now() });
  return questions;
}

export async function listPaperGroupsForSubjectLevel(
  subject: string,
  level: string,
  cycle: ExamCycleId = DEFAULT_EXAM_CYCLE
): Promise<ImagePaperGroup[]> {
  const key = `${cycle}:${subject}/${level}:papers`;
  const cached = getCached(paperCache, key);
  if (cached) return cached;

  const papers = await listCataloguePapers(subject, level, cycle);
  paperCache.set(key, { data: papers, ts: Date.now() });
  return papers;
}

export type UseImageTopicsResult = {
  topics: ImageTopic[];
  levels: string[];
  loading: boolean;
  error: string | null;
};

export function useImageTopics(
  subject: string | null,
  level: string | null,
  cycle: ExamCycleId = DEFAULT_EXAM_CYCLE
): UseImageTopicsResult {
  const [topics, setTopics] = useState<ImageTopic[]>([]);
  const [levels, setLevels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(0);

  useEffect(() => {
    if (!subject) {
      setTopics([]);
      setLevels([]);
      setLoading(false);
      setError(null);
      return;
    }

    const id = ++abortRef.current;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const availableLevels = await listLevelsForSubject(subject, cycle);
        if (id !== abortRef.current) return;
        setLevels(availableLevels);

        const targetLevel = level && availableLevels.includes(level) ? level : availableLevels[0];
        if (!targetLevel) {
          setTopics([]);
          setLoading(false);
          return;
        }

        const topicList = await listTopicsForSubjectLevel(subject, targetLevel, cycle);
        if (id !== abortRef.current) return;
        setTopics(topicList);
      } catch (err: unknown) {
        if (id !== abortRef.current) return;
        setError(err instanceof Error ? err.message : "Failed to load topics");
        setTopics([]);
      } finally {
        if (id === abortRef.current) setLoading(false);
      }
    })();
  }, [subject, level, cycle]);

  return { topics, levels, loading, error };
}

export function useImagePapers(
  subject: string | null,
  level: string | null,
  cycle: ExamCycleId = DEFAULT_EXAM_CYCLE
): { papers: ImagePaperGroup[]; loading: boolean; error: string | null } {
  const [papers, setPapers] = useState<ImagePaperGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(0);

  useEffect(() => {
    if (!subject || !level) {
      setPapers([]);
      setLoading(false);
      setError(null);
      return;
    }
    const id = ++abortRef.current;
    setLoading(true);
    setError(null);
    listPaperGroupsForSubjectLevel(subject, level, cycle)
      .then((rows) => {
        if (id !== abortRef.current) return;
        setPapers(rows);
      })
      .catch((err: unknown) => {
        if (id !== abortRef.current) return;
        setError(err instanceof Error ? err.message : "Failed to load papers");
        setPapers([]);
      })
      .finally(() => {
        if (id === abortRef.current) setLoading(false);
      });
  }, [subject, level, cycle]);

  return { papers, loading, error };
}

export type UseImageQuestionsResult = {
  questions: ImageQuestion[];
  grouped: GroupedImageQuestion[];
  loading: boolean;
  error: string | null;
};

export function useImageMarkingSchemesForTopic(
  subject: string | null,
  level: string | null,
  topic: string | null,
  cycle: ExamCycleId = DEFAULT_EXAM_CYCLE
): { files: MarkingSchemeFile[]; loading: boolean; error: string | null } {
  const [files, setFiles] = useState<MarkingSchemeFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(0);

  useEffect(() => {
    if (!subject || !level || !topic) {
      setFiles([]);
      setLoading(false);
      setError(null);
      return;
    }

    const id = ++abortRef.current;
    setLoading(true);
    setError(null);

    // Soft-fail: empty list is fine — catalogue paths on questions still work.
    listMarkingSchemeFilesForTopic(subject, level, topic, cycle)
      .then((items) => {
        if (id !== abortRef.current) return;
        setFiles(items);
      })
      .catch((err: unknown) => {
        if (id !== abortRef.current) return;
        console.warn("[marking-schemes] topic list failed:", err);
        setError(null);
        setFiles([]);
      })
      .finally(() => {
        if (id === abortRef.current) setLoading(false);
      });
  }, [subject, level, topic, cycle]);

  return { files, loading, error };
}

export function useMarkingSchemeUrls(files: MarkingSchemeFile[]) {
  const [images, setImages] = useState<ImageQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef(0);
  const filesKey = files.map((f) => f.storagePath).join("\0");

  useEffect(() => {
    if (files.length === 0) {
      setImages([]);
      setLoading(false);
      return;
    }

    const id = ++abortRef.current;
    setLoading(true);

    resolveMarkingSchemeUrls(files)
      .then((items) => {
        if (id !== abortRef.current) return;
        setImages(items);
      })
      .catch((err: unknown) => {
        if (id !== abortRef.current) return;
        console.warn("[marking-schemes] URL resolve failed:", err);
        setImages([]);
      })
      .finally(() => {
        if (id === abortRef.current) setLoading(false);
      });
  }, [filesKey, files.length]);

  return { images, loading };
}

export function useImageQuestionsForTopic(
  subject: string | null,
  level: string | null,
  topic: string | null,
  cycle: ExamCycleId = DEFAULT_EXAM_CYCLE
): UseImageQuestionsResult {
  const [questions, setQuestions] = useState<ImageQuestion[]>([]);
  const [grouped, setGrouped] = useState<GroupedImageQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(0);

  useEffect(() => {
    if (!subject || !level || !topic) {
      setQuestions([]);
      setGrouped([]);
      setLoading(false);
      setError(null);
      return;
    }

    const id = ++abortRef.current;
    setLoading(true);
    setError(null);

    listQuestionsForTopic(subject, level, topic, cycle)
      .then((qs) => {
        if (id !== abortRef.current) return;
        setQuestions(qs);
        setGrouped(groupImageQuestions(qs));
      })
      .catch((err: unknown) => {
        if (id !== abortRef.current) return;
        setError(err instanceof Error ? err.message : "Failed to load questions");
        setQuestions([]);
        setGrouped([]);
      })
      .finally(() => {
        if (id === abortRef.current) setLoading(false);
      });
  }, [subject, level, topic, cycle]);

  return { questions, grouped, loading, error };
}

/** Load questions for a year (+ optional paper number) across all topics. */
export function useImageQuestionsForPaper(
  subject: string | null,
  level: string | null,
  year: number | null,
  paper: number | null,
  cycle: ExamCycleId = DEFAULT_EXAM_CYCLE
): UseImageQuestionsResult {
  const [questions, setQuestions] = useState<ImageQuestion[]>([]);
  const [grouped, setGrouped] = useState<GroupedImageQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(0);

  useEffect(() => {
    if (!subject || !level || year == null) {
      setQuestions([]);
      setGrouped([]);
      setLoading(false);
      setError(null);
      return;
    }

    const id = ++abortRef.current;
    setLoading(true);
    setError(null);

    listQuestionsForPaper(subject, level, year, paper, cycle)
      .then((qs) => {
        if (id !== abortRef.current) return;
        setQuestions(qs);
        setGrouped(groupImageQuestions(qs));
      })
      .catch((err: unknown) => {
        if (id !== abortRef.current) return;
        setError(err instanceof Error ? err.message : "Failed to load questions");
        setQuestions([]);
        setGrouped([]);
      })
      .finally(() => {
        if (id === abortRef.current) setLoading(false);
      });
  }, [subject, level, year, paper, cycle]);

  return { questions, grouped, loading, error };
}

export function useAllTopicsForSubjectLevel(
  subject: string | null,
  level: string | null,
  cycle: ExamCycleId = DEFAULT_EXAM_CYCLE
): { topics: ImageTopic[]; loading: boolean } {
  const [topics, setTopics] = useState<ImageTopic[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef(0);

  useEffect(() => {
    if (!subject || !level) {
      setTopics([]);
      return;
    }
    const id = ++abortRef.current;
    setLoading(true);
    listTopicsForSubjectLevel(subject, level, cycle)
      .then((t) => {
        if (id === abortRef.current) setTopics(t);
      })
      .catch(() => {
        if (id === abortRef.current) setTopics([]);
      })
      .finally(() => {
        if (id === abortRef.current) setLoading(false);
      });
  }, [subject, level, cycle]);

  return { topics, loading };
}
