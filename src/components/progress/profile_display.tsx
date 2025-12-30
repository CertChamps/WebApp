import { UserContext } from "../../context/UserContext"
import Rankbar from "../../components/rankbar"
import { useContext, useMemo } from "react";

const profile_display = () => {
    const { user } = useContext(UserContext);

    const rankNames = ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Master"];
    const currentRank = rankNames[(user?.rank ?? 1) - 1] || "Unranked";

    // Calculate progress percentage towards next rank
    const progress = useMemo(() => {
        const thresholds = [100, 300, 1000, 5000, 10000, 100000];
        let remainingXP = user?.xp || 0;

        for (let i = 0; i < thresholds.length; i++) {
            if (remainingXP < thresholds[i]) {
                return (remainingXP / thresholds[i]) * 100;
            }
            remainingXP -= thresholds[i];
        }

        // Max rank reached
        return 100;
    }, [user?.xp]);

    if (!user?.uid) {
        return (
            <div className="rank progress-skeleton-card">
                <div className="flex items-center gap-4">
                    <div className="progress-skeleton-avatar" />
                    <div className="progress-skeleton-lines">
                        <div className="progress-skeleton-line w-32" />
                        <div className="progress-skeleton-line w-20" />
                    </div>
                </div>
                <div className="progress-skeleton-line w-full h-3" />
                <div className="grid grid-cols-2 gap-4 w-full">
                    <div className="progress-skeleton-pill" />
                    <div className="progress-skeleton-pill" />
                </div>
            </div>
        );
    }

    return (
        <div className="rank">
          <div className="profile-header">
            <img src={user?.picture} alt={user?.username} className="profile-pic" />
            <div className="profile-info">
              <span className="profile-username">{user?.username}</span>
            </div>
          </div>

          <Rankbar rank={(user?.rank ?? 1) - 1} progress={progress} />
          
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