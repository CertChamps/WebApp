import { useContext } from "react"
import "../../styles/progress.css"
import TodoList from "../../components/progress/todo_list"
import SubjectProgress from "../../components/progress/subject_progress"
import ProfileDisplay from "../../components/progress/profile_display"
import StatsOverview from "../../components/progress/stats_overview"
import DailyActivityChart from "../../components/progress/daily_activity_chart"
import ExamTracker from "../../components/progress/exam_tracker"
import { UserContext } from "../../context/UserContext"

const ProgressSkeleton = () => {
  return (
    <div className="progress-main">
      <div className="left-column">
        <div className="rank progress-skeleton-card">
          <div className="flex items-center gap-4">
            <div className="progress-skeleton-avatar" />
            <div className="progress-skeleton-lines">
              <div className="progress-skeleton-line w-32" />
              <div className="progress-skeleton-line w-24" />
            </div>
          </div>
          <div className="progress-skeleton-line w-full h-3" />
          <div className="grid grid-cols-2 gap-4 w-full">
            <div className="progress-skeleton-pill" />
            <div className="progress-skeleton-pill" />
          </div>
        </div>

        <div className="stats-overview progress-skeleton-card">
          {[1, 2, 3].map((id) => (
            <div key={id} className="flex items-center gap-3">
              <div className="progress-skeleton-icon" />
              <div className="progress-skeleton-lines">
                <div className="progress-skeleton-line w-24" />
                <div className="progress-skeleton-line w-16" />
              </div>
            </div>
          ))}
        </div>

        <div className="subject-progress progress-skeleton-card">
          <div className="progress-skeleton-line w-40" />
          <div className="subject-circles">
            {[...Array(6)].map((_, idx) => (
              <div key={idx} className="progress-skeleton-circle" />
            ))}
          </div>
        </div>
      </div>

      <div className="right-column">
        <div className="daily-chart progress-skeleton-card">
          <div className="progress-skeleton-line w-32" />
          <div className="progress-skeleton-bars">
            {[...Array(7)].map((_, idx) => (
              <div key={idx} className="progress-skeleton-bar" />
            ))}
          </div>
        </div>

        <div className="exam-tracker progress-skeleton-card">
          <div className="progress-skeleton-line w-36" />
          <div className="progress-skeleton-list">
            {[...Array(3)].map((_, idx) => (
              <div key={idx} className="progress-skeleton-line w-full" />
            ))}
          </div>
        </div>

        <div className="todo-list progress-skeleton-card">
          <div className="progress-skeleton-line w-32" />
          <div className="progress-skeleton-list">
            {[...Array(3)].map((_, idx) => (
              <div key={idx} className="progress-skeleton-line w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const Progress = () => {
  const { user } = useContext(UserContext);
  const isLoadingUser = !user?.uid;

  if (isLoadingUser) {
    return <ProgressSkeleton />;
  }

  return (
    <div className="progress-main">
        {/* ==================== THE LEFT COLUMN OF THE PAGE HERE ==================== */}
      <div className="left-column">
        <ProfileDisplay />
        <StatsOverview />
        <SubjectProgress />
      </div>
      {/* ==================== THE RIGHT COLUMN OF THE PAGE HERE ==================== */}
      <div className="right-column">
        <DailyActivityChart />
        <ExamTracker />
        <TodoList />
      </div>
    </div>
  );
}

export default Progress;