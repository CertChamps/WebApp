import { useContext, useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { UserContext } from "../context/UserContext";
import { LuSend, LuCheck, LuBug, LuLightbulb, LuMessageCircle, LuHammer, LuHeart, LuSearch, LuTrash2 } from "react-icons/lu";

type FeedbackType = "bug" | "feature" | "general";
type AdminTag = "working_on_it" | "love_it" | "looking_into_it" | null;

const ADMIN_UIDS = ["NkN9UBqoPEYpE21MC89fipLn0SP2", "gJIqKYlc1OdXUQGZQkR4IzfCIoL2"];

type FeedbackItem = {
    id: string;
    type: FeedbackType;
    message: string;
    timestamp: number | null;
    adminTag: AdminTag;
};

const TYPES: { id: FeedbackType; label: string }[] = [
    { id: "general", label: "General" },
    { id: "bug", label: "Bug Report" },
    { id: "feature", label: "Feature Request" },
];

const TYPE_ICON: Record<FeedbackType, typeof LuMessageCircle> = {
    general: LuMessageCircle,
    bug: LuBug,
    feature: LuLightbulb,
};

const TAG_OPTIONS: { id: AdminTag; label: string; icon: typeof LuHammer; color: string }[] = [
    { id: "working_on_it", label: "Working on it", icon: LuHammer, color: "text-amber-500 bg-amber-500/15" },
    { id: "love_it", label: "We love this!", icon: LuHeart, color: "text-pink-500 bg-pink-500/15" },
    { id: "looking_into_it", label: "Looking into it", icon: LuSearch, color: "text-blue-500 bg-blue-500/15" },
];

const PLACEHOLDERS = [
    "What would make this better?",
    "Any features you're dying for?",
    "What's bugging you?",
    "If you could change one thing...",
    "How can we make your study life easier?",
    "What's missing?",
    "Roast us. We can take it.",
    "YOUR FEEDBACK MATTERS TO US!!!!!!",
];

const STICKY_ROTATIONS = [
    "-rotate-1",
    "rotate-1",
    "-rotate-2",
    "rotate-2",
    "rotate-0",
    "-rotate-1.5",
    "rotate-1.5",
];

export default function Feedback() {
    const { user } = useContext(UserContext);
    const isAdmin = ADMIN_UIDS.includes(user?.uid ?? "");
    const [type, setType] = useState<FeedbackType>("general");
    const [message, setMessage] = useState("");
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [items, setItems] = useState<FeedbackItem[]>([]);
    const [tagMenuOpen, setTagMenuOpen] = useState<string | null>(null);
    const [placeholder] = useState(() => PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)]);

    const fetchFeedback = async () => {
        const q = query(collection(db, "feedback"), orderBy("timestamp", "desc"));
        const snap = await getDocs(q);
        setItems(
            snap.docs.map((d) => {
                const data = d.data();
                return {
                    id: d.id,
                    type: (data.type as FeedbackType) ?? "general",
                    message: data.message ?? "",
                    timestamp: data.timestamp?.seconds ?? null,
                    adminTag: (data.adminTag as AdminTag) ?? null,
                };
            })
        );
    };

    useEffect(() => {
        fetchFeedback();
    }, []);

    const handleSubmit = async () => {
        const trimmed = message.trim();
        if (!trimmed || !user?.uid) return;
        setSending(true);
        setError(null);
        try {
            await addDoc(collection(db, "feedback"), {
                userId: user.uid,
                username: user.username ?? "",
                type,
                message: trimmed,
                timestamp: serverTimestamp(),
                adminTag: null,
            });
            setMessage("");
            setSent(true);
            setTimeout(() => setSent(false), 3000);
            fetchFeedback();
        } catch (e: any) {
            console.error("Failed to send feedback:", e);
            setError(e?.message ?? "Failed to send. Check Firestore rules.");
        }
        setSending(false);
    };

    const handleTag = async (itemId: string, tag: AdminTag) => {
        const item = items.find((i) => i.id === itemId);
        const newTag = item?.adminTag === tag ? null : tag;
        try {
            await updateDoc(doc(db, "feedback", itemId), { adminTag: newTag });
            setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, adminTag: newTag } : i)));
        } catch (e) {
            console.error("Failed to tag feedback:", e);
        }
        setTagMenuOpen(null);
    };

    const handleDelete = async (itemId: string) => {
        try {
            await deleteDoc(doc(db, "feedback", itemId));
            setItems((prev) => prev.filter((i) => i.id !== itemId));
        } catch (e) {
            console.error("Failed to delete feedback:", e);
        }
    };

    const timeAgo = (seconds: number | null) => {
        if (!seconds) return "";
        const diff = Math.floor(Date.now() / 1000 - seconds);
        if (diff < 60) return "just now";
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
        return new Date(seconds * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    };

    const getTagInfo = (tag: AdminTag) => TAG_OPTIONS.find((t) => t.id === tag) ?? null;

    return (
        <div className="flex flex-col w-full h-full color-bg overflow-y-auto scrollbar-minimal">
            <div className="w-full max-w-5xl mx-auto px-8 py-10 space-y-10 flex flex-col items-center">
                {/* Header + form */}
                <div className="w-full space-y-5">
                    <div>
                        <h1 className="text-3xl font-bold color-txt-main">Feedback Wall</h1>
                        <p className="color-txt-sub text-base mt-1">
                            We want this to be the best Leaving Cert experience out there. Your feedback shapes what we build next. We act on it immediately.
                        </p>
                    </div>

                    <div className="flex gap-2">
                        {TYPES.map(({ id, label }) => (
                            <button
                                key={id}
                                type="button"
                                onClick={() => setType(id)}
                                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                                    type === id
                                        ? "color-bg-accent color-txt-accent"
                                        : "color-bg-grey-5 color-txt-sub hover:color-txt-main"
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder={placeholder}
                        rows={4}
                        className="w-full rounded-xl color-bg-grey-5 color-txt-main p-4 text-base outline-none resize-none placeholder:color-txt-sub"
                    />

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={sending || !message.trim()}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold color-bg-accent color-txt-accent hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity cursor-pointer text-sm"
                        >
                            <LuSend size={16} />
                            {sending ? "Sending…" : "Post Note"}
                        </button>
                        {sent && (
                            <span className="flex items-center gap-1.5 text-green-500 text-sm font-medium animate-pulse">
                                <LuCheck size={16} /> Posted!
                            </span>
                        )}
                    </div>
                    {error && <p className="text-red-500 text-sm">{error}</p>}
                </div>

                {/* Sticky notes wall */}
                {items.length > 0 && (
                    <div className="columns-2 sm:columns-3 lg:columns-4 gap-4 space-y-4">
                        {items.map((item, i) => {
                            const Icon = TYPE_ICON[item.type];
                            const rotation = STICKY_ROTATIONS[i % STICKY_ROTATIONS.length];
                            const tagInfo = getTagInfo(item.adminTag);
                            return (
                                <div
                                    key={item.id}
                                    className={`break-inside-avoid rounded-2xl color-bg-grey-5 p-5 shadow-small hover:shadow-md transition-all hover:scale-[1.02] ${rotation} relative`}
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg color-bg-accent text-xs font-semibold color-txt-accent">
                                            <Icon size={12} />
                                            {item.type === "bug" ? "Bug" : item.type === "feature" ? "Idea" : "General"}
                                        </span>
                                        <span className="color-txt-sub text-xs">{timeAgo(item.timestamp)}</span>
                                    </div>

                                    <p className="color-txt-main text-sm leading-relaxed whitespace-pre-wrap">{item.message}</p>

                                    {/* Admin tag display */}
                                    {tagInfo && (
                                        <div className={`flex items-center gap-1.5 mt-3 px-2.5 py-1.5 rounded-lg text-xs font-bold ${tagInfo.color}`}>
                                            <tagInfo.icon size={13} />
                                            {tagInfo.label}
                                        </div>
                                    )}

                                    {/* Admin controls */}
                                    {isAdmin && (
                                        <div className="mt-3 relative">
                                            <div className="flex items-center gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => setTagMenuOpen(tagMenuOpen === item.id ? null : item.id)}
                                                    className="color-txt-sub hover:color-txt-main text-xs font-medium cursor-pointer transition-colors"
                                                >
                                                    {item.adminTag ? "Change tag" : "Add tag"}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDelete(item.id)}
                                                    className="text-red-400 hover:text-red-500 text-xs font-medium cursor-pointer transition-colors flex items-center gap-1"
                                                >
                                                    <LuTrash2 size={12} /> Delete
                                                </button>
                                            </div>

                                            {tagMenuOpen === item.id && (
                                                <div className="absolute bottom-full left-0 mb-2 color-bg rounded-xl shadow-md border border-color-border p-1.5 z-20 flex flex-col gap-1 min-w-[170px]">
                                                    {TAG_OPTIONS.map((opt) => (
                                                        <button
                                                            key={opt.id}
                                                            type="button"
                                                            onClick={() => handleTag(item.id, opt.id)}
                                                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all hover:opacity-80 ${
                                                                item.adminTag === opt.id ? opt.color : "color-txt-main hover:color-bg-grey-5"
                                                            }`}
                                                        >
                                                            <opt.icon size={13} />
                                                            {opt.label}
                                                        </button>
                                                    ))}
                                                    {item.adminTag && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleTag(item.id, null)}
                                                            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer text-red-500 hover:bg-red-500/10 transition-all"
                                                        >
                                                            Remove tag
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {items.length === 0 && (
                    <p className="color-txt-sub text-sm text-center pt-8">No feedback yet. Be the first to post!</p>
                )}
            </div>
        </div>
    );
}
