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
import { createContext, useContext, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  DndContext,
  DragOverlay,
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
  currentQuestionId?: string | null;
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
  "group relative flex w-full items-center gap-2 rounded-xl py-1.5 text-left text-[15px] leading-snug transition-colors select-none";

const ICON = 18;
const CHEVRON = 18;
const EDIT_ICON = 16;
const HEADER_ICON = 20;
const LINK_ICON = 14;
const ROW_GUTTER = 20;

const indentPx = (depth: number) => 4 + depth * 12;
const sameItem = (a: SidebarDragItem, b: SidebarDragItem) => a.type === b.type && a.id === b.id;

// ============================= shared row context ============================= //

type SidebarCtxValue = {
  currentPageId: string | null;
  currentQuestionId: string | null;
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

/** Thin accent insertion line, indented to the target row's nesting depth. */
function DropLine({ position, depth }: { position: "before" | "after"; depth: number }) {
  return (
    <span
      className="pointer-events-none absolute z-10 h-[3px] rounded-full color-cursor"
      style={{
        left: `${indentPx(depth)}px`,
        right: "8px",
        [position === "before" ? "top" : "bottom"]: "-1px",
      }}
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
      <span className="shrink-0 text-base leading-none" aria-hidden>
        {page.emoji ?? <LuFileText size={ICON} className="color-txt-sub" />}
      </span>
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
    <div className={`flex flex-col ${isDraggingThis ? "opacity-40" : ""}`}>
      <div
        ref={setRef}
        {...attributes}
        {...listeners}
        className={`${rowBase} cursor-grab active:cursor-grabbing ${
          isActive ? "color-bg-accent color-txt-accent font-bold" : "color-txt-main hover:color-bg-grey-5"
        }`}
        style={{ paddingLeft: `${indentPx(depth)}px`, WebkitTouchCallout: "none" }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {showBefore && <DropLine position="before" depth={depth} />}
        {showAfter && <DropLine position="after" depth={depth} />}
        {/* Spacer keeps page icons aligned with folder icons (folders have a chevron here). */}
        <span className="w-[20px] shrink-0" aria-hidden />
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer"
          onClick={() => {
            ctx.onOpenPage(page);
            if (hasQuestions) ctx.togglePage(page.id);
          }}
          aria-expanded={hasQuestions ? isExpanded : undefined}
        >
          <span className="shrink-0 text-base leading-none" aria-hidden>
            {page.emoji ?? <LuFileText size={ICON} className={isActive ? "" : "color-txt-sub"} />}
          </span>
          <span className="min-w-0 flex-1 truncate">{page.name}</span>
        </button>
        <button
          type="button"
          className="shrink-0 rounded-lg p-1.5 color-txt-sub opacity-0 transition-opacity cursor-pointer group-hover:opacity-100 hover:color-bg-grey-10"
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
            {page.attachedQuestions.map((attachment) => {
              const isQuestionActive = attachment.id === ctx.currentQuestionId;
              return (
                <button
                  key={attachment.id}
                  type="button"
                  className={`${rowBase} cursor-pointer ${
                    isQuestionActive
                      ? "font-bold color-txt-main"
                      : "color-txt-sub hover:color-bg-grey-5"
                  }`}
                  style={{ paddingLeft: `${indentPx(depth + 1) + ROW_GUTTER}px` }}
                  onClick={() => ctx.onOpenQuestion(page, attachment.id)}
                >
                  <LuLink size={LINK_ICON} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-sm">{attachment.label}</span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function EmptyFolderDrop({ folderId, depth }: { folderId: string; depth: number }) {
  const { setNodeRef } = useDroppable({ id: `empty:${folderId}`, data: { role: "empty-folder", folderId } });
  return (
    <div
      ref={setNodeRef}
      className="px-2 py-1.5 text-sm italic color-txt-sub"
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
    <div className={`flex flex-col ${isDraggingThis ? "opacity-40" : ""}`}>
      <div
        ref={setRef}
        {...attributes}
        {...listeners}
        className={`${rowBase} cursor-grab active:cursor-grabbing color-txt-main hover:color-bg-grey-5 ${
          intoThis ? "color-bg-accent ring-2 ring-inset color-shadow-accent" : ""
        }`}
        style={{
          paddingLeft: `${indentPx(depth)}px`,
          WebkitTouchCallout: "none",
          ...(intoThis && folder.colour ? { boxShadow: `inset 0 0 0 2px ${folder.colour}` } : undefined),
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {showBefore && <DropLine position="before" depth={depth} />}
        {showAfter && <DropLine position="after" depth={depth} />}
        <button
          type="button"
          className="shrink-0 rounded-lg p-1 transition-colors cursor-pointer hover:color-bg-grey-10"
          onClick={() => ctx.toggleFolder(folder.id)}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={isCollapsed ? "Expand folder" : "Collapse folder"}
          aria-expanded={!isCollapsed}
        >
          {isCollapsed ? <LuChevronRight size={CHEVRON} /> : <LuChevronDown size={CHEVRON} />}
        </button>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer"
          onClick={() => ctx.toggleFolder(folder.id)}
        >
          <FolderGlyph folder={folder} />
          <span className="min-w-0 flex-1 truncate font-bold">{folder.name}</span>
        </button>
        <button
          type="button"
          className="shrink-0 rounded-lg p-1.5 color-txt-sub opacity-0 transition-opacity cursor-pointer group-hover:opacity-100 hover:color-bg-grey-10"
          onClick={() => ctx.onEditFolder(folder)}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={`Edit ${folder.name}`}
          title="Edit folder"
        >
          <LuPencil size={EDIT_ICON} />
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
    </div>
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
  currentQuestionId = null,
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

  useEffect(() => {
    if (!currentQuestionId) return;
    const page = pages.find((p) => p.attachedQuestions.some((q) => q.id === currentQuestionId));
    if (!page) return;
    setExpandedPages((prev) => {
      if (prev.size === 1 && prev.has(page.id)) return prev;
      return new Set([page.id]);
    });
  }, [currentQuestionId, pages]);

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
      if (prev.has(id)) return new Set();
      return new Set([id]);
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
    currentQuestionId,
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
      className={`flex h-full min-h-0 w-full flex-col gap-2 border-r border-grey/15 py-2 pl-1.5 pr-2 ${className}`.trim()}
    >
      <div className="flex min-w-0 shrink-0 items-center gap-1">
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
            onClick={() => onCreatePage(null)}
            aria-label="New page"
            title="New page"
          >
            <LuPlus size={HEADER_ICON} />
          </button>
          <button
            type="button"
            className="rounded-lg p-2 color-txt-sub hover:color-bg-grey-5 transition-colors cursor-pointer"
            onClick={onCreateFolder}
            aria-label="New folder"
            title="New folder"
          >
            <LuFolderPlus size={HEADER_ICON} />
          </button>
        </div>
      </div>

      <div className="min-w-0 shrink-0">
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
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div
          ref={setRootDropRef}
          className={`flex-1 min-h-0 overflow-y-auto scrollbar-minimal rounded-xl transition-colors ${
            rootHighlighted ? "color-bg-grey-5" : ""
          }`}
        >
          {loading ? (
            <div className="flex flex-col gap-1 pt-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-9 rounded-lg color-bg-grey-5 animate-pulse" />
              ))}
            </div>
          ) : isEmpty ? (
            <button
              type="button"
              className="mt-1 flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-[15px] color-txt-main hover:color-bg-grey-5 cursor-pointer"
              onClick={() => onCreatePage(null)}
            >
              <LuPlus size={ICON} className="shrink-0 color-txt-sub" />
              <span>New page</span>
            </button>
          ) : (
            <SidebarCtx.Provider value={ctxValue}>
              <div className="flex flex-col pt-1">
                <TreeItems items={tree.rootItems} depth={0} />
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
