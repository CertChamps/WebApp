import { useParams, useNavigate } from "react-router-dom";
import { LuArrowLeft } from "react-icons/lu";
import { useAllPaperProgress } from "../../hooks/usePaperProgress";
import OverallStatsBanner from "../../components/progress/OverallStatsBanner";
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

  return (
    <div className="flex flex-col h-full min-h-0 w-full overflow-y-auto">
      <div className="shrink-0 p-6 md:p-10 pb-0 flex items-center gap-4">
        <button
          type="button"
          onClick={() => navigate("/progress")}
          className="p-2 rounded-lg color-txt-sub hover:color-bg-grey-5 transition-colors cursor-pointer"
          aria-label="Back to progress"
        >
          <LuArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold color-txt-main">
            {subject ? formatSubject(subject) : "Subject"}
            {level && (
              <span className="font-normal color-txt-sub ml-2">
                | {formatLevel(level)}
              </span>
            )}
          </h1>
        </div>
      </div>

      <OverallStatsBanner
        entries={progressEntries}
        subject={subject ? decodeURIComponent(subject) : undefined}
        level={level ? decodeURIComponent(level) : undefined}
      />

      <div className="flex-1 p-6 md:p-10 pt-4">
        <div className="rounded-2xl color-bg-grey-5 p-8 border border-dashed border-[var(--grey-10,rgba(128,128,128,0.2))]">
          <p className="text-sm color-txt-sub">More subject details — coming soon</p>
        </div>
      </div>
    </div>
  );
}
