import { useCallback, useEffect, useRef, useState } from "react";
import {
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  resolveDrop,
  type ResolvedMove,
  type SidebarDragItem,
  type SidebarDropIntent,
  type WhiteboardFolder,
  type WhiteboardPage,
} from "../data/whiteboards";

/** Delay before a sustained hover over a collapsed folder auto-expands it. */
const HOLD_EXPAND_MS = 550;

/** Data attached to each droppable so drop-intent can be derived without prop-drilling. */
export type DroppableData =
  | {
      role: "row";
      item: SidebarDragItem;
      isFolder: boolean;
    }
  | { role: "empty-folder"; folderId: string }
  | { role: "root" };

type Options = {
  folders: WhiteboardFolder[];
  pages: WhiteboardPage[];
  isCollapsed: (folderId: string) => boolean;
  onExpand: (folderId: string) => void;
  onMove: (drag: SidebarDragItem, move: ResolvedMove) => void;
};

const sameItem = (a: SidebarDragItem, b: SidebarDragItem) => a.type === b.type && a.id === b.id;

function sameIntent(a: SidebarDropIntent | null, b: SidebarDropIntent | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind === "into" && b.kind === "into") return a.folderId === b.folderId;
  if ((a.kind === "before" || a.kind === "after") && (b.kind === "before" || b.kind === "after")) {
    return sameItem(a.target, b.target);
  }
  return a.kind === b.kind; // into-root
}

/**
 * Prefer the deepest row under the pointer over the catch-all root droppable, so
 * hovering a specific row always wins and only truly-empty space resolves to root.
 */
const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (hits.length <= 1) return hits;
  const nonRoot = hits.filter((h) => h.id !== "root");
  return nonRoot.length ? nonRoot : hits;
};

/**
 * Drag-and-drop brain for the whiteboards sidebar tree.
 *
 * Owns the transient drag state (what's being dragged, where it will land) plus the
 * cancellable hover-to-expand timer, and derives drop intent from the pointer's
 * position within the hovered row (top third → before, middle → into, bottom → after).
 * Rendering (indicators, overlay) is left to the component; this hook only computes.
 */
export function useSidebarDnd({ folders, pages, isCollapsed, onExpand, onMove }: Options) {
  const [activeDrag, setActiveDrag] = useState<SidebarDragItem | null>(null);
  const [dropIntent, setDropIntent] = useState<SidebarDropIntent | null>(null);

  // Live pointer position (viewport coords) — accurate even while the list auto-scrolls.
  const pointerY = useRef(0);
  // Cancellable hover-to-expand timer, keyed by the folder it's scheduled for.
  const holdTimer = useRef<number | null>(null);
  const holdFolderId = useRef<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Small threshold so clicks (open/rename/toggle) still work and don't start a drag.
      activationConstraint: { distance: 6 },
    })
  );

  const clearHold = useCallback(() => {
    if (holdTimer.current != null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    holdFolderId.current = null;
  }, []);

  const scheduleHold = useCallback(
    (folderId: string) => {
      if (holdFolderId.current === folderId) return; // already pending for this folder
      clearHold();
      holdFolderId.current = folderId;
      holdTimer.current = window.setTimeout(() => {
        onExpand(folderId);
        holdTimer.current = null;
        holdFolderId.current = null;
      }, HOLD_EXPAND_MS);
    },
    [clearHold, onExpand]
  );

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      pointerY.current = e.clientY;
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", onPointerMove);
  }, []);

  useEffect(() => () => clearHold(), [clearHold]);

  const reset = useCallback(() => {
    clearHold();
    setActiveDrag(null);
    setDropIntent(null);
  }, [clearHold]);

  const handleDragStart = useCallback((e: DragStartEvent) => {
    const data = e.active.data.current as { item?: SidebarDragItem } | undefined;
    if (data?.item) setActiveDrag(data.item);
  }, []);

  const handleDragMove = useCallback(
    (e: DragMoveEvent) => {
      const dragData = e.active.data.current as { item?: SidebarDragItem } | undefined;
      const drag = dragData?.item;
      const over = e.over;
      if (!drag || !over) {
        setDropIntent(null);
        clearHold();
        return;
      }
      const data = over.data.current as DroppableData | undefined;
      if (!data) {
        setDropIntent(null);
        clearHold();
        return;
      }

      let intent: SidebarDropIntent | null = null;
      if (data.role === "root") {
        intent = { kind: "into-root" };
      } else if (data.role === "empty-folder") {
        intent = { kind: "into", folderId: data.folderId };
      } else {
        const rect = over.rect;
        const rel = rect.height > 0 ? (pointerY.current - rect.top) / rect.height : 0.5;
        if (data.isFolder) {
          if (rel < 0.33) intent = { kind: "before", target: data.item };
          else if (rel > 0.66) intent = { kind: "after", target: data.item };
          else intent = { kind: "into", folderId: data.item.id };
        } else {
          intent = rel < 0.5 ? { kind: "before", target: data.item } : { kind: "after", target: data.item };
        }
      }

      // Drop invalid targets (self / cycle / no-op) so no misleading indicator shows.
      if (intent && !resolveDrop(folders, pages, drag, intent)) intent = null;

      setDropIntent((prev) => (sameIntent(prev, intent) ? prev : intent));

      // Hover-to-expand only while intending to drop *into* a collapsed folder.
      if (intent && intent.kind === "into" && isCollapsed(intent.folderId)) {
        scheduleHold(intent.folderId);
      } else {
        clearHold();
      }
    },
    [folders, pages, isCollapsed, scheduleHold, clearHold]
  );

  const handleDragEnd = useCallback(
    (_e: DragEndEvent) => {
      const drag = activeDrag;
      const intent = dropIntent;
      if (drag && intent) {
        const move = resolveDrop(folders, pages, drag, intent);
        if (move) onMove(drag, move);
      }
      reset();
    },
    [activeDrag, dropIntent, folders, pages, onMove, reset]
  );

  return {
    sensors,
    collisionDetection,
    activeDrag,
    dropIntent,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    handleDragCancel: reset,
  };
}
