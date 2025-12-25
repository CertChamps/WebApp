import { UserContext } from "../../context/UserContext"
import Rankbar from "../../components/rankbar"
import { useContext } from "react";

const profile_display = () => {
    const { user } = useContext(UserContext);

    const rankNames = ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Master"];
    const currentRank = rankNames[user.rank] || "Unranked";

    return (
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
    );
};

export default profile_display;