import "../../styles/progress.css"
import TodoList from "../../components/progress/todo_list"
import SubjectProgress from "../../components/progress/subject_progress"
import ProfileDisplay from "../../components/progress/profile_display"

const Progress = () => {
  return (
    <div className="progress-main">
        {/* ==================== THE LEFT COLUMN OF THE PAGE HERE ==================== */}
      <div className="left-column">
        <ProfileDisplay />
        <SubjectProgress />
      </div>
      {/* ==================== THE RIGHT COLUMN OF THE PAGE HERE ==================== */}
      <div className="right-column">
        <TodoList />
      </div>
    </div>
  );
}

export default Progress;