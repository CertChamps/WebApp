import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuChevronDown, LuSearch } from "react-icons/lu";
import {
  PRACTICE_HUB_SUBJECTS,
  getFavouriteSubjectIds,
  toggleFavourite,
  type SubjectOption,
} from "../../data/practiceHubSubjects";
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
};

function SubjectTile({
  subject,
  selected,
  pinned,
  menuOpen,
  onSelect,
  onOpenMenu,
  onCloseMenu,
  onTogglePin,
}: {
  subject: SubjectOption;
  selected: boolean;
  pinned: boolean;
  menuOpen: boolean;
  onSelect: () => void;
  onOpenMenu: () => void;
  onCloseMenu: () => void;
  onTogglePin: () => void;
}) {
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      setHolding(true);
      holdTimerRef.current = setTimeout(() => {
        holdTimerRef.current = null;
        holdFiredRef.current = true;
        suppressNextSelectUntil = Date.now() + 400;
        setHolding(false);
        onOpenMenu();
      }, HOLD_MS);
    },
    [onOpenMenu]
  );

  return (
    <div
      role="option"
      aria-selected={selected}
      className={`relative flex flex-col items-center gap-2 rounded-2xl px-2 pb-3 pt-3 text-center transition-colors cursor-pointer select-none touch-manipulation ${
        selected
          ? "color-bg-accent color-txt-accent"
          : "color-txt-main hover:color-bg-grey-5"
      } ${holding ? "scale-[1.03] color-bg-grey-5" : ""}`}
      onClick={() => {
        if (holdFiredRef.current || Date.now() < suppressNextSelectUntil) {
          holdFiredRef.current = false;
          return;
        }
        if (menuOpen) {
          onCloseMenu();
          return;
        }
        onSelect();
      }}
      onPointerDown={startHold}
      onPointerUp={clearHold}
      onPointerLeave={clearHold}
      onPointerCancel={clearHold}
      onContextMenu={(e) => {
        e.preventDefault();
        suppressNextSelectUntil = Date.now() + 400;
        onOpenMenu();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      tabIndex={0}
    >
      {menuOpen && (
        <div
          className="absolute inset-x-1 top-1 z-20"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="w-full rounded-xl border-2 color-shadow color-bg px-2 py-1.5 text-[11px] font-semibold leading-snug color-txt-main transition-colors hover:color-bg-grey-5"
            onClick={() => {
              onTogglePin();
              onCloseMenu();
            }}
          >
            {pinned ? "Remove from your subjects" : "Add to your subjects"}
          </button>
        </div>
      )}

      <span
        className={`flex size-12 items-center justify-center rounded-xl ${
          selected ? "color-bg" : "color-bg-grey-5"
        }`}
        aria-hidden
      >
        <SubjectGlyph
          subjectId={subject.id}
          size={26}
          className={selected ? "color-txt-accent" : "color-txt-accent opacity-80"}
        />
      </span>

      <span className={`w-full px-0.5 text-xs leading-snug line-clamp-2 ${selected ? "txt-bold" : ""}`}>
        {subject.label}
      </span>
    </div>
  );
}

export default function SubjectDropdown({
  value,
  onChange,
  subjects,
  id = "ph-subject",
  "aria-label": ariaLabel,
  onFavouritesChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [favourites, setFavourites] = useState<string[]>(() => getFavouriteSubjectIds());
  const [menuSubjectId, setMenuSubjectId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const options = subjects != null && subjects.length > 0 ? subjects : PRACTICE_HUB_SUBJECTS;
  const allowAllSubjects = subjects == null || subjects.length === 0;

  useEffect(() => {
    setFavourites(getFavouriteSubjectIds());
  }, [open]);

  useEffect(() => {
    if (!open) setMenuSubjectId(null);
  }, [open]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
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

  const selectedLabel = useMemo(
    () =>
      options.find((s) => s.id === value)?.label ??
      (allowAllSubjects ? "Choose a subject" : "Select subject"),
    [value, options, allowAllSubjects]
  );

  const handleSelect = useCallback(
    (subject: SubjectOption | null) => {
      setMenuSubjectId(null);
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

  const searching = search.trim().length > 0;

  return (
    <div
      ref={containerRef}
      className="practice-hub__subject-wrap"
      data-state={open ? "open" : "closed"}
    >
      <button
        type="button"
        id={id}
        aria-label={ariaLabel ?? "Choose subject"}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="practice-hub__subject-trigger"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {value ? (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg color-bg-grey-5" aria-hidden>
              <SubjectGlyph subjectId={value} size={18} />
            </span>
          ) : null}
          <span className="practice-hub__subject-trigger-label truncate">{selectedLabel}</span>
        </span>
        <span className="practice-hub__subject-arrow" aria-hidden>
          <LuChevronDown size={18} strokeWidth={2} className="practice-hub__subject-chevron" />
        </span>
      </button>

      {open && (
        <div
          className="practice-hub__subject-dropdown practice-hub__subject-dropdown--grid"
          role="listbox"
          aria-label="Subjects"
          onScroll={() => setMenuSubjectId(null)}
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
                setMenuSubjectId(null);
              }}
              autoFocus
              aria-label="Search subjects"
            />
          </div>

          <div
            className="flex max-h-[min(32rem,70vh)] min-h-0 flex-1 flex-col overflow-y-auto scrollbar-minimal"
            onScroll={() => setMenuSubjectId(null)}
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
                        pinned
                        menuOpen={menuSubjectId === s.id}
                        onSelect={() => handleSelect(s)}
                        onOpenMenu={() => setMenuSubjectId(s.id)}
                        onCloseMenu={() => setMenuSubjectId(null)}
                        onTogglePin={() => handleTogglePin(s.id)}
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
                        pinned={false}
                        menuOpen={menuSubjectId === s.id}
                        onSelect={() => handleSelect(s)}
                        onOpenMenu={() => setMenuSubjectId(s.id)}
                        onCloseMenu={() => setMenuSubjectId(null)}
                        onTogglePin={() => handleTogglePin(s.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
