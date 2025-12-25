import { useContext, useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../../firebase";
import { UserContext } from "../../context/UserContext";

const subject_progress = () => {
    const { user } = useContext(UserContext);
    const [subjects, setSubjects] = useState<{ name: string; completed: number }[]>([]);

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
            const progressData: { name: string; completed: number }[] = [];

            for (const topic of validTopics) {
                try {
                    const completedQuestionsRef = collection(
                        db,
                        "user-data",
                        user.uid,
                        "completed-questions"
                    );
                    const snapshot = await getDocs(completedQuestionsRef);
                    
                    const topicDoc = snapshot.docs.find(doc => doc.id === topic);
                    const completed = topicDoc?.data()?.questionIds?.length || 0;
                    
                    progressData.push({ name: topic, completed });
                } catch (error) {
                    console.error(`Error fetching progress for ${topic}:`, error);
                    progressData.push({ name: topic, completed: 0 });
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
              // Calculate progress based on completed questions (out of 100 questions per topic as example)
              const maxQuestions = 100;
              const progress = Math.min((subject.completed / maxQuestions) * 100, 100);
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
                    <span className="subject-percent">{subject.completed}</span>
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