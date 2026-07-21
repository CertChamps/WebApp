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
  /** Manual sort position among siblings (shared space with sibling pages). Unset legacy items sort last (alphabetically). */
  order: number;
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
  /** Manual sort position among siblings (shared space with sibling folders). Unset legacy items sort last (alphabetically). */
  order: number;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
};

/** A single row in a sibling list — a folder subtree or a page. Ordered by `order`. */
export type WhiteboardTreeItem =
  | { kind: "folder"; node: WhiteboardTreeNode }
  | { kind: "page"; page: WhiteboardPage };

export type WhiteboardTreeNode = {
  folder: WhiteboardFolder;
  /** Child folders only (ordered). Kept for backwards-compatibility. */
  children: WhiteboardTreeNode[];
  /** Child pages only (ordered). Kept for backwards-compatibility. */
  pages: WhiteboardPage[];
  /** Unified, ordered list of child folders + pages — what the sidebar renders. */
  items: WhiteboardTreeItem[];
};

export type WhiteboardTree = {
  rootFolders: WhiteboardTreeNode[];
  rootPages: WhiteboardPage[];
  /** Unified, ordered list of root folders + pages — what the sidebar renders. */
  rootItems: WhiteboardTreeItem[];
};

/** Sentinel for legacy items with no explicit `order` — sorts them after ordered items (then alphabetically). */
export const UNSET_ORDER = Number.MAX_SAFE_INTEGER;

/** Gap between sequential sibling orders, so reindexing leaves room and stays stable. */
export const ORDER_STEP = 1000;

/** A minimal reference to a draggable item (folder subtree or page). */
export type SidebarDragItem = { type: "folder" | "page"; id: string };

/** What will happen on drop, derived from pointer position relative to the hovered row. */
export type SidebarDropIntent =
  | { kind: "before" | "after"; target: SidebarDragItem }
  | { kind: "into"; folderId: string }
  | { kind: "into-root" };

/** A resolved, validated move: the destination parent + the full final order of that sibling list. */
export type ResolvedMove = {
  destParentId: string | null;
  orderedIds: SidebarDragItem[];
};

/** Build the nested folder/page tree for a subject. Orphaned items fall back to root. */
export function buildWhiteboardTree(
  folders: WhiteboardFolder[],
  pages: WhiteboardPage[]
): WhiteboardTree {
  const nodeById = new Map<string, WhiteboardTreeNode>();
  folders.forEach((folder) => {
    nodeById.set(folder.id, { folder, children: [], pages: [], items: [] });
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
  // Manual order first (unset legacy items fall back to alphabetical at the end).
  const byOrder = (
    a: { order: number; name: string },
    b: { order: number; name: string }
  ) => a.order - b.order || byName(a, b);

  const buildItems = (node: WhiteboardTreeNode): WhiteboardTreeItem[] => {
    const items: WhiteboardTreeItem[] = [
      ...node.children.map((child) => ({ kind: "folder" as const, node: child })),
      ...node.pages.map((page) => ({ kind: "page" as const, page })),
    ];
    items.sort((a, b) =>
      byOrder(
        a.kind === "folder" ? a.node.folder : a.page,
        b.kind === "folder" ? b.node.folder : b.page
      )
    );
    return items;
  };

  const sortNode = (node: WhiteboardTreeNode) => {
    node.children.sort((a, b) => byOrder(a.folder, b.folder));
    node.pages.sort(byOrder);
    node.children.forEach(sortNode);
    node.items = buildItems(node);
  };
  rootFolders.sort((a, b) => byOrder(a.folder, b.folder));
  rootFolders.forEach(sortNode);
  rootPages.sort(byOrder);

  const rootItems: WhiteboardTreeItem[] = [
    ...rootFolders.map((node) => ({ kind: "folder" as const, node })),
    ...rootPages.map((page) => ({ kind: "page" as const, page })),
  ];
  rootItems.sort((a, b) =>
    byOrder(
      a.kind === "folder" ? a.node.folder : a.page,
      b.kind === "folder" ? b.node.folder : b.page
    )
  );

  return { rootFolders, rootPages, rootItems };
}

/** Count all folders + pages nested anywhere under `folderId` (for the drag-preview badge). */
export function countDescendants(
  folders: WhiteboardFolder[],
  pages: WhiteboardPage[],
  folderId: string
): number {
  const childFolders = new Map<string, WhiteboardFolder[]>();
  folders.forEach((f) => {
    if (f.parentId == null) return;
    const list = childFolders.get(f.parentId) ?? [];
    list.push(f);
    childFolders.set(f.parentId, list);
  });
  const pageCountByFolder = new Map<string, number>();
  pages.forEach((p) => {
    if (p.folderId == null) return;
    pageCountByFolder.set(p.folderId, (pageCountByFolder.get(p.folderId) ?? 0) + 1);
  });

  let total = 0;
  const stack = [folderId];
  const seen = new Set<string>();
  while (stack.length) {
    const current = stack.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    total += pageCountByFolder.get(current) ?? 0;
    for (const child of childFolders.get(current) ?? []) {
      total += 1;
      stack.push(child.id);
    }
  }
  return total;
}

/** The current parent id of a folder/page (its containing folder, or null for root). */
function parentOf(
  folders: WhiteboardFolder[],
  pages: WhiteboardPage[],
  item: SidebarDragItem
): string | null {
  if (item.type === "folder") return folders.find((f) => f.id === item.id)?.parentId ?? null;
  return pages.find((p) => p.id === item.id)?.folderId ?? null;
}

/** Ordered sibling list (folders + pages) for a given parent id. */
function siblingsOf(
  folders: WhiteboardFolder[],
  pages: WhiteboardPage[],
  parentId: string | null
): SidebarDragItem[] {
  const byName = (a: { name: string }, b: { name: string }) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  const byOrder = (a: { order: number; name: string }, b: { order: number; name: string }) =>
    a.order - b.order || byName(a, b);

  const childFolders = folders.filter((f) => f.parentId === parentId).sort(byOrder);
  const childPages = pages.filter((p) => p.folderId === parentId).sort(byOrder);
  return [
    ...childFolders.map((f) => ({ type: "folder" as const, id: f.id })),
    ...childPages.map((p) => ({ type: "page" as const, id: p.id })),
  ].sort((a, b) => {
    const av = a.type === "folder" ? childFolders.find((f) => f.id === a.id)! : childPages.find((p) => p.id === a.id)!;
    const bv = b.type === "folder" ? childFolders.find((f) => f.id === b.id)! : childPages.find((p) => p.id === b.id)!;
    return byOrder(av, bv);
  });
}

const sameItem = (a: SidebarDragItem, b: SidebarDragItem) => a.type === b.type && a.id === b.id;

/**
 * Turn a drop intent into a validated, concrete move — or `null` if the drop is a
 * no-op or illegal (onto itself, or a folder into its own descendant/subtree).
 *
 * Returns the destination parent plus the *entire* final order of that sibling list,
 * so the caller can persist a stable reindex in one batch.
 */
export function resolveDrop(
  folders: WhiteboardFolder[],
  pages: WhiteboardPage[],
  drag: SidebarDragItem,
  intent: SidebarDropIntent
): ResolvedMove | null {
  // 1. Destination parent.
  let destParentId: string | null;
  if (intent.kind === "into") destParentId = intent.folderId;
  else if (intent.kind === "into-root") destParentId = null;
  else destParentId = parentOf(folders, pages, intent.target);

  // 2. Cycle / self prevention for folders.
  if (drag.type === "folder") {
    if (destParentId === drag.id) return null;
    if (isDescendantFolder(folders, drag.id, destParentId)) return null;
  }
  if ((intent.kind === "before" || intent.kind === "after") && sameItem(intent.target, drag)) {
    return null;
  }

  // 3. Build the destination sibling list without the dragged item.
  const base = siblingsOf(folders, pages, destParentId).filter((s) => !sameItem(s, drag));

  // 4. Where to insert.
  let index: number;
  if (intent.kind === "into" || intent.kind === "into-root") {
    index = base.length; // append to the end
  } else {
    const targetIdx = base.findIndex((s) => sameItem(s, intent.target));
    if (targetIdx === -1) index = base.length;
    else index = intent.kind === "before" ? targetIdx : targetIdx + 1;
  }

  const orderedIds = [...base.slice(0, index), drag, ...base.slice(index)];

  // 5. No-op detection: same parent + identical final order as it already is.
  const currentParent = parentOf(folders, pages, drag);
  if (currentParent === destParentId) {
    const currentOrder = siblingsOf(folders, pages, destParentId);
    if (
      currentOrder.length === orderedIds.length &&
      currentOrder.every((s, i) => sameItem(s, orderedIds[i]))
    ) {
      return null;
    }
  }

  return { destParentId, orderedIds };
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
