import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LuFileText, LuX } from "react-icons/lu";
import { WHITEBOARD_EMOJIS } from "../../data/whiteboards";
import { getThemedPortalTarget } from "../../utils/themedPortal";

type Props = {
  value: string | null;
  onChange: (emoji: string | null) => void;
  /** Shown when no emoji is picked. Defaults to a generic page icon. */
  fallbackIcon?: React.ReactNode;
  "aria-label"?: string;
};

const PANEL_WIDTH = 256;

/** Small preset emoji picker used for whiteboard pages and folders. */
export default function EmojiPicker({ value, onChange, fallbackIcon, "aria-label": ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({
      top: rect.bottom + 6,
      left: Math.min(Math.max(8, rect.left), window.innerWidth - PANEL_WIDTH - 8),
    });
  }, []);

  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="flex size-11 items-center justify-center rounded-xl color-bg-grey-5 hover:color-bg-grey-10 transition-colors cursor-pointer text-xl"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={ariaLabel ?? "Choose an emoji"}
      >
        {value ? (
          <span aria-hidden>{value}</span>
        ) : (
          fallbackIcon ?? <LuFileText size={20} className="color-txt-sub" />
        )}
      </button>

      {open && position &&
        createPortal(
          <div
            ref={panelRef}
            className="fixed z-[80] rounded-xl color-bg color-shadow p-2"
            style={{ top: position.top, left: position.left, width: PANEL_WIDTH }}
          >
            <div className="flex items-center justify-between px-1 pb-1">
              <span className="text-xs font-semibold color-txt-sub">Pick an icon</span>
              {value && (
                <button
                  type="button"
                  className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs color-txt-sub hover:color-bg-grey-5 transition-colors cursor-pointer"
                  onClick={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  <LuX size={12} /> Clear
                </button>
              )}
            </div>
            <div className="grid max-h-48 grid-cols-8 gap-0.5 overflow-y-auto scrollbar-minimal">
              {WHITEBOARD_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className={`flex size-7 items-center justify-center rounded-md text-base transition-colors cursor-pointer hover:color-bg-grey-10 ${
                    value === emoji ? "color-bg-accent" : ""
                  }`}
                  onClick={() => {
                    onChange(emoji);
                    setOpen(false);
                  }}
                  aria-label={`Emoji ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>,
          getThemedPortalTarget()
        )}
    </>
  );
}
