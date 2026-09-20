/**
 * Whiteboards sidebar — folder/page browser with full drag-and-drop.
 *
 * Navigation model: folders are *entered*, not expanded. The list always shows one
 * folder's contents; entering pushes onto `folderPath` and the two lists cross-slide.
 * Nesting is unlimited; the breadcrumb row doubles as the back button.
 *
 * DnD library: @dnd-kit/core (actively maintained; gives accessible pointer sensors,
 * a `DragOverlay` for the custom themed drag preview, and built-in edge auto-scroll).
 * We drive drop-intent ourselves (top-third → before, middle → into, bottom-third → after)
 * because the tree's "reorder vs. nest" + hover-to-open interaction is bespoke and doesn't
 * map onto @dnd-kit/sortable's flat-list strategy. The reorder/cycle/no-op logic lives in
 * `resolveDrop` (data layer) and the transient drag state in the `useSidebarDnd` hook.
 *
 * Data-model change: added an `order: number` field to folders + pages (shared per-sibling
 * ordering space) so items can be manually reordered. Legacy items with no `order` sort last
 * alphabetically until first reordered; a move reindexes the whole destination sibling list.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import {
  LuChevronLeft,
  LuFileText,
  LuFolder,
  LuFolderPlus,
  LuHouse,
  LuLink,
  LuPencil,
  LuPlus,
} from "react-icons/lu";
import SubjectDropdown from "../practiceHub/SubjectDropdown";
import {
  SIDEBAR_CONTAINER_DROPPABLE,
  useSidebarDnd,
  type DroppableData,
} from "../../hooks/useSidebarDnd";
import {
  countDescendants,
  type ResolvedMove,
  type SidebarDragItem,
  type SidebarDropIntent,
  type WhiteboardFolder,
  type WhiteboardPage,
  type WhiteboardTree,
  type WhiteboardTreeItem,
  type WhiteboardTreeNode,
} from "../../data/whiteboards";
import "../../styles/practiceHub.css";

type Props = {
  subject: string | null;
  onSubjectChange: (subjectId: string | null) => void;
  tree: WhiteboardTree;
  folders: WhiteboardFolder[];
  pages: WhiteboardPage[];
  loading: boolean;
  currentPageId?: string | null;
  currentQuestionId?: string | null;
  onOpenPage: (page: WhiteboardPage) => void;
  onOpenQuestion: (page: WhiteboardPage, attachmentId: string) => void;
  onEditPage: (page: WhiteboardPage) => void;
  onEditFolder: (folder: WhiteboardFolder) => void;
  onCreatePage: (folderId: string | null) => void;
  onCreateFolder: (parentId: string | null) => void;
  onHome: () => void;
  onMove: (drag: SidebarDragItem, move: ResolvedMove) => void;
  /** Drill into this folder on mount (e.g. opening a folder from Recents). */
  openFolderId?: string | null;
  className?: string;
};

/** Highlight lives on this shell — no radius, no horizontal padding — so it
 *  paints edge-to-edge. Inner buttons carry the text inset. */
const rowBase =
  "group relative flex w-full items-center gap-1 py-1.5 text-left text-[15px] leading-snug transition-colors select-none rounded-none";

const ICON = 18;
const EDIT_ICON = 16;
const HEADER_ICON = 20;
const LINK_ICON = 12;

const SLIDE = { duration: 0.24, ease: [0.22, 1, 0.36, 1] as const };
const slideVariants = {
  enter: (direction: number) => ({ x: direction > 0 ? "100%" : "-100%", opacity: 0.4 }),
  center: { x: "0%", opacity: 1 },
  exit: (direction: number) => ({ x: direction > 0 ? "-100%" : "100%", opacity: 0.4 }),
};

const sameItem = (a: SidebarDragItem, b: SidebarDragItem) => a.type === b.type && a.id === b.id;

// ============================= shared row context ============================= //

type SidebarCtxValue = {
  currentPageId: string | null;
  currentQuestionId: string | null;
  expandedPages: Set<string>;
  activeDrag: SidebarDragItem | null;
  dropIntent: SidebarDropIntent | null;
  ignoreClick: () => boolean;
  onEnterFolder: (folderId: string) => void;
  togglePage: (id: string) => void;
  onOpenPage: (page: WhiteboardPage) => void;
  onOpenQuestion: (page: WhiteboardPage, attachmentId: string) => void;
  onEditPage: (page: WhiteboardPage) => void;
  onEditFolder: (folder: WhiteboardFolder) => void;
};

const SidebarCtx = createContext<SidebarCtxValue | null>(null);
const useSidebarCtx = () => {
  const ctx = useContext(SidebarCtx);
  if (!ctx) throw new Error("SidebarCtx missing");
  return ctx;
};

// ============================= presentational bits ============================= //

function FolderGlyph({ folder }: { folder: WhiteboardFolder }) {
  if (folder.emoji) {
    return (
      <span className="shrink-0 text-base leading-none" aria-hidden>
        {folder.emoji}
      </span>
    );
  }
  // Default: a filled, colour-tinted folder icon (accent colour when none is set).
  return (
    <LuFolder
      size={ICON}
      className={`shrink-0 ${folder.colour ? "" : "color-txt-accent"}`}
      style={folder.colour ? { color: folder.colour } : undefined}
      fill="currentColor"
      fillOpacity={0.18}
      aria-hidden
    />
  );
}

function PageGlyph({ page, muted = true }: { page: WhiteboardPage; muted?: boolean }) {
  if (page.emoji) {
    return (
      <span className="shrink-0 text-sm leading-none" aria-hidden>
        {page.emoji}
      </span>
    );
  }
  const iconClass = muted ? "color-txt-sub" : "";
  if (page.pageType === "document") {
    return <LuFileText size={14} className={`shrink-0 ${iconClass}`} aria-hidden />;
  }
  return <LuPencil size={14} className={`shrink-0 ${iconClass}`} aria-hidden />;
}

/** Thin accent insertion line spanning the row. */
function DropLine({ position }: { position: "before" | "after" }) {
  return (
    <span
      className="pointer-events-none absolute inset-x-0 z-10 h-[3px] color-cursor"
      style={{ [position === "before" ? "top" : "bottom"]: "-1px" }}
      aria-hidden
    />
  );
}

function DragPreviewBody({
  item,
  folders,
  pages,
}: {
  item: SidebarDragItem;
  folders: WhiteboardFolder[];
  pages: WhiteboardPage[];
}) {
  if (item.type === "folder") {
    const folder = folders.find((f) => f.id === item.id);
    if (!folder) return null;
    const count = countDescendants(folders, pages, folder.id);
    return (
      <>
        <FolderGlyph folder={folder} />
        <span className="min-w-0 flex-1 truncate font-semibold color-txt-main">{folder.name}</span>
        {count > 0 && (
          <span className="ml-0.5 rounded-full color-bg-accent color-txt-accent px-1.5 text-[11px] font-bold leading-5">
            {count}
          </span>
        )}
      </>
    );
  }
  const page = pages.find((p) => p.id === item.id);
  if (!page) return null;
  return (
    <>
      <PageGlyph page={page} />
      <span className="min-w-0 flex-1 truncate color-txt-main">{page.name}</span>
    </>
  );
}

/** Floating preview that follows the cursor (replaces the native drag image). */
function DragPreview({
  item,
  folders,
  pages,
}: {
  item: SidebarDragItem;
  folders: WhiteboardFolder[];
  pages: WhiteboardPage[];
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-grey/20 color-bg px-2 py-1.5 text-[15px] shadow-md">
      <DragPreviewBody item={item} folders={folders} pages={pages} />
    </div>
  );
}

// ============================= draggable rows ============================= //

function PageRow({ page }: { page: WhiteboardPage }) {
  const ctx = useSidebarCtx();
  const item: SidebarDragItem = { type: "page", id: page.id };
  const isActive = page.id === ctx.currentPageId;
  const hasQuestions = page.attachedQuestions.length > 0;
  const isExpanded = ctx.expandedPages.has(page.id);
  const isDraggingThis = ctx.activeDrag != null && sameItem(ctx.activeDrag, item);
  const showBefore = ctx.dropIntent?.kind === "before" && sameItem(ctx.dropIntent.target, item);
  const showAfter = ctx.dropIntent?.kind === "after" && sameItem(ctx.dropIntent.target, item);

  const { setNodeRef: setDragRef, attributes, listeners } = useDraggable({ id: page.id, data: { item } });
  const dropData: DroppableData = { role: "row", item, isFolder: false };
  const { setNodeRef: setDropRef } = useDroppable({ id: page.id, data: dropData });
  const setRef = (el: HTMLElement | null) => {
    setDragRef(el);
    setDropRef(el);
  };

  return (
    <div className={`flex flex-col ${isDraggingThis ? "opacity-40" : ""}`}>
      <div
        ref={setRef}
        {...attributes}
        {...listeners}
        className={`${rowBase} cursor-grab active:cursor-grabbing ${
          isActive ? "color-bg-accent color-txt-accent font-bold" : "color-txt-main hover:color-bg-grey-5"
        }`}
        style={{ WebkitTouchCallout: "none" }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {showBefore && <DropLine position="before" />}
        {showAfter && <DropLine position="after" />}
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 py-0.5 pl-2.5 text-left cursor-pointer"
          onClick={() => {
            if (ctx.ignoreClick()) return;
            ctx.onOpenPage(page);
            if (hasQuestions) ctx.togglePage(page.id);
          }}
          aria-expanded={hasQuestions ? isExpanded : undefined}
        >
          <PageGlyph page={page} muted={!isActive} />
          <span className="min-w-0 flex-1 truncate">{page.name}</span>
        </button>
        <button
          type="button"
          className="mr-1 shrink-0 rounded-lg p-1.5 color-txt-sub opacity-0 transition-opacity cursor-pointer group-hover:opacity-100 hover:color-bg-grey-10"
          onClick={() => ctx.onEditPage(page)}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={`Edit ${page.name}`}
          title="Edit page"
        >
          <LuPencil size={EDIT_ICON} />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="relative ml-3.5">
              <span
                className="pointer-events-none absolute top-1.5 bottom-1.5 left-0 w-px bg-grey/35"
                aria-hidden
              />
              <div className="flex flex-col py-0.5">
                {page.attachedQuestions.map((attachment) => {
                  const isQuestionActive = attachment.id === ctx.currentQuestionId;
                  return (
                    <button
                      key={attachment.id}
                      type="button"
                      className={`flex w-full items-center gap-1.5 py-0.5 pl-2.5 pr-2 text-left leading-snug transition-colors cursor-pointer ${
                        isQuestionActive
                          ? "font-semibold color-txt-main"
                          : "color-txt-sub hover:color-bg-grey-5"
                      }`}
                      onClick={() => ctx.onOpenQuestion(page, attachment.id)}
                    >
                      <LuLink size={LINK_ICON} className="shrink-0 opacity-70" />
                      <span className="min-w-0 flex-1 truncate text-[12px]">{attachment.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FolderRow({ node }: { node: WhiteboardTreeNode }) {
  const ctx = useSidebarCtx();
  const { folder } = node;
  const item: SidebarDragItem = { type: "folder", id: folder.id };
  const isDraggingThis = ctx.activeDrag != null && sameItem(ctx.activeDrag, item);
  const intoThis = ctx.dropIntent?.kind === "into" && ctx.dropIntent.folderId === folder.id;
  const showBefore = ctx.dropIntent?.kind === "before" && sameItem(ctx.dropIntent.target, item);
  const showAfter = ctx.dropIntent?.kind === "after" && sameItem(ctx.dropIntent.target, item);

  const { setNodeRef: setDragRef, attributes, listeners } = useDraggable({ id: folder.id, data: { item } });
  const dropData: DroppableData = { role: "row", item, isFolder: true };
  const { setNodeRef: setDropRef } = useDroppable({ id: folder.id, data: dropData });
  const setRef = (el: HTMLElement | null) => {
    setDragRef(el);
    setDropRef(el);
  };

  return (
    <div
      ref={setRef}
      {...attributes}
      {...listeners}
      className={`${rowBase} cursor-grab active:cursor-grabbing color-txt-main hover:color-bg-grey-5 ${
        isDraggingThis ? "opacity-40" : ""
      } ${intoThis ? "color-bg-accent" : ""}`}
      style={{ WebkitTouchCallout: "none" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {showBefore && <DropLine position="before" />}
      {showAfter && <DropLine position="after" />}
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 py-0.5 pl-2.5 text-left cursor-pointer"
        onClick={() => {
          if (ctx.ignoreClick()) return;
          ctx.onEnterFolder(folder.id);
        }}
        aria-label={`Open ${folder.name}`}
      >
        <FolderGlyph folder={folder} />
        <span className="min-w-0 flex-1 truncate font-bold">{folder.name}</span>
      </button>
      <button
        type="button"
        className="mr-1 shrink-0 rounded-lg p-1.5 color-txt-sub opacity-0 transition-opacity cursor-pointer group-hover:opacity-100 hover:color-bg-grey-10"
        onClick={() => ctx.onEditFolder(folder)}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={`Edit ${folder.name}`}
        title="Edit folder"
      >
        <LuPencil size={EDIT_ICON} />
      </button>
    </div>
  );
}

/** Current folder heading with a back button and subtle divider. */
function FolderHeader({ path, parentId, onNavigate, onEdit, highlighted }: {
  path: WhiteboardFolder[];
  parentId: string | null;
  onNavigate: (depth: number) => void;
  onEdit: () => void;
  highlighted: boolean;
}) {
  const folder = path[path.length - 1];
  const dropData: DroppableData = { role: "up-level", folderId: parentId };
  const { setNodeRef } = useDroppable({ id: "sidebar-up-level", data: dropData });
  return (
    <div ref={setNodeRef} className={`flex min-w-0 shrink-0 items-center gap-1 border-b border-current/20 px-2.5 py-1 color-txt-sub ${highlighted ? "color-bg-accent" : ""}`}>
      <button type="button" onClick={() => onNavigate(path.length - 1)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg cursor-pointer hover:color-bg-grey-5" aria-label="Back to parent folder" title="Back">
        <LuChevronLeft size={16} />
      </button>
      <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
        <FolderGlyph folder={folder} />
        <span className="min-w-0 truncate text-[14px] font-normal" title={folder.name}>{folder.name}</span>
      </div>
      <button type="button" onClick={onEdit} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg cursor-pointer hover:color-bg-grey-10" aria-label={`Edit ${folder.name}`} title="Edit folder">
        <LuPencil size={14} />
      </button>
    </div>
  );
}

function TreeItems({ items }: { items: WhiteboardTreeItem[] }) {
  return (
    <>
      {items.map((it) =>
        it.kind === "folder" ? (
          <FolderRow key={`f:${it.node.folder.id}`} node={it.node} />
        ) : (
          <PageRow key={`p:${it.page.id}`} page={it.page} />
        )
      )}
    </>
  );
}

// ============================= main component ============================= //

export default function WhiteboardsSidebar({
  subject,
  onSubjectChange,
  tree,
  folders,
  pages,
  loading,
  currentPageId = null,
  currentQuestionId = null,
  onOpenPage,
  onOpenQuestion,
  onEditPage,
  onEditFolder,
  onCreatePage,
  onCreateFolder,
  onHome,
  onMove,
  openFolderId = null,
  className = "",
}: Props) {
  const [folderPath, setFolderPath] = useState<string[]>([]);
  const [slideDirection, setSlideDirection] = useState(1);
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());
  const revealedPageRef = useRef<string | null>(null);
  const revealedFolderRef = useRef<string | null>(null);
  const ignoreClicksUntilRef = useRef(0);
  const folderPathAtDragStartRef = useRef<string[]>([]);

  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const nodeById = useMemo(() => {
    const map = new Map<string, WhiteboardTreeNode>();
    const walk = (nodes: WhiteboardTreeNode[]) => {
      nodes.forEach((node) => {
        map.set(node.folder.id, node);
        walk(node.children);
      });
    };
    walk(tree.rootFolders);
    return map;
  }, [tree]);

  // Deleted / moved folders can leave a stale path; stop at the first missing link.
  const activePath = useMemo(() => {
    const chain: WhiteboardFolder[] = [];
    for (const id of folderPath) {
      const folder = folderById.get(id);
      if (!folder) break;
      chain.push(folder);
    }
    return chain;
  }, [folderPath, folderById]);

  const currentFolder = activePath[activePath.length - 1] ?? null;
  const parentFolderId = activePath.length > 1 ? activePath[activePath.length - 2].id : null;
  const currentItems = currentFolder
    ? nodeById.get(currentFolder.id)?.items ?? []
    : tree.rootItems;

  const enterFolder = useCallback((folderId: string) => {
    setSlideDirection(1);
    setFolderPath((prev) => (prev[prev.length - 1] === folderId ? prev : [...prev, folderId]));
  }, []);

  const navigateToDepth = useCallback((depth: number) => {
    setSlideDirection(-1);
    setFolderPath((prev) => prev.slice(0, depth));
  }, []);

  useEffect(() => {
    setFolderPath([]);
    setSlideDirection(-1);
    revealedPageRef.current = null;
    revealedFolderRef.current = null;
  }, [subject]);

  // Opening a page from anywhere else should surface it in its own folder.
  // An explicit `openFolderId` (from Recents) wins so empty folders still open.
  useEffect(() => {
    if (!openFolderId) revealedFolderRef.current = null;
    if (openFolderId && revealedFolderRef.current !== openFolderId && folderById.has(openFolderId)) {
      revealedFolderRef.current = openFolderId;
      const chain: string[] = [];
      let id: string | null = openFolderId;
      while (id) {
        chain.unshift(id);
        id = folderById.get(id)?.parentId ?? null;
      }
      revealedPageRef.current = currentPageId;
      setSlideDirection(1);
      setFolderPath((prev) =>
        prev.length === chain.length && prev.every((value, i) => value === chain[i]) ? prev : chain
      );
      return;
    }
    if (!currentPageId || revealedPageRef.current === currentPageId) return;
    const page = pages.find((p) => p.id === currentPageId);
    if (!page) return;
    revealedPageRef.current = currentPageId;
    const chain: string[] = [];
    let id = page.folderId;
    while (id) {
      chain.unshift(id);
      id = folderById.get(id)?.parentId ?? null;
    }
    setSlideDirection(1);
    setFolderPath((prev) =>
      prev.length === chain.length && prev.every((value, i) => value === chain[i]) ? prev : chain
    );
  }, [openFolderId, currentPageId, pages, folderById]);

  useEffect(() => {
    if (!currentQuestionId) return;
    const page = pages.find((p) => p.attachedQuestions.some((q) => q.id === currentQuestionId));
    if (!page) return;
    setExpandedPages((prev) => {
      if (prev.size === 1 && prev.has(page.id)) return prev;
      return new Set([page.id]);
    });
  }, [currentQuestionId, pages]);

  const togglePage = useCallback(
    (id: string) =>
      setExpandedPages((prev) => (prev.has(id) ? new Set<string>() : new Set([id]))),
    []
  );

  // Every folder row shows a folder we are *not* inside, so hovering one mid-drag
  // should drill into it.
  const isCollapsed = useCallback(
    (folderId: string) => folderId !== currentFolder?.id,
    [currentFolder?.id]
  );

  const ignoreClick = useCallback(() => Date.now() < ignoreClicksUntilRef.current, []);

  const {
    sensors,
    collisionDetection,
    activeDrag,
    dropIntent,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    handleDragCancel,
  } = useSidebarDnd({ folders, pages, isCollapsed, onExpand: enterFolder, onMove });

  const onDragStart = useCallback(
    (event: Parameters<typeof handleDragStart>[0]) => {
      folderPathAtDragStartRef.current = folderPath;
      handleDragStart(event);
    },
    [folderPath, handleDragStart]
  );

  const onDragEnd = useCallback(
    (event: Parameters<typeof handleDragEnd>[0]) => {
      handleDragEnd(event);
      ignoreClicksUntilRef.current = Date.now() + 500;
      // Hover-to-open is only for targeting during the drag. Stay put after drop.
      setFolderPath(folderPathAtDragStartRef.current);
    },
    [handleDragEnd]
  );

  const onDragCancel = useCallback(() => {
    handleDragCancel();
    ignoreClicksUntilRef.current = Date.now() + 500;
    setFolderPath(folderPathAtDragStartRef.current);
  }, [handleDragCancel]);

  const containerData: DroppableData = { role: "container", folderId: currentFolder?.id ?? null };
  const { setNodeRef: setContainerDropRef } = useDroppable({
    id: SIDEBAR_CONTAINER_DROPPABLE,
    data: containerData,
  });

  const containerHighlighted = currentFolder
    ? dropIntent?.kind === "into" && dropIntent.folderId === currentFolder.id
    : dropIntent?.kind === "into-root";
  const upLevelHighlighted = parentFolderId
    ? dropIntent?.kind === "into" && dropIntent.folderId === parentFolderId
    : dropIntent?.kind === "into-root" && activePath.length === 1;

  const ctxValue: SidebarCtxValue = {
    currentPageId,
    currentQuestionId,
    expandedPages,
    activeDrag,
    dropIntent,
    ignoreClick,
    onEnterFolder: enterFolder,
    togglePage,
    onOpenPage,
    onOpenQuestion,
    onEditPage,
    onEditFolder,
  };

  return (
    <aside
      className={`flex h-full min-h-0 w-full flex-col gap-2 overflow-x-hidden border-r border-grey/15 py-2 ${className}`.trim()}
    >
      <div className="flex min-w-0 shrink-0 items-center gap-1 pl-1.5 pr-2">
        <button
          type="button"
          className="shrink-0 rounded-lg p-2 color-txt-sub hover:color-bg-grey-5 transition-colors cursor-pointer"
          onClick={onHome}
          aria-label="Whiteboards home"
          title="Whiteboards home"
        >
          <LuHouse size={HEADER_ICON} />
        </button>
        <span className="min-w-0 truncate text-base font-bold color-txt-main">Notes</span>
        <div className="ml-auto flex shrink-0 items-center">
          <button
            type="button"
            className="rounded-lg p-2 color-txt-sub hover:color-bg-grey-5 transition-colors cursor-pointer"
            onClick={() => onCreatePage(currentFolder?.id ?? null)}
            aria-label="New page"
            title={currentFolder ? `New page in ${currentFolder.name}` : "New page"}
          >
            <LuPlus size={HEADER_ICON} />
          </button>
          <button
            type="button"
            className="rounded-lg p-2 color-txt-sub hover:color-bg-grey-5 transition-colors cursor-pointer"
            onClick={() => onCreateFolder(currentFolder?.id ?? null)}
            aria-label="New folder"
            title={currentFolder ? `New folder in ${currentFolder.name}` : "New folder"}
          >
            <LuFolderPlus size={HEADER_ICON} />
          </button>
        </div>
      </div>

      <div className="min-w-0 shrink-0 pl-1.5 pr-2">
        <SubjectDropdown
          value={subject}
          onChange={onSubjectChange}
          id="wb-sidebar-subject"
          aria-label="Whiteboards subject"
          variant="list"
        />
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        autoScroll={{ threshold: { x: 0, y: 0.2 }, acceleration: 14 }}
        onDragStart={onDragStart}
        onDragMove={handleDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          {currentFolder && (
            <FolderHeader
              path={activePath}
              parentId={parentFolderId}
              onNavigate={(depth) => {
                if (ignoreClick()) return;
                navigateToDepth(depth);
              }}
              onEdit={() => onEditFolder(currentFolder)}
              highlighted={Boolean(upLevelHighlighted)}
            />
          )}

          <div
            ref={setContainerDropRef}
            className={`relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-minimal transition-colors ${
              containerHighlighted ? "color-bg-grey-5" : ""
            }`}
          >
            {loading ? (
              <div className="flex flex-col gap-1 px-1.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-9 rounded-lg color-bg-grey-5 animate-pulse" />
                ))}
              </div>
            ) : (
              <SidebarCtx.Provider value={ctxValue}>
                <AnimatePresence initial={false} mode="popLayout" custom={slideDirection}>
                  <motion.div
                    key={currentFolder?.id ?? "root"}
                    className="flex w-full flex-col"
                    custom={slideDirection}
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    // Sliding transforms would make @dnd-kit measure stale rects, so a
                    // hover-to-open during a drag switches folders instantly instead.
                    transition={activeDrag ? { duration: 0 } : SLIDE}
                  >
                    {currentItems.length === 0 ? (
                      currentFolder ? (
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-[15px] color-txt-sub hover:color-bg-grey-5 cursor-pointer"
                          onClick={() => onCreatePage(currentFolder.id)}
                        >
                          <LuPlus size={ICON} className="shrink-0" />
                          <span>Add a page here</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-[15px] color-txt-main hover:color-bg-grey-5 cursor-pointer"
                          onClick={() => onCreatePage(null)}
                        >
                          <LuPlus size={ICON} className="shrink-0 color-txt-sub" />
                          <span>New page</span>
                        </button>
                      )
                    ) : (
                      <TreeItems items={currentItems} />
                    )}
                  </motion.div>
                </AnimatePresence>
              </SidebarCtx.Provider>
            )}
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {activeDrag ? <DragPreview item={activeDrag} folders={folders} pages={pages} /> : null}
        </DragOverlay>
      </DndContext>
    </aside>
  );
}
