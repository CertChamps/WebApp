import { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { LuPanelRightOpen } from "react-icons/lu";
import { SidebarTileManager } from "./SidebarTileManager";
import type { SidebarTileManagerProps } from "./SidebarTileManager";

const SIDEBAR_TRANSITION = { type: "tween" as const, duration: 0.3, ease: [0.25, 0.1, 0.25, 1] };
const SWIPE_THRESHOLD_PX = 80;
const VELOCITY_THRESHOLD = 400;

function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return navigator.maxTouchPoints > 0 || "ontouchstart" in window;
}

export type CollapsibleSidebarProps = SidebarTileManagerProps & {
  /** Class name for the wrapper. */
  className?: string;
};

export function CollapsibleSidebar({
  className = "",
  ...tileManagerProps
}: CollapsibleSidebarProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [touchEnabled, setTouchEnabled] = useState(false);

  useEffect(() => {
    setTouchEnabled(isTouchDevice());
  }, []);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const handleDragEnd = useCallback(
    (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
      const shouldClose =
        info.offset.x > SWIPE_THRESHOLD_PX || info.velocity.x > VELOCITY_THRESHOLD;
      if (shouldClose) setIsOpen(false);
    },
    []
  );

  return (
    <div className={`collapsible-sidebar relative h-full w-full  ${className}`.trim()}>
      <motion.button
        type="button"
        aria-label="Open sidebar"
        onClick={open}
        className="collapsible-sidebar__tab absolute right-0 top-1/2 z-30 flex -translate-y-1/2 cursor-pointer items-center justify-center rounded-l-xl border border-r-0 border-grey/25 py-6 pl-2 pr-1.5 color-bg backdrop-blur-sm transition-colors hover:border-grey/40 hover:color-bg-grey-10"
        initial={false}
        animate={{
          opacity: isOpen ? 0 : 1,
          pointerEvents: isOpen ? "none" : "auto",
          x: isOpen ? 16 : 0,
        }}
        transition={SIDEBAR_TRANSITION}
      >
        <LuPanelRightOpen size={20} strokeWidth={2} className="color-txt-sub" />
      </motion.button>

      <motion.div
        className={`collapsible-sidebar__panel absolute right-0 top-0 bottom-0 z-20 flex h-full w-full ${touchEnabled ? "cursor-grab active:cursor-grabbing" : ""}`}
        initial={false}
        animate={{ x: isOpen ? 0 : "100%" }}
        transition={SIDEBAR_TRANSITION}
        drag={touchEnabled && isOpen ? "x" : false}
        dragConstraints={{ left: 0, right: 200 }}
        dragElastic={{ left: 0, right: 0.35 }}
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
}
