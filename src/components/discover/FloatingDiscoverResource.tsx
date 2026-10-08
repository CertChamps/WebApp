import { useEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { LuGrip, LuX } from "react-icons/lu";
import DiscoverMediaPreview from "./DiscoverMediaPreview";
import type { DiscoverPreviewSource } from "../../lib/discoverPreview";
import { getThemedPortalTarget } from "../../utils/themedPortal";

const POPOUT_EVENT = "discover-resource-popout";
type Resource = DiscoverPreviewSource & { id: string; title: string };
type Frame = { x: number; y: number; width: number; height: number };

export function popOutDiscoverResource(resource: Resource) {
  window.dispatchEvent(new CustomEvent(POPOUT_EVENT, { detail: resource }));
}

function fit(frame: Frame): Frame {
  const width = Math.min(Math.max(260, frame.width), window.innerWidth - 16);
  const height = Math.min(Math.max(220, frame.height), window.innerHeight - 16);
  return { width, height, x: Math.max(8, Math.min(frame.x, window.innerWidth - width - 8)), y: Math.max(8, Math.min(frame.y, window.innerHeight - height - 8)) };
}

/** Mounted outside the sidebar so closing it cannot dismiss or stop playback. */
export default function FloatingDiscoverResource() {
  const [resource, setResource] = useState<Resource | null>(null);
  const [frame, setFrame] = useState<Frame>(() => fit({ x: 60, y: 80, width: 520, height: 380 }));
  const [moving, setMoving] = useState(false);
  const gesture = useRef<{ mode: "move" | "resize"; x: number; y: number; frame: Frame } | null>(null);
  const location = useLocation();
  useEffect(() => { setResource(null); }, [location.pathname]);
  useEffect(() => {
    const open = (event: Event) => {
      setResource((event as CustomEvent<Resource>).detail);
      setFrame(current => fit(current));
    };
    const resize = () => setFrame(current => fit(current));
    window.addEventListener(POPOUT_EVENT, open);
    window.addEventListener("resize", resize);
    return () => { window.removeEventListener(POPOUT_EVENT, open); window.removeEventListener("resize", resize); };
  }, []);
  if (!resource) return null;
  const start = (event: PointerEvent<HTMLElement>, mode: "move" | "resize") => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { mode, x: event.clientX, y: event.clientY, frame };
    setMoving(true);
  };
  const move = (event: PointerEvent<HTMLElement>) => {
    const current = gesture.current;
    if (!current) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    setFrame(fit(current.mode === "move"
      ? { ...current.frame, x: current.frame.x + dx, y: current.frame.y + dy }
      : { ...current.frame, width: current.frame.width + dx, height: current.frame.height + dy }));
  };
  const end = () => { gesture.current = null; setMoving(false); };
  return createPortal(
    <section aria-label={`Resource preview: ${resource.title}`} className="fixed z-[160] flex flex-col overflow-hidden rounded-2xl border-2 border-[var(--theme-txt-accent)] color-bg shadow-lg" style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height }}>
      <header className="flex shrink-0 touch-none items-center gap-2 px-3 py-2 cursor-move color-bg-grey-5" onPointerDown={event => start(event, "move")} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}>
        <span className="min-w-0 flex-1 truncate text-sm font-bold color-txt-main">{resource.title}</span>
        <button type="button" aria-label="Close resource preview" className="shrink-0 rounded-lg p-1 color-txt-sub hover:color-txt-main cursor-pointer" onPointerDown={event => event.stopPropagation()} onClick={() => setResource(null)}><LuX size={18} /></button>
      </header>
      <div className="relative min-h-0 flex-1">
        <DiscoverMediaPreview key={resource.id} resource={resource} variant="hero" />
        {moving && <div className="absolute inset-0" />}
      </div>
      <button type="button" aria-label="Resize resource preview" className="absolute bottom-0 right-0 touch-none rounded-tl-lg p-1.5 color-bg color-txt-sub cursor-nwse-resize" onPointerDown={event => start(event, "resize")} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} onKeyDown={event => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault();
        setFrame(current => fit({ ...current, width: current.width + (event.key === "ArrowRight" ? 20 : event.key === "ArrowLeft" ? -20 : 0), height: current.height + (event.key === "ArrowDown" ? 20 : event.key === "ArrowUp" ? -20 : 0) }));
      }}><LuGrip size={16} /></button>
    </section>, getThemedPortalTarget() ?? document.body,
  );
}
