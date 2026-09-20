import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { LuX } from "react-icons/lu";
import { getThemedPortalTarget } from "../../utils/themedPortal";
import { getVisualViewportBounds, subscribeVisualViewport } from "../../utils/visualViewport";

type Props = {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Optional footer row (buttons). */
  footer?: React.ReactNode;
  /** Optional controls rendered before the close button (e.g. share). */
  headerActions?: React.ReactNode;
  maxWidthClass?: string;
};

const BACKDROP_TRANSITION = { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };
const PANEL_TRANSITION = { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const };

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

/** Shared modal shell with a fade and keyboard-aware viewport frame. */
export default function WhiteboardModal({
  title,
  onClose,
  children,
  footer,
  headerActions,
  maxWidthClass = "max-w-lg",
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const initialBounds = useRef(getVisualViewportBounds()).current;

  // Update the viewport frame before measuring the field. React's asynchronous
  // state updates and forced page scrolling fight iOS's keyboard pan animation.
  useLayoutEffect(() => {
    let animationFrame = 0;
    const sync = () => {
      const bounds = getVisualViewportBounds();
      const frame = frameRef.current;
      if (!frame) return;
      frame.style.top = `${bounds.offsetTop}px`;
      frame.style.left = `${bounds.left}px`;
      frame.style.width = `${bounds.width}px`;
      frame.style.height = `${bounds.height}px`;
      const active = document.activeElement;
      const scroller = bodyRef.current;
      if (active instanceof HTMLElement && scroller?.contains(active) && isEditableTarget(active)) {
        const visible = scroller.getBoundingClientRect();
        const field = active.getBoundingClientRect();
        const margin = 16;
        if (field.bottom > visible.bottom - margin) {
          scroller.scrollTop += field.bottom - (visible.bottom - margin);
        } else if (field.top < visible.top + margin) {
          scroller.scrollTop -= visible.top + margin - field.top;
        }
      }
    };
    const schedule = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(sync);
    };
    sync();
    const panel = panelRef.current;
    panel?.addEventListener("focusin", schedule);
    panel?.addEventListener("input", schedule);
    const unsubscribe = subscribeVisualViewport(schedule);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      panel?.removeEventListener("focusin", schedule);
      panel?.removeEventListener("input", schedule);
      unsubscribe();
    };
  }, []);

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={BACKDROP_TRANSITION}
    >
      <div
        ref={frameRef}
        className="absolute flex items-center justify-center px-4 py-3"
        style={{ top: initialBounds.offsetTop, left: initialBounds.left, width: initialBounds.width, height: initialBounds.height }}
      >
        <motion.div
          ref={panelRef}
          className={`relative z-10 w-full ${maxWidthClass} color-bg rounded-2xl overflow-hidden flex flex-col max-h-full`}
          onClick={(e) => e.stopPropagation()}
          data-visual-viewport-modal="true"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={PANEL_TRANSITION}
        >
          <div className="px-5 pt-5 pb-3 flex items-center justify-between shrink-0">
            <h2 className="text-lg font-bold color-txt-main">{title}</h2>
            <div className="flex items-center gap-0.5">
              {headerActions}
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg color-txt-sub hover:color-bg-grey-5 transition-colors cursor-pointer"
                aria-label="Close"
              >
                <LuX size={18} />
              </button>
            </div>
          </div>

          <div
            ref={bodyRef}
            className="px-5 pb-4 flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-minimal [&_input]:text-base [&_textarea]:text-base"
          >
            {children}
          </div>

          {footer && <div className="px-5 pb-5 pt-2 shrink-0">{footer}</div>}
        </motion.div>
      </div>
    </motion.div>,
    getThemedPortalTarget()
  );
}
