/**
 * Whiteboards sidebar — folder/page tree with full drag-and-drop.
 *
 * DnD library: @dnd-kit/core (actively maintained; gives accessible pointer sensors,
 * a `DragOverlay` for the custom themed drag preview, and built-in edge auto-scroll).
 * We drive drop-intent ourselves (top-third → before, middle → into, bottom-third → after)
 * because the tree's "reorder vs. nest" + hover-to-expand interaction is bespoke and doesn't
 * map onto @dnd-kit/sortable's flat-list strategy. The reorder/cycle/no-op logic lives in
 * `resolveDrop` (data layer) and the transient drag state in the `useSidebarDnd` hook.
 *
 * Data-model change: added an `order: number` field to folders + pages (shared per-sibling
 * ordering space) so items can be manually reordered. Legacy items with no `order` sort last
 * alphabetically until first reordered; a move reindexes the whole destination sibling list.
 */
import { createContext, useContext, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import {
  LuChevronDown,
  LuChevronRight,
  LuFileText,
  LuFolder,
  LuFolderPlus,
  LuHouse,
  LuLink,
  LuPencil,
  LuPlus,
} from "react-icons/lu";
import SubjectDropdown from "../practiceHub/SubjectDropdown";
import { useSidebarDnd, type DroppableData } from "../../hooks/useSidebarDnd";
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
  onOpenPage: (page: WhiteboardPage) => void;
  onOpenQuestion: (page: WhiteboardPage, attachmentId: string) => void;
  onEditPage: (page: WhiteboardPage) => void;
  onEditFolder: (folder: WhiteboardFolder) => void;
  onCreatePage: (folderId: string | null) => void;
  onCreateFolder: () => void;
  onHome: () => void;
  onMove: (drag: SidebarDragItem, move: ResolvedMove) => void;
  className?: string;
};

const rowBase =
  "group relative flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors";

const indentPx = (depth: number) => 8 + depth * 14;
const sameItem = (a: SidebarDragItem, b: SidebarDragItem) => a.type === b.type && a.id === b.id;

// ============================= shared row context ============================= //

type SidebarCtxValue = {
  currentPageId: string | null;
  collapsedFolders: Set<string>;
  expandedPages: Set<string>;
  activeDrag: SidebarDragItem | null;
  dropIntent: SidebarDropIntent | null;
  toggleFolder: (id: string) => void;
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
      <span className="shrink-0 text-sm leading-none" aria-hidden>
        {folder.emoji}
      </span>
    );
  }
  // Default: a filled, colour-tinted folder icon (accent colour when none is set).
  return (
    <LuFolder
      size={14}
      className={`shrink-0 ${folder.colour ? "" : "color-txt-accent"}`}
      style={folder.colour ? { color: folder.colour } : undefined}
      fill="currentColor"
      fillOpacity={0.18}
      aria-hidden
    />
  );
}

/** Thin accent insertion line, indented to the target row's nesting depth. */
function DropLine({ position, depth }: { position: "before" | "after"; depth: number }) {
  return (
    <span
      className="pointer-events-none absolute z-10 h-0.5 rounded-full color-cursor"
      style={{
        left: `${indentPx(depth)}px`,
        right: "8px",
        [position === "before" ? "top" : "bottom"]: "-1px",
      }}
      aria-hidden
    />
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
  if (item.type === "folder") {
    const folder = folders.find((f) => f.id === item.id);
    if (!folder) return null;
    const count = countDescendants(folders, pages, folder.id);
    return (
      <div className="flex items-center gap-1.5 rounded-lg border border-grey/20 color-bg px-2 py-1.5 text-sm">
        <FolderGlyph folder={folder} />
        <span className="max-w-[160px] truncate font-semibold color-txt-main">{folder.name}</span>
        {count > 0 && (
          <span className="ml-0.5 rounded-full color-bg-accent color-txt-accent px-1.5 text-[10px] font-bold leading-4">
            {count}
          </span>
        )}
      </div>
    );
  }
  const page = pages.find((p) => p.id === item.id);
  if (!page) return null;
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-grey/20 color-bg px-2 py-1.5 text-sm">
      <span className="shrink-0 text-sm leading-none" aria-hidden>
        {page.emoji ?? <LuFileText size={14} className="color-txt-sub" />}
      </span>
      <span className="max-w-[160px] truncate color-txt-main">{page.name}</span>
    </div>
  );
}

// ============================= draggable rows ============================= //

function PageRow({ page, depth }: { page: WhiteboardPage; depth: number }) {
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
    <motion.div layout="position" className={`flex flex-col ${isDraggingThis ? "opacity-40" : ""}`}>
      <div
        ref={setRef}
        {...attributes}
        {...listeners}
        className={`${rowBase} cursor-grab active:cursor-grabbing ${
          isActive ? "color-bg-accent color-txt-accent font-bold" : "color-txt-main hover:color-bg-grey-5"
        }`}
        style={{ paddingLeft: `${indentPx(depth)}px` }}
      >
        {showBefore && <DropLine position="before" depth={depth} />}
        {showAfter && <DropLine position="after" depth={depth} />}
        {/* Spacer keeps page icons aligned with folder icons (folders have a chevron here). */}
        <span className="w-[18px] shrink-0" aria-hidden />
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left cursor-pointer"
          onClick={() => {
            ctx.onOpenPage(page);
            if (hasQuestions) ctx.togglePage(page.id);
          }}
          aria-expanded={hasQuestions ? isExpanded : undefined}
        >
          <span className="shrink-0 text-sm leading-none" aria-hidden>
            {page.emoji ?? <LuFileText size={14} className={isActive ? "" : "color-txt-sub"} />}
          </span>
          <span className="min-w-0 flex-1 truncate">{page.name}</span>
        </button>
        <button
          type="button"
          className="shrink-0 rounded p-1 color-txt-sub opacity-0 transition-opacity cursor-pointer group-hover:opacity-100 hover:color-bg-grey-10"
          onClick={() => ctx.onEditPage(page)}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={`Edit ${page.name}`}
          title="Edit page"
        >
          <LuPencil size={12} />
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
            {page.attachedQuestions.map((attachment) => (
              <button
                key={attachment.id}
                type="button"
                className={`${rowBase} color-txt-sub hover:color-bg-grey-5 cursor-pointer`}
                style={{ paddingLeft: `${indentPx(depth + 1) + 18}px` }}
                onClick={() => ctx.onOpenQuestion(page, attachment.id)}
              >
                <LuLink size={11} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate text-xs">{attachment.label}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function EmptyFolderDrop({ folderId, depth }: { folderId: string; depth: number }) {
  const { setNodeRef } = useDroppable({ id: `empty:${folderId}`, data: { role: "empty-folder", folderId } });
  return (
    <div
      ref={setNodeRef}
      className="px-2 py-1.5 text-xs italic color-txt-sub"
      style={{ paddingLeft: `${indentPx(depth)}px` }}
    >
      Empty folder
    </div>
  );
}

function FolderRow({ node, depth }: { node: WhiteboardTreeNode; depth: number }) {
  const ctx = useSidebarCtx();
  const { folder } = node;
  const item: SidebarDragItem = { type: "folder", id: folder.id };
  const isCollapsed = ctx.collapsedFolders.has(folder.id);
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
    <motion.div layout="position" className={`flex flex-col ${isDraggingThis ? "opacity-40" : ""}`}>
      <div
        ref={setRef}
        {...attributes}
        {...listeners}
        className={`${rowBase} cursor-grab active:cursor-grabbing color-txt-main hover:color-bg-grey-5 ${
          intoThis ? "color-bg-accent ring-2 ring-inset color-shadow-accent" : ""
        }`}
        style={{
          paddingLeft: `${indentPx(depth)}px`,
          ...(intoThis && folder.colour ? { boxShadow: `inset 0 0 0 2px ${folder.colour}` } : undefined),
        }}
      >
        {showBefore && <DropLine position="before" depth={depth} />}
        {showAfter && <DropLine position="after" depth={depth} />}
        <button
          type="button"
          className="shrink-0 rounded p-0.5 transition-colors cursor-pointer hover:color-bg-grey-10"
          onClick={() => ctx.toggleFolder(folder.id)}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={isCollapsed ? "Expand folder" : "Collapse folder"}
          aria-expanded={!isCollapsed}
        >
          {isCollapsed ? <LuChevronRight size={13} /> : <LuChevronDown size={13} />}
        </button>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left cursor-pointer"
          onClick={() => ctx.toggleFolder(folder.id)}
        >
          <FolderGlyph folder={folder} />
          <span className="min-w-0 flex-1 truncate font-bold">{folder.name}</span>
        </button>
        <button
          type="button"
          className="shrink-0 rounded p-1 color-txt-sub opacity-0 transition-opacity cursor-pointer group-hover:opacity-100 hover:color-bg-grey-10"
          onClick={() => ctx.onEditFolder(folder)}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={`Edit ${folder.name}`}
          title="Edit folder"
        >
          <LuPencil size={12} />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            {node.items.length === 0 ? (
              <EmptyFolderDrop folderId={folder.id} depth={depth + 1} />
            ) : (
              <TreeItems items={node.items} depth={depth + 1} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function TreeItems({ items, depth }: { items: WhiteboardTreeItem[]; depth: number }) {
  return (
    <>
      {items.map((it) =>
        it.kind === "folder" ? (
          <FolderRow key={`f:${it.node.folder.id}`} node={it.node} depth={depth} />
        ) : (
          <PageRow key={`p:${it.page.id}`} page={it.page} depth={depth} />
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
  onOpenPage,
  onOpenQuestion,
  onEditPage,
  onEditFolder,
  onCreatePage,
  onCreateFolder,
  onHome,
  onMove,
  className = "",
}: Props) {
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());

  const isCollapsed = (id: string) => collapsedFolders.has(id);
  const expandFolder = (id: string) =>
    setCollapsedFolders((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  const toggleFolder = (id: string) =>
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const togglePage = (id: string) =>
    setExpandedPages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const {
    sensors,
    collisionDetection,
    activeDrag,
    dropIntent,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    handleDragCancel,
  } = useSidebarDnd({ folders, pages, isCollapsed, onExpand: expandFolder, onMove });

  const isEmpty = tree.rootItems.length === 0;
  const rootHighlighted = dropIntent?.kind === "into-root";

  const { setNodeRef: setRootDropRef } = useDroppable({ id: "root", data: { role: "root" } });

  const ctxValue: SidebarCtxValue = {
    currentPageId,
    collapsedFolders,
    expandedPages,
    activeDrag,
    dropIntent,
    toggleFolder,
    togglePage,
    onOpenPage,
    onOpenQuestion,
    onEditPage,
    onEditFolder,
  };

  return (
    <aside
      className={`flex h-full min-h-0 w-full flex-col gap-2 border-r border-grey/15 p-3 ${className}`.trim()}
    >
      <div className="flex min-w-0 shrink-0 items-center gap-1.5">
        <button
          type="button"
          className="shrink-0 rounded-lg p-2 color-txt-sub hover:color-bg-grey-5 transition-colors cursor-pointer"
          onClick={onHome}
          aria-label="Whiteboards home"
          title="Whiteboards home"
        >
          <LuHouse size={16} />
        </button>
        <span className="min-w-0 truncate text-sm font-bold color-txt-main">Whiteboards</span>
        <div className="ml-auto flex shrink-0 items-center">
          <button
            type="button"
            className="rounded-lg p-2 color-txt-sub hover:color-bg-grey-5 transition-colors cursor-pointer"
            onClick={() => onCreatePage(null)}
            aria-label="New page"
            title="New page"
          >
            <LuPlus size={16} />
          </button>
          <button
            type="button"
            className="rounded-lg p-2 color-txt-sub hover:color-bg-grey-5 transition-colors cursor-pointer"
            onClick={onCreateFolder}
            aria-label="New folder"
            title="New folder"
          >
            <LuFolderPlus size={16} />
          </button>
        </div>
      </div>

      <div className="min-w-0 shrink-0">
        <SubjectDropdown
          value={subject}
          onChange={onSubjectChange}
          id="wb-sidebar-subject"
          aria-label="Whiteboards subject"
        />
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        autoScroll={{ threshold: { x: 0, y: 0.2 }, acceleration: 14 }}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div
          ref={setRootDropRef}
          className={`flex-1 min-h-0 overflow-y-auto scrollbar-minimal rounded-xl transition-colors ${
            rootHighlighted ? "color-bg-grey-5 ring-2 ring-inset color-shadow-accent" : ""
          }`}
        >
          {loading ? (
            <div className="flex flex-col gap-1.5 pt-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-8 rounded-lg color-bg-grey-5 animate-pulse" />
              ))}
            </div>
          ) : isEmpty ? (
            <p className="px-2 pt-2 text-xs color-txt-sub">
              Nothing here yet — create a page or folder to get started.
            </p>
          ) : (
            <SidebarCtx.Provider value={ctxValue}>
              <div className="flex flex-col pt-1">
                <TreeItems items={tree.rootItems} depth={0} />
                {activeDrag && (
                  <p className="mt-2 px-2 text-[10px] color-txt-sub">
                    Drop between items to reorder, on a folder to nest, or here for the root.
                  </p>
                )}
              </div>
            </SidebarCtx.Provider>
          )}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeDrag ? <DragPreview item={activeDrag} folders={folders} pages={pages} /> : null}
        </DragOverlay>
      </DndContext>
    </aside>
  );
}
