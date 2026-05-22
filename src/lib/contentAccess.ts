import { FREE_IMAGE_TOPIC_BY_STORAGE_FOLDER } from "../data/freeContentConfig";
import type { ExamPaper } from "../hooks/useExamPapers";
import { getExamPaperKey, normalizePaperLevel } from "../hooks/useExamPapers";
import type { ImageTopic } from "../hooks/useImageQuestions";

export type AccessUser = { isPro?: boolean } | null | undefined;

export type AceFeature = "ai" | "threads" | "social";

export type FreeImageSample = {
  subject: string;
  level: string;
  topic: string;
  label: string;
};

function getPaperNumber(docId: string, label?: string): number | null {
  const s = `${label ?? ""} ${docId ?? ""}`.toLowerCase();
  if (/\bpaper\s*1\b|paper-1|1-paper/.test(s)) return 1;
  if (/\bpaper\s*2\b|paper-2|2-paper/.test(s)) return 2;
  return null;
}

function normalizeSubject(subject?: string): string {
  return (subject ?? "unknown").trim().toLowerCase();
}

/** Legacy gratis set: 2024 Maths HL & OL Paper 1 & 2. */
export function isLegacyFreePaper(paper: ExamPaper): boolean {
  const num = getPaperNumber(paper.id, paper.label);
  const level = normalizePaperLevel(paper.level);
  return (
    paper.year === 2024 &&
    (num === 1 || num === 2) &&
    normalizeSubject(paper.subject) === "maths" &&
    (level === "higher" || level === "ordinary")
  );
}

function subjectLevelKey(paper: ExamPaper): string {
  return `${normalizeSubject(paper.subject)}::${normalizePaperLevel(paper.level) || "unknown"}`;
}

function starterPaperScore(paper: ExamPaper): number {
  let score = (paper.year ?? 0) * 10;
  const num = getPaperNumber(paper.id, paper.label);
  if (num === 1) score += 100;
  else if (num === 2) score += 50;
  const level = normalizePaperLevel(paper.level);
  if (level === "higher") score += 30;
  else if (level === "ordinary") score += 20;
  else if (level === "foundation") score += 10;
  return score;
}

/** All paper keys a non-ACE user may open (Firestore `isFree`, legacy maths, + one starter per subject & level). */
export function computeFreePaperKeys(papers: ExamPaper[]): Set<string> {
  const free = new Set<string>();
  const bySubjectLevel = new Map<string, ExamPaper[]>();

  for (const paper of papers) {
    if (paper.isPrediction === true) continue;
    if (paper.isFree === true || isLegacyFreePaper(paper)) {
      free.add(getExamPaperKey(paper));
    }
    const key = subjectLevelKey(paper);
    if (!bySubjectLevel.has(key)) bySubjectLevel.set(key, []);
    bySubjectLevel.get(key)!.push(paper);
  }

  for (const group of bySubjectLevel.values()) {
    const hasFreeInGroup = group.some((p) => free.has(getExamPaperKey(p)));
    if (hasFreeInGroup) continue;
    const starter = [...group].sort((a, b) => starterPaperScore(b) - starterPaperScore(a))[0];
    if (starter) free.add(getExamPaperKey(starter));
  }

  return free;
}

export function hasAceAccess(user: AccessUser): boolean {
  return user?.isPro === true;
}

export function canUseAceFeature(user: AccessUser, feature: AceFeature): boolean {
  if (feature === "ai") return true;
  return hasAceAccess(user);
}

export function canAccessPaper(
  user: AccessUser,
  paper: ExamPaper,
  freePaperKeys: Set<string>
): boolean {
  if (paper.isPrediction === true) return true;
  if (hasAceAccess(user)) return true;
  return freePaperKeys.has(getExamPaperKey(paper));
}

export function isPaperInFreeSet(paper: ExamPaper, freePaperKeys: Set<string>): boolean {
  return freePaperKeys.has(getExamPaperKey(paper));
}

/** @deprecated Prefer `canAccessPaper` with `computeFreePaperKeys`. */
export function isPaperFree(paper: ExamPaper, freePaperKeys?: Set<string>): boolean {
  if (freePaperKeys) return isPaperInFreeSet(paper, freePaperKeys);
  if (paper.isFree === true) return true;
  return isLegacyFreePaper(paper);
}

export function pickStarterImageTopic(
  topics: ImageTopic[],
  storageFolder: string | null
): ImageTopic | null {
  if (topics.length === 0) return null;
  if (storageFolder) {
    const override = FREE_IMAGE_TOPIC_BY_STORAGE_FOLDER[storageFolder];
    if (override) {
      const match = topics.find((t) => t.name === override);
      if (match) return match;
    }
  }
  return [...topics].sort((a, b) => a.displayName.localeCompare(b.displayName))[0] ?? null;
}

export function isImageTopicContentFree(
  topic: ImageTopic,
  starterTopic: ImageTopic | null,
  storageFolder: string | null
): boolean {
  if (storageFolder) {
    const override = FREE_IMAGE_TOPIC_BY_STORAGE_FOLDER[storageFolder];
    if (override) return topic.name === override;
  }
  return starterTopic !== null && topic.name === starterTopic.name;
}

export function canAccessImageTopic(
  user: AccessUser,
  topic: ImageTopic,
  starterTopic: ImageTopic | null,
  storageFolder: string | null
): boolean {
  if (hasAceAccess(user)) return true;
  return isImageTopicContentFree(topic, starterTopic, storageFolder);
}

export function buildFreeImageSample(
  starterTopic: ImageTopic | null,
  storageFolder: string | null,
  level: string
): FreeImageSample | null {
  if (!starterTopic || !storageFolder) return null;
  return {
    subject: storageFolder,
    level,
    topic: starterTopic.name,
    label: starterTopic.displayName,
  };
}

export type ContentAccessLabel = "free" | "locked";

/** Badge label for hub cards; null when user has ACE (no badge needed). */
export function getContentAccessLabel(
  user: AccessUser,
  isFreeContent: boolean
): ContentAccessLabel | null {
  if (hasAceAccess(user)) return null;
  return isFreeContent ? "free" : "locked";
}
