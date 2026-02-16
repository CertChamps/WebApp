import { LuArrowUpRight } from "react-icons/lu";
import type { PaperQuestion } from "../../hooks/useExamPapers";

type PaperQuestionRegionBarProps = {
  question: PaperQuestion;
  index: number;
  onOpenQuestion: () => void;
};

/** Subtle bar at the top of each question region when viewing the full paper. */
export default function PaperQuestionRegionBar({
  question,
  index,
  onOpenQuestion,
}: PaperQuestionRegionBarProps) {
  const tags = question.tags ?? [];
  const name = question.questionName || `Question ${index + 1}`;

  return (
    <div className="paper-question-region-bar flex flex-col rounded-b-md overflow-hidden border-b border-dashed bg-red border-[#333]">
      <div className="flex items-center justify-between gap-3 py-1.5 min-h-0">
        {/* Left: question name · #tags — subtle grey */}
        <div className="flex min-w-0 flex-1 items-center gap-2 text-xs color-txt-sub">
          <span className="truncate font-medium">{name}</span>
          {tags.length > 0 && (
            <>
              <span className="shrink-0 w-1 h-1 rounded-full color-txt-sub opacity-60 bg-current" aria-hidden />
              <span className="truncate">
                {tags.map((t) => `#${t}`).join(" ")}
              </span>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onOpenQuestion}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-grey/25 color-bg-grey-10 color-txt-sub px-2 py-1 text-xs font-medium transition-all duration-200 hover:border-grey/40 hover:color-bg-grey-5 hover:color-txt-main active:scale-[0.98] cursor-pointer"
          aria-label={`Open ${name}`}
        >
          <LuArrowUpRight size={12} strokeWidth={2} />
          <span>open question</span>
        </button>
      </div>
      {/* Faint dotted line */}
      <div
        className="h-px w-full flex-shrink-0 border-t border-dashed border-[#333]"
        aria-hidden
      />
    </div>
  );
}
