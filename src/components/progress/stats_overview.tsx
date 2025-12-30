import { useContext, useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../../firebase";
import { UserContext } from "../../context/UserContext";
import { BarChart3, Flame, Trophy } from "lucide-react";

const stats_overview = () => {
    const { user } = useContext(UserContext);
    const [totalQuestions, setTotalQuestions] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        if (!user?.uid) return;

        const fetchTotalQuestions = async () => {
            try {
                const completedQuestionsRef = collection(
                    db,
                    "user-data",
                    user.uid,
                    "completed-questions"
                );
                const snapshot = await getDocs(completedQuestionsRef);
                
                let total = 0;
                snapshot.docs.forEach(doc => {
                    const questionIds = doc.data()?.questionIds || [];
                    total += questionIds.length;
                });
                
                setTotalQuestions(total);
            } catch (error) {
                console.error("Error fetching total questions:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchTotalQuestions();
    }, [user?.uid]);

    if (loading) {
        return (
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
        );
    }

    return (
        <div className="stats-overview">
            <div className="stat-card">
                <BarChart3 className="stat-icon" size={36} />
                <div className="stat-content">
                    <span className="stat-label">Liftime Correct Questions</span>
                    <span className="stat-value">{(totalQuestions ?? 0).toLocaleString()}</span>
                </div>
            </div>
            
            <div className="stat-card">
                <Flame className="stat-icon" size={36} />
                <div className="stat-content">
                    <span className="stat-label">Current Streak</span>
                    <span className="stat-value">{user?.streak || 0}</span>
                </div>
            </div>
            
            <div className="stat-card">
                <Trophy className="stat-icon" size={36} />
                <div className="stat-content">
                    <span className="stat-label">Highest Streak</span>
                    <span className="stat-value">{user?.highestStreak || 0}</span>
                </div>
            </div>
        </div>
    );
};

export default stats_overview;
