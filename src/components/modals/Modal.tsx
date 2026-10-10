import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Overlay } from "react-aria/Overlay";
import { useModalOverlay } from "react-aria/useModalOverlay";
import { useDialog } from "react-aria/useDialog";
import { mergeProps } from "react-aria/mergeProps";
import { useOverlayTriggerState } from "react-stately/useOverlayTriggerState";
import { LuX } from "react-icons/lu";
import { getThemedPortalTarget } from "../../utils/themedPortal";
import { acquireAppViewportLock } from "../../utils/modalViewport";
import { getVisualViewportBounds, isKeyboardOpen, subscribeVisualViewport } from "../../utils/visualViewport";
import { ModalPortalContext } from "./ModalPortalContext";

export type ModalProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  headerActions?: ReactNode;
  maxWidthClass?: string;
  className?: string;
  layer?: number;
  initialPlacement?: "top" | "center";
  keyboardLiftPx?: number;
};

/** One viewport frame and one scroll area for all modal form content. */
export default function Modal(props: ModalProps) {
  return (
    <Overlay portalContainer={getThemedPortalTarget()}>
      <ModalSurface {...props} />
    </Overlay>
  );
}

function ModalSurface({
  title, onClose, children, footer, headerActions,
  maxWidthClass = "max-w-lg", className = "", layer = 80,
  initialPlacement = "top",
  keyboardLiftPx = 0,
}: ModalProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const restingTopRef = useRef<number | null>(null);
  const minimumTopPaddingRef = useRef<number | null>(null);
  const state = useOverlayTriggerState({ isOpen: true, onOpenChange: (open) => { if (!open) onClose(); } });
  const { modalProps, underlayProps } = useModalOverlay({ isDismissable: true }, state, panelRef);
  const { dialogProps, titleProps } = useDialog({ "aria-label": title }, panelRef);

  // React Aria owns document scroll prevention, focus containment and iOS
  // keyboard navigation. The app shell must not reposition underneath it.
  useLayoutEffect(() => acquireAppViewportLock(), []);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const panel = panelRef.current;
    if (!frame || !panel) return;
    let revealTimer = 0;
    let revealPending = false;
    minimumTopPaddingRef.current ??= Number.parseFloat(getComputedStyle(frame).paddingTop) || 16;
    const minimumTopPadding = minimumTopPaddingRef.current;

    const revealFocusedField = () => {
      revealPending = false;
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || active === panel || !panel.contains(active)) return;
      // Only scroll this dialog, never the document or another overlay. Waiting
      // for the viewport to settle avoids fighting the native keyboard animation.
      const field = active.getBoundingClientRect();
      const area = panel.getBoundingClientRect();
      const top = area.top + 16;
      const bottom = area.bottom - 16;
      const delta = field.top < top || field.height > bottom - top
        ? field.top - top
        : Math.max(0, field.bottom - bottom);
      if (Math.abs(delta) > 1) panel.scrollTop += delta;
    };
    const scheduleReveal = () => {
      revealPending = true;
      window.clearTimeout(revealTimer);
      revealTimer = window.setTimeout(revealFocusedField, 120);
    };
    const onScroll = () => {
      // Let the native focus scroll finish too. Once revealed, ordinary user
      // scrolling is left alone, even while an input remains focused.
      if (revealPending) scheduleReveal();
    };
    const syncViewport = () => {
      const bounds = getVisualViewportBounds();
      // No centering, panel translation, height animation or React re-render.
      // The top edge stays anchored while only the available scroll area shrinks.
      frame.style.top = `${bounds.top}px`;
      frame.style.left = `${bounds.left}px`;
      frame.style.width = `${bounds.width}px`;
      frame.style.height = `${bounds.height}px`;
      if (initialPlacement === "center") {
        // Measure once before the keyboard opens. Keep this resting top while
        // the visible viewport shrinks, and reduce the panel's scroll area.
        // This restores the original centered presentation without bringing
        // back the keyboard-time recentering jump.
        if (restingTopRef.current == null) {
          restingTopRef.current = bounds.top + Math.max(
            minimumTopPadding,
            Math.round((bounds.height - panel.offsetHeight) / 2),
          );
        }
        const keyboardLift = isKeyboardOpen(bounds) ? keyboardLiftPx : 0;
        frame.style.paddingTop = `${Math.max(
          minimumTopPadding,
          restingTopRef.current - bounds.top - keyboardLift,
        )}px`;
      }
      scheduleReveal();
    };
    syncViewport();
    const unsubscribe = subscribeVisualViewport(syncViewport);
    panel.addEventListener("focusin", scheduleReveal);
    panel.addEventListener("scroll", onScroll, { passive: true });
    const observer = new ResizeObserver(scheduleReveal);
    if (contentRef.current) observer.observe(contentRef.current);
    return () => {
      window.clearTimeout(revealTimer);
      unsubscribe();
      observer.disconnect();
      panel.removeEventListener("focusin", scheduleReveal);
      panel.removeEventListener("scroll", onScroll);
    };
  }, [initialPlacement, keyboardLiftPx]);

  return (
    <ModalPortalContext.Provider value={panelRef}>
      <div {...underlayProps} ref={frameRef} className="app-modal-frame" style={{ zIndex: layer }}>
        <div
          {...mergeProps(modalProps, dialogProps)}
          ref={panelRef}
          className={`app-modal-panel color-bg color-txt-main scrollbar-minimal ${maxWidthClass} ${className}`}
          data-visual-viewport-modal="true"
        >
          <div ref={contentRef}>
            <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
              <h2 {...titleProps} className="text-lg font-bold color-txt-main">{title}</h2>
              <div className="flex shrink-0 items-center gap-0.5">
                {headerActions}
                <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg color-txt-sub hover:color-bg-grey-5 transition-colors cursor-pointer">
                  <LuX size={18} />
                </button>
              </div>
            </div>
            <div className="px-5 pb-4">{children}</div>
            {footer && <div className="px-5 pb-5 pt-2">{footer}</div>}
          </div>
        </div>
      </div>
    </ModalPortalContext.Provider>
  );
}
