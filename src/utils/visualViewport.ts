/** Keep page chrome aligned with the visible viewport when the software keyboard opens. */

const KEYBOARD_INSET_PX = 48;
const CARET_MARGIN_PX = 28;

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
