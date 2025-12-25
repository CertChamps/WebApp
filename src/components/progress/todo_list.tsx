import { useContext, useEffect, useState } from "react";
import { LuSquarePlus } from "react-icons/lu";
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp, updateDoc, doc } from "firebase/firestore";
import { db } from "../../../firebase";
import { UserContext } from "../../context/UserContext";

type TodoItem = { id: string; text: string; done: boolean };

const todo_list = () => {    
    const { user } = useContext(UserContext);
    const [todos, setTodos] = useState<TodoItem[]>([]);
    const [taskText, setTaskText] = useState("");

    useEffect(() => {
        if (!user?.uid) return;

        const fetchTasks = async () => {
            try {
                const tasksQuery = query(
                    collection(db, "user-data", user.uid, "tasks"),
                    orderBy("createdAt", "asc")
                );
                const snapshot = await getDocs(tasksQuery);
                const loaded = snapshot.docs.map((d) => {
                    const data = d.data();
                    return {
                        id: d.id,
                        text: (data.text as string) || "",
                        done: Boolean(data.done),
                    };
                });
                setTodos(loaded);
            } catch (error) {
                console.error("Failed to load tasks", error);
            }
        };

        fetchTasks();
    }, [user?.uid]);

    const toggleTodo = async (item: TodoItem) => {
        const updated = { ...item, done: !item.done };
        setTodos((prev) => prev.map((t) => (t.id === item.id ? updated : t)));

        try {
            await updateDoc(doc(db, "user-data", user.uid, "tasks", item.id), { done: updated.done });
        } catch (error) {
            console.error("Failed to update task", error);
            setTodos((prev) => prev.map((t) => (t.id === item.id ? item : t)));
        }
    };

    const addTask = async (text: string) => {
        const cleanText = text.trim();
        if (!cleanText || !user?.uid) return;

        try {
            const docRef = await addDoc(collection(db, "user-data", user.uid, "tasks"), {
                text: cleanText,
                done: false,
                createdAt: serverTimestamp(),
            });

            setTodos((prev) => [...prev, { id: docRef.id, text: cleanText, done: false }]);
            setTaskText("");
        } catch (error) {
            console.error("Failed to add task", error);
        }
    };
    
    return(   
        <div className="todo-list">
            <h3 className="todo-title">Todo-List</h3>
            <ul className="todo-items">
                {todos.map((item) => (
                <li key={item.id} className={`todo-item ${item.done ? "done" : ""}`}>
                    <input
                        type="checkbox"
                        checked={item.done}
                        onChange={() => toggleTodo(item)}
                        className="todo-checkbox"
                        id={`todo-${item.id}`}
                    />
                    <span className="todo-text">{item.text}</span>
                </li>
                ))}
            </ul>
            <div className="todo-adder">
                <input 
                    type="text" 
                    className="todo-input" 
                    placeholder="Add new task..."
                    value={taskText}
                    onChange={(e) => setTaskText(e.target.value)}
                />
                <button 
                    className="todo-add-button"
                    onClick={() => addTask(taskText)}
                >
                    <LuSquarePlus size={20} strokeWidth={2.5} />
                </button>
            </div>
        </div>
    );
};

export default todo_list;