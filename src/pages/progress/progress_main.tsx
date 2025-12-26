import "../../styles/progress.css"
import TodoList from "../../components/progress/todo_list"
import SubjectProgress from "../../components/progress/subject_progress"
import ProfileDisplay from "../../components/progress/profile_display"
import StatsOverview from "../../components/progress/stats_overview"
import DailyActivityChart from "../../components/progress/daily_activity_chart"
import ExamTracker from "../../components/progress/exam_tracker"

const Progress = () => {
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