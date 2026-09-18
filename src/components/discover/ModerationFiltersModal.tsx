import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { LuX } from "react-icons/lu";
import { getThemedPortalTarget } from "../../utils/themedPortal";
import type { ResourceType } from "../../lib/discoverModeration";

export type ModerationSourceFilter = "website" | "pdf" | "image";
export type ModerationLinkedFilter = "all" | "linked" | "unlinked";

export type ModerationSubjectOption = { id: string; label: string };

export type ModerationFiltersValue = {
  subjects: string[];
  levels: string[];
  types: ResourceType[];
  sources: ModerationSourceFilter[];
  linked: ModerationLinkedFilter;
};

type Props = {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  subjects: ModerationSubjectOption[];
  resourceTypes: ResourceType[];
  levels: readonly string[];
  value: ModerationFiltersValue;
  onChange: (value: ModerationFiltersValue) => void;
};

const SOURCE_OPTIONS: Array<{ id: ModerationSourceFilter; label: string }> = [
  { id: "website", label: "Website" },
  { id: "pdf", label: "PDF" },
  { id: "image", label: "Image" },
];

const LINKED_OPTIONS: Array<{ id: ModerationLinkedFilter; label: string }> = [
  { id: "all", label: "Any" },
  { id: "linked", label: "Has linked question" },
  { id: "unlinked", label: "No linked question" },
];

function toggleValue(current: string[], value: string): string[] {
  return current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];
}

function FilterRow({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <button
        type="button"
        onClick={onToggle}
        className={`text-sm font-medium text-left cursor-pointer ${
          active ? "color-txt-accent" : "color-txt-sub hover:color-txt-main"
        }`}
      >
        {label}
      </button>
      {active && (
        <button
          type="button"
          onClick={onToggle}
          className="color-txt-sub hover:color-txt-main cursor-pointer p-0.5"
          aria-label={`Remove ${label}`}
        >
          <LuX size={15} />
        </button>
      )}
    </div>
  );
}

export default function ModerationFiltersModal({
  open,
  onClose,
  anchorRef,
  subjects,
  resourceTypes,
  levels,
  value,
  onChange,
}: Props) {
  const [subjectQuery, setSubjectQuery] = useState("");
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setSubjectQuery("");
  }, [open]);

  const updatePos = () => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({
      top: rect.bottom + 8,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePos();
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      const target = e.target as Node | null;
      if (anchorRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open || !pos) return null;

  const visibleSubjects = subjects.filter((subject) =>
    subject.label.toLowerCase().includes(subjectQuery.trim().toLowerCase())
  );

  const commit = (next: ModerationFiltersValue) => {
    onChange(next);
  };

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-[200] w-[min(92vw,40rem)] overflow-hidden rounded-2xl border-2 color-shadow color-bg shadow-none"
      style={{ top: pos.top, right: pos.right }}
      role="dialog"
      aria-label="Moderation filters"
    >
      <div className="p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <section>
            <h3 className="text-base font-bold color-txt-main mb-3">Subject</h3>
            <input
              type="search"
              value={subjectQuery}
              onChange={(event) => setSubjectQuery(event.target.value)}
              placeholder="Find a subject"
              className="w-full mb-2 px-3 py-1.5 rounded-lg color-bg-grey-5 color-txt-main text-sm outline-none placeholder:color-txt-sub"
            />
            <div className="flex flex-col max-h-56 overflow-y-auto scrollbar-minimal pr-1">
              {visibleSubjects.length === 0 ? (
                <p className="text-sm color-txt-sub">No matching subjects.</p>
              ) : (
                visibleSubjects.map((subject) => (
                  <FilterRow
                    key={subject.id}
                    label={subject.label}
                    active={value.subjects.includes(subject.id)}
                    onToggle={() =>
                      commit({ ...value, subjects: toggleValue(value.subjects, subject.id) })
                    }
                  />
                ))
              )}
            </div>
          </section>

          <section>
            <h3 className="text-base font-bold color-txt-main mb-3">Level</h3>
            <div className="flex flex-col">
              {levels.map((level) => (
                <FilterRow
                  key={level}
                  label={level}
                  active={value.levels.includes(level)}
                  onToggle={() => commit({ ...value, levels: toggleValue(value.levels, level) })}
                />
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-base font-bold color-txt-main mb-3">Type</h3>
            <div className="flex flex-col">
              {resourceTypes.map((type) => (
                <FilterRow
                  key={type}
                  label={type}
                  active={value.types.includes(type)}
                  onToggle={() =>
                    commit({
                      ...value,
                      types: value.types.includes(type)
                        ? value.types.filter((item) => item !== type)
                        : [...value.types, type],
                    })
                  }
                />
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-base font-bold color-txt-main mb-3">Source</h3>
            <div className="flex flex-col">
              {SOURCE_OPTIONS.map((option) => (
                <FilterRow
                  key={option.id}
                  label={option.label}
                  active={value.sources.includes(option.id)}
                  onToggle={() =>
                    commit({
                      ...value,
                      sources: value.sources.includes(option.id)
                        ? value.sources.filter((item) => item !== option.id)
                        : [...value.sources, option.id],
                    })
                  }
                />
              ))}
            </div>
          </section>

          <section className="sm:col-span-2 lg:col-span-2">
            <h3 className="text-base font-bold color-txt-main mb-3">Linked question</h3>
            <div className="flex flex-col">
              {LINKED_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => commit({ ...value, linked: option.id })}
                  className={`text-sm font-medium text-left cursor-pointer py-1.5 ${
                    value.linked === option.id
                      ? "color-txt-accent"
                      : "color-txt-sub hover:color-txt-main"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="flex items-center justify-between gap-3 pt-4">
          <button
            type="button"
            onClick={() =>
              commit({
                subjects: [],
                levels: [],
                types: [],
                sources: [],
                linked: "all",
              })
            }
            className="text-sm font-semibold color-txt-sub hover:color-txt-main cursor-pointer"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center px-4 py-1.5 rounded-xl color-bg-accent color-txt-accent font-semibold text-sm cursor-pointer hover:opacity-90"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    getThemedPortalTarget()
  );
}
