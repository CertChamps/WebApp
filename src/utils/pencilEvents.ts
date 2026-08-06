export const PENCIL_DOUBLE_TAP_EVENT = "certchamps:pencil-double-tap";
export const PENCIL_SQUEEZE_EVENT = "certchamps:pencil-squeeze";

export const CANVAS_FINGER_POINTER_EVENT = "certchamps:canvas-finger-pointer";
export const CANVAS_FINGER_SELECT_EVENT = "certchamps:canvas-finger-select";

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
