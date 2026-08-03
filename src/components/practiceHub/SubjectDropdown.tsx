import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { LuChevronDown, LuSearch, LuStar } from "react-icons/lu";
import {
  PRACTICE_HUB_SUBJECTS,
  getFavouriteSubjectIds,
  toggleFavourite,
  useSyncedFavouriteSubjectIds,
  type SubjectOption,
} from "../../data/practiceHubSubjects";
import { getThemedPortalTarget } from "../../utils/themedPortal";
import { SubjectGlyph } from "./subjectIcons";
import "../../styles/practiceHub.css";

const HOLD_MS = 480;

/** Ignores the click that follows a long-press menu open. */
let suppressNextSelectUntil = 0;

type Props = {
  value: string | null;
  onChange: (subjectId: string | null) => void;
  /** When provided, only these subjects are shown (e.g. from Firestore leaving cert > subjects). */
  subjects?: SubjectOption[] | null;
  id?: string;
  "aria-label"?: string;
  onFavouritesChange?: (ids: string[]) => void;
  /**
   * `grid` — icon tiles (Practice Hub). `list` — compact text rows with star favourites
   * (whiteboards).
   */
  variant?: "grid" | "list";
};

type ContextMenuState = {
  subjectId: string;
  x: number;
  y: number;
};

function SubjectTile({
  subject,
  selected,
  favourited,
  onSelect,
  onOpenMenu,
}: {
  subject: SubjectOption;
  selected: boolean;
  favourited: boolean;
  onSelect: () => void;
  onOpenMenu: (x: number, y: number) => void;
}) {
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdPointRef = useRef<{ x: number; y: number } | null>(null);
  const holdFiredRef = useRef(false);
  const [holding, setHolding] = useState(false);

  const clearHold = useCallback(() => {
    if (holdTimerRef.current != null) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setHolding(false);
  }, []);

  useEffect(() => () => clearHold(), [clearHold]);

  const startHold = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      holdFiredRef.current = false;
      holdPointRef.current = { x: e.clientX, y: e.clientY };
      setHolding(true);
      holdTimerRef.current = setTimeout(() => {
        holdTimerRef.current = null;
        holdFiredRef.current = true;
        suppressNextSelectUntil = Date.now() + 400;
        setHolding(false);
        const point = holdPointRef.current ?? { x: e.clientX, y: e.clientY };
        onOpenMenu(point.x, point.y);
      }, HOLD_MS);
    },
    [onOpenMenu]
  );

  return (
    <div
      role="option"
      aria-selected={selected}
      className={`relative flex flex-col items-center gap-2 rounded-lg px-2 pb-3 pt-3 text-center transition-colors cursor-pointer select-none touch-manipulation ${
        selected
          ? "color-bg-accent color-txt-accent"
          : favourited
            ? "color-txt-accent hover:color-bg-accent"
            : "color-txt-main hover:color-bg-grey-5"
      } ${holding ? "scale-[1.03] color-bg-grey-5" : ""}`}
      onClick={() => {
        if (holdFiredRef.current || Date.now() < suppressNextSelectUntil) {
          holdFiredRef.current = false;
          return;
        }
        onSelect();
      }}
      onPointerDown={startHold}
      onPointerMove={(e) => {
        if (holdPointRef.current) {
          holdPointRef.current = { x: e.clientX, y: e.clientY };
        }
      }}
      onPointerUp={clearHold}
      onPointerLeave={clearHold}
      onPointerCancel={clearHold}
      onContextMenu={(e) => {
        e.preventDefault();
        suppressNextSelectUntil = Date.now() + 400;
        onOpenMenu(e.clientX, e.clientY);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      tabIndex={0}
    >
      <span
        className={`flex size-12 items-center justify-center rounded-lg ${
          selected ? "color-bg" : favourited ? "color-bg-accent" : "color-bg-grey-5"
        }`}
        aria-hidden
      >
        <SubjectGlyph
          subjectId={subject.id}
          size={26}
          className="color-txt-accent"
        />
      </span>

      <span className={`w-full px-0.5 text-xs leading-snug line-clamp-2 ${selected ? "txt-bold" : ""}`}>
        {subject.label}
      </span>
    </div>
  );
}

function SubjectContextMenu({
  menu,
  label,
  onToggle,
  onClose,
}: {
  menu: ContextMenuState;
  label: string;
  onToggle: () => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: menu.x, top: menu.y });

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    setPos({
      left: Math.max(pad, Math.min(menu.x, window.innerWidth - rect.width - pad)),
      top: Math.max(pad, Math.min(menu.y, window.innerHeight - rect.height - pad)),
    });
  }, [menu.x, menu.y]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onPointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      data-subject-context-menu
      className="fixed z-[80] min-w-[11.5rem] rounded-lg border-2 color-shadow color-bg py-1"
      style={{ left: pos.left, top: pos.top }}
    >
      <button
        type="button"
        role="menuitem"
        className="w-full cursor-pointer px-3 py-2 text-left text-sm color-txt-main transition-colors hover:color-bg-grey-5"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
          onClose();
        }}
      >
        {label}
      </button>
    </div>,
    getThemedPortalTarget()
  );
}

export default function SubjectDropdown({
  value,
  onChange,
  subjects,
  id = "ph-subject",
  "aria-label": ariaLabel,
  onFavouritesChange,
  variant = "grid",
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [favourites, setFavourites] = useState<string[]>(() => getFavouriteSubjectIds());
  const syncedFavourites = useSyncedFavouriteSubjectIds();
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isList = variant === "list";

  const options = subjects != null && subjects.length > 0 ? subjects : PRACTICE_HUB_SUBJECTS;
  const allowAllSubjects = subjects == null || subjects.length === 0;

  useEffect(() => {
    setFavourites(getFavouriteSubjectIds());
  }, [open]);

  useEffect(() => {
    setFavourites(syncedFavourites);
  }, [syncedFavourites]);

  useEffect(() => {
    if (!open) setContextMenu(null);
  }, [open]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      // Context menu is portaled outside the wrap — don't treat it as outside.
      if ((target as Element).closest?.("[data-subject-context-menu]")) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (s) => s.label.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)
    );
  }, [search, options]);

  const yourSubjects = useMemo(
    () => filtered.filter((s) => favourites.includes(s.id)),
    [filtered, favourites]
  );

  const otherSubjects = useMemo(
    () => filtered.filter((s) => !favourites.includes(s.id)),
    [filtered, favourites]
  );

  const favouriteSubjects = useMemo(
    () => filtered.filter((s) => favourites.includes(s.id)),
    [filtered, favourites]
  );

  const selectedLabel = useMemo(
    () =>
      options.find((s) => s.id === value)?.label ??
      (allowAllSubjects ? "Choose a subject" : "Select subject"),
    [value, options, allowAllSubjects]
  );

  const menuSubject = useMemo(
    () => (contextMenu ? options.find((s) => s.id === contextMenu.subjectId) ?? null : null),
    [contextMenu, options]
  );

  const handleSelect = useCallback(
    (subject: SubjectOption | null) => {
      setContextMenu(null);
      onChange(subject?.id ?? null);
      setOpen(false);
      setSearch("");
    },
    [onChange]
  );

  const handleTogglePin = useCallback(
    (subjectId: string) => {
      setFavourites((prev) => {
        const next = toggleFavourite(subjectId, prev);
        onFavouritesChange?.(next);
        return next;
      });
    },
    [onFavouritesChange]
  );

  const handleFavourite = useCallback(
    (e: React.MouseEvent, subjectId: string) => {
      e.stopPropagation();
      handleTogglePin(subjectId);
    },
    [handleTogglePin]
  );

  const openMenuFor = useCallback((subjectId: string, x: number, y: number) => {
    setContextMenu({ subjectId, x, y });
  }, []);

  const searching = search.trim().length > 0;

  return (
    <div
      ref={containerRef}
      className={`practice-hub__subject-wrap${isList ? " practice-hub__subject-wrap--compact" : ""}`}
      data-state={open ? "open" : "closed"}
    >
      <button
        type="button"
        id={id}
        aria-label={ariaLabel ?? "Choose subject"}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`practice-hub__subject-trigger${isList ? " practice-hub__subject-trigger--compact" : ""}`}
        onClick={() => setOpen((o) => !o)}
      >
        {isList ? (
          <span className="practice-hub__subject-trigger-label truncate">{selectedLabel}</span>
        ) : (
          <span className="flex min-w-0 flex-1 items-center gap-2">
            {value ? (
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg color-bg-accent" aria-hidden>
                <SubjectGlyph subjectId={value} size={18} className="color-txt-accent" />
              </span>
            ) : null}
            <span className="practice-hub__subject-trigger-label truncate">{selectedLabel}</span>
          </span>
        )}
        <span className="practice-hub__subject-arrow" aria-hidden>
          <LuChevronDown size={isList ? 16 : 18} strokeWidth={2} className="practice-hub__subject-chevron" />
        </span>
      </button>

      <AnimatePresence>
        {open && isList && (
          <motion.div
            key="subject-dropdown-list"
            className="practice-hub__subject-dropdown practice-hub__subject-dropdown--list"
            role="listbox"
            aria-label="Subjects"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.99 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformOrigin: "top center" }}
          >
            <div className="practice-hub__subject-search-wrap">
              <LuSearch size={15} className="practice-hub__subject-search-icon" aria-hidden />
              <input
                type="text"
                className="practice-hub__subject-search"
                placeholder="Search subjects…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
                aria-label="Search subjects"
              />
            </div>

            <div className="practice-hub__subject-scroll">
              {favouriteSubjects.length > 0 && (
                <div className="practice-hub__subject-group">
                  <div className="practice-hub__subject-group-label">Favourites</div>
                  {favouriteSubjects.map((s) => (
                    <button
                      key={`fav-${s.id}`}
                      type="button"
                      role="option"
                      aria-selected={value === s.id}
                      className="practice-hub__subject-option"
                      onClick={() => handleSelect(s)}
                    >
                      <span className="truncate">{s.label}</span>
                      <button
                        type="button"
                        className="practice-hub__subject-fav practice-hub__subject-fav--on"
                        onClick={(e) => handleFavourite(e, s.id)}
                        aria-label={`Unfavourite ${s.label}`}
                        title="Remove from favourites"
                      >
                        <LuStar size={14} fill="currentColor" />
                      </button>
                    </button>
                  ))}
                </div>
              )}

              <div className="practice-hub__subject-group">
                <div className="practice-hub__subject-group-label">
                  {search.trim() ? "Results" : "All subjects"}
                </div>
                <div className="practice-hub__subject-list">
                  {filtered.length === 0 ? (
                    <div className="practice-hub__subject-empty color-txt-sub text-sm py-2">
                      No subjects match
                    </div>
                  ) : (
                    filtered.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        role="option"
                        aria-selected={value === s.id}
                        className="practice-hub__subject-option"
                        onClick={() => handleSelect(s)}
                      >
                        <span className="truncate">{s.label}</span>
                        <button
                          type="button"
                          className={`practice-hub__subject-fav ${favourites.includes(s.id) ? "practice-hub__subject-fav--on" : ""}`}
                          onClick={(e) => handleFavourite(e, s.id)}
                          aria-label={
                            favourites.includes(s.id)
                              ? `Unfavourite ${s.label}`
                              : `Favourite ${s.label}`
                          }
                          title={
                            favourites.includes(s.id)
                              ? "Remove from favourites"
                              : "Add to favourites"
                          }
                        >
                          <LuStar size={14} fill={favourites.includes(s.id) ? "currentColor" : "none"} />
                        </button>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {open && !isList && (
          <motion.div
            key="subject-dropdown"
            className="practice-hub__subject-dropdown practice-hub__subject-dropdown--grid"
            role="listbox"
            aria-label="Subjects"
            onScroll={() => setContextMenu(null)}
            initial={{ opacity: 0, y: -8, scale: 0.96, x: "-50%" }}
            animate={{ opacity: 1, y: 0, scale: 1, x: "-50%" }}
            exit={{ opacity: 0, y: -6, scale: 0.98, x: "-50%" }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={{ transformOrigin: "top center" }}
          >
            <div className="flex shrink-0 items-center gap-2.5 border-b border-grey/15 px-4 py-3">
              <LuSearch size={18} className="shrink-0 color-txt-sub" aria-hidden />
              <input
                type="text"
                className="min-w-0 flex-1 border-none bg-transparent py-1 text-base color-txt-main outline-none placeholder:color-txt-sub"
                placeholder="Search subjects…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setContextMenu(null);
                }}
                autoFocus
                aria-label="Search subjects"
              />
            </div>

            <div
              className="flex max-h-[min(32rem,70vh)] min-h-0 flex-1 flex-col overflow-y-auto scrollbar-minimal"
              onScroll={() => setContextMenu(null)}
            >
              <section className="shrink-0 border-b border-grey/15">
                <h3 className="px-4 pb-1.5 pt-3.5 text-xs font-semibold uppercase tracking-wide color-txt-sub">
                  Your subjects
                </h3>
                <div className="px-3 pb-3">
                  {yourSubjects.length === 0 ? (
                    <p className="px-1 py-4 text-center text-sm leading-snug color-txt-sub">
                      {searching
                        ? "No matching subjects"
                        : "Hold a subject to add it here"}
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5">
                      {yourSubjects.map((s) => (
                        <SubjectTile
                          key={s.id}
                          subject={s}
                          selected={value === s.id}
                          favourited
                          onSelect={() => handleSelect(s)}
                          onOpenMenu={(x, y) => openMenuFor(s.id, x, y)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <section className="min-h-0 flex-1">
                <h3 className="px-4 pb-1.5 pt-3.5 text-xs font-semibold uppercase tracking-wide color-txt-sub">
                  {searching ? "Results" : "All subjects"}
                </h3>
                <div className="px-3 pb-3">
                  {otherSubjects.length === 0 ? (
                    <p className="px-1 py-4 text-center text-sm leading-snug color-txt-sub">
                      {filtered.length === 0 ? "No subjects match" : "Nothing else to show"}
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5">
                      {otherSubjects.map((s) => (
                        <SubjectTile
                          key={s.id}
                          subject={s}
                          selected={value === s.id}
                          favourited={false}
                          onSelect={() => handleSelect(s)}
                          onOpenMenu={(x, y) => openMenuFor(s.id, x, y)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!isList && contextMenu && menuSubject && (
        <SubjectContextMenu
          menu={contextMenu}
          label={
            favourites.includes(contextMenu.subjectId)
              ? "Remove from your subjects"
              : "Add to your subjects"
          }
          onToggle={() => handleTogglePin(contextMenu.subjectId)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
