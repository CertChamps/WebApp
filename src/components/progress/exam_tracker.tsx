import { useContext, useEffect, useState } from "react";
import { LuSquarePlus, LuTrash2 } from "react-icons/lu";
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp, deleteDoc, doc } from "firebase/firestore";
import { db } from "../../../firebase";
import { UserContext } from "../../context/UserContext";

type ExamItem = { id: string; name: string; grade: string };

const exam_tracker = () => {
    const { user } = useContext(UserContext);
    const [exams, setExams] = useState<ExamItem[]>([]);
    const [examName, setExamName] = useState("");
    const [examGrade, setExamGrade] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        if (!user?.uid) return;

        const fetchExams = async () => {
            try {
                const examsQuery = query(
                    collection(db, "user-data", user.uid, "exam-tracks"),
                    orderBy("createdAt", "asc")
                );
                const snapshot = await getDocs(examsQuery);
                const loaded = snapshot.docs.map((d) => {
                    const data = d.data();
                    return {
                        id: d.id,
                        name: (data.name as string) || "",
                        grade: (data.grade as string) || "",
                    };
                });
                setExams(loaded);
            } catch (error) {
                console.error("Failed to load exams", error);
            } finally {
                setLoading(false);
            }
        };

        fetchExams();
    }, [user?.uid]);

    if (loading) {
        return (
            <div className="exam-tracker progress-skeleton-card">
                <div className="progress-skeleton-line w-36" />
                <div className="progress-skeleton-list">
                    {[...Array(3)].map((_, idx) => (
                        <div key={idx} className="progress-skeleton-line w-full" />
                    ))}
                </div>
            </div>
        );
    }

    const addExam = async () => {
        const cleanName = examName.trim();
        const cleanGrade = examGrade.trim();
        if (!cleanName || !cleanGrade || !user?.uid) return;

        try {
            const docRef = await addDoc(collection(db, "user-data", user.uid, "exam-tracks"), {
                name: cleanName,
                grade: cleanGrade,
                createdAt: serverTimestamp(),
            });

            setExams((prev) => [...prev, { id: docRef.id, name: cleanName, grade: cleanGrade }]);
            setExamName("");
            setExamGrade("");
        } catch (error) {
            console.error("Failed to add exam", error);
        }
    };

    const deleteExam = async (item: ExamItem) => {
        setExams((prev) => prev.filter((e) => e.id !== item.id));

        try {
            await deleteDoc(doc(db, "user-data", user.uid, "exam-tracks", item.id));
        } catch (error) {
            console.error("Failed to delete exam", error);
            setExams((prev) => [...prev, item]);
        }
    };

    return (
        <div className="exam-tracker">
            <h3 className="exam-title">Exam Tracker</h3>
            <ul className="exam-items">
                {exams.map((item) => (
                    <li key={item.id} className="exam-item">
                        <div className="exam-info">
                            <span className="exam-name">{item.name}</span>
                            <span className="exam-grade">{item.grade}</span>
                        </div>
                        <button 
                            className="exam-delete-button"
                            onClick={() => deleteExam(item)}
                            title="Delete exam"
                        >
                            <LuTrash2 size={16} strokeWidth={2} />
                        </button>
                    </li>
                ))}
            </ul>
            <div className="exam-adder">
                <input 
                    type="text" 
                    className="exam-input" 
                    placeholder="Exam name..."
                    value={examName}
                    onChange={(e) => setExamName(e.target.value)}
                />
                <input 
                    type="text" 
                    className="exam-input exam-grade-input" 
                    placeholder="Grade..."
                    value={examGrade}
                    onChange={(e) => setExamGrade(e.target.value)}
                />
                <button 
                    className="exam-add-button"
                    onClick={() => addExam()}
                >
                    <LuSquarePlus size={20} strokeWidth={2.5} />
                </button>
            </div>
        </div>
    );
};

export default exam_tracker;
