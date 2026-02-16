// Icons 
import {LuChevronLeft, LuChevronRight, LuFilter, LuSearch } from "react-icons/lu";
import { TbDice5 } from "react-icons/tb";
import { AnimatePresence, motion } from "framer-motion";

// Style Imports 
import '../../styles/questions.css';

// Props for the QuestionSelector component
export type QuestionSelectorProps = {
    question: any;
    nextQuestion: () => void;
    previousQuestion: () => void;
    setShowSearch: (show: boolean) => void;
    /** When true, next picks a random question from the full set; when undefined, randomise button is hidden */
    randomise?: boolean;
    onRandomiseChange?: (value: boolean) => void;
    /** When set (e.g. past paper mode), opens the topic/subtopic filter panel */
    onFilterClick?: () => void;
    /** When set (e.g. past paper mode), center shows this title and arrows call these handlers */
    overrideTitle?: string;
    /** When set (e.g. past paper mode), tags shown under the title */
    overrideTags?: string[];
    overrideOnPrevious?: () => void;
    overrideOnNext?: () => void;
};

// Formatting tags for display
function formatTags(tags: string[] | string | undefined): string {
  if (tags == null || tags === "") return "";
  const list = Array.isArray(tags) ? tags : tags.split(",").map((t) => t.trim());
  return list.filter(Boolean).map((t) => `#${t}`).join(", ");
}

export default function QuestionSelector({
  question,
  nextQuestion,
  previousQuestion,
  setShowSearch,
  randomise = false,
  onRandomiseChange,
  onFilterClick,
  overrideTitle,
  overrideTags,
  overrideOnPrevious,
  overrideOnNext,
}: QuestionSelectorProps) {
  const title = question?.properties?.name ?? "...";
  const tagsFromQuestion = formatTags(question?.properties?.tags);
  const tagsDisplay = overrideTags != null ? formatTags(overrideTags) : tagsFromQuestion;

  const onPrev = overrideOnPrevious ?? previousQuestion;
  const onNext = overrideOnNext ?? nextQuestion;
  const centerLabel = overrideTitle ?? title;
  const showTags = !!tagsDisplay;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex w-full items-center justify-between">
        <button
          type="button"
          aria-label={overrideOnPrevious ? "Previous paper" : "Previous question"}
          className="questions-advance pointer-events-auto"
          onClick={onPrev}
        >
          <LuChevronLeft size={16} strokeWidth={2.5} />
        </button>

        <div className="flex min-w-0 flex-col self-center overflow-hidden p-2">
          <div className="w-full text-left">
            <AnimatePresence mode="wait">
              <motion.div
                key={overrideTitle ?? question?.id ?? "empty"}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15, ease: [0.25, 0.4, 0.25, 1] }}
                className="flex min-w-0 flex-col"
              >
                <h2 className="question-selector-title question-selector-truncate color-txt-accent text-md font-bold leading-tight">
                  {centerLabel}
                </h2>
                {showTags ? (
                  <p className="question-selector-truncate color-txt-sub mt-0.5 text-xs font-normal">
                    {tagsDisplay}
                  </p>
                ) : null}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <button
          type="button"
          aria-label={overrideOnNext ? "Next paper" : "Next question"}
          className="questions-advance pointer-events-auto"
          onClick={onNext}
        >
          <LuChevronRight size={16} strokeWidth={2.5} />
        </button>
      </div>

      {/* ================================================================================================== */}



      {/* ========================================== BOTTOM SECTION ========================================== */}
      <div className="flex w-full flex-wrap items-center justify-start gap-4">
        <button
          type="button"
          aria-label={randomise ? "Random question (on)" : "Random question (off)"}
          className={`question-selector-button pointer-events-auto ${randomise ? "question-selector-button-active" : ""}`}
          onClick={() => onRandomiseChange?.(!randomise)}
        >
          <TbDice5 size={20} strokeWidth={1.8} />
          <span>randomize</span>
        </button>

        {/* Filter: only wired in past paper mode */}
        {onFilterClick != null ? (
          <button
            type="button"
            aria-label="Filter questions by topic"
            className="question-selector-button pointer-events-auto"
            onClick={onFilterClick}
          >
            <LuFilter size={18} strokeWidth={2} />
            <span>filter</span>
          </button>
        ) : (
          <button
            type="button"
            aria-label="Filter questions"
            className="question-selector-button pointer-events-auto"
          >
            <LuFilter size={18} strokeWidth={2} />
            <span>filter</span>
          </button>
        )}

        {/* Search: default pill */}
        <button
          type="button"
          aria-label="Search questions"
          className="question-selector-button pointer-events-auto"
          onClick={() => setShowSearch(true)}
        >
          <LuSearch size={18} strokeWidth={2} />
          <span>search</span>
        </button>
      </div>
      {/* ================================================================================================== */}


    </div>
  );
}