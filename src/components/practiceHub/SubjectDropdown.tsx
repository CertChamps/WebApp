import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuChevronDown, LuSearch, LuStar } from "react-icons/lu";
import {
  PRACTICE_HUB_SUBJECTS,
  getFavouriteSubjectIds,
  toggleFavourite,
  type SubjectOption,
} from "../../data/practiceHubSubjects";
import "../../styles/practiceHub.css";

type Props = {
  value: string | null;
  onChange: (subjectId: string | null) => void;
  /** When provided, only these subjects are shown (e.g. from Firestore leaving cert > subjects). */
  subjects?: SubjectOption[] | null;
  id?: string;
  "aria-label"?: string;
};

export default function SubjectDropdown({ value, onChange, subjects, id = "ph-subject", "aria-label": ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [favourites, setFavourites] = useState<string[]>(() => getFavouriteSubjectIds());
  const containerRef = useRef<HTMLDivElement>(null);

  const options = subjects != null && subjects.length > 0 ? subjects : PRACTICE_HUB_SUBJECTS;
  const allowAllSubjects = subjects == null || subjects.length === 0;

  useEffect(() => {
    setFavourites(getFavouriteSubjectIds());
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

  const selectedLabel = useMemo(
    () => options.find((s) => s.id === value)?.label ?? (allowAllSubjects ? "All subjects" : "Select subject"),
    [value, options, allowAllSubjects]
  );

  const handleSelect = useCallback(
    (subject: SubjectOption | null) => {
      onChange(subject?.id ?? null);
      setOpen(false);
      setSearch("");
    },
    [onChange]
  );

  const handleFavourite = useCallback((e: React.MouseEvent, subjectId: string) => {
    e.stopPropagation();
    setFavourites((prev) => toggleFavourite(subjectId, prev));
  }, []);

  const favouriteSubjects = useMemo(
    () => options.filter((s) => favourites.includes(s.id)),
    [favourites, options]
  );

  return (
    <div ref={containerRef} className="practice-hub__subject-wrap" data-state={open ? "open" : "closed"}>
      <button
        type="button"
        id={id}
        aria-label={ariaLabel ?? "Choose subject"}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="practice-hub__subject-trigger"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="practice-hub__subject-trigger-label truncate">{selectedLabel}</span>
        <span className="practice-hub__subject-arrow" aria-hidden>
          <LuChevronDown size={18} strokeWidth={2} className="practice-hub__subject-chevron" />
        </span>
      </button>

      {open && (
        <div className="practice-hub__subject-dropdown" role="listbox">
          <div className="practice-hub__subject-search-wrap">
            <LuSearch size={18} className="practice-hub__subject-search-icon" aria-hidden />
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

          {favouriteSubjects.length > 0 && (
            <div className="practice-hub__subject-group">
              <div className="practice-hub__subject-group-label">Favourites</div>
              {favouriteSubjects.map((s) => (
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
              {search.trim() ? "Results" : allowAllSubjects ? "All subjects" : "Subjects"}
            </div>
            <div className="practice-hub__subject-list">
              {!search.trim() && allowAllSubjects && (
                <button
                  type="button"
                  role="option"
                  aria-selected={value === null}
                  className="practice-hub__subject-option"
                  onClick={() => handleSelect(null)}
                >
                  <span className="truncate">All subjects</span>
                </button>
              )}
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
                      aria-label={favourites.includes(s.id) ? `Unfavourite ${s.label}` : `Favourite ${s.label}`}
                      title={favourites.includes(s.id) ? "Remove from favourites" : "Add to favourites"}
                    >
                      <LuStar size={14} />
                    </button>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
