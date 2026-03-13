import type { ReactNode } from "react";
import { LuArrowLeft, LuMonitor, LuTablet, LuCircleCheck, LuCircle } from "react-icons/lu";

type QuestionsMode = "certchamps" | "pastpaper";

type QuestionsTopBarProps = {
  onBack: () => void;
  laptopMode: boolean;
  onLaptopModeChange: () => void;
  mode: QuestionsMode;
  subjectFilter: string | null;
  onSubjectFilterChange: (subject: string | null) => void;
  subjectOptions: { value: string; label: string }[];
  centerContent?: ReactNode;
  rightContent?: ReactNode;
  questionCompleted?: boolean;
  onToggleQuestionCompleted?: () => void;
  paperProgress?: { completed: number; total: number };
};

export default function QuestionsTopBar({
  onBack,
  laptopMode,
  onLaptopModeChange,
  mode,
  subjectFilter,
  onSubjectFilterChange,
  subjectOptions,
  centerContent,
  rightContent,
  questionCompleted,
  onToggleQuestionCompleted,
  paperProgress,
}: QuestionsTopBarProps) {
  return (
    <div className="questions-top-bar pointer-events-auto">
      <div className="questions-top-bar__inner">
        {/* Left: navigation + mode controls */}
        <div className="questions-top-bar__left">
          <button
            type="button"
            onClick={onBack}
            className="questions-top-bar__btn"
            aria-label="Back to Practice Hub"
          >
            <LuArrowLeft size={18} strokeWidth={2} className="shrink-0" />
            <span className="txt-bold color-txt-sub">Hub</span>
          </button>

          <button
            type="button"
            onClick={onLaptopModeChange}
            className="questions-top-bar__btn"
            title={laptopMode ? "Tablet layout" : "Laptop layout"}
            aria-label={laptopMode ? "Switch to tablet layout" : "Switch to laptop layout"}
            data-tutorial-id="laptop-tablet-toggle"
          >
            {laptopMode ? (
              <LuMonitor size={20} strokeWidth={2} className="shrink-0" />
            ) : (
              <LuTablet size={20} strokeWidth={2} className="shrink-0" />
            )}
            <span className="txt-bold color-txt-sub">{laptopMode ? "Laptop" : "Tablet"}</span>
          </button>

          {mode === "pastpaper" && onToggleQuestionCompleted && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onToggleQuestionCompleted}
                className={`questions-top-bar__tick ${questionCompleted ? "questions-top-bar__tick--done" : ""}`}
                aria-label={questionCompleted ? "Mark question incomplete" : "Mark question complete"}
                title={questionCompleted ? "Mark incomplete" : "Mark complete"}
              >
                {questionCompleted ? (
                  <LuCircleCheck size={18} strokeWidth={2.2} />
                ) : (
                  <LuCircle size={18} strokeWidth={1.8} />
                )}
              </button>
              {paperProgress && paperProgress.total > 0 && (
                <span className="questions-top-bar__progress-pill">
                  {paperProgress.completed}/{paperProgress.total}
                </span>
              )}
            </div>
          )}

          {mode === "certchamps" && subjectOptions.length > 0 && (
            <>
              <label htmlFor="questions-subject" className="sr-only">
                Subject
              </label>
              <select
                id="questions-subject"
                value={subjectFilter ?? ""}
                onChange={(e) => onSubjectFilterChange(e.target.value || null)}
                className="questions-top-bar__dropdown"
              >
                <option value="" className="color-bg color-txt-main">
                  All topics
                </option>
                {subjectOptions.map((opt) => (
                  <option key={opt.value} value={opt.value} className="color-bg color-txt-main">
                    {opt.label}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>

        {/* Center: question title + navigation arrows */}
        {centerContent && (
          <div className="questions-top-bar__center">{centerContent}</div>
        )}

        {/* Right: action buttons */}
        {rightContent && (
          <div className="questions-top-bar__right">{rightContent}</div>
        )}
      </div>
    </div>
  );
}
