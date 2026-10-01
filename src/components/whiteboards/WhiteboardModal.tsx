import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { LuX } from "react-icons/lu";
import { getThemedPortalTarget } from "../../utils/themedPortal";
import { acquireModalViewportLock, getVisualViewportBounds, isKeyboardOpen, subscribeVisualViewportResize } from "../../utils/visualViewport";

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
const KEYBOARD_FIELD_GAP = 14;

function isEditableTarget(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

function currentTranslateY(element: HTMLElement): number {
  const transform = window.getComputedStyle(element).transform;
  if (!transform || transform === "none") return 0;
  try {
    return new DOMMatrixReadOnly(transform).m42;
  } catch {
    return 0;
  }
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
  const layoutBounds = useRef({ width: window.innerWidth, height: window.innerHeight }).current;

  useLayoutEffect(() => acquireModalViewportLock(), []);

  // Keep the panel at its original size and translate the entire sheet only when
  // the focused field would otherwise sit behind the software keyboard.
  useLayoutEffect(() => {
    let animationFrame = 0;
    const sync = () => {
      const bounds = getVisualViewportBounds();
      const panel = panelRef.current;
      if (!panel) return;
      const active = document.activeElement;

      if (!isKeyboardOpen(bounds) || !isEditableTarget(active) || !panel.contains(active)) {
        panel.style.transform = "translate3d(0, 0, 0)";
        return;
      }

      const field = active.closest<HTMLElement>(".themed-input-shell") ?? active;
      const rect = field.getBoundingClientRect();
      const renderedShift = currentTranslateY(panel);
      const baseTop = rect.top - renderedShift;
      const baseBottom = rect.bottom - renderedShift;
      const visibleTop = bounds.top + KEYBOARD_FIELD_GAP;
      const visibleBottom = bounds.bottom - KEYBOARD_FIELD_GAP;
      let nextShift = Math.min(0, visibleBottom - baseBottom);
      if (baseTop + nextShift < visibleTop) {
        nextShift = Math.min(0, visibleTop - baseTop);
      }
      panel.style.transform = `translate3d(0, ${Math.round(nextShift)}px, 0)`;
    };
    const schedule = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(sync);
    };
    sync();
    const panel = panelRef.current;
    panel?.addEventListener("focusin", schedule);
    panel?.addEventListener("input", schedule);
    panel?.addEventListener("keydown", schedule);
    const unsubscribe = subscribeVisualViewportResize(schedule);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      panel?.removeEventListener("focusin", schedule);
      panel?.removeEventListener("input", schedule);
      panel?.removeEventListener("keydown", schedule);
      unsubscribe();
      if (panel) panel.style.transform = "";
    };
  }, []);

  return createPortal(
    <motion.div
      className="keyboard-modal-root fixed inset-0 z-[70]"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={BACKDROP_TRANSITION}
    >
      <div className="keyboard-modal-backdrop keyboard-modal-backdrop--light" aria-hidden />
      <div
        className="absolute flex items-center justify-center px-4 py-3"
        style={{ top: 0, left: 0, width: layoutBounds.width, height: layoutBounds.height }}
      >
        <div
          ref={panelRef}
          className={`keyboard-modal-panel relative z-10 w-full ${maxWidthClass} color-bg rounded-2xl overflow-hidden flex flex-col max-h-full`}
          onClick={(e) => e.stopPropagation()}
          data-visual-viewport-modal="true"
          role="dialog"
          aria-modal="true"
          aria-label={title}
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
            className="keyboard-modal-scroll px-5 pb-4 flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-minimal [&_input]:text-base [&_textarea]:text-base"
          >
            {children}
          </div>

          {footer && <div className="px-5 pb-5 pt-2 shrink-0">{footer}</div>}
        </div>
      </div>
    </motion.div>,
    getThemedPortalTarget()
  );
}
