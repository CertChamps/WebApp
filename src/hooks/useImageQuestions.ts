import { useEffect, useRef, useState } from "react";
import { ref, listAll, getDownloadURL, getMetadata } from "firebase/storage";
import { storage } from "../../firebase";

const STORAGE_BASE = "temp_images/leaving-cert";

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
};

export type GroupedImageQuestion = {
  key: string;
  displayName: string;
  images: ImageQuestion[];
};

type CacheEntry<T> = { data: T; ts: number };
const CACHE_TTL = 5 * 60 * 1000;

const levelCache = new Map<string, CacheEntry<string[]>>();
const topicCache = new Map<string, CacheEntry<ImageTopic[]>>();
const questionCache = new Map<string, CacheEntry<ImageQuestion[]>>();
const resolvedFolderCache = new Map<string, string>();
let parentFolderList: string[] | null = null;

function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  return null;
}

const normaliseForMatch = (s: string) => s.replace(/[-_]/g, "").toLowerCase();

async function resolveStorageFolder(subject: string): Promise<string> {
  const cached = resolvedFolderCache.get(subject);
  if (cached) return cached;

  const directRef = ref(storage, `${STORAGE_BASE}/${subject}`);
  const directResult = await listAll(directRef);
  if (directResult.prefixes.length > 0 || directResult.items.length > 0) {
    resolvedFolderCache.set(subject, subject);
    return subject;
  }

  if (!parentFolderList) {
    const parentRef = ref(storage, STORAGE_BASE);
    const parentResult = await listAll(parentRef);
    parentFolderList = parentResult.prefixes.map((p) => p.name);
  }

  const norm = normaliseForMatch(subject);
  const match =
    parentFolderList.find((f) => normaliseForMatch(f) === norm) ??
    parentFolderList.find((f) => {
      const nf = normaliseForMatch(f);
      return nf.includes(norm) || norm.includes(nf);
    });

  const resolved = match ?? subject;
  resolvedFolderCache.set(subject, resolved);
  return resolved;
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
  const bareNames = flat.map((q) => stripExtension(q.name));
  const bareNameSet = new Set(bareNames);

  const tentativeKeyCount = new Map<string, number>();
  for (const bare of bareNames) {
    const k = tryStripSuffix(bare);
    tentativeKeyCount.set(k, (tentativeKeyCount.get(k) ?? 0) + 1);
  }

  const map = new Map<string, ImageQuestion[]>();
  const keyOrder: string[] = [];

  for (let i = 0; i < flat.length; i++) {
    const q = flat[i];
    const bare = bareNames[i];
    const tentativeKey = tryStripSuffix(bare);
    const stripped = tentativeKey !== bare;

    const shouldGroup =
      stripped &&
      ((tentativeKeyCount.get(tentativeKey) ?? 0) > 1 ||
        bareNameSet.has(tentativeKey));

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
    images.sort(
      (a, b) =>
        getPartNumber(stripExtension(a.name), key) -
        getPartNumber(stripExtension(b.name), key)
    );
    return {
      key,
      displayName: prettifyName(key),
      images,
    };
  });
}

export async function listLevelsForSubject(subject: string): Promise<string[]> {
  const key = subject;
  const cached = getCached(levelCache, key);
  if (cached) return cached;

  const resolved = await resolveStorageFolder(subject);
  const folderRef = ref(storage, `${STORAGE_BASE}/${resolved}`);
  const result = await listAll(folderRef);
  const levels = result.prefixes.map((p) => p.name);
  levelCache.set(key, { data: levels, ts: Date.now() });
  return levels;
}

export async function listTopicsForSubjectLevel(
  subject: string,
  level: string
): Promise<ImageTopic[]> {
  const key = `${subject}/${level}`;
  const cached = getCached(topicCache, key);
  if (cached) return cached;

  const resolved = await resolveStorageFolder(subject);
  const folderRef = ref(storage, `${STORAGE_BASE}/${resolved}/${level}`);
  const result = await listAll(folderRef);

  const topics: ImageTopic[] = await Promise.all(
    result.prefixes.map(async (prefix) => {
      const topicRef = ref(storage, prefix.fullPath);
      const topicResult = await listAll(topicRef);
      const itemBareNames = topicResult.items.map((i) => stripExtension(i.name));
      const itemBareSet = new Set(itemBareNames);
      const tentativeCounts = new Map<string, number>();
      for (const bare of itemBareNames) {
        const k = tryStripSuffix(bare);
        tentativeCounts.set(k, (tentativeCounts.get(k) ?? 0) + 1);
      }
      const groupKeys = new Set<string>();
      for (const bare of itemBareNames) {
        const tk = tryStripSuffix(bare);
        const stripped = tk !== bare;
        const shouldGroup = stripped && ((tentativeCounts.get(tk) ?? 0) > 1 || itemBareSet.has(tk));
        groupKeys.add(shouldGroup ? tk : bare);
      }
      const count = groupKeys.size;

      let thumbnailUrl: string | null = null;
      if (topicResult.items.length > 0) {
        try {
          const candidates = topicResult.items;
          const sampleSize = Math.min(candidates.length, 6);
          const step = Math.max(1, Math.floor(candidates.length / sampleSize));
          const sampled = Array.from({ length: sampleSize }, (_, i) =>
            candidates[Math.min(i * step, candidates.length - 1)]
          );
          const metas = await Promise.all(
            sampled.map(async (item) => {
              try {
                const m = await getMetadata(item);
                return { item, size: m.size ?? 0 };
              } catch {
                return { item, size: 0 };
              }
            })
          );
          const best = metas.reduce((a, b) => (b.size > a.size ? b : a));
          thumbnailUrl = await getDownloadURL(best.item);
        } catch {
          thumbnailUrl = null;
        }
      }

      return {
        name: prefix.name,
        displayName: prettifyName(prefix.name),
        path: prefix.fullPath,
        questionCount: count,
        thumbnailUrl,
      };
    })
  );

  topicCache.set(key, { data: topics, ts: Date.now() });
  return topics;
}

export async function listQuestionsForTopic(
  subject: string,
  level: string,
  topic: string
): Promise<ImageQuestion[]> {
  const key = `${subject}/${level}/${topic}`;
  const cached = getCached(questionCache, key);
  if (cached) return cached;

  const resolved = await resolveStorageFolder(subject);
  const folderRef = ref(storage, `${STORAGE_BASE}/${resolved}/${level}/${topic}`);
  const result = await listAll(folderRef);

  const questions: ImageQuestion[] = await Promise.all(
    result.items.map(async (item) => {
      const downloadUrl = await getDownloadURL(item);
      return {
        name: item.name,
        displayName: prettifyName(item.name),
        storagePath: item.fullPath,
        downloadUrl,
      };
    })
  );

  questionCache.set(key, { data: questions, ts: Date.now() });
  return questions;
}

export type UseImageTopicsResult = {
  topics: ImageTopic[];
  levels: string[];
  loading: boolean;
  error: string | null;
};

export function useImageTopics(
  subject: string | null,
  level: string | null
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
        const availableLevels = await listLevelsForSubject(subject);
        if (id !== abortRef.current) return;
        setLevels(availableLevels);

        const targetLevel = level && availableLevels.includes(level) ? level : availableLevels[0];
        if (!targetLevel) {
          setTopics([]);
          setLoading(false);
          return;
        }

        const topicList = await listTopicsForSubjectLevel(subject, targetLevel);
        if (id !== abortRef.current) return;
        setTopics(topicList);
      } catch (err: any) {
        if (id !== abortRef.current) return;
        setError(err?.message ?? "Failed to load topics");
        setTopics([]);
      } finally {
        if (id === abortRef.current) setLoading(false);
      }
    })();
  }, [subject, level]);

  return { topics, levels, loading, error };
}

export type UseImageQuestionsResult = {
  questions: ImageQuestion[];
  grouped: GroupedImageQuestion[];
  loading: boolean;
  error: string | null;
};

export function useImageQuestionsForTopic(
  subject: string | null,
  level: string | null,
  topic: string | null
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

    listQuestionsForTopic(subject, level, topic)
      .then((qs) => {
        if (id !== abortRef.current) return;
        setQuestions(qs);
        setGrouped(groupImageQuestions(qs));
      })
      .catch((err: any) => {
        if (id !== abortRef.current) return;
        setError(err?.message ?? "Failed to load questions");
        setQuestions([]);
        setGrouped([]);
      })
      .finally(() => {
        if (id === abortRef.current) setLoading(false);
      });
  }, [subject, level, topic]);

  return { questions, grouped, loading, error };
}

export function useAllTopicsForSubjectLevel(
  subject: string | null,
  level: string | null
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
    listTopicsForSubjectLevel(subject, level)
      .then((t) => {
        if (id === abortRef.current) setTopics(t);
      })
      .catch(() => {
        if (id === abortRef.current) setTopics([]);
      })
      .finally(() => {
        if (id === abortRef.current) setLoading(false);
      });
  }, [subject, level]);

  return { topics, loading };
}
