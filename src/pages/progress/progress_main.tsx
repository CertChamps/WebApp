import "../../styles/progress.css"
import { useContext } from "react"
import { UserContext } from "../../context/UserContext"
import Rankbar from "../../components/rankbar"
import TodoList from "../../components/progress/todo_list"


export default function Progress() {
  const { user } = useContext(UserContext)

  

  const rankNames = ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Master"];
  const currentRank = rankNames[user.rank] || "Unranked";

  const subjects = [
    { name: "Algebra", progress: 75 },
    { name: "Geometry", progress: 60 },
    { name: "Calculus", progress: 45 },
  ];

  const radius = 50;
  const circumference = 2 * Math.PI * radius;



  return (
    <div className="progress-main">
        {/* ==================== THE LEFT COLUMN OF THE PAGE HERE ==================== */}
      <div className="left-column">
        {/* ==================== RANK STATISTICS ==================== */}
        <div className="rank">
          <div className="profile-header">
            <img src={user.picture} alt={user.username} className="profile-pic" />
            <div className="profile-info">
              <span className="profile-username">{user.username}</span>
              <span className="profile-subtitle">{currentRank} • {user.xp?.toLocaleString() || "0"} XP</span>
            </div>
          </div>

          <Rankbar rank={user.rank || 0} progress={user.questionStreak || 0} />
          
          <div className="rank-stats">
            <div className="rank-info">
              <span className="rank-label">Current Rank</span>
              <span className="rank-name">{currentRank}</span>
            </div>
            <div className="xp-info">
              <span className="xp-label">Total XP</span>
              <span className="xp-value">{user.xp?.toLocaleString() || "0"}</span>
            </div>
          </div>
        </div>
        {/* ==================== SUBJECT STATISTICS ==================== */}
        <div className="subject-progress">
          <h3 className="subject-title">Subject Progress</h3>
          <div className="subject-circles">
            {subjects.map((subject) => {
              const offset = circumference - (subject.progress / 100) * circumference;
              return (
                <div key={subject.name} className="subject-circle">
                  <svg className="circle-svg" width="120" height="120">
                    <circle
                      className="circle-bg-subject"
                      cx="60"
                      cy="60"
                      r={radius}
                    />
                    <circle
                      className="circle-progress"
                      cx="60"
                      cy="60"
                      r={radius}
                      style={{
                        strokeDasharray: circumference,
                        strokeDashoffset: offset,
                      }}
                    />
                  </svg>
                  <div className="circle-label">
                    <span className="subject-percent">{subject.progress}%</span>
                    <span className="subject-name">{subject.name}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {/* ==================== THE RIGHT COLUMN OF THE PAGE HERE ==================== */}
      <div className="right-column">
        <TodoList />
      </div>
    </div>
  );
}