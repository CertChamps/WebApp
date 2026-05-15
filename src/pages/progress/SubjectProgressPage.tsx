import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { LuArrowLeft, LuTrash2, LuX } from "react-icons/lu";
import { useAllPaperProgress } from "../../hooks/usePaperProgress";
import { hideSubjectLevelFromProgressList } from "../../hooks/useProgressHiddenSubjectLevels";
import OverallStatsBanner from "../../components/progress/OverallStatsBanner";
import TopicBarChart from "../../components/progress/TopicBarChart";
import SubjectHeatmap from "../../components/progress/SubjectHeatmap";
import QuestionLogTable from "../../components/progress/QuestionLogTable";
import "../../styles/progress.css";

function formatSubject(s: string): string {
  return decodeURIComponent(s).replace(/-/g, " ").replace(/\b(\w)/g, (c) => c.toUpperCase());
}

function formatLevel(l: string): string {
  return decodeURIComponent(l).charAt(0).toUpperCase() + decodeURIComponent(l).slice(1);
}

export default function SubjectProgressPage() {
  const { subject, level } = useParams<{ subject: string; level: string }>();
  const navigate = useNavigate();
  const { entries: progressEntries } = useAllPaperProgress();
  const [showRemoveModal, setShowRemoveModal] = useState(false);

  const decodedSubject = subject ? decodeURIComponent(subject) : "";
  const decodedLevel = level ? decodeURIComponent(level) : "";

  return (
    <div className="flex flex-col h-full min-h-0 w-full overflow-y-auto">
      <div className="shrink-0 px-6 md:px-10 pt-4 md:pt-6 pb-0 flex items-center gap-4 w-full min-w-0">
        <button
          type="button"
          onClick={() => navigate("/progress")}
          className="p-2 rounded-lg color-txt-sub hover:color-bg-grey-5 transition-colors cursor-pointer shrink-0"
          aria-label="Back to progress"
        >
          <LuArrowLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-black color-txt-main truncate">
            {subject ? formatSubject(subject) : "Subject"}
            {level && (
              <span className="font-normal color-txt-sub ml-2">
                | {formatLevel(level)}
              </span>
            )}
          </h1>
        </div>
        {decodedSubject && decodedLevel && (
          <button
            type="button"
            onClick={() => setShowRemoveModal(true)}
            className="shrink-0 flex items-center gap-2 rounded-xl border border-[var(--grey-10,rgba(128,128,128,0.25))] px-3 py-2 text-sm font-bold color-txt-sub hover:color-txt-main hover:color-bg-grey-5 transition-colors cursor-pointer"
            aria-label="Remove from progress list"
          >
            <LuTrash2 size={16} strokeWidth={2.25} aria-hidden />
            <span className="hidden sm:inline">Remove</span>
          </button>
        )}
      </div>

      {showRemoveModal && decodedSubject && decodedLevel && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          role="presentation"
          onClick={() => setShowRemoveModal(false)}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-from-progress-title"
            className="relative z-10 w-full max-w-md color-bg rounded-2xl shadow-lg border border-[var(--grey-10,rgba(128,128,128,0.2))] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <h2 id="remove-from-progress-title" className="text-lg font-black color-txt-main pr-2">
                Remove from progress list?
              </h2>
              <button
                type="button"
                onClick={() => setShowRemoveModal(false)}
                className="p-1.5 rounded-lg color-txt-sub hover:color-bg-grey-5 transition-colors cursor-pointer shrink-0"
                aria-label="Close"
              >
                <LuX size={20} />
              </button>
            </div>
            <p className="text-sm color-txt-sub leading-relaxed mb-6">
              This only removes the subject tile from your Progress page. It does{" "}
              <span className="font-bold color-txt-main">not</span> delete your saved answers, canvas
              drawings, or any other data. The tile comes back automatically when you complete a question or
              your paper progress for this subject updates again.
            </p>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowRemoveModal(false)}
                className="rounded-xl px-4 py-2.5 text-sm font-bold color-txt-sub hover:color-bg-grey-5 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  hideSubjectLevelFromProgressList(decodedSubject, decodedLevel, progressEntries);
                  setShowRemoveModal(false);
                  navigate("/progress");
                }}
                className="rounded-xl px-4 py-2.5 text-sm font-bold color-bg-accent color-txt-accent hover:opacity-90 transition-opacity cursor-pointer"
              >
                Remove from list
              </button>
            </div>
          </div>
        </div>
      )}

      <OverallStatsBanner
        entries={progressEntries}
        subject={subject ? decodeURIComponent(subject) : undefined}
        level={level ? decodeURIComponent(level) : undefined}
      />

      <div className="flex-1 px-6 md:px-10 pt-3 pb-6 flex flex-col gap-4">
        {subject && level && (
          <>
            <TopicBarChart
              subject={decodeURIComponent(subject)}
              level={decodeURIComponent(level)}
              entries={progressEntries}
            />
            <SubjectHeatmap
              subject={decodeURIComponent(subject)}
              level={decodeURIComponent(level)}
              entries={progressEntries}
            />
            <QuestionLogTable
              subject={decodeURIComponent(subject)}
              level={decodeURIComponent(level)}
            />
          </>
        )}
      </div>
    </div>
  );
}
