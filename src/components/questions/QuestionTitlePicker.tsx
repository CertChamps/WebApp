import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { LuChevronDown, LuCircle, LuCircleCheck } from "react-icons/lu";

export type QuestionPickerItem = {
  id: string;
  label: string;
};

type QuestionTitlePickerProps = {
  title: string;
  titleKey?: string;
  tagsDisplay?: string;
  items: QuestionPickerItem[];
  currentIndex: number;
  onSelect: (index: number) => void;
  isCompleted?: (id: string) => boolean;
  showCompletion?: boolean;
  disabled?: boolean;
  /** When set, dropdown aligns to this element (e.g. the full prev/title/next row). */
  anchorRef?: RefObject<HTMLElement | null>;
  /** Optional tutorial anchor for onboarding (e.g. session-question-list-btn). */
  tutorialId?: string;
};

type PanelPosition = {
  top: number;
  left: number;
  width: number;
};

function getPortalTarget(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.getElementById("themed-root") ?? document.body;
}

export default function QuestionTitlePicker({
  title,
  titleKey,
  tagsDisplay,
  items,
  currentIndex,
  onSelect,
  isCompleted,
  showCompletion = false,
  disabled = false,
  anchorRef,
  tutorialId,
}: QuestionTitlePickerProps) {
  const [open, setOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState<PanelPosition | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const canOpen = !disabled && items.length > 0;
  const portalTarget = getPortalTarget();

  const updatePanelPosition = useCallback(() => {
    const anchor = anchorRef?.current ?? containerRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    setPanelPosition({
      top: rect.bottom + 6,
      left: rect.left + rect.width / 2,
      width: Math.min(320, window.innerWidth - 32),
    });
  }, [anchorRef]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePanelPosition();
  }, [open, updatePanelPosition, titleKey, title]);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  const handleExitComplete = useCallback(() => {
    setPanelPosition(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", updatePanelPosition);
    window.addEventListener("scroll", updatePanelPosition, true);
    return () => {
      window.removeEventListener("resize", updatePanelPosition);
      window.removeEventListener("scroll", updatePanelPosition, true);
    };
  }, [open, updatePanelPosition]);

  useEffect(() => {
    if (!open) return;
    const activeEl = listRef.current?.querySelector("[data-active='true']");
    activeEl?.scrollIntoView({ block: "nearest" });
  }, [open, currentIndex]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleClose]);

  const handleSelect = (index: number) => {
    onSelect(index);
    handleClose();
  };

  const showPortal = Boolean(portalTarget && canOpen && panelPosition);

  const dropdownPortal = showPortal
    ? createPortal(
        <AnimatePresence onExitComplete={handleExitComplete}>
          {open && panelPosition && (
            <>
              <motion.button
                key="question-title-picker-backdrop"
                type="button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="question-title-picker__backdrop fixed inset-0 z-[55] cursor-default border-none bg-transparent p-0"
                aria-label="Close question list"
                onPointerDown={handleClose}
              />
              <motion.div
                key="question-title-picker-panel"
                className="question-title-picker__panel pointer-events-auto fixed z-[60] overflow-hidden rounded-lg color-bg border-2 color-shadow"
                data-tutorial-id={tutorialId ? "session-question-list-panel" : undefined}
                style={{
                  top: panelPosition.top,
                  left: panelPosition.left,
                  width: panelPosition.width,
                }}
                initial={{ opacity: 0, height: 0, y: -4, x: "-50%" }}
                animate={{ opacity: 1, height: "auto", y: 0, x: "-50%" }}
                exit={{ opacity: 0, height: 0, y: -4, x: "-50%" }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              >
                <div
                  ref={listRef}
                  className="question-title-picker__list max-h-[min(360px,50vh)] overflow-y-auto scrollbar-minimal py-1"
                  role="listbox"
                  aria-label="Questions in this set"
                >
                  {items.map((item, index) => {
                    const isActive = index === currentIndex;
                    const completed = showCompletion && isCompleted?.(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        data-active={isActive ? "true" : undefined}
                        className={`question-title-picker__item flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors duration-150 ${
                          isActive
                            ? "color-bg-accent color-txt-accent font-bold"
                            : "bg-transparent color-txt-main hover:color-bg-grey-10"
                        }`}
                        onClick={() => handleSelect(index)}
                      >
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {showCompletion && (
                          <span
                            className={`shrink-0 ${completed ? "color-txt-accent" : "color-txt-sub opacity-60"}`}
                            aria-label={completed ? "Completed" : "Not completed"}
                            title={completed ? "Completed" : "Not completed"}
                          >
                            {completed ? (
                              <LuCircleCheck size={16} strokeWidth={2} />
                            ) : (
                              <LuCircle size={16} strokeWidth={2} />
                            )}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        portalTarget
      )
    : null;

  return (
    <>
      <div ref={containerRef} className="question-title-picker relative flex min-w-0 flex-col items-center overflow-hidden px-2">
        {canOpen ? (
          <button
            type="button"
            className="question-title-picker__trigger pointer-events-auto flex min-w-0 max-w-[min(100%,280px)] flex-col items-center rounded-md px-1 py-0.5 text-center transition-colors duration-150 hover:color-bg-grey-5"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-label={`${title}. Show question list`}
            {...(tutorialId ? { "data-tutorial-id": tutorialId } : {})}
          >
            <AnimatePresence mode="wait">
              <motion.span
                key={titleKey ?? title}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15, ease: [0.25, 0.4, 0.25, 1] }}
                className="flex min-w-0 items-center gap-1"
              >
                <span className="question-selector-title question-selector-truncate color-txt-accent text-sm font-bold leading-tight">
                  {title}
                </span>
                <LuChevronDown
                  size={14}
                  strokeWidth={2.5}
                  className={`shrink-0 color-txt-sub transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </motion.span>
            </AnimatePresence>
            {tagsDisplay && (
              <p className="question-selector-truncate color-txt-sub mt-0.5 text-xs font-normal">
                {tagsDisplay}
              </p>
            )}
          </button>
        ) : (
          <div className="flex min-w-0 max-w-[min(100%,280px)] flex-col items-center px-1 py-0.5 text-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={titleKey ?? title}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15, ease: [0.25, 0.4, 0.25, 1] }}
                className="flex min-w-0 flex-col items-center"
              >
                <h2 className="question-selector-title question-selector-truncate color-txt-accent text-sm font-bold leading-tight">
                  {title}
                </h2>
                {tagsDisplay && (
                  <p className="question-selector-truncate color-txt-sub mt-0.5 text-xs font-normal">
                    {tagsDisplay}
                  </p>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </div>

      {dropdownPortal}
    </>
  );
}
