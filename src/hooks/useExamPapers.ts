import { useCallback, useEffect, useRef, useState } from "react";
import { doc, getDoc, getDocs, collection } from "firebase/firestore";
import { db } from "../../firebase";
import { getFirestoreSubjectIds } from "../data/practiceHubSubjects";
import { computeFreePaperKeys } from "../lib/contentAccess";
import { loadPredictionPapers } from "../lib/predictions/loadPredictions";
import { predictionQuestionsRef } from "../lib/predictions/firestorePaths";

export { isPaperFree, isLegacyFreePaper, canAccessPaper, computeFreePaperKeys } from "../lib/contentAccess";
import { fetchStorageBlob } from "../utils/fetchStorageBlob";
import {
  loadPaperBlobFromCache,
  removePaperBlobFromCache,
  savePaperBlobToCache,
} from "../utils/paperBlobStorage";
import { isValidPdfBlob } from "../utils/pdfBlobUtils";

export function normalizePaperLevel(level: string | undefined | null): string {
  const raw = String(level ?? "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "hl" || raw === "higher" || raw === "higher-level" || raw === "higher level") {
    return "higher";
  }
  if (raw === "ol" || raw === "ordinary" || raw === "ordinary-level" || raw === "ordinary level") {
    return "ordinary";
  }
  if (raw === "fd" || raw === "foundation" || raw === "foundation-level" || raw === "foundation level") {
    return "foundation";
  }
  return raw;
}

export function formatLevelDisplay(level: string | undefined | null): string {
  const normalized = normalizePaperLevel(level);
  if (!normalized) return "—";
  if (normalized === "higher") return "Higher";
  if (normalized === "ordinary") return "Ordinary";
  if (normalized === "foundation") return "Foundation";
  return normalized;
}

export function formatLevelCode(level: string | undefined | null): string {
  const normalized = normalizePaperLevel(level);
  if (normalized === "higher") return "HL";
  if (normalized === "ordinary") return "OL";
  if (normalized === "foundation") return "FD";
  return normalized ? normalized.toUpperCase() : "—";
}

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
  /** If true, paper is free for non-pro users. From Firestore or derived for 2024 Maths HL/OL Paper 1 & 2. */
  isFree?: boolean;
  /** Curated exam prediction paper shown on Practice Hub home. */
  isPrediction?: boolean;
  /** AI-assembled paper referencing questions from multiple source PDFs. */
  isComposite?: boolean;
  /** pastpaper = PDF composite; image = curated image question set. */
  contentType?: "pastpaper" | "image";
};

export function getExamPaperKey(paper: Pick<ExamPaper, "id" | "subject" | "level">): string {
  const subject = String(paper.subject ?? "unknown").trim().toLowerCase();
  const level = normalizePaperLevel(paper.level) || "unknown";
  return `${subject}::${level}::${paper.id}`;
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
  /** For composite prediction papers: original paper the PDF snippet comes from. */
  sourcePaperId?: string;
  sourceQuestionId?: string;
  sourceSubject?: string;
  sourceLevel?: string;
  sourceStoragePath?: string;
  sourceYear?: number;
  predictionReason?: string;
};

function deriveLabel(docId: string, year?: number): string {
  const part = docId
    .replace(/^\d+-/, "")
    .replace(/-/g, " ")
    .replace(/\b(\w)/g, (c) => c.toUpperCase());
  if (year != null) return `${year} ${part || "Paper"}`.trim();
  return part || docId;
}

export type UseExamPapersOptions = {
  /** When true and subjectId is null, load papers for all subjects (e.g. questions page). Default false = load no papers when null (practice tab). */
  loadAllWhenNull?: boolean;
  /** Include papers from questions/leavingcert/predictions (needed for practice session deep links). */
  includePredictions?: boolean;
  /** Bump to re-fetch papers (e.g. after saving a new prediction). */
  reloadKey?: number;
};

/** Load papers for the given subject. When subjectId is null: if loadAllWhenNull, load all subjects; otherwise load none. */
export function useExamPapers(
  subjectId: string | null,
  options: UseExamPapersOptions = {}
) {
  const { loadAllWhenNull = false, includePredictions = false, reloadKey = 0 } = options;
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [subjectIdsLoading, setSubjectIdsLoading] = useState(true);
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load leaving cert sections (subject ids) once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const lcRef = doc(db, "questions", "leavingcert");
        const lcSnap = await getDoc(lcRef);
        if (cancelled) return;
        const raw = lcSnap.exists() ? (lcSnap.data()?.sections as string[] | undefined) : undefined;
        const ids = Array.isArray(raw) ? raw : [];
        setSubjectIds(ids);
      } catch {
        if (!cancelled) setSubjectIds([]);
      } finally {
        if (!cancelled) setSubjectIdsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load papers: for one subject when subjectId is set, or all when subjectId is null and loadAllWhenNull
  useEffect(() => {
    const shouldLoadAll = subjectId === null && loadAllWhenNull;
    if (subjectId === null && !shouldLoadAll) {
      setPapers([]);
      setLoading(false);
      setError(null);
      return;
    }

    if (shouldLoadAll && subjectIds.length === 0) {
      setLoading(true);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    async function loadPapersForSubject(subId: string): Promise<ExamPaper[]> {
      const subjRef = doc(db, "questions", "leavingcert", "subjects", subId);
      const subjSnap = await getDoc(subjRef);
      if (!subjSnap.exists()) return [];

      let levelIds = (subjSnap.data()?.sections as string[] | undefined) ?? [];
      const usingFallbackLevels =
        levelIds.length === 0 && (subId === "maths" || subId === "applied-maths");
      if (usingFallbackLevels) {
        levelIds = ["higher", "ordinary"];
      }

      const levelPaperLists = await Promise.all(
        levelIds.map(async (level) => {
          const levelRef = doc(
            db,
            "questions",
            "leavingcert",
            "subjects",
            subId,
            "levels",
            level
          );
          const levelSnap = await getDoc(levelRef);
          if (!usingFallbackLevels) {
            if (!levelSnap.exists()) return [] as ExamPaper[];
            const levelSections =
              (levelSnap.data()?.sections as string[] | undefined) ?? [];
            if (!levelSections.includes("papers")) return [] as ExamPaper[];
          }

            const papersRef = collection(
              db,
              "questions",
              "leavingcert",
              "subjects",
              subId,
              "levels",
              level,
              "papers"
            );
            const papersSnap = await getDocs(papersRef);

            papersSnap.docs.forEach((d) => {
              const data = d.data();
              const storagePath =
                typeof data.storagePath === "string" ? data.storagePath : "";
              const isComposite = data.isComposite === true;
              const isPrediction = data.isPrediction === true;
              // Legacy: skip predictions stored under real papers (now live in /predictions).
              if (isPrediction || isComposite) return;
              if (!storagePath) return;

            const year = typeof data.year === "number" ? data.year : undefined;
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
                subject: subId,
                level,
                isFree,
              });
            });
          }
        }

        if (includePredictions) {
          const predictions = await loadPredictionPapers(
            shouldLoadAll ? null : subjectId
          );
          allPapers.push(...predictions);
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
  }, [subjectId, loadAllWhenNull, includePredictions, subjectIds, reloadKey]);

  // In-memory blob cache (LRU) — instant when revisiting in the same session
  const paperBlobCache = useRef<Map<string, Blob>>(new Map());
  const paperBlobCacheOrder = useRef<string[]>([]);
  const MAX_BLOB_CACHE = 10;

  const getPaperBlob = useCallback(async (paper: ExamPaper): Promise<Blob> => {
    const key = paper.storagePath;
    if (!key) {
      throw new Error("This paper has no PDF — open questions individually.");
    }
    const cached = paperBlobCache.current.get(key);
    if (cached) {
      // Move to end (most recently used)
      paperBlobCacheOrder.current = paperBlobCacheOrder.current.filter((k) => k !== key);
      paperBlobCacheOrder.current.push(key);
      return cached;
    }
    const pathRef = ref(storage, paper.storagePath);
    const blob = await getBlob(pathRef);
  
  const inflightDownloads = useRef<Map<string, Promise<Blob>>>(new Map());

  const rememberBlob = useCallback((key: string, blob: Blob) => {
    paperBlobCache.current.set(key, blob);
    paperBlobCacheOrder.current = paperBlobCacheOrder.current.filter((k) => k !== key);
    paperBlobCacheOrder.current.push(key);
    if (paperBlobCacheOrder.current.length > MAX_BLOB_CACHE) {
      const oldest = paperBlobCacheOrder.current.shift();
      if (oldest) paperBlobCache.current.delete(oldest);
    }
  }, []);

  /** Load PDF blob for a question, resolving composite prediction source paths. */
  const getPaperBlobForQuestion = useCallback(
    async (paper: ExamPaper, question: PaperQuestion): Promise<Blob> => {
      const path = question.sourceStoragePath?.trim() || paper.storagePath;
      if (!path) {
        throw new Error("No PDF path for this question");
      }
      if (path === paper.storagePath && paper.storagePath) {
        return getPaperBlob(paper);
      }
      return getPaperBlob({ ...paper, storagePath: path });
    },
    [getPaperBlob]
  );

  const getPaperBlob = useCallback(async (paper: ExamPaper): Promise<Blob> => {
    const key = paper.storagePath;
    const mem = paperBlobCache.current.get(key);
    if (mem) {
      if (await isValidPdfBlob(mem)) {
        paperBlobCacheOrder.current = paperBlobCacheOrder.current.filter((k) => k !== key);
        paperBlobCacheOrder.current.push(key);
        return mem;
      }
      paperBlobCache.current.delete(key);
    }

    const inflight = inflightDownloads.current.get(key);
    if (inflight) return inflight;

    const task = (async () => {
      const fromDisk = await loadPaperBlobFromCache(key);
      if (fromDisk) {
        if (await isValidPdfBlob(fromDisk)) {
          rememberBlob(key, fromDisk);
          return fromDisk;
        }
        void removePaperBlobFromCache(key);
        paperBlobCache.current.delete(key);
      }

      const blob = await fetchStorageBlob(key);
      if (!(await isValidPdfBlob(blob))) {
        throw new Error("Downloaded file is not a valid PDF");
      }
      rememberBlob(key, blob);
      void savePaperBlobToCache(key, blob);
      return blob;
    })();

    inflightDownloads.current.set(key, task);
    try {
      return await task;
    } finally {
      inflightDownloads.current.delete(key);
    }
  }, [rememberBlob]);

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
      const msPath = getMarkingSchemeStoragePath(paper);
      const cached = msBlobCache.current.get(msPath);
      if (cached !== undefined) return cached;
      try {
        const fromDisk = await loadPaperBlobFromCache(`ms:${msPath}`);
        if (fromDisk) {
          msBlobCache.current.set(msPath, fromDisk);
          return fromDisk;
        }
        const blob = await fetchStorageBlob(msPath);
        msBlobCache.current.set(msPath, blob);
        void savePaperBlobToCache(`ms:${msPath}`, blob);
        if (msBlobCache.current.size > 8) {
          const firstKey = msBlobCache.current.keys().next().value;
          if (firstKey != null) msBlobCache.current.delete(firstKey);
        }
        return blob;
      } catch {
        msBlobCache.current.set(msPath, null);
        return null;
      }
    },
    [getMarkingSchemeStoragePath]
  );

  const getPaperQuestions = useCallback(
    async (paper: ExamPaper): Promise<PaperQuestion[]> => {
      const questionsRef = paper.isPrediction
        ? predictionQuestionsRef(paper.id)
        : collection(
            db,
            "questions",
            "leavingcert",
            "subjects",
            paper.subject ?? "maths",
            "levels",
            paper.level ?? "higher",
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
          const sourcePaperId =
            typeof data.sourcePaperId === "string" ? data.sourcePaperId : undefined;
          const sourceQuestionId =
            typeof data.sourceQuestionId === "string" ? data.sourceQuestionId : undefined;
          const sourceSubject =
            typeof data.sourceSubject === "string" ? data.sourceSubject : undefined;
          const sourceLevel =
            typeof data.sourceLevel === "string" ? data.sourceLevel : undefined;
          const sourceStoragePath =
            typeof data.sourceStoragePath === "string" ? data.sourceStoragePath : undefined;
          const sourceYear =
            typeof data.sourceYear === "number" ? data.sourceYear : undefined;
          const predictionReason =
            typeof data.predictionReason === "string" ? data.predictionReason : undefined;
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
            sourcePaperId,
            sourceQuestionId,
            sourceSubject,
            sourceLevel,
            sourceStoragePath,
            sourceYear,
            predictionReason,
          });
        });
      return list;
    },
    []
  );

  const firstFreePaper = (() => {
    const freeKeys = computeFreePaperKeys(papers);
    return (
      papers.find((p) => freeKeys.has(getExamPaperKey(p)) && getPaperNumber(p.id, p.label) === 1) ??
      papers.find((p) => freeKeys.has(getExamPaperKey(p))) ??
      null
    );
  })();

  return {
    papers,
    loading,
    error,
    subjectIds,
    subjectIdsLoading,
    getPaperBlob,
    getPaperBlobForQuestion,
    getPaperQuestions,
    getMarkingSchemeBlob,
    firstFreePaper,
  };
}
