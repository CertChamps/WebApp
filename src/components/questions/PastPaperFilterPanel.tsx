import { useState, useEffect, useMemo } from "react";
import { LuX } from "react-icons/lu";
import {
  MATHS_HIGHER_TOPICS,
  TOPIC_TO_SUB_TOPICS,
} from "../../data/mathsHigherTopics";
import "../../styles/questions.css";
import "../../styles/practiceHub.css";

export type PastPaperFilterPanelProps = {
  open: boolean;
  onClose: () => void;
  selectedSubTopics: string[];
  onApply: (subTopics: string[]) => void;
  /** When true, render only the dropdown panel (no overlay). Same as Practice Hub Topics popup. */
  asDropdown?: boolean;
};

function PanelContent({
  pendingTopicFilter,
  setPendingTopicFilter,
  pendingSubTopicFilter,
  setPendingSubTopicFilter,
  availableSubTopics,
  onApply,
  onClose,
}: {
  pendingTopicFilter: string[];
  setPendingTopicFilter: React.Dispatch<React.SetStateAction<string[]>>;
  pendingSubTopicFilter: string[];
  setPendingSubTopicFilter: React.Dispatch<React.SetStateAction<string[]>>;
  availableSubTopics: string[];
  onApply: () => void;
}) {
  return (
    <>
      <p className="practice-hub__topics-heading txt-bold color-txt-main mb-2">topic</p>
      <div className="practice-hub__topics-tags flex flex-wrap gap-2 mb-4">
        {MATHS_HIGHER_TOPICS.map((tag) => {
          const selected = pendingTopicFilter.some(
            (t) => t.toLowerCase() === tag.toLowerCase()
          );
          return (
            <button
              key={tag}
              type="button"
              className={`practice-hub__topic-tag rounded-in px-1.5 py-0.5 text-xs font-medium border-0 cursor-pointer flex items-center gap-1 ${
                selected
                  ? "color-bg-accent color-txt-accent"
                  : "color-bg-grey-5 color-txt-sub"
              }`}
              onClick={() => {
                if (selected) {
                  setPendingTopicFilter((prev) =>
                    prev.filter((t) => t.toLowerCase() !== tag.toLowerCase())
                  );
                  setPendingSubTopicFilter((prev) =>
                    prev.filter((st) => !(TOPIC_TO_SUB_TOPICS[tag] ?? []).includes(st))
                  );
                } else {
                  setPendingTopicFilter((prev) => [...prev, tag]);
                }
              }}
              aria-pressed={selected}
            >
              <span>{tag}</span>
              {selected && <LuX size={12} strokeWidth={2.5} aria-hidden />}
            </button>
          );
        })}
      </div>
      {availableSubTopics.length > 0 && (
        <>
          <p className="practice-hub__topics-heading txt-bold color-txt-main mb-2">subtopic</p>
          <div className="practice-hub__topics-tags flex flex-wrap gap-2 mb-4">
            {availableSubTopics.map((tag) => {
              const selected = pendingSubTopicFilter.some(
                (t) => t.toLowerCase() === tag.toLowerCase()
              );
              return (
                <button
                  key={tag}
                  type="button"
                  className={`practice-hub__topic-tag rounded-in px-1.5 py-0.5 text-xs font-medium border-0 cursor-pointer flex items-center gap-1 ${
                    selected
                      ? "color-bg-accent color-txt-accent"
                      : "color-bg-grey-5 color-txt-sub"
                  }`}
                  onClick={() => {
                    if (selected) {
                      setPendingSubTopicFilter((prev) =>
                        prev.filter((t) => t.toLowerCase() !== tag.toLowerCase())
                      );
                    } else {
                      setPendingSubTopicFilter((prev) => [...prev, tag]);
                    }
                  }}
                  aria-pressed={selected}
                >
                  <span>{tag}</span>
                  {selected && <LuX size={12} strokeWidth={2.5} aria-hidden />}
                </button>
              );
            })}
          </div>
        </>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          className="blue-btn color-bg-accent color-txt-accent txt-bold rounded-in px-3 py-1.5"
          onClick={onApply}
        >
          Apply
        </button>
      </div>
    </>
  );
}

export default function PastPaperFilterPanel({
  open,
  onClose,
  selectedSubTopics,
  onApply,
  asDropdown = false,
}: PastPaperFilterPanelProps) {
  const [pendingTopicFilter, setPendingTopicFilter] = useState<string[]>([]);
  const [pendingSubTopicFilter, setPendingSubTopicFilter] = useState<string[]>([]);

  const availableSubTopics = useMemo(() => {
    if (pendingTopicFilter.length === 0) return [];
    const set = new Set<string>();
    pendingTopicFilter.forEach((t) => {
      TOPIC_TO_SUB_TOPICS[t]?.forEach((st) => set.add(st));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [pendingTopicFilter]);

  useEffect(() => {
    if (!open) return;
    const subtopics = [...selectedSubTopics];
    const topics: string[] = [];
    MATHS_HIGHER_TOPICS.forEach((topic) => {
      const subs = TOPIC_TO_SUB_TOPICS[topic] ?? [];
      if (subs.some((st) => selectedSubTopics.includes(st))) topics.push(topic);
    });
    setPendingTopicFilter(topics);
    setPendingSubTopicFilter(subtopics);
  }, [open, selectedSubTopics]);

  const handleApply = () => {
    onApply(pendingSubTopicFilter);
    onClose();
  };

  const handleClear = () => {
    setPendingTopicFilter([]);
    setPendingSubTopicFilter([]);
    onApply([]);
    onClose();
  };

  if (!open) return null;

  if (asDropdown) {
    return (
      <div
        className="practice-hub__topics-panel color-bg rounded-out border-2 color-shadow"
        role="dialog"
        aria-modal="true"
        aria-label="Topic filter"
      >
        <PanelContent
          pendingTopicFilter={pendingTopicFilter}
          setPendingTopicFilter={setPendingTopicFilter}
          pendingSubTopicFilter={pendingSubTopicFilter}
          setPendingSubTopicFilter={setPendingSubTopicFilter}
          availableSubTopics={availableSubTopics}
          onApply={() => {
            onApply(pendingSubTopicFilter);
            onClose();
          }}
        />
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Filter by topic and subtopic"
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-lg rounded-out color-bg border-2 color-shadow overflow-hidden">
        <div className="flex shrink-0 items-center justify-between border-b color-border px-4 py-3">
          <h3 className="text-sm font-semibold color-txt-main">
            Filter questions by topic
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 hover:color-bg-grey-5 color-txt-sub"
            aria-label="Close"
          >
            <LuX size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <PanelContent
            pendingTopicFilter={pendingTopicFilter}
            setPendingTopicFilter={setPendingTopicFilter}
            pendingSubTopicFilter={pendingSubTopicFilter}
            setPendingSubTopicFilter={setPendingSubTopicFilter}
            availableSubTopics={availableSubTopics}
            onApply={handleApply}
          />
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t color-border px-4 py-3">
          <button
            type="button"
            onClick={handleClear}
            className="rounded-in px-3 py-1.5 text-xs font-medium border-0 cursor-pointer color-txt-sub color-bg-grey-5 hover:color-txt-main"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
