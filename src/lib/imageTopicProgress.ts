import type { PaperProgressEntry } from "../hooks/usePaperProgress";
import { buildImageTopicExamPaper } from "../hooks/usePaperProgress";
import { normalizePaperLevel } from "../hooks/useExamPapers";
import {
  groupImageQuestions,
  listQuestionsForTopic,
  listTopicsForSubjectLevel,
} from "../hooks/useImageQuestions";
import { paperProgressEntryMatchesSubjectLevel } from "./matchPaperProgressEntry";

/** Leading `2021` in `2021 2 Q5` / `2021_2_Q5` (underscore is *not* a \\b boundary in JS). */
const YEAR_AT_START = /^((?:19|20)\d{2})(?![0-9])/;
/** First plausible year after a non-digit or start (still not glued to more digits). */
const YEAR_AFTER_BREAK = /(?:^|[^0-9])((?:19|20)\d{2})(?![0-9])/g;

function isDeferredExamKey(key: string): boolean {
  return /\(\s*DEFERRED\s*\)|\bDEFERRED\b/i.test(key);
}

function clampYear(y: number): number {
  if (y < 1970 || y > 2035) return 0;
  return y;
}

/**
 * Exam year + deferred paper flag from a grouped image key / filename.
 * Leading years like `2021 2 Q5` and `2021_2_Q5` are recognised; `(DEFERRED)` marks deferred sittings.
 */
export function parseExamYearFromImageKey(key: string): { year: number; deferred: boolean } {
  const deferred = isDeferredExamKey(key);
  const s = key.trim();
  const mStart = s.match(YEAR_AT_START);
  if (mStart) return { year: clampYear(parseInt(mStart[1], 10)), deferred };

  YEAR_AFTER_BREAK.lastIndex = 0;
  const m2 = YEAR_AFTER_BREAK.exec(s);
  if (m2) return { year: clampYear(parseInt(m2[1], 10)), deferred };
  return { year: 0, deferred: false };
}

export type ImageHeatmapYearColumnData = {
  /** 0 = could not infer a year */
  year: number;
  /** Separate column from the same calendar year; header shows e.g. `23D` */
  deferred: boolean;
  questions: {
    id: string;
    name: string;
    topicLabel: string;
    topicTitle: string;
    paperId: string;
  }[];
};

function yearColumnMapKey(year: number, deferred: boolean): string {
  return `${year}:${deferred ? 1 : 0}`;
}

/**
 * One column per exam year (and one for deferred sittings, e.g. 2023 vs 2023 deferred).
 * Year is taken from the start of the key when possible (`2021_2_Q5`), else first `19xx`/`20xx` token.
 */
export function buildImageHeatmapYearColumnsFromTopicColumns(
  topicColumns: {
    paperId: string;
    topicLabel: string;
    topicTitle?: string;
    questions: { id: string; name: string }[];
  }[]
): ImageHeatmapYearColumnData[] {
  const byKey = new Map<
    string,
    { year: number; deferred: boolean; questions: ImageHeatmapYearColumnData["questions"] }
  >();

  for (const col of topicColumns) {
    const topicTitle = (col.topicTitle ?? col.topicLabel).trim() || col.topicLabel;
    for (const q of col.questions) {
      let { year, deferred } = parseExamYearFromImageKey(q.id);
      if (year === 0) deferred = false;
      const mk = year === 0 ? "0" : yearColumnMapKey(year, deferred);
      const row = byKey.get(mk) ?? { year, deferred: year === 0 ? false : deferred, questions: [] };
      row.questions.push({
        id: q.id,
        name: q.name,
        topicLabel: col.topicLabel,
        paperId: col.paperId,
        topicTitle,
      });
      byKey.set(mk, row);
    }
  }

  for (const col of byKey.values()) {
    col.questions.sort((a, b) => {
      const tc = a.topicLabel.localeCompare(b.topicLabel, undefined, { sensitivity: "base" });
      if (tc !== 0) return tc;
      return a.id.localeCompare(b.id, undefined, { numeric: true });
    });
  }

  return [...byKey.values()].sort((a, b) => {
    if (a.year === 0 && b.year !== 0) return 1;
    if (b.year === 0 && a.year !== 0) return -1;
    if (a.year !== b.year) return b.year - a.year;
    if (a.deferred !== b.deferred) return a.deferred ? 1 : -1;
    return 0;
  });
}

/** Matches `activeCanvasQuestionId` in questions.tsx for imagequestions mode. */
export function imageCanvasQuestionId(
  subject: string,
  level: string,
  topicFolderName: string,
  groupKey: string
): string {
  const s = subject.trim().toLowerCase();
  const l = normalizePaperLevel(level.trim()) || level.trim().toLowerCase();
  return `img_${s}_${l}_${topicFolderName}_${groupKey}`;
}

export function isImageTopicPaperProgressEntry(
  e: Pick<PaperProgressEntry, "paperId">
): boolean {
  return typeof e.paperId === "string" && e.paperId.startsWith("img-topic-");
}

/** Per-topic stats for image practice (one row per `paper-progress` image topic doc). */
export function buildImageTopicBreakdownStats(
  entries: PaperProgressEntry[],
  subject: string,
  level: string
): { topic: string; completed: number; total: number }[] {
  const stats: { topic: string; completed: number; total: number }[] = [];
  for (const e of entries) {
    if (!paperProgressEntryMatchesSubjectLevel(e, subject, level)) continue;
    if (!isImageTopicPaperProgressEntry(e)) continue;
    const label = (e.paperLabel ?? "").trim() || "Topic";
    stats.push({
      topic: label,
      completed: e.completedQuestions.length,
      total: Math.max(0, e.totalQuestions),
    });
  }
  stats.sort((a, b) => a.topic.localeCompare(b.topic, undefined, { sensitivity: "base" }));
  return stats;
}

/** One Storage topic column for the progress heatmap (questions from filenames, no Firestore). */
export type ImageHeatmapColumnData = {
  paperId: string;
  /** Folder name under `.../{level}/{topic}/` — must match `paper-progress` / canvas ids. */
  topicFolderName: string;
  /** Human-friendly title from folder name (same as Practice Hub). */
  topicDisplayName: string;
  questions: { id: string; name: string }[];
};

/**
 * Lists every image topic under this subject+level in Storage and builds grouped questions
 * (same pipeline as practice mode). No Firestore question documents required.
 */
export async function loadImageHeatmapColumnsData(
  subject: string,
  level: string
): Promise<ImageHeatmapColumnData[]> {
  const topics = await listTopicsForSubjectLevel(subject, level);
  if (topics.length === 0) return [];

  const sorted = [...topics].sort((a, b) =>
    (a.displayName || a.name).localeCompare(b.displayName || b.name, undefined, {
      sensitivity: "base",
    })
  );

  const cols: ImageHeatmapColumnData[] = [];
  for (const t of sorted) {
    const paper = buildImageTopicExamPaper(subject, level, t.name);
    try {
      const flat = await listQuestionsForTopic(subject, level, t.name);
      const grouped = groupImageQuestions(flat);
      const questions = grouped.map((g) => ({ id: g.key, name: g.displayName }));
      cols.push({
        paperId: paper.id,
        topicFolderName: t.name,
        topicDisplayName: t.displayName || t.name,
        questions,
      });
    } catch {
      cols.push({
        paperId: paper.id,
        topicFolderName: t.name,
        topicDisplayName: t.displayName || t.name,
        questions: [],
      });
    }
  }
  return cols;
}

export type ImageTopicBarStat = { topic: string; completed: number; total: number };

/**
 * Topic breakdown bars: every Storage topic for this level, totals from grouped image count,
 * completed counts merged from `paper-progress` image rows (matched by folder name).
 */
export async function buildImageTopicBarStatsFromStorage(
  subject: string,
  level: string,
  entries: PaperProgressEntry[]
): Promise<ImageTopicBarStat[]> {
  const cols = await loadImageHeatmapColumnsData(subject, level);
  if (cols.length === 0) return [];

  const entryByFolder = new Map<string, PaperProgressEntry>();
  for (const e of entries) {
    if (!paperProgressEntryMatchesSubjectLevel(e, subject, level)) continue;
    if (!isImageTopicPaperProgressEntry(e)) continue;
    const folder = (e.paperLabel ?? "").trim();
    if (folder) entryByFolder.set(folder, e);
  }

  return cols.map((col) => {
    const e = entryByFolder.get(col.topicFolderName);
    const total = Math.max(col.questions.length, e?.totalQuestions ?? 0);
    return {
      topic: col.topicDisplayName,
      completed: e?.completedQuestions.length ?? 0,
      total,
    };
  });
}
