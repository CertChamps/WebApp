import { useState } from "react";
import { LuChevronDown, LuChevronRight, LuArrowUpRight } from "react-icons/lu";
import type { PaperQuestion } from "../../hooks/useExamPapers";

type PaperQuestionRegionPanelProps = {
  question: PaperQuestion;
  index: number;
  onGoToQuestion: () => void;
};

/** Compact panel beside a question region — expandable, click to show tags + "Go to question". */
export default function PaperQuestionRegionPanel({
  question,
  index,
  onGoToQuestion,
}: PaperQuestionRegionPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const name = question.questionName || `Question ${index + 1}`;
  const tags = question.tags ?? [];

  return (
    <div className="paper-question-region-panel w-full max-w-[9rem] rounded-lg border border-grey/15 color-bg shadow-sm overflow-hidden transition-shadow hover:shadow-[0_2px_6px_rgba(0,0,0,0.08)]">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left hover:color-bg-grey-10 transition-colors cursor-pointer rounded-t-lg"
        aria-expanded={expanded}
      >
        <span className="shrink-0 color-txt-sub">
          {expanded ? <LuChevronDown size={11} strokeWidth={2} /> : <LuChevronRight size={11} strokeWidth={2} />}
        </span>
        <span className="flex-1 min-w-0 truncate text-[11px] font-medium color-txt-main">{name}</span>
      </button>
      {expanded && (
        <div className="px-2 pb-2 pt-0 pl-5 space-y-1.5 border-t border-grey/10">
          {tags.length > 0 && (
            <p className="text-[10px] color-txt-sub leading-tight">{tags.map((t) => `#${t}`).join(" ")}</p>
          )}
          <button
            type="button"
            onClick={onGoToQuestion}
            className="flex items-center gap-1 w-full justify-center rounded-md border border-grey/20 color-bg-grey-10 color-txt-sub px-1.5 py-1 text-[10px] font-medium transition-all duration-200 hover:border-grey/35 hover:color-bg-grey-5 hover:color-txt-main active:scale-[0.98] cursor-pointer"
          >
            <LuArrowUpRight size={10} strokeWidth={2} />
            <span>Go to question</span>
          </button>
        </div>
      )}
    </div>
  );
}
