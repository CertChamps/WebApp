/**
 * Types and helpers for the Whiteboards tab (folders + pages tree, attached questions).
 * Folders and pages are always scoped to a single subject (Practice Hub subject slug).
 */

import type { PaperPageRegion } from "../hooks/useExamPapers";

// ============================= ATTACHED QUESTIONS ============================= //

export type AttachedQuestionSource = "bank" | "custom";

/** Bank question snapshot — enough info to render the question + marking scheme without re-searching. */
export type AttachedBankRef = {
  kind: "paper" | "image";
  /** Backend subject id (Firestore doc id / Storage folder), not the UI slug. */
  subject: string;
  level: string;
  // Past-paper questions
  paperId?: string;
  questionId?: string;
  paperStoragePath?: string;
  year?: number;
  pageRange?: [number, number];
  pageRegions?: PaperPageRegion[];
  markingSchemePageRange?: { start: number; end: number } | null;
  // Image questions
  topic?: string;
  groupKey?: string;
  imagePaths?: string[];
  markingSchemePaths?: string[];
};

export type AttachedCustomFiles = {
  questionPath: string;
  questionType: "pdf" | "image";
  markingSchemePath?: string | null;
  markingSchemeType?: "pdf" | "image" | null;
};

export type AttachedQuestion = {
  /** Unique per attachment (stable across renames). */
  id: string;
  source: AttachedQuestionSource;
  /** Display label used in the sidebar and on-canvas picker. */
  label: string;
  bank?: AttachedBankRef;
  custom?: AttachedCustomFiles;
};

// ============================= FOLDERS + PAGES ============================= //

export type WhiteboardFolder = {
  id: string;
  name: string;
  subject: string;
  parentId: string | null;
  colour: string | null;
  emoji: string | null;
  createdAt: number;
  updatedAt: number;
};

export type WhiteboardPage = {
  id: string;
  name: string;
  subject: string;
  folderId: string | null;
  emoji: string | null;
  attachedQuestions: AttachedQuestion[];
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
};

export type WhiteboardTreeNode = {
  folder: WhiteboardFolder;
  children: WhiteboardTreeNode[];
  pages: WhiteboardPage[];
};

export type WhiteboardTree = {
  rootFolders: WhiteboardTreeNode[];
  rootPages: WhiteboardPage[];
};

/** Build the nested folder/page tree for a subject. Orphaned items fall back to root. */
export function buildWhiteboardTree(
  folders: WhiteboardFolder[],
  pages: WhiteboardPage[]
): WhiteboardTree {
  const nodeById = new Map<string, WhiteboardTreeNode>();
  folders.forEach((folder) => {
    nodeById.set(folder.id, { folder, children: [], pages: [] });
  });

  const rootFolders: WhiteboardTreeNode[] = [];
  nodeById.forEach((node) => {
    const parentId = node.folder.parentId;
    const parent = parentId ? nodeById.get(parentId) : undefined;
    if (parent && parentId !== node.folder.id) parent.children.push(node);
    else rootFolders.push(node);
  });

  const rootPages: WhiteboardPage[] = [];
  pages.forEach((page) => {
    const parent = page.folderId ? nodeById.get(page.folderId) : undefined;
    if (parent) parent.pages.push(page);
    else rootPages.push(page);
  });

  const byName = (a: { name: string }, b: { name: string }) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  const sortNode = (node: WhiteboardTreeNode) => {
    node.children.sort((a, b) => byName(a.folder, b.folder));
    node.pages.sort(byName);
    node.children.forEach(sortNode);
  };
  rootFolders.sort((a, b) => byName(a.folder, b.folder));
  rootFolders.forEach(sortNode);
  rootPages.sort(byName);

  return { rootFolders, rootPages };
}

/** Would moving `folderId` under `candidateParentId` create a cycle? */
export function isDescendantFolder(
  folders: WhiteboardFolder[],
  folderId: string,
  candidateParentId: string | null
): boolean {
  if (!candidateParentId) return false;
  const byId = new Map(folders.map((f) => [f.id, f]));
  let current: string | null = candidateParentId;
  const seen = new Set<string>();
  while (current) {
    if (current === folderId) return true;
    if (seen.has(current)) return false;
    seen.add(current);
    current = byId.get(current)?.parentId ?? null;
  }
  return false;
}

// ============================= PRESETS ============================= //

export const FOLDER_COLOURS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
] as const;

export const WHITEBOARD_EMOJIS = [
  "📄", "📝", "📚", "📖", "📓", "📒", "📕", "📗", "📘", "📙",
  "✏️", "🖊️", "🖍️", "📐", "📏", "🧮", "🔢", "➗", "📊", "📈",
  "🧪", "🧬", "🔬", "🔭", "⚗️", "🧲", "⚡", "💡", "🔋", "⚙️",
  "🌍", "🌋", "🌊", "🌱", "🍃", "🐝", "🦠", "🫀", "🧠", "🦴",
  "🏛️", "⚖️", "💶", "🏦", "🗺️", "🕰️", "📜", "🎭", "🎨", "🎼",
  "🎵", "🇮🇪", "🇫🇷", "🇩🇪", "🇪🇸", "🗣️", "💬", "⭐", "🌟", "✨",
  "🔥", "🎯", "🏆", "🚀", "❤️", "💪", "🤓", "☘️", "🧩", "🎲",
] as const;

// ============================= SUBJECT PERSISTENCE ============================= //

const LAST_SUBJECT_KEY = "whiteboards-last-subject";

export function getLastWhiteboardsSubject(): string | null {
  try {
    return localStorage.getItem(LAST_SUBJECT_KEY);
  } catch {
    return null;
  }
}

export function setLastWhiteboardsSubject(subjectId: string | null): void {
  try {
    if (subjectId) localStorage.setItem(LAST_SUBJECT_KEY, subjectId);
    else localStorage.removeItem(LAST_SUBJECT_KEY);
  } catch {
    /* ignore */
  }
}

/** Canvas storage id for a whiteboard page (namespaced so it can't collide with question ids). */
export function whiteboardCanvasId(pageId: string): string {
  return `whiteboard_${pageId}`;
}

export function newAttachmentId(): string {
  return `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
