import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LuGripVertical, LuX } from "react-icons/lu";
import { OptionsContext } from "../context/OptionsContext";
import LogTables from "./logtables";

const MIN_WIDTH = 320;
const MIN_HEIGHT = 400;
const DEFAULT_WIDTH = 520;
const DEFAULT_HEIGHT = 70;

function getDefaultPosition() {
  if (typeof window === "undefined") return { left: 80, top: 60 };
  const h = Math.min(0.7 * window.innerHeight, 720);
  return {
    left: Math.max(20, (window.innerWidth - DEFAULT_WIDTH) / 2),
    top: Math.max(20, (window.innerHeight - h) / 2),
  };
}
function getDefaultHeight() {
  if (typeof window === "undefined") return 560;
  return Math.min(0.7 * window.innerHeight, 720);
}

type FloatingLogTablesProps = {
  pgNumber: string;
  onClose?: () => void;
  /** Preloaded log tables PDF blob; when provided, modal opens without fetching. */
  file?: Blob | null;
};

export default function FloatingLogTables({ pgNumber, onClose, file }: FloatingLogTablesProps) {
  const { options } = useContext(OptionsContext);
  const [pos, setPos] = useState(getDefaultPosition);
  const [size, setSize] = useState({
    width: DEFAULT_WIDTH,
    height: getDefaultHeight(),
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, left: 0, top: 0 });
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 });

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest("button")) return;
      e.preventDefault();
      setIsDragging(true);
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        left: pos.left,
        top: pos.top,
      };
    },
    [pos]
  );

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsResizing(true);
      resizeStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        width: size.width,
        height: size.height,
      };
    },
    [size]
  );

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPos({
        left: Math.max(0, dragStartRef.current.left + dx),
        top: Math.max(0, dragStartRef.current.top + dy),
      });
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDragging]);

  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - resizeStartRef.current.x;
      const dy = e.clientY - resizeStartRef.current.y;
      setSize({
        width: Math.max(MIN_WIDTH, resizeStartRef.current.width + dx),
        height: Math.max(MIN_HEIGHT, resizeStartRef.current.height + dy),
      });
    };
    const onUp = () => setIsResizing(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isResizing]);

  const panel = (
    <div data-theme={options.theme}>
      <div
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
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") e.currentTarget.click();
        }}
        className="flex shrink-0 items-center justify-between gap-2 px-3 py-2  color-bg-grey-5 cursor-grab active:cursor-grabbing select-none"
      >
        <div className="flex items-center gap-2 min-w-0">
          <LuGripVertical size={18} className="color-txt-sub shrink-0" aria-hidden />
          <span className="text-sm font-semibold color-txt-main truncate">Log tables</span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            aria-label="Close log tables"
            className="p-1.5 rounded-lg hover:color-bg-grey-10 color-txt-sub hover:color-txt-main transition-colors shrink-0"
          >
            <LuX size={18} />
          </button>
        )}
      </div>

      {/* Content: fills remaining height */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <LogTables pgNumber={pgNumber} embedded file={file} />
      </div>

      {/* Resize handle */}
      <div
        role="presentation"
        onMouseDown={handleResizeStart}
        className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize flex items-end justify-end p-1 color-txt-sub"
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
