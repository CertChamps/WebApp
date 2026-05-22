import { useMemo, useState } from "react";
import { LuCheck, LuSearch } from "react-icons/lu";
import {
  PRACTICE_HUB_SUBJECTS,
  type SubjectOption,
} from "../../data/practiceHubSubjects";

type Props = {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
};

export default function OnboardingSubjectPicker({ selectedIds, onChange }: Props) {
  const [search, setSearch] = useState("");

  const filteredSubjects = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return PRACTICE_HUB_SUBJECTS;
    return PRACTICE_HUB_SUBJECTS.filter(
      (subject) =>
        subject.label.toLowerCase().includes(query) ||
        subject.id.toLowerCase().includes(query)
    );
  }, [search]);

  const toggleSubject = (subject: SubjectOption) => {
    if (selectedIds.includes(subject.id)) {
      onChange(selectedIds.filter((id) => id !== subject.id));
      return;
    }
    onChange([...selectedIds, subject.id]);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <LuSearch
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 color-txt-sub pointer-events-none"
          aria-hidden
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search subjects…"
          className="txtbox w-full pl-9"
          aria-label="Search subjects"
        />
      </div>
      <p className="txt-sub color-txt-sub text-xs">
        {selectedIds.length === 0
          ? "Select at least one subject to continue."
          : `${selectedIds.length} subject${selectedIds.length === 1 ? "" : "s"} selected`}
      </p>
      <div
        className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto scrollbar-minimal pr-1"
        role="listbox"
        aria-label="Subjects you are studying"
        aria-multiselectable
      >
        {filteredSubjects.map((subject) => {
          const selected = selectedIds.includes(subject.id);
          return (
            <button
              key={subject.id}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => toggleSubject(subject)}
              className={`flex items-center justify-between gap-2 rounded-in border-2 px-3 py-2.5 text-left transition-colors ${
                selected
                  ? "color-bg-accent color-txt-accent border-transparent"
                  : "color-bg-grey-5 border-transparent hover:brightness-95"
              }`}
            >
              <span className="txt truncate">{subject.label}</span>
              {selected ? (
                <LuCheck size={18} className="color-txt-accent shrink-0" aria-hidden />
              ) : null}
            </button>
          );
        })}
        {filteredSubjects.length === 0 ? (
          <p className="txt-sub color-txt-sub col-span-full text-center py-4">No subjects match your search.</p>
        ) : null}
      </div>
    </div>
  );
}
