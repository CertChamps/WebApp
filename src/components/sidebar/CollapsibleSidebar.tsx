import { useState, useCallback, useEffect, type FC } from "react";
import { motion } from "framer-motion";
import { LuPanelRightOpen, LuPanelLeftOpen } from "react-icons/lu";
import { SidebarTileManager } from "./SidebarTileManager";
import type { SidebarTileManagerProps } from "./SidebarTileManager";

const SIDEBAR_TRANSITION = { type: "tween" as const, duration: 0.3, ease: [0.25, 0.1, 0.25, 1] };
const SWIPE_THRESHOLD_PX = 80;
const VELOCITY_THRESHOLD = 400;

function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return navigator.maxTouchPoints > 0 || "ontouchstart" in window;
}

export interface CollapsibleSidebarProps extends SidebarTileManagerProps {
  /** Class name for the wrapper. */
  className?: string;
  /** Which side the sidebar is on (affects tab position and panel slide direction). */
  side?: "left" | "right";
  /** Called when the sidebar open state changes (e.g. so parent can shrink overlay and allow drawing when closed). */
  onOpenChange?: (open: boolean) => void;
  /** Optional: controlled open state. When provided, parent can open the sidebar (e.g. from marking scheme click). */
  open?: boolean;
}

export const CollapsibleSidebar: FC<CollapsibleSidebarProps> = function CollapsibleSidebar({
  className = "",
  side = "right",
  onOpenChange,
  open: controlledOpen,
  ...tileManagerProps
}) {
  const [internalOpen, setInternalOpen] = useState(true);
  const [touchEnabled, setTouchEnabled] = useState(false);
  const isLeft = side === "left";

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;

  useEffect(() => {
    setTouchEnabled(isTouchDevice());
  }, []);

  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  const open = useCallback(() => {
    if (isControlled) onOpenChange?.(true);
    else setInternalOpen(true);
  }, [isControlled, onOpenChange]);
  const close = useCallback(() => {
    if (isControlled) onOpenChange?.(false);
    else setInternalOpen(false);
  }, [isControlled, onOpenChange]);

  const handleDragEnd = useCallback(
    (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
      const shouldClose = isLeft
        ? info.offset.x < -SWIPE_THRESHOLD_PX || info.velocity.x < -VELOCITY_THRESHOLD
        : info.offset.x > SWIPE_THRESHOLD_PX || info.velocity.x > VELOCITY_THRESHOLD;
      if (shouldClose) close();
    },
    [close, isLeft]
  );

  const tabEdgeClass = isLeft
    ? "left-0 rounded-r-xl border-l-0 border-r border-grey/25 pl-1.5 pr-2"
    : "right-0 rounded-l-xl border-r-0 border-l border-grey/25 pl-2 pr-1.5";
  const panelEdgeClass = isLeft ? "left-0" : "right-0";
  const panelClosedX = isLeft ? "-100%" : "100%";

  return (
    <div className={`collapsible-sidebar relative h-full w-full  ${className}`.trim()}>
      <motion.button
        type="button"
        aria-label="Open sidebar"
        onClick={open}
        className={`collapsible-sidebar__tab absolute top-1/2 z-30 flex -translate-y-1/2 cursor-pointer items-center justify-center border py-6 color-bg backdrop-blur-sm transition-colors hover:border-grey/40 hover:color-bg-grey-10 ${tabEdgeClass}`}
        initial={false}
        animate={{
          opacity: isOpen ? 0 : 1,
          pointerEvents: isOpen ? "none" : "auto",
          x: isOpen ? (isLeft ? -16 : 16) : 0,
        }}
        transition={SIDEBAR_TRANSITION}
      >
        {isLeft ? (
          <LuPanelLeftOpen size={20} strokeWidth={2} className="color-txt-sub" />
        ) : (
          <LuPanelRightOpen size={20} strokeWidth={2} className="color-txt-sub" />
        )}
      </motion.button>

      <motion.div
        className={`collapsible-sidebar__panel absolute top-0 bottom-0 z-20 flex h-full w-full ${panelEdgeClass} ${touchEnabled ? "cursor-grab active:cursor-grabbing" : ""}`}
        initial={false}
        animate={{ x: isOpen ? 0 : panelClosedX }}
        transition={SIDEBAR_TRANSITION}
        drag={touchEnabled && isOpen ? "x" : false}
        dragDirectionLock
        dragConstraints={isLeft ? { left: -200, right: 0 } : { left: 0, right: 200 }}
        dragElastic={isLeft ? { left: 0.35, right: 0 } : { left: 0, right: 0.35 }}
        onDragEnd={handleDragEnd}
      >
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="h-full w-full px-2 py-2">
            <SidebarTileManager {...tileManagerProps} onCollapse={close} />
          </div>
        </div>
      </motion.div>
    </div>
  );
};
