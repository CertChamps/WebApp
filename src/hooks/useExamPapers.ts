import { useCallback, useEffect, useRef, useState } from "react";
import { getBlob, ref } from "firebase/storage";
import { doc, getDoc, getDocs, collection } from "firebase/firestore";
import { storage, db } from "../../firebase";

/** Derive paper number (1 or 2) from label or id. */
function getPaperNumber(docId: string, label?: string): number | null {
  const s = `${label ?? ""} ${docId ?? ""}`.toLowerCase();
  if (/\bpaper\s*1\b|paper-1|1-paper/.test(s)) return 1;
  if (/\bpaper\s*2\b|paper-2|2-paper/.test(s)) return 2;
  return null;
}

export type ExamPaper = {
  id: string;
  label: string;
  storagePath: string;
  year?: number;
  subject?: string;
  level?: string;
  /** If true, paper is free for non-pro users. From Firestore or derived for 2024 Paper 1 & 2 maths. */
  isFree?: boolean;
};

/** Returns true if paper is free (2024 Paper 1 or 2, maths higher). */
export function isPaperFree(paper: ExamPaper): boolean {
  if (paper.isFree === true) return true;
  const num = getPaperNumber(paper.id, paper.label);
  return (
    paper.year === 2024 &&
    (num === 1 || num === 2) &&
    (paper.subject ?? "").toLowerCase() === "maths" &&
    (paper.level ?? "").toLowerCase() === "higher"
  );
}

/** One page region defining a snippet of the question on a PDF page. */
export type PaperPageRegion = {
  page: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

/** Page range in a marking scheme PDF (1-based, inclusive). */
export type MarkingSchemePageRange = { start: number; end: number };

/** One question from a paper's questions subcollection (q1, q2, ...). */
export type PaperQuestion = {
  id: string;
  questionName: string;
  pageRange: [number, number];
  pageRegions?: PaperPageRegion[];
  markingSchemePageRange?: MarkingSchemePageRange;
  /** Optional tags (e.g. topic tags) when stored with the paper question. */
  tags?: string[];
  /** Optional log table page for past papers. */
  log_table_page?: number | string;
};

function deriveLabel(docId: string, year?: number): string {
  const part = docId
    .replace(/^\d+-/, "")
    .replace(/-/g, " ")
    .replace(/\b(\w)/g, (c) => c.toUpperCase());
  if (year != null) return `${year} ${part || "Paper"}`.trim();
  return part || docId;
}

export function useExamPapers() {
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const lcRef = doc(db, "questions", "leavingcert");
        const lcSnap = await getDoc(lcRef);
        if (!lcSnap.exists()) {
          setPapers([]);
          setError(null);
          return;
        }

        const subjectIds = (lcSnap.data()?.sections as string[] | undefined) ?? [];
        const allPapers: ExamPaper[] = [];

        for (const subject of subjectIds) {
          if (cancelled) return;
          const subjRef = doc(db, "questions", "leavingcert", "subjects", subject);
          const subjSnap = await getDoc(subjRef);
          if (!subjSnap.exists()) continue;

          const levelIds = (subjSnap.data()?.sections as string[] | undefined) ?? [];

          for (const level of levelIds) {
            if (cancelled) return;
            const levelRef = doc(
              db,
              "questions",
              "leavingcert",
              "subjects",
              subject,
              "levels",
              level
            );
            const levelSnap = await getDoc(levelRef);
            if (!levelSnap.exists()) continue;

            const levelSections =
              (levelSnap.data()?.sections as string[] | undefined) ?? [];
            if (!levelSections.includes("papers")) continue;

            const papersRef = collection(
              db,
              "questions",
              "leavingcert",
              "subjects",
              subject,
              "levels",
              level,
              "papers"
            );
            const papersSnap = await getDocs(papersRef);

            papersSnap.docs.forEach((d) => {
              const data = d.data();
              const storagePath =
                typeof data.storagePath === "string" ? data.storagePath : "";
              if (!storagePath) return;

              const year =
                typeof data.year === "number" ? data.year : undefined;
              const label =
                typeof data.label === "string" && data.label.trim()
                  ? data.label.trim()
                  : deriveLabel(d.id, year);
              const isFree = data.isFree === true;

              allPapers.push({
                id: d.id,
                label,
                storagePath,
                year,
                subject,
                level,
                isFree,
              });
            });
          }
        }

        if (cancelled) return;
        allPapers.sort((a, b) => {
          const yearA = a.year ?? 0;
          const yearB = b.year ?? 0;
          if (yearA !== yearB) return yearB - yearA;
          return (a.label ?? "").localeCompare(b.label ?? "");
        });
        setPapers(allPapers);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load exam papers:", err);
          setError(err instanceof Error ? err.message : "Failed to load papers");
          setPapers([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // In-memory blob cache (LRU, max 10) so switching papers is instant when revisiting
  const paperBlobCache = useRef<Map<string, Blob>>(new Map());
  const paperBlobCacheOrder = useRef<string[]>([]);
  const MAX_BLOB_CACHE = 10;

  const getPaperBlob = useCallback(async (paper: ExamPaper): Promise<Blob> => {
    const key = paper.id;
    const cached = paperBlobCache.current.get(key);
    if (cached) {
      // Move to end (most recently used)
      paperBlobCacheOrder.current = paperBlobCacheOrder.current.filter((k) => k !== key);
      paperBlobCacheOrder.current.push(key);
      return cached;
    }
    const pathRef = ref(storage, paper.storagePath);
    const blob = await getBlob(pathRef);
    paperBlobCache.current.set(key, blob);
    paperBlobCacheOrder.current = paperBlobCacheOrder.current.filter((k) => k !== key);
    paperBlobCacheOrder.current.push(key);
    if (paperBlobCacheOrder.current.length > MAX_BLOB_CACHE) {
      const oldest = paperBlobCacheOrder.current.shift();
      if (oldest) paperBlobCache.current.delete(oldest);
    }
    return blob;
  }, []);

  /** Storage path for marking scheme: marking-schemes/leaving-cert/{subject}/{level}-level/{year}ms.pdf */
  const getMarkingSchemeStoragePath = useCallback((paper: ExamPaper): string => {
    const subject = paper.subject ?? "maths";
    const level = paper.level ?? "higher";
    const year = paper.year ?? new Date().getFullYear();
    return `marking-schemes/leaving-cert/${subject}/${level}-level/${year}ms.pdf`;
  }, []);

  const msBlobCache = useRef<Map<string, Blob | null>>(new Map());
  const getMarkingSchemeBlob = useCallback(
    async (paper: ExamPaper): Promise<Blob | null> => {
      const cached = msBlobCache.current.get(paper.id);
      if (cached !== undefined) return cached;
      try {
        const pathRef = ref(storage, getMarkingSchemeStoragePath(paper));
        const blob = await getBlob(pathRef);
        msBlobCache.current.set(paper.id, blob);
        if (msBlobCache.current.size > 5) {
          const firstKey = msBlobCache.current.keys().next().value;
          if (firstKey != null) msBlobCache.current.delete(firstKey);
        }
        return blob;
      } catch {
        msBlobCache.current.set(paper.id, null);
        return null;
      }
    },
    [getMarkingSchemeStoragePath]
  );

  const getPaperQuestions = useCallback(
    async (paper: ExamPaper): Promise<PaperQuestion[]> => {
      const subject = paper.subject ?? "maths";
      const level = paper.level ?? "higher";
      const questionsRef = collection(
        db,
        "questions",
        "leavingcert",
        "subjects",
        subject,
        "levels",
        level,
        "papers",
        paper.id,
        "questions"
      );
      const snap = await getDocs(questionsRef);
      const list: PaperQuestion[] = [];
      snap.docs
        .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
        .forEach((d) => {
          const data = d.data();
          const pr = data.pageRange;
          const pageRange: [number, number] = Array.isArray(pr)
            ? [Number(pr[0]) || 1, Number(pr[1]) || 1]
            : typeof pr === "object" && pr !== null && "start" in pr && "end" in pr
              ? [(pr as { start: number }).start, (pr as { end: number }).end]
              : [1, 1];
          const rawRegions = data.pageRegions;
          const pageRegions: PaperPageRegion[] = Array.isArray(rawRegions)
            ? rawRegions.map((r: Record<string, unknown>) => ({
                page: typeof r.page === "number" ? r.page : 1,
                x: typeof r.x === "number" ? r.x : 0,
                y: typeof r.y === "number" ? r.y : 0,
                width: typeof r.width === "number" ? r.width : 595,
                height: typeof r.height === "number" ? r.height : 150,
              }))
            : [];
          const rawMsRange = data.markingSchemePageRange;
          let markingSchemePageRange: MarkingSchemePageRange | undefined;
          if (rawMsRange != null) {
            if (
              typeof rawMsRange === "object" &&
              typeof (rawMsRange as { start?: unknown }).start === "number" &&
              typeof (rawMsRange as { end?: unknown }).end === "number"
            ) {
              markingSchemePageRange = {
                start: (rawMsRange as { start: number }).start,
                end: (rawMsRange as { end: number }).end,
              };
            } else if (
              Array.isArray(rawMsRange) &&
              rawMsRange.length >= 2 &&
              typeof rawMsRange[0] === "number" &&
              typeof rawMsRange[1] === "number"
            ) {
              markingSchemePageRange = {
                start: rawMsRange[0],
                end: rawMsRange[1],
              };
            }
          }
          const tags = Array.isArray(data.tags)
            ? (data.tags as unknown[]).filter((t): t is string => typeof t === "string")
            : undefined;
          const rawLogPage = data.log_table_page ?? data.logTablePage;
          const log_table_page =
            rawLogPage != null
              ? typeof rawLogPage === "number"
                ? rawLogPage
                : String(rawLogPage)
              : undefined;
          list.push({
            id: d.id,
            questionName:
              typeof data.questionName === "string"
                ? data.questionName
                : data.id ?? d.id,
            pageRange,
            pageRegions: pageRegions.length > 0 ? pageRegions : undefined,
            markingSchemePageRange,
            tags: tags?.length ? tags : undefined,
            log_table_page,
          });
        });
      return list;
    },
    []
  );

  const firstFreePaper = papers.find((p) => isPaperFree(p)) ?? null;

  return {
    papers,
    loading,
    error,
    getPaperBlob,
    getPaperQuestions,
    getMarkingSchemeBlob,
    firstFreePaper,
  };
}
