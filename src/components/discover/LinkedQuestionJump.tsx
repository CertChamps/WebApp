import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LuArrowUpRight, LuChevronDown } from "react-icons/lu";
import {
  withDiscoverSidebar,
  type LinkedDiscoverQuestion,
} from "../../lib/discoverLinks";

type LinkedQuestionJumpProps = {
  questions: LinkedDiscoverQuestion[];
  resourceId: string;
  compact?: boolean;
};

export default function LinkedQuestionJump({
  questions,
  resourceId,
  compact = false,
}: LinkedQuestionJumpProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const jumpable = questions.filter((item) => item.practiceUrl?.trim());

  const go = (item: LinkedDiscoverQuestion) => {
    if (!item.practiceUrl) return;
    setOpen(false);
    navigate(withDiscoverSidebar(item.practiceUrl, resourceId));
  };

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node | null)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (jumpable.length === 0) return null;

  const icon = <LuArrowUpRight size={compact ? 13 : 15} className="shrink-0" />;
  const pillClass = compact
    ? "inline-flex items-center gap-1 max-w-full rounded-lg color-bg-accent color-txt-accent px-2 py-0.5 text-[11px] font-semibold cursor-pointer hover:opacity-90"
    : "inline-flex items-center gap-1.5 max-w-full rounded-xl color-bg-accent color-txt-accent px-2.5 py-1 text-sm font-semibold cursor-pointer hover:opacity-90";

  if (jumpable.length === 1) {
    return (
      <button
        type="button"
        onClick={() => go(jumpable[0])}
        className={pillClass}
        title={jumpable[0].name}
      >
        {icon}
        <span className="truncate">{jumpable[0].name}</span>
      </button>
    );
  }

  return (
    <div ref={rootRef} className="relative inline-flex max-w-full">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={pillClass}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Linked question"
      >
        {icon}
        <span className="truncate">Linked question</span>
        <LuChevronDown
          size={compact ? 11 : 13}
          className={`shrink-0 opacity-80 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Linked questions"
          className="absolute left-0 top-full mt-1.5 z-30 min-w-[13.5rem] max-w-[20rem] rounded-2xl color-bg overflow-hidden"
        >
          <div className="p-1.5 color-bg-grey-10">
            {jumpable.map((item) => (
              <button
                key={item.id || item.practiceUrl}
                type="button"
                role="menuitem"
                onClick={() => go(item)}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold color-txt-main hover:color-bg-accent hover:color-txt-accent cursor-pointer"
              >
                <LuArrowUpRight size={13} className="shrink-0" />
                <span className="truncate">{item.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
