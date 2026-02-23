import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LuGripVertical, LuX } from "react-icons/lu";
import { OptionsContext } from "../context/OptionsContext";
import LogTables, { type LogTablesHandle } from "./logtables";

const MIN_WIDTH = 320;
const MIN_HEIGHT = 400;
const DEFAULT_WIDTH = 520;
const DEFAULT_HEIGHT = 70;

const BOTTOM_BAR_CLEARANCE = 72; // Leave space for the bottom floating bar (Log tables, Full paper, etc.)

function getDefaultPosition() {
  if (typeof window === "undefined") return { left: 80, top: 60 };
  const h = getDefaultHeight();
  const maxTop = window.innerHeight - h - BOTTOM_BAR_CLEARANCE;
  return {
    left: Math.max(20, (window.innerWidth - DEFAULT_WIDTH) / 2),
    top: Math.max(20, Math.min(maxTop, (window.innerHeight - h) / 2)),
  };
}
function getDefaultHeight() {
  if (typeof window === "undefined") return 560;
  const available = window.innerHeight - BOTTOM_BAR_CLEARANCE - 40;
  return Math.min(0.6 * window.innerHeight, 720, available);
}

type FloatingLogTablesProps = {
  pgNumber: string;
  onClose?: () => void;
  /** Preloaded log tables PDF blob; when provided, modal opens without fetching. */
  file?: Blob | null;
};

const isNullPage = (p: string) => !p || p === "null" || p === "NaN" || p === "0";
const effectivePage = (p: string) => (isNullPage(p) ? "1" : p);

export default function FloatingLogTables({ pgNumber, onClose, file }: FloatingLogTablesProps) {
  const { options } = useContext(OptionsContext);
  const logTablesRef = useRef<LogTablesHandle>(null);
  const [pos, setPos] = useState(getDefaultPosition);
  const [size, setSize] = useState({
    width: DEFAULT_WIDTH,
    height: getDefaultHeight(),
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, left: 0, top: 0 });
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 });

  const getClientCoords = (e: MouseEvent | TouchEvent) => {
    if ("touches" in e && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if ("changedTouches" in e && e.changedTouches.length) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    const me = e as MouseEvent;
    return { x: me.clientX, y: me.clientY };
  };

  const handleDragStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if ((e.target as HTMLElement).closest("button")) return;
      e.preventDefault();
      const { x, y } = "touches" in e && e.touches.length ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY };
      setIsDragging(true);
      dragStartRef.current = { x, y, left: pos.left, top: pos.top };
    },
    [pos]
  );

  const handleResizeStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const { x, y } = "touches" in e && e.touches.length ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY };
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
      const dx = x - dragStartRef.current.x;
      const dy = y - dragStartRef.current.y;
      setPos({
        left: Math.max(0, dragStartRef.current.left + dx),
        top: Math.max(0, dragStartRef.current.top + dy),
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
      const dx = x - resizeStartRef.current.x;
      const dy = y - resizeStartRef.current.y;
      setSize({
        width: Math.max(MIN_WIDTH, resizeStartRef.current.width + dx),
        height: Math.max(MIN_HEIGHT, resizeStartRef.current.height + dy),
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

  const panel = (
    <div data-theme={options.theme}>
      <div
        data-tutorial-id="sideview-logtables"
        className="fixed flex flex-col rounded-xl overflow-hidden border-2 color-shadow color-bg"
        style={{
          left: pos.left,
          top: pos.top,
          width: size.width,
          height: size.height,
          zIndex: 99999,
        }}
      >
      {/* Title bar: drag handle + close */}
      <div
        role="button"
        tabIndex={0}
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") e.currentTarget.click();
        }}
        className="flex shrink-0 items-center justify-between gap-2 px-3 py-2  color-bg-grey-5 cursor-grab active:cursor-grabbing select-none touch-none"
      >
        <div className="flex items-center gap-2 min-w-0">
          <LuGripVertical size={18} className="color-txt-sub shrink-0" aria-hidden />
          <span className="text-sm font-semibold color-txt-main truncate">Log tables</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {!isNullPage(pgNumber) && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  logTablesRef.current?.scrollToCurrentPage();
                }}
                className="px-2.5 py-1 text-xs font-medium rounded-lg color-bg-grey-10 color-txt-main hover:opacity-80 transition-all"
              >
                Jump to Pg {effectivePage(pgNumber)}
              </button>
              <span className="text-xs color-txt-accent font-medium">← this is the page you want!</span>
            </>
          )}
          {onClose && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              aria-label="Close log tables"
              className="p-1.5 rounded-lg hover:color-bg-grey-10 color-txt-sub hover:color-txt-main transition-colors"
            >
              <LuX size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Content: fills remaining height */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <LogTables ref={logTablesRef} pgNumber={pgNumber} embedded file={file} />
      </div>

      {/* Resize handle */}
      <div
        role="presentation"
        onMouseDown={handleResizeStart}
        onTouchStart={handleResizeStart}
        className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize flex items-end justify-end p-1 color-txt-sub touch-none"
        style={{ margin: "-2px -2px 0 0" }}
        aria-hidden
      >
        <svg width={14} height={14} viewBox="0 0 16 16" className="opacity-60">
          <path fill="currentColor" d="M14 14H10v-2h2v-2h2v6zM8 14H4v-4h2v2h2v2zM14 8V4h-2v2h-2v2h4z" />
        </svg>
      </div>
    </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(panel, document.body);
}
