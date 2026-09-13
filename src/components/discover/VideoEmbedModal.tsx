import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LuExternalLink, LuGripVertical, LuPictureInPicture2, LuX } from "react-icons/lu";
import { OptionsContext } from "../../context/OptionsContext";
import { getDiscoverVideoEmbed, getDiscoverVideoPlayerSrc, DISCOVER_VIDEO_IFRAME_ALLOW } from "../../lib/discoverMedia";

const MIN_WIDTH = 320;
const MIN_HEIGHT = 220;
const DEFAULT_WIDTH = 480;
const BOTTOM_BAR_CLEARANCE = 72;

function getDefaultFloatingSize() {
  if (typeof window === "undefined") {
    return { width: DEFAULT_WIDTH, height: Math.round((DEFAULT_WIDTH * 9) / 16) + 48 };
  }
  const width = Math.min(DEFAULT_WIDTH, Math.max(MIN_WIDTH, window.innerWidth - 80));
  return { width, height: Math.round((width * 9) / 16) + 48 };
}

function getDefaultFloatingPosition(size: { width: number; height: number }) {
  if (typeof window === "undefined") return { left: 80, top: 80 };
  const maxTop = window.innerHeight - size.height - BOTTOM_BAR_CLEARANCE;
  return {
    left: Math.max(20, window.innerWidth - size.width - 40),
    top: Math.max(20, Math.min(maxTop, 80)),
  };
}

type VideoEmbedModalProps = {
  url: string;
  title?: string;
  onClose: () => void;
  className?: string;
};

export default function VideoEmbedModal({ url, title, onClose, className }: VideoEmbedModalProps) {
  const { options } = useContext(OptionsContext);
  const embed = getDiscoverVideoEmbed(url);
  const [poppedOut, setPoppedOut] = useState(false);
  const [size, setSize] = useState(getDefaultFloatingSize);
  const [pos, setPos] = useState(() => getDefaultFloatingPosition(getDefaultFloatingSize()));
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, left: 0, top: 0 });
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 });

  const getClientCoords = (e: MouseEvent | TouchEvent) => {
    if ("touches" in e && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if ("changedTouches" in e && e.changedTouches.length) {
      return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    }
    const me = e as MouseEvent;
    return { x: me.clientX, y: me.clientY };
  };

  const handleDragStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if ((e.target as HTMLElement).closest("button, a")) return;
      e.preventDefault();
      const { x, y } =
        "touches" in e && e.touches.length
          ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
          : { x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY };
      setIsDragging(true);
      dragStartRef.current = { x, y, left: pos.left, top: pos.top };
    },
    [pos]
  );

  const handleResizeStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const { x, y } =
        "touches" in e && e.touches.length
          ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
          : { x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY };
      setIsResizing(true);
      resizeStartRef.current = { x, y, width: size.width, height: size.height };
    },
    [size]
  );

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      const { x, y } = getClientCoords(e);
      setPos({
        left: Math.max(0, dragStartRef.current.left + x - dragStartRef.current.x),
        top: Math.max(0, dragStartRef.current.top + y - dragStartRef.current.y),
      });
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [isDragging]);

  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      const { x, y } = getClientCoords(e);
      setSize({
        width: Math.max(MIN_WIDTH, resizeStartRef.current.width + x - resizeStartRef.current.x),
        height: Math.max(MIN_HEIGHT, resizeStartRef.current.height + y - resizeStartRef.current.y),
      });
    };
    const onUp = () => setIsResizing(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [isResizing]);

  if (!embed) return null;

  const player = embed.kind === "direct" ? (
    <video src={embed.embedUrl} controls autoPlay playsInline className="h-full w-full bg-black" />
  ) : (
    <iframe
      src={getDiscoverVideoPlayerSrc(embed, { autoplay: true })}
      title={title || "Video player"}
      className="h-full w-full border-0 bg-black"
      allow={DISCOVER_VIDEO_IFRAME_ALLOW}
      referrerPolicy="strict-origin-when-cross-origin"
      allowFullScreen
    />
  );

  const headerActions = (
    <div className="flex shrink-0 items-center gap-1">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold color-txt-sub hover:color-txt-main"
      >
        <LuExternalLink size={14} /> Open source
      </a>
      <button
        type="button"
        onClick={() => {
          if (!poppedOut) {
            const nextSize = getDefaultFloatingSize();
            setSize(nextSize);
            setPos(getDefaultFloatingPosition(nextSize));
          }
          setPoppedOut((value) => !value);
        }}
        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold cursor-pointer ${
          poppedOut ? "color-bg-accent color-txt-accent" : "color-txt-sub hover:color-txt-main"
        }`}
        title={poppedOut ? "Return to full player" : "Pop out video over your work"}
      >
        <LuPictureInPicture2 size={14} />
        {poppedOut ? "Expand" : "Pop out"}
      </button>
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg p-1.5 color-txt-sub hover:color-txt-main cursor-pointer"
        aria-label="Close video"
      >
        <LuX size={18} />
      </button>
    </div>
  );

  const panel = poppedOut ? (
    <div data-theme={options.theme}>
      <div
        className="fixed flex flex-col overflow-hidden rounded-xl border-2 color-shadow color-bg"
        style={{
          left: pos.left,
          top: pos.top,
          width: size.width,
          height: size.height,
          zIndex: 100060,
        }}
        role="dialog"
        aria-modal="false"
        aria-label={title ? `Watch ${title}` : "Watch video"}
      >
        <div
          role="button"
          tabIndex={0}
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
          className="flex shrink-0 cursor-grab select-none items-center justify-between gap-2 px-3 py-2 color-bg-grey-5 touch-none active:cursor-grabbing"
        >
          <div className="flex min-w-0 items-center gap-2">
            <LuGripVertical size={18} className="shrink-0 color-txt-sub" aria-hidden />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold color-txt-main">{title || "Video"}</p>
              <p className="text-[11px] color-txt-sub">Drag to move · resize from the corner</p>
            </div>
          </div>
          {headerActions}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden bg-black">{player}</div>

        <div
          role="presentation"
          onMouseDown={handleResizeStart}
          onTouchStart={handleResizeStart}
          className="absolute bottom-0 right-0 flex h-6 w-6 cursor-nwse-resize items-end justify-end p-1 color-txt-sub touch-none"
          style={{ margin: "-2px -2px 0 0" }}
          aria-hidden
        >
          <svg width={14} height={14} viewBox="0 0 16 16" className="opacity-60">
            <path fill="currentColor" d="M14 14H10v-2h2v-2h2v6zM8 14H4v-4h2v2h2v2zM14 8V4h-2v2h-2v2h4z" />
          </svg>
        </div>
      </div>
    </div>
  ) : (
    <div
      className={`fixed inset-0 ${className ?? "z-[80]"} flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title ? `Watch ${title}` : "Watch video"}
    >
      <div
        className="w-full max-w-4xl overflow-hidden rounded-2xl color-bg shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-color-border/40 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold color-txt-main">{title || "Video"}</p>
            <p className="text-xs color-txt-sub">Playing in CertChamps · pop out to keep working</p>
          </div>
          {headerActions}
        </div>
        <div className="aspect-video bg-black">{player}</div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(panel, document.getElementById("themed-root") ?? document.body);
}
