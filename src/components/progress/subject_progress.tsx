import { useContext, useEffect, useState } from "react";
import { collection, getDocs, doc, getDoc, query, where } from "firebase/firestore";
import { db } from "../../../firebase";
import { UserContext } from "../../context/UserContext";

const subject_progress = () => {
    const { user } = useContext(UserContext);
    const [subjects, setSubjects] = useState<{ name: string; completed: number; total: number }[]>([]);

    const validTopics = [
        "Algebra",
        "Area & Volume",
        "Calculus",
        "Complex Numbers",
        "Financial Maths",
        "Coordinate Geometry",
        "Probability",
        "Sequences & Series",
        "Statistics",
        "Trigonometry",
        "Geometry",
        "First Year Algebra"
    ];

    useEffect(() => {
        if (!user?.uid) return;

        const fetchProgress = async () => {
            const progressData: { name: string; completed: number; total: number }[] = [];

            for (const topic of validTopics) {
                try {
                    // Fetch completed count directly from topic document
                    const completedDocRef = doc(db, "user-data", user.uid, "completed-questions", topic);
                    const completedDocSnap = await getDoc(completedDocRef);
                    const completed = completedDocSnap.exists() 
                      ? (completedDocSnap.data()?.questionIds?.length || 0)
                      : 0;

                    // Fetch total available questions for this topic from certchamps-questions
                    const totalSnap = await getDocs(
                      query(
                        collection(db, "certchamps-questions"),
                        where("tags", "array-contains", topic)
                      )
                    );
                    const total = totalSnap.size || 0;

                    progressData.push({ name: topic, completed, total });
                } catch (error) {
                    console.error(`Error fetching progress for ${topic}:`, error);
                    progressData.push({ name: topic, completed: 0, total: 0 });
                }
            }

            setSubjects(progressData);
        };

        fetchProgress();
    }, [user?.uid]);

    const radius = 50;
    const circumference = 2 * Math.PI * radius;

    return (
        <div className="subject-progress">
          <h3 className="subject-title">Subject Progress</h3>
          <div className="subject-circles">
            {subjects.map((subject) => {
              // Calculate progress based on actual total questions per topic
              const total = subject.total > 0 ? subject.total : 0;
              const progress = total > 0 ? Math.min(Math.round((subject.completed / total) * 100), 100) : 0;
              const offset = circumference - (progress / 100) * circumference;
              
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
                    <span className="subject-percent">{progress}%</span>
                    <span className="subject-name">{subject.name}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
    );
};

export default subject_progress;