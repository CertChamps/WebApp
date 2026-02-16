import { useState, useEffect } from "react";
import { LuX } from "react-icons/lu";
import {
  MATHS_HIGHER_TOPICS,
  TOPIC_TO_SUB_TOPICS,
} from "../../data/mathsHigherTopics";
import "../../styles/questions.css";

export type PastPaperFilterPanelProps = {
  open: boolean;
  onClose: () => void;
  selectedSubTopics: string[];
  onApply: (subTopics: string[]) => void;
};

function buildEmptySubTopicChecks(): Record<string, boolean> {
  const o: Record<string, boolean> = {};
  MATHS_HIGHER_TOPICS.forEach((topic) => {
    TOPIC_TO_SUB_TOPICS[topic]?.forEach((st) => (o[st] = false));
  });
  return o;
}

export default function PastPaperFilterPanel({
  open,
  onClose,
  selectedSubTopics,
  onApply,
}: PastPaperFilterPanelProps) {
  const [topicChecks, setTopicChecks] = useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {};
    MATHS_HIGHER_TOPICS.forEach((t) => (o[t] = false));
    return o;
  });
  const [subTopicChecks, setSubTopicChecks] = useState<Record<string, boolean>>(
    buildEmptySubTopicChecks
  );

  useEffect(() => {
    if (!open) return;
    const next = buildEmptySubTopicChecks();
    selectedSubTopics.forEach((st) => (next[st] = true));
    setSubTopicChecks(next);
  }, [open, selectedSubTopics]);


  const handleTopicChange = (topic: string, checked: boolean) => {
    setTopicChecks((prev) => ({ ...prev, [topic]: checked }));
  };

  const handleSubTopicChange = (st: string, checked: boolean) => {
    setSubTopicChecks((prev) => ({ ...prev, [st]: checked }));
  };

  const handleSelectAllInTopic = (topic: string, checked: boolean) => {
    const subs = TOPIC_TO_SUB_TOPICS[topic] ?? [];
    setSubTopicChecks((prev) => {
      const next = { ...prev };
      subs.forEach((s) => (next[s] = checked));
      return next;
    });
  };

  const handleApply = () => {
    const selected = Object.entries(subTopicChecks)
      .filter(([, v]) => v)
      .map(([k]) => k);
    onApply(selected);
    onClose();
  };

  const handleClear = () => {
    setTopicChecks((prev) => {
      const next = { ...prev };
      MATHS_HIGHER_TOPICS.forEach((t) => (next[t] = false));
      return next;
    });
    setSubTopicChecks((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => (next[k] = false));
      return next;
    });
    onApply([]);
    onClose();
  };

  if (!open) return null;

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
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl color-bg border border-[var(--grey-10)] shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--grey-10)] px-4 py-3">
          <h3 className="text-sm font-semibold color-txt-main">
            Filter questions by topic
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 hover:color-bg-grey-10 color-txt-sub"
            aria-label="Close"
          >
            <LuX size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <p className="mb-3 text-xs color-txt-sub">
            Select topics, then tick the subtopics you want. Only questions
            with those subtopics will be shown.
          </p>
          <div className="space-y-4">
            {MATHS_HIGHER_TOPICS.map((topic) => {
              const subs = TOPIC_TO_SUB_TOPICS[topic] ?? [];
              const allChecked =
                subs.length > 0 &&
                subs.every((s) => subTopicChecks[s]);
              return (
                <div key={topic} className="rounded-lg color-bg-grey-5 p-3">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={topicChecks[topic]}
                      onChange={(e) =>
                        handleTopicChange(topic, e.target.checked)
                      }
                      className="h-4 w-4 rounded border-[var(--grey-10)]"
                    />
                    <span className="font-medium color-txt-main text-sm">
                      {topic}
                    </span>
                  </label>
                  <div className="ml-6 mt-2 flex flex-col gap-1.5">
                    {subs.map((st) => (
                      <label
                        key={st}
                        className="flex cursor-pointer items-center gap-2"
                      >
                        <input
                          type="checkbox"
                          checked={subTopicChecks[st] ?? false}
                          onChange={(e) =>
                            handleSubTopicChange(st, e.target.checked)
                          }
                          className="h-3.5 w-3.5 rounded border-[var(--grey-10)]"
                        />
                        <span className="text-xs color-txt-sub">{st}</span>
                      </label>
                    ))}
                    {subs.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          handleSelectAllInTopic(topic, !allChecked)
                        }
                        className="mt-1 text-left text-xs color-txt-accent hover:underline"
                      >
                        {allChecked ? "Deselect all" : "Select all"} in {topic}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--grey-10)] px-4 py-3">
          <button
            type="button"
            onClick={handleClear}
            className="question-selector-button px-3 py-1.5 text-sm"
          >
            Clear filter
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="question-selector-button-active question-selector-button px-3 py-1.5 text-sm"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
