/** Keep page chrome aligned with the visible viewport when the software keyboard opens. */

const KEYBOARD_INSET_PX = 48;
const CARET_MARGIN_PX = 28;

let modalViewportLockCount = 0;
let releaseModalViewportLock: (() => void) | null = null;

export type VisualViewportBounds = {
  top: number;
  left: number;
  bottom: number;
  right: number;
  width: number;
  height: number;
  offsetTop: number;
  keyboardBottom: number;
};

export function subscribeVisualViewport(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  const viewport = window.visualViewport;
  if (!viewport) {
    return () => window.removeEventListener("resize", onChange);
  }
  viewport.addEventListener("resize", onChange);
  viewport.addEventListener("scroll", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
    viewport.removeEventListener("resize", onChange);
    viewport.removeEventListener("scroll", onChange);
  };
}

/** Subscribe to viewport size changes without reacting to iOS pan/overscroll.
 * Modal keyboard positioning uses this so a user's form scroll cannot fight
 * with the sheet translation. */
export function subscribeVisualViewportResize(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  const viewport = window.visualViewport;
  if (!viewport) {
    return () => window.removeEventListener("resize", onChange);
  }
  viewport.addEventListener("resize", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
    viewport.removeEventListener("resize", onChange);
  };
}

/** Freeze the layout viewport while a keyboard-aware modal is mounted.
 * The modal keeps its own scroll region, while iOS is prevented from panning
 * the document and dragging the application underneath it. Locks are counted
 * so nested modals cannot release one another's viewport lock. */
export function acquireModalViewportLock(): () => void {
  if (typeof document === "undefined") return () => undefined;

  modalViewportLockCount += 1;
  if (modalViewportLockCount === 1) {
    const root = document.documentElement;
    const body = document.body;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const previousRootOverflow = root.style.overflow;
    const previousBodyPosition = body.style.position;
    const previousBodyTop = body.style.top;
    const previousBodyLeft = body.style.left;
    const previousBodyWidth = body.style.width;
    const previousBodyHeight = body.style.height;
    const previousBodyOverflow = body.style.overflow;
    const previousLayoutWidth = root.style.getPropertyValue("--keyboard-modal-layout-width");
    const previousLayoutHeight = root.style.getPropertyValue("--keyboard-modal-layout-height");

    root.classList.add("keyboard-modal-open");
    root.style.overflow = "hidden";
    root.style.setProperty("--keyboard-modal-layout-width", `${window.innerWidth}px`);
    root.style.setProperty("--keyboard-modal-layout-height", `${window.innerHeight}px`);
    body.style.position = "fixed";
    body.style.top = `${-scrollY}px`;
    body.style.left = `${-scrollX}px`;
    body.style.width = "100%";
    body.style.height = "100%";
    body.style.overflow = "hidden";

    releaseModalViewportLock = () => {
      root.classList.remove("keyboard-modal-open");
      root.style.overflow = previousRootOverflow;
      if (previousLayoutWidth) root.style.setProperty("--keyboard-modal-layout-width", previousLayoutWidth);
      else root.style.removeProperty("--keyboard-modal-layout-width");
      if (previousLayoutHeight) root.style.setProperty("--keyboard-modal-layout-height", previousLayoutHeight);
      else root.style.removeProperty("--keyboard-modal-layout-height");
      body.style.position = previousBodyPosition;
      body.style.top = previousBodyTop;
      body.style.left = previousBodyLeft;
      body.style.width = previousBodyWidth;
      body.style.height = previousBodyHeight;
      body.style.overflow = previousBodyOverflow;
      if (window.scrollX !== scrollX || window.scrollY !== scrollY) {
        window.scrollTo(scrollX, scrollY);
      }
    };
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    modalViewportLockCount = Math.max(0, modalViewportLockCount - 1);
    if (modalViewportLockCount === 0) {
      releaseModalViewportLock?.();
      releaseModalViewportLock = null;
    }
  };
}

export function getVisualViewportBounds(): VisualViewportBounds {
  const viewport = window.visualViewport;
  if (!viewport) {
    return {
      top: 0,
      left: 0,
      bottom: window.innerHeight,
      right: window.innerWidth,
      width: window.innerWidth,
      height: window.innerHeight,
      offsetTop: 0,
      keyboardBottom: 0,
    };
  }
  const offsetTop = Math.max(0, viewport.offsetTop);
  const offsetLeft = Math.max(0, viewport.offsetLeft);
  return {
    top: offsetTop,
    left: offsetLeft,
    bottom: offsetTop + viewport.height,
    right: offsetLeft + viewport.width,
    width: viewport.width,
    height: viewport.height,
    offsetTop,
    keyboardBottom: Math.max(0, window.innerHeight - viewport.height - offsetTop),
  };
}

export function isKeyboardOpen(bounds: VisualViewportBounds = getVisualViewportBounds()): boolean {
  return bounds.offsetTop > KEYBOARD_INSET_PX || bounds.keyboardBottom > KEYBOARD_INSET_PX;
}

export function findScrollParent(start: HTMLElement | null): HTMLElement | null {
  let node = start?.parentElement ?? null;
  while (node && node !== document.body && node !== document.documentElement) {
    const overflowY = getComputedStyle(node).overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay")
      && node.scrollHeight > node.clientHeight + 1
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

export function ensureRectInView(rect: DOMRectReadOnly, margin = CARET_MARGIN_PX): boolean {
  if (rect.width <= 0 && rect.height <= 0) return false;
  const viewport = getVisualViewportBounds();
  const visibleTop = viewport.top + margin;
  const visibleBottom = viewport.bottom - margin;
  let dy = 0;
  if (rect.bottom > visibleBottom) dy = rect.bottom - visibleBottom;
  else if (rect.top < visibleTop) dy = rect.top - visibleTop;
  if (Math.abs(dy) < 1) return false;

  const active = document.activeElement;
  const scroller = active instanceof HTMLElement ? findScrollParent(active) : null;
  if (scroller) {
    scroller.scrollTop += dy;
    return true;
  }

  window.dispatchEvent(new CustomEvent("certchamps:canvas-pan-by", { detail: { dy: -dy } }));
  return true;
}

export function ensureElementInView(element: HTMLElement, margin = CARET_MARGIN_PX): boolean {
  return ensureRectInView(element.getBoundingClientRect(), margin);
}

export function ensureSelectionCaretInView(root?: HTMLElement | null): boolean {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return false;
  if (root && !root.contains(selection.anchorNode)) return false;
  const range = selection.getRangeAt(0);
  let rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    const node = selection.focusNode;
    const element = node instanceof HTMLElement ? node : node?.parentElement;
    if (element) rect = element.getBoundingClientRect();
  }
  return ensureRectInView(rect);
}
