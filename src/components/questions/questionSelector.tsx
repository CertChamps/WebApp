// Icons 
import { LuChevronLeft, LuChevronRight, LuFilter, LuSearch } from "react-icons/lu";
import { TbDice5 } from "react-icons/tb";
import { Pencil } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

// Style Imports 
import '../../styles/questions.css';

// Props for the QuestionSelector component
export type QuestionSelectorProps = {
    question: any;
    nextQuestion: () => void;
    previousQuestion: () => void;
    setShowSearch: (show: boolean) => void;
    canvasMode: boolean;
    setCanvasMode: (show: boolean) => void;
};

// Formatting tags for display
function formatTags(tags: string[] | string | undefined): string {
  if (tags == null || tags === "") return "";
  const list = Array.isArray(tags) ? tags : tags.split(",").map((t) => t.trim());
  return list.filter(Boolean).map((t) => `#${t}`).join(", ");
}

export default function QuestionSelector({ question, nextQuestion, previousQuestion, setShowSearch, canvasMode, setCanvasMode }: QuestionSelectorProps) {

  // Title and tags from question document (properties = Firestore doc data)
  const title = question?.properties?.name ?? '...';
  const tagsDisplay = formatTags(question?.properties?.tags);

  return (
    <div className="flex flex-col gap-2 rounded-out px-4 py-2 backdrop-blur-sm ">


      <div className="flex w-full items-center  justify-between">

        {/* ========================================== TOP SECTION ========================================== */}

        {/* Left: previous question (circular) - pointer-events-auto so button works when column has pointer-events-none (canvas draw-through) */}
        <button
          type="button"
          aria-label="Previous question"
          className="questions-advance pointer-events-auto"
          onClick={previousQuestion}
        >
          <LuChevronLeft size={16} strokeWidth={2.5} />
        </button>

        {/* Centre: title and tags with transition */}
        <div className="flex min-w-0 flex-col self-center overflow-hidden p-2">
          <div className="w-full text-left">

            <AnimatePresence mode="wait">
              <motion.div
                key={question?.id ?? 'empty'}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15, ease: [0.25, 0.4, 0.25, 1] }}
                className="flex min-w-0 flex-col"
              >

                <h2 className="question-selector-truncate color-txt-accent text-md font-bold leading-tight">
                  {title}
                </h2>
                {tagsDisplay ? (
                  <p className="question-selector-truncate color-txt-sub mt-0.5 text-xs font-normal">
                    {tagsDisplay}
                  </p>
                ) : null}

              </motion.div>
            </AnimatePresence>

          </div>
        </div>

        {/* Right: next question (circular) */}
        <button
          type="button"
          aria-label="Next question"
          className="questions-advance pointer-events-auto"
          onClick={nextQuestion}
        >
          <LuChevronRight size={16} strokeWidth={2.5} />
        </button>
      </div>

      {/* ================================================================================================== */}



      {/* ========================================== BOTTOM SECTION ========================================== */}
      <div className="flex w-full flex-wrap items-center justify-start gap-4">
        {/* Random / dice: highlighted (active-style) pill */}
        <button
          type="button"
          aria-label="Random question"
          className="question-selector-button-active question-selector-button pointer-events-auto"
        >
          <TbDice5 size={20} strokeWidth={1.8} />
          <span>randomize</span>
        </button>

        {/* Filter: default pill */}
        <button
          type="button"
          aria-label="Filter questions"
          className="question-selector-button pointer-events-auto"
        >
          <LuFilter size={18} strokeWidth={2} />
          <span>filter</span>
        </button>

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

        {/* Canvas: toggle drawing mode */}
        <button
          type="button"
          aria-label="Toggle canvas mode"
          className={`question-selector-button pointer-events-auto ${canvasMode ? "question-selector-button-active" : ""}`}
          onClick={() => setCanvasMode(!canvasMode)}
        >
          <Pencil size={18} strokeWidth={2} />
          <span>canvas</span>
        </button>
      </div>
      {/* ================================================================================================== */}


    </div>
  );
}
