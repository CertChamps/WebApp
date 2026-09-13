export const PENCIL_DOUBLE_TAP_EVENT = "certchamps:pencil-double-tap";
export const PENCIL_SQUEEZE_EVENT = "certchamps:pencil-squeeze";

export const CANVAS_FINGER_POINTER_EVENT = "certchamps:canvas-finger-pointer";
export const CANVAS_FINGER_SELECT_EVENT = "certchamps:canvas-finger-select";
export const CANVAS_PAN_BY_EVENT = "certchamps:canvas-pan-by";

export type CanvasFingerPointerDetail = {
  phase: "start" | "move" | "end" | "cancel";
  pointerId: number;
  clientX: number;
  clientY: number;
};

export function dispatchCanvasFingerPointer(detail: CanvasFingerPointerDetail): void {
  window.dispatchEvent(new CustomEvent<CanvasFingerPointerDetail>(CANVAS_FINGER_POINTER_EVENT, { detail }));
}

export function requestCanvasFingerSelectMode(): void {
  window.dispatchEvent(new Event(CANVAS_FINGER_SELECT_EVENT));
}

export type CanvasPanByDetail = {
  dy: number;
};

type WebKitTouch = Touch & { touchType?: "stylus" | "direct" };

export function isStylusTouch(touch: Touch): boolean {
  return (touch as WebKitTouch).touchType === "stylus";
}

export function touchEventHasStylus(event: TouchEvent): boolean {
  return Array.from(event.changedTouches).some(isStylusTouch)
    || Array.from(event.touches).some(isStylusTouch);
}
