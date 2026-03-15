import { useParams, useNavigate } from "react-router-dom";
import { LuArrowLeft } from "react-icons/lu";
import { useAllPaperProgress } from "../../hooks/usePaperProgress";
import OverallStatsBanner from "../../components/progress/OverallStatsBanner";
import TopicBarChart from "../../components/progress/TopicBarChart";
import SubjectHeatmap from "../../components/progress/SubjectHeatmap";
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
      <div className="shrink-0 px-6 md:px-10 pt-4 md:pt-6 pb-0 flex items-center gap-4">
        <button
          type="button"
          onClick={() => navigate("/progress")}
          className="p-2 rounded-lg color-txt-sub hover:color-bg-grey-5 transition-colors cursor-pointer"
          aria-label="Back to progress"
        >
          <LuArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-3xl font-black color-txt-main">
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
          </>
        )}
      </div>
    </div>
  );
}
