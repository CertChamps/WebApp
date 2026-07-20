import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
import {
  isDescendantFolder,
  type WhiteboardFolder,
  type WhiteboardPage,
  type WhiteboardTree,
  type WhiteboardTreeNode,
} from "../../data/whiteboards";
import "../../styles/practiceHub.css";

type DragPayload =
  | { type: "folder"; id: string }
  | { type: "page"; id: string };

type DropTarget =
  | { kind: "folder"; id: string }
  | { kind: "root" };

type Props = {
  subject: string | null;
  onSubjectChange: (subjectId: string | null) => void;
  tree: WhiteboardTree;
  folders: WhiteboardFolder[];
  loading: boolean;
  currentPageId?: string | null;
  onOpenPage: (page: WhiteboardPage) => void;
  onOpenQuestion: (page: WhiteboardPage, attachmentId: string) => void;
  onEditPage: (page: WhiteboardPage) => void;
  onEditFolder: (folder: WhiteboardFolder) => void;
  onCreatePage: (folderId: string | null) => void;
  onCreateFolder: () => void;
  onHome: () => void;
  onMovePage: (pageId: string, folderId: string | null) => void;
  onMoveFolder: (folderId: string, parentId: string | null) => void;
};

const HOLD_EXPAND_MS = 650;
const DND_MIME = "application/x-whiteboard-dnd";

const rowBase =
  "group flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors cursor-pointer";

function FolderGlyph({ folder }: { folder: WhiteboardFolder }) {
  // Colour replaces the icon — just a tinted swatch, no folder glyph.
  if (folder.colour && !folder.emoji) {
    return (
      <span
        className="block size-3.5 shrink-0 rounded-full"
        style={{ backgroundColor: folder.colour }}
        aria-hidden
      />
    );
  }
  if (folder.emoji) {
    return (
      <span className="shrink-0 text-sm leading-none" aria-hidden>
        {folder.emoji}
      </span>
    );
  }
  return <LuFolder size={14} className="shrink-0 color-txt-sub" aria-hidden />;
}

export default function WhiteboardsSidebar({
  subject,
  onSubjectChange,
  tree,
  folders,
  loading,
  currentPageId = null,
  onOpenPage,
  onOpenQuestion,
  onEditPage,
  onEditFolder,
  onCreatePage,
  onCreateFolder,
  onHome,
  onMovePage,
  onMoveFolder,
}: Props) {
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState<DragPayload | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const holdExpandTimer = useRef<number | null>(null);
  const holdExpandFolderId = useRef<string | null>(null);

  const clearHoldExpand = useCallback(() => {
    if (holdExpandTimer.current != null) {
      window.clearTimeout(holdExpandTimer.current);
      holdExpandTimer.current = null;
    }
    holdExpandFolderId.current = null;
  }, []);

  useEffect(() => () => clearHoldExpand(), [clearHoldExpand]);

  const expandFolder = useCallback((id: string) => {
    setCollapsedFolders((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

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

  const canDropOnFolder = useCallback(
    (targetFolderId: string, payload: DragPayload | null) => {
      if (!payload) return false;
      if (payload.type === "folder") {
        if (payload.id === targetFolderId) return false;
        return !isDescendantFolder(folders, payload.id, targetFolderId);
      }
      return true;
    },
    [folders]
  );

  const beginDrag = (e: React.DragEvent, payload: DragPayload) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(DND_MIME, JSON.stringify(payload));
    e.dataTransfer.setData("text/plain", payload.id);
    setDragging(payload);
  };

  const endDrag = () => {
    clearHoldExpand();
    setDragging(null);
    setDropTarget(null);
  };

  const scheduleHoldExpand = (folderId: string, isCollapsed: boolean) => {
    if (!isCollapsed) {
      clearHoldExpand();
      return;
    }
    if (holdExpandFolderId.current === folderId) return;
    clearHoldExpand();
    holdExpandFolderId.current = folderId;
    holdExpandTimer.current = window.setTimeout(() => {
      expandFolder(folderId);
      holdExpandTimer.current = null;
      holdExpandFolderId.current = null;
    }, HOLD_EXPAND_MS);
  };

  const applyDrop = (target: DropTarget) => {
    if (!dragging) return;
    if (target.kind === "root") {
      if (dragging.type === "page") onMovePage(dragging.id, null);
      else onMoveFolder(dragging.id, null);
      return;
    }
    if (!canDropOnFolder(target.id, dragging)) return;
    if (dragging.type === "page") onMovePage(dragging.id, target.id);
    else onMoveFolder(dragging.id, target.id);
  };

  const dropHighlight = (target: DropTarget) =>
    dropTarget?.kind === target.kind &&
    (target.kind === "root" || (dropTarget.kind === "folder" && dropTarget.id === target.id));

  const renderPage = (page: WhiteboardPage, depth: number) => {
    const isActive = page.id === currentPageId;
    const hasQuestions = page.attachedQuestions.length > 0;
    const isExpanded = expandedPages.has(page.id);
    const isDraggingThis = dragging?.type === "page" && dragging.id === page.id;

    return (
      <div
        key={page.id}
        className={`flex flex-col ${isDraggingThis ? "opacity-40" : ""}`}
        draggable
        onDragStart={(e) => beginDrag(e, { type: "page", id: page.id })}
        onDragEnd={endDrag}
      >
        <div
          className={`${rowBase} ${
            isActive ? "color-bg-accent color-txt-accent font-bold" : "color-txt-main hover:color-bg-grey-5"
          }`}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
        >
          <button
            type="button"
            className={`shrink-0 rounded p-0.5 transition-colors cursor-pointer ${
              hasQuestions ? "hover:color-bg-grey-10" : "opacity-0 pointer-events-none"
            }`}
            onClick={() => togglePage(page.id)}
            aria-label={isExpanded ? "Collapse questions" : "Expand questions"}
            aria-expanded={isExpanded}
          >
            {isExpanded ? <LuChevronDown size={13} /> : <LuChevronRight size={13} />}
          </button>
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-1.5 cursor-grab active:cursor-grabbing"
            onClick={() => onOpenPage(page)}
          >
            <span className="shrink-0 text-sm leading-none" aria-hidden>
              {page.emoji ?? <LuFileText size={14} className={isActive ? "" : "color-txt-sub"} />}
            </span>
            <span className="min-w-0 flex-1 truncate">{page.name}</span>
          </button>
          <button
            type="button"
            className="shrink-0 rounded p-1 color-txt-sub opacity-0 transition-opacity cursor-pointer group-hover:opacity-100 hover:color-bg-grey-10"
            onClick={() => onEditPage(page)}
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
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              {page.attachedQuestions.map((attachment) => (
                <button
                  key={attachment.id}
                  type="button"
                  className={`${rowBase} color-txt-sub hover:color-bg-grey-5`}
                  style={{ paddingLeft: `${8 + (depth + 1) * 14 + 18}px` }}
                  onClick={() => onOpenQuestion(page, attachment.id)}
                >
                  <LuLink size={11} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-xs">{attachment.label}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const renderFolder = (node: WhiteboardTreeNode, depth: number) => {
    const { folder } = node;
    const isCollapsed = collapsedFolders.has(folder.id);
    const isDraggingThis = dragging?.type === "folder" && dragging.id === folder.id;
    const isValidTarget = canDropOnFolder(folder.id, dragging);
    const highlighted = dropHighlight({ kind: "folder", id: folder.id }) && isValidTarget;

    return (
      <div
        key={folder.id}
        className={`flex flex-col ${isDraggingThis ? "opacity-40" : ""}`}
        draggable
        onDragStart={(e) => beginDrag(e, { type: "folder", id: folder.id })}
        onDragEnd={endDrag}
      >
        <div
          className={`${rowBase} color-txt-main hover:color-bg-grey-5 ${
            highlighted ? "ring-2 ring-inset color-bg-accent" : ""
          }`}
          style={{
            paddingLeft: `${8 + depth * 14}px`,
            ...(highlighted && folder.colour
              ? { boxShadow: `inset 0 0 0 2px ${folder.colour}` }
              : undefined),
          }}
          onDragOver={(e) => {
            if (!dragging || !isValidTarget) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setDropTarget({ kind: "folder", id: folder.id });
            scheduleHoldExpand(folder.id, isCollapsed);
          }}
          onDragLeave={() => {
            if (holdExpandFolderId.current === folder.id) clearHoldExpand();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            clearHoldExpand();
            applyDrop({ kind: "folder", id: folder.id });
            endDrag();
          }}
        >
          <button
            type="button"
            className="shrink-0 rounded p-0.5 transition-colors cursor-pointer hover:color-bg-grey-10"
            onClick={() => toggleFolder(folder.id)}
            aria-label={isCollapsed ? "Expand folder" : "Collapse folder"}
            aria-expanded={!isCollapsed}
          >
            {isCollapsed ? <LuChevronRight size={13} /> : <LuChevronDown size={13} />}
          </button>
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-1.5 cursor-grab active:cursor-grabbing"
            onClick={() => toggleFolder(folder.id)}
          >
            <FolderGlyph folder={folder} />
            <span className="min-w-0 flex-1 truncate font-semibold">{folder.name}</span>
          </button>
          <button
            type="button"
            className="shrink-0 rounded p-1 color-txt-sub opacity-0 transition-opacity cursor-pointer group-hover:opacity-100 hover:color-bg-grey-10"
            onClick={() => onEditFolder(folder)}
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
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              {node.children.map((child) => renderFolder(child, depth + 1))}
              {node.pages.map((page) => renderPage(page, depth + 1))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const isEmpty = tree.rootFolders.length === 0 && tree.rootPages.length === 0;
  const rootHighlighted = dropHighlight({ kind: "root" });

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col gap-2 overflow-hidden border-r border-grey/15 p-3">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="shrink-0 rounded-lg p-2 color-txt-sub hover:color-bg-grey-5 transition-colors cursor-pointer"
          onClick={onHome}
          aria-label="Whiteboards home"
          title="Whiteboards home"
        >
          <LuHouse size={16} />
        </button>
        <span className="text-sm font-bold color-txt-main">Whiteboards</span>
        <div className="ml-auto flex items-center">
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

      <SubjectDropdown
        value={subject}
        onChange={onSubjectChange}
        id="wb-sidebar-subject"
        aria-label="Whiteboards subject"
      />

      <div
        className={`flex-1 min-h-0 overflow-y-auto scrollbar-minimal rounded-xl transition-colors ${
          rootHighlighted ? "color-bg-grey-5" : ""
        }`}
        onDragOver={(e) => {
          if (!dragging) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setDropTarget({ kind: "root" });
          clearHoldExpand();
        }}
        onDrop={(e) => {
          e.preventDefault();
          applyDrop({ kind: "root" });
          endDrag();
        }}
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
          <div className="flex flex-col pt-1">
            {tree.rootFolders.map((node) => renderFolder(node, 0))}
            {tree.rootPages.map((page) => renderPage(page, 0))}
            {dragging && (
              <p className="mt-2 px-2 text-[10px] color-txt-sub">
                Drop on a folder to nest, or here to move to the root.
              </p>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
