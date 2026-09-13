import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";

const WIDGET_TRANSITION = { type: "tween" as const, duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as const };

export type FloatingWidgetSlot = {
  id: string;
  /** Whether this widget should currently be shown. */
  visible: boolean;
  content: ReactNode;
};

type FloatingWidgetStackProps = {
  slots: FloatingWidgetSlot[];
  /** Which corner to anchor to. Left is used for left-hand layout. */
  side?: "left" | "right";
  className?: string;
};

/**
 * Shared bottom-corner container that stacks floating widgets vertically
 * (first slot on top). Widgets register through the `slots` array; when one
 * appears or disappears the others animate smoothly into their new position
 * via framer-motion's shared `layout` animation instead of snapping.
 */
export function FloatingWidgetStack({ slots, side = "right", className = "" }: FloatingWidgetStackProps) {
  const visible = slots.filter((s) => s.visible);
  const sideClass = side === "left" ? "left-20 items-start" : "right-3 items-end";

  return (
    <div className={`pointer-events-none fixed bottom-3 z-10 flex flex-col gap-2 ${sideClass} ${className}`.trim()}>
      <AnimatePresence initial={false}>
        {visible.map((slot) => (
          <motion.div
            key={slot.id}
            layout
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={WIDGET_TRANSITION}
            className="pointer-events-auto"
          >
            {slot.content}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
