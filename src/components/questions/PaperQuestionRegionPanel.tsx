import { LuArrowUpRight, LuClipboardList, LuBookOpen } from "react-icons/lu";
import type { PaperQuestion } from "../../hooks/useExamPapers";

type PaperQuestionRegionPanelProps = {
  question: PaperQuestion;
  index: number;
  paperLabel?: string;
  onGoToQuestion: () => void;
  hasMarkingScheme?: boolean;
  onOpenMarkingScheme?: () => void;
  onOpenLogTables?: () => void;
  /** Tablet overlay: smaller text, no internal dashed line (caller draws it). */
  compact?: boolean;
};

/** Extract "Question [x]" and "Part [y]" from a title string. */
function formatQuestionTitle(title: string, fallbackIndex: number): string {
  const qMatch = title.match(/(?:Question|Q)\s*(\d+)/i);
  const partMatch =
    title.match(/Part\s+([A-Za-z])/i) ?? // "Part A", "Part B"
    title.match(/Part\s+([ivx]+)/i) ??   // "Part i", "Part ii"
    title.match(/\(([a-zA-Z])\)/) ??     // "(a)", "(A)"
    title.match(/\(([ivx]+)\)/i);        // "(i)", "(ii)"
  const qNum = qMatch ? qMatch[1] : String(fallbackIndex + 1);
  const part = partMatch ? partMatch[1].toUpperCase() : null;
  return part ? `Question ${qNum} - Part ${part}` : `Question ${qNum}`;
}

/** True if this is the start of a question (Question N only, or Part A). */
export function isStartOfQuestion(question: PaperQuestion, index: number): boolean {
  const title = question.questionName || `Question ${index + 1}`;
  const partMatch =
    title.match(/Part\s+([A-Za-z])/i) ??
    title.match(/Part\s+([ivx]+)/i) ??
    title.match(/\(([a-zA-Z])\)/) ??
    title.match(/\(([ivx]+)\)/i);
  const part = partMatch ? partMatch[1].toUpperCase() : null;
  return part == null || part === "A";
}

/** Panel beside each question in full paper view: title, dotted line, open question button. */
export default function PaperQuestionRegionPanel({
  question,
  index,
  paperLabel,
  onGoToQuestion,
  hasMarkingScheme,
  onOpenMarkingScheme,
  onOpenLogTables,
  compact = false,
}: PaperQuestionRegionPanelProps) {
  const rawName = question.questionName || `Question ${index + 1}`;
  const name = formatQuestionTitle(rawName, index);
  const tags = (question as PaperQuestion & { tags?: string[] }).tags ?? [];

  const textClass = compact ? "text-[7px]" : "text-[10px]";
  const buttonClass = compact
    ? "color-bg-grey-5 color-txt-sub flex items-center gap-1 text-[6px] justify-center rounded-in px-1.5 py-0.5 ml-auto hover:opacity-80 transition-all duration-200 cursor-pointer"
    : "color-bg-grey-5 color-txt-sub flex items-center gap-2 text-xs justify-center rounded-in px-2 py-1 my-1 hover:opacity-80 transition-all duration-200 cursor-pointer";

  return (
    <div className={`paper-question-region-panel w-full max-w-[11rem] flex flex-col relative ${compact ? "gap-1 max-w-[3rem]" : "gap-2"}`}>
      {!compact && (
        <div className="w-full border-t border-dashed color-shadow" aria-hidden />
      )}
      <div className={`flex justify-start items-center ${compact ? "text-right" : "text-left"}`}>
        <div className={`space-y-0.5 min-w-0 flex-1 ${compact ? "" : "px-4"}`}>
          {/* <p className={`${textClass} color-txt-main font-bold`}>{name}</p> */}
          {tags.length > 0 && (
            <p className={`${textClass} font-normal color-txt-sub `}>
              {tags.map((t: string) => `#${t}`).join(" ")}
            </p>
          )}
          <button
            type="button"
            onClick={onGoToQuestion}
            className={buttonClass}
            aria-label={`Open ${name}`}
          >
            <LuArrowUpRight size={compact ? 6 : 12} strokeWidth={2} aria-hidden />
            <span>open question</span>
          </button>
        </div>
        {/* <div className="shrink-0 flex flex-col gap-3 items-center">
          {hasMarkingScheme && onOpenMarkingScheme && (
            <button
              type="button"
              onClick={onOpenMarkingScheme}
              className="rounded color-txt-sub hover:color-txt-main hover:color-bg-grey-10 transition-all cursor-pointer"
              title="Marking scheme"
              aria-label="Open marking scheme"
            >
              <LuClipboardList size={14} strokeWidth={2} />
            </button>
          )}
          {onOpenLogTables && (
            <button
              type="button"
              onClick={onOpenLogTables}
              className="rounded color-txt-sub hover:color-txt-main hover:color-bg-grey-10 transition-all cursor-pointer"
              title="Log tables"
              aria-label="Open log tables"
            >
              <LuBookOpen size={14} strokeWidth={2} />
            </button>
          )}
        </div> */}
      </div>
      {/* Open question button */}

    </div>
  );
}
