import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { LuX } from "react-icons/lu";
import type { ExportImage } from "../../lib/exportFile";

type Rect = { x: number; y: number; width: number; height: number };
type Action = "move" | "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";
const handles: { action: Action; label: string; left: string; top: string; cursor: string }[] = [
  { action: "nw", label: "top left", left: "0%", top: "0%", cursor: "nwse-resize" },
  { action: "n", label: "top", left: "50%", top: "0%", cursor: "ns-resize" },
  { action: "ne", label: "top right", left: "100%", top: "0%", cursor: "nesw-resize" },
  { action: "e", label: "right", left: "100%", top: "50%", cursor: "ew-resize" },
  { action: "se", label: "bottom right", left: "100%", top: "100%", cursor: "nwse-resize" },
  { action: "s", label: "bottom", left: "50%", top: "100%", cursor: "ns-resize" },
  { action: "sw", label: "bottom left", left: "0%", top: "100%", cursor: "nesw-resize" },
  { action: "w", label: "left", left: "0%", top: "50%", cursor: "ew-resize" },
];
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function adjustCrop(rect: Rect, action: Action, dx: number, dy: number, minWidth: number, minHeight: number): Rect {
  if (action === "move") return { ...rect, x: clamp(rect.x + dx, 0, 1 - rect.width), y: clamp(rect.y + dy, 0, 1 - rect.height) };
  let left = rect.x, top = rect.y, right = left + rect.width, bottom = top + rect.height;
  if (action.includes("w")) left = clamp(left + dx, 0, right - minWidth);
  if (action.includes("e")) right = clamp(right + dx, left + minWidth, 1);
  if (action.includes("n")) top = clamp(top + dy, 0, bottom - minHeight);
  if (action.includes("s")) bottom = clamp(bottom + dy, top + minHeight, 1);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export default function ExportCrop({ image, busy, onClose, onApply }: {
  image: ExportImage;
  busy: boolean;
  onClose: () => void;
  onApply: (rect: Rect) => void;
}) {
  const [selection, setSelection] = useState<Rect>({ x: 0, y: 0, width: 1, height: 1 });
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; rect: Rect; action: Action } | null>(null);
  const point = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height };
  };
  const minimum = () => {
    const bounds = stageRef.current?.getBoundingClientRect();
    return { width: Math.min(1, 20 / (bounds?.width || 400)), height: Math.min(1, 20 / (bounds?.height || 280)) };
  };
  const keyboardAdjust = (event: KeyboardEvent<HTMLElement>, action: Action) => {
    if (busy || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 0.05 : 0.01;
    const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
    const min = minimum();
    setSelection((rect) => adjustCrop(rect, action, dx, dy, min.width, min.height));
  };
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4" role="dialog" aria-modal="true" aria-label="Crop whiteboard">
      <div className="w-full max-w-md overflow-hidden rounded-2xl color-bg color-shadow">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h3 className="text-sm font-bold color-txt-main">Crop whiteboard</h3>
          <button type="button" onClick={onClose} disabled={busy} className="p-1.5 rounded-lg color-txt-sub cursor-pointer" aria-label="Close crop"><LuX size={18} /></button>
        </div>
        <p className="px-4 pb-3 text-xs color-txt-sub">Drag the rectangle to move it. Drag its corners or edges to resize.</p>
        <div className="mx-4 flex justify-center overflow-hidden rounded-xl bg-black/40 p-3">
          <div
            ref={stageRef}
            className="relative inline-flex max-w-full touch-none select-none"
            onPointerDown={(event) => {
              if (busy || !event.isPrimary || event.button !== 0 || dragRef.current) return;
              const target = (event.target as HTMLElement).closest<HTMLElement>("[data-crop-action]");
              if (!target) return;
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              dragRef.current = { pointerId: event.pointerId, ...point(event), rect: selection, action: target.dataset.cropAction as Action };
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current;
              if (!drag || drag.pointerId !== event.pointerId || busy) return;
              const end = point(event);
              const min = minimum();
              setSelection(adjustCrop(drag.rect, drag.action, end.x - drag.x, end.y - drag.y, min.width, min.height));
            }}
            onPointerUp={(event) => {
              if (dragRef.current?.pointerId !== event.pointerId) return;
              dragRef.current = null;
              event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={() => { dragRef.current = null; }}
            onLostPointerCapture={() => { dragRef.current = null; }}
          >
            <img src={image.dataUrl} alt="Select export crop" draggable={false} className="block max-h-[280px] max-w-full object-contain pointer-events-none" />
            <div
              data-crop-action="move"
              role="button"
              tabIndex={busy ? -1 : 0}
              aria-label="Move crop rectangle"
              aria-disabled={busy}
              onKeyDown={(event) => keyboardAdjust(event, "move")}
              className="absolute border-2 border-white cursor-move outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              style={{ left: `${selection.x * 100}%`, top: `${selection.y * 100}%`, width: `${selection.width * 100}%`, height: `${selection.height * 100}%`, boxShadow: "0 0 0 9999px rgb(0 0 0 / 45%)" }}
            >
              <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                {Array.from({ length: 9 }, (_, index) => <div key={index} className="border border-white/25" />)}
              </div>
              {handles.map((handle) => (
                <button
                  key={handle.action}
                  type="button"
                  data-crop-action={handle.action}
                  disabled={busy}
                  aria-label={`Resize crop ${handle.label}`}
                  onKeyDown={(event) => keyboardAdjust(event, handle.action)}
                  className="absolute z-10 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded focus-visible:outline-2 focus-visible:outline-blue-400"
                  style={{ left: handle.left, top: handle.top, cursor: handle.cursor }}
                >
                  <span className="pointer-events-none h-2.5 w-2.5 rounded-sm border border-black/30 bg-white shadow" />
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-4 py-4">
          <button type="button" disabled={busy} onClick={() => setSelection({ x: 0, y: 0, width: 1, height: 1 })} className="rounded-xl px-3 py-2 text-sm font-semibold color-bg-grey-5 color-txt-main cursor-pointer">Reset</button>
          <button type="button" disabled={busy || selection.width * image.width < 1 || selection.height * image.height < 1} onClick={() => onApply({ x: selection.x * image.width, y: selection.y * image.height, width: selection.width * image.width, height: selection.height * image.height })} className="rounded-xl px-3 py-2 text-sm font-semibold color-bg-accent color-txt-accent cursor-pointer disabled:opacity-50">{busy ? "Cropping…" : "Apply crop"}</button>
        </div>
      </div>
    </div>
  );
}
