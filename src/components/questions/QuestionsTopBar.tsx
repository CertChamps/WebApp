import type { ReactNode } from "react";
import { LuArrowLeft, LuPenTool } from "react-icons/lu";

type QuestionsMode = "certchamps" | "pastpaper" | "imagequestions";

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
  leftActionContent?: ReactNode;
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
  leftActionContent,
}: QuestionsTopBarProps) {
  const whiteboardOn = !laptopMode;

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
            <span className="color-txt-sub">Hub</span>
          </button>

          <button
            type="button"
            onClick={onLaptopModeChange}
            className={`questions-top-bar__whiteboard ${whiteboardOn ? "questions-top-bar__whiteboard--active" : ""}`}
            title={whiteboardOn ? "Whiteboard on (Tablet Mode)" : "Whiteboard off (Laptop Mode)"}
            aria-label={whiteboardOn ? "Turn whiteboard off and switch to laptop mode" : "Turn whiteboard on and switch to tablet mode"}
            aria-pressed={whiteboardOn}
            data-tutorial-id="laptop-tablet-toggle"
          >
            <LuPenTool size={20} strokeWidth={2} className="shrink-0" />
            <span>Whiteboard</span>
          </button>

          {leftActionContent}

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
