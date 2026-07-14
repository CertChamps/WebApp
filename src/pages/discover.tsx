import { useContext, useEffect, useRef, useState } from "react";
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    limit,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { db, storage } from "../../firebase";
import { UserContext } from "../context/UserContext";
import { isAdminUid } from "../constants/adminUids";
import {
    LuCompass,
    LuPlus,
    LuLink,
    LuImage,
    LuTrash2,
    LuExternalLink,
    LuLoader,
    LuX,
} from "react-icons/lu";
import { useNavigate } from "react-router-dom";

type DiscoverNote = {
    id: string;
    userId: string;
    username: string;
    userPicture: string | null;
    title: string;
    description: string;
    websiteUrl: string;
    thumbnailUrl: string;
    thumbnailPath?: string | null;
    timestamp: number | null;
};

const MAX_TITLE = 80;
const MAX_DESCRIPTION = 240;
const MAX_THUMBNAIL_BYTES = 4 * 1024 * 1024; // 4 MB

const PLACEHOLDER_TITLES = [
    "My free LC Maths notes",
    "Biology summary sheets",
    "Irish essay starter pack",
    "Chemistry definitions cheatsheet",
    "Free history timeline PDFs",
];

function normaliseUrl(input: string): string | null {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
        const url = new URL(withScheme);
        if (!url.hostname.includes(".")) return null;
        return url.toString();
    } catch {
        return null;
    }
}

function timeAgo(seconds: number | null): string {
    if (!seconds) return "";
    const diff = Math.floor(Date.now() / 1000 - seconds);
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(seconds * 1000).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
    });
}

function displayHostname(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return url;
    }
}

export default function Discover() {
    const { user } = useContext(UserContext);
    const isAdmin = isAdminUid(user?.uid, user?.email);
    const navigate = useNavigate();

    const [notes, setNotes] = useState<DiscoverNote[]>([]);
    const [loading, setLoading] = useState(true);

    const [showForm, setShowForm] = useState(false);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [websiteUrl, setWebsiteUrl] = useState("");
    const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
    const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [submittedToast, setSubmittedToast] = useState(false);

    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [placeholderTitle] = useState(
        () => PLACEHOLDER_TITLES[Math.floor(Math.random() * PLACEHOLDER_TITLES.length)]
    );

    useEffect(() => {
        const q = query(
            collection(db, "discover-notes"),
            orderBy("timestamp", "desc"),
            limit(100)
        );
        const unsub = onSnapshot(
            q,
            (snap) => {
                const rows: DiscoverNote[] = snap.docs.map((d) => {
                    const data = d.data() as any;
                    return {
                        id: d.id,
                        userId: data.userId ?? "",
                        username: data.username ?? "Unknown",
                        userPicture: data.userPicture ?? null,
                        title: data.title ?? "",
                        description: data.description ?? "",
                        websiteUrl: data.websiteUrl ?? "",
                        thumbnailUrl: data.thumbnailUrl ?? "",
                        thumbnailPath: data.thumbnailPath ?? null,
                        timestamp: data.timestamp?.seconds ?? null,
                    };
                });
                setNotes(rows);
                setLoading(false);
            },
            (err) => {
                console.error("Discover listener error:", err);
                setLoading(false);
            }
        );
        return () => unsub();
    }, []);

    const resetForm = () => {
        setTitle("");
        setDescription("");
        setWebsiteUrl("");
        setThumbnailFile(null);
        setThumbnailPreview((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
        });
        setFormError(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handlePickThumbnail = (file: File | undefined | null) => {
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            setFormError("Thumbnail must be an image.");
            return;
        }
        if (file.size > MAX_THUMBNAIL_BYTES) {
            setFormError("Thumbnail must be under 4 MB.");
            return;
        }
        setFormError(null);
        setThumbnailFile(file);
        setThumbnailPreview((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(file);
        });
    };

    const closeForm = () => {
        setShowForm(false);
        resetForm();
    };

    const handleSubmit = async () => {
        if (!user?.uid) {
            setFormError("You must be logged in to share notes.");
            return;
        }
        const trimmedTitle = title.trim();
        const trimmedDescription = description.trim();
        const validUrl = normaliseUrl(websiteUrl);

        if (!trimmedTitle) {
            setFormError("Add a title so people know what your notes are about.");
            return;
        }
        if (trimmedTitle.length > MAX_TITLE) {
            setFormError(`Title is too long (max ${MAX_TITLE} characters).`);
            return;
        }
        if (trimmedDescription.length > MAX_DESCRIPTION) {
            setFormError(`Description is too long (max ${MAX_DESCRIPTION} characters).`);
            return;
        }
        if (!validUrl) {
            setFormError("Add a valid link (https://...) for people to visit.");
            return;
        }
        if (!thumbnailFile) {
            setFormError("Upload a thumbnail image.");
            return;
        }

        setSubmitting(true);
        setFormError(null);
        let uploadedPath: string | null = null;
        try {
            const safeName = thumbnailFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
            const path = `discover-thumbnails/${user.uid}/${Date.now()}-${safeName}`;
            const fileRef = storageRef(storage, path);
            await uploadBytes(fileRef, thumbnailFile);
            uploadedPath = path;
            const thumbnailUrl = await getDownloadURL(fileRef);

            await addDoc(collection(db, "discover-notes"), {
                userId: user.uid,
                username: user.username ?? "",
                userPicture: user.picture ?? null,
                title: trimmedTitle,
                description: trimmedDescription,
                websiteUrl: validUrl,
                thumbnailUrl,
                thumbnailPath: path,
                timestamp: serverTimestamp(),
            });

            resetForm();
            setShowForm(false);
            setSubmittedToast(true);
            setTimeout(() => setSubmittedToast(false), 2800);
        } catch (e: any) {
            console.error("Failed to publish discover note:", e);
            setFormError(e?.message ?? "Couldn't publish. Try again in a moment.");
            if (uploadedPath) {
                try {
                    await deleteObject(storageRef(storage, uploadedPath));
                } catch {
                    // ignore cleanup failure
                }
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (note: DiscoverNote) => {
        if (!user?.uid) return;
        const canDelete = isAdmin || note.userId === user.uid;
        if (!canDelete) return;
        const confirmed = window.confirm("Delete this listing?");
        if (!confirmed) return;
        try {
            await deleteDoc(doc(db, "discover-notes", note.id));
            if (note.thumbnailPath) {
                try {
                    await deleteObject(storageRef(storage, note.thumbnailPath));
                } catch (err) {
                    console.warn("Thumbnail cleanup failed:", err);
                }
            }
        } catch (err) {
            console.error("Failed to delete note:", err);
        }
    };

    const handleVisit = (url: string) => {
        try {
            window.open(url, "_blank", "noopener,noreferrer");
        } catch (err) {
            console.error("Failed to open link:", err);
        }
    };

    return (
        <div className="flex flex-col w-full h-full color-bg overflow-y-auto scrollbar-minimal">
            <div className="w-full max-w-6xl mx-auto px-6 sm:px-8 py-10 space-y-8">
                {/* Header */}
                <div className="flex items-center justify-between gap-4">
                    <h2 className="text-3xl font-black color-txt-main shrink-0">Discover</h2>
                    <button
                        type="button"
                        onClick={() => setShowForm(true)}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl color-bg-accent color-txt-accent font-semibold text-sm hover:opacity-90 transition-opacity cursor-pointer"
                    >
                        <LuPlus size={16} />
                        Share your notes
                    </button>
                </div>

                {submittedToast && (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm color-txt-main">
                        Thanks for sharing — your listing is live.
                    </div>
                )}

                {/* Listings grid */}
                {loading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {[...Array(6)].map((_, i) => (
                            <div
                                key={i}
                                className="rounded-2xl color-bg-grey-5 overflow-hidden animate-pulse"
                            >
                                <div className="aspect-video w-full color-bg-grey-10" />
                                <div className="p-4 space-y-3">
                                    <div className="h-4 w-3/4 rounded color-bg-grey-10" />
                                    <div className="h-3 w-full rounded color-bg-grey-10" />
                                    <div className="h-3 w-5/6 rounded color-bg-grey-10" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : notes.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-color-border color-bg-grey-5 p-10 text-center space-y-3">
                        <div className="mx-auto w-12 h-12 rounded-full color-bg-accent flex items-center justify-center color-txt-accent">
                            <LuCompass size={22} />
                        </div>
                        <h2 className="text-xl font-semibold color-txt-main">
                            Nothing here yet
                        </h2>
                        <p className="color-txt-sub text-sm max-w-md mx-auto">
                            Be the first to share free notes, a study site, or revision resources
                            with everyone studying for the Leaving Cert.
                        </p>
                        <button
                            type="button"
                            onClick={() => setShowForm(true)}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl color-bg-accent color-txt-accent font-semibold text-sm hover:opacity-90 transition-opacity cursor-pointer"
                        >
                            <LuPlus size={16} />
                            Share your notes
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {notes.map((note) => {
                            const canDelete = isAdmin || note.userId === user?.uid;
                            return (
                                <article
                                    key={note.id}
                                    className="group rounded-2xl color-bg-grey-5 overflow-hidden flex flex-col hover:shadow-md transition-shadow"
                                >
                                    <button
                                        type="button"
                                        onClick={() => handleVisit(note.websiteUrl)}
                                        className="block w-full aspect-video color-bg-grey-10 overflow-hidden relative cursor-pointer"
                                        aria-label={`Visit ${note.title}`}
                                    >
                                        {note.thumbnailUrl ? (
                                            <img
                                                src={note.thumbnailUrl}
                                                alt={note.title}
                                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                                                loading="lazy"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center color-txt-sub">
                                                <LuImage size={32} />
                                            </div>
                                        )}
                                    </button>

                                    <div className="p-4 flex flex-col flex-1 gap-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <h3 className="text-base font-semibold color-txt-main line-clamp-2">
                                                {note.title}
                                            </h3>
                                            {canDelete && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleDelete(note)}
                                                    className="shrink-0 color-txt-sub hover:text-red-500 transition-colors cursor-pointer"
                                                    aria-label="Delete listing"
                                                    title="Delete"
                                                >
                                                    <LuTrash2 size={16} />
                                                </button>
                                            )}
                                        </div>

                                        {note.description && (
                                            <p className="color-txt-sub text-sm line-clamp-3">
                                                {note.description}
                                            </p>
                                        )}

                                        <div className="mt-auto flex items-center justify-between gap-3 pt-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (note.userId) navigate(`/viewProfile/${note.userId}`);
                                                }}
                                                className="flex items-center gap-2 min-w-0 cursor-pointer group/author"
                                            >
                                                {note.userPicture ? (
                                                    <img
                                                        src={note.userPicture}
                                                        alt=""
                                                        className="w-6 h-6 rounded-full object-cover shrink-0"
                                                    />
                                                ) : (
                                                    <div className="w-6 h-6 rounded-full color-bg-grey-10 shrink-0" />
                                                )}
                                                <span className="text-xs color-txt-sub truncate group-hover/author:color-txt-main">
                                                    {note.username || "Unknown"}
                                                    {note.timestamp ? ` · ${timeAgo(note.timestamp)}` : ""}
                                                </span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleVisit(note.websiteUrl)}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg color-bg-accent color-txt-accent text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer shrink-0"
                                                title={displayHostname(note.websiteUrl)}
                                            >
                                                <LuExternalLink size={13} />
                                                Visit
                                            </button>
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Create-listing modal */}
            {showForm && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                    onClick={closeForm}
                >
                    <div
                        className="w-full max-w-lg rounded-2xl color-bg shadow-md p-6 space-y-5 max-h-[90vh] overflow-y-auto scrollbar-minimal"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-xl font-bold color-txt-main">
                                    Share your free notes
                                </h2>
                                <p className="color-txt-sub text-sm mt-1">
                                    Anyone studying for the LC will see this on the Discover tab.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={closeForm}
                                className="color-txt-sub hover:color-txt-main cursor-pointer"
                                aria-label="Close"
                            >
                                <LuX size={20} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            {/* Thumbnail upload */}
                            <div className="space-y-2">
                                <label className="text-xs font-semibold color-txt-sub uppercase tracking-wide">
                                    Thumbnail
                                </label>
                                <label className="block w-full aspect-video rounded-xl color-bg-grey-5 border border-dashed border-color-border overflow-hidden relative cursor-pointer hover:opacity-90 transition-opacity">
                                    {thumbnailPreview ? (
                                        <img
                                            src={thumbnailPreview}
                                            alt="Thumbnail preview"
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center color-txt-sub gap-2">
                                            <LuImage size={28} />
                                            <span className="text-sm">Click to upload an image</span>
                                            <span className="text-xs">PNG, JPG up to 4 MB</span>
                                        </div>
                                    )}
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => handlePickThumbnail(e.target.files?.[0])}
                                    />
                                </label>
                                {thumbnailPreview && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setThumbnailFile(null);
                                            setThumbnailPreview((prev) => {
                                                if (prev) URL.revokeObjectURL(prev);
                                                return null;
                                            });
                                            if (fileInputRef.current) fileInputRef.current.value = "";
                                        }}
                                        className="text-xs color-txt-sub hover:text-red-500 transition-colors cursor-pointer"
                                    >
                                        Remove image
                                    </button>
                                )}
                            </div>

                            {/* Title */}
                            <div className="space-y-2">
                                <label className="text-xs font-semibold color-txt-sub uppercase tracking-wide">
                                    Title
                                </label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value.slice(0, MAX_TITLE))}
                                    placeholder={placeholderTitle}
                                    className="w-full rounded-xl color-bg-grey-5 color-txt-main px-4 py-3 text-sm outline-none placeholder:color-txt-sub"
                                />
                                <p className="text-[11px] color-txt-sub text-right">
                                    {title.length}/{MAX_TITLE}
                                </p>
                            </div>

                            {/* Description */}
                            <div className="space-y-2">
                                <label className="text-xs font-semibold color-txt-sub uppercase tracking-wide">
                                    Description
                                </label>
                                <textarea
                                    value={description}
                                    onChange={(e) =>
                                        setDescription(e.target.value.slice(0, MAX_DESCRIPTION))
                                    }
                                    placeholder="What's in your notes? Which subjects and topics do they cover?"
                                    rows={3}
                                    className="w-full rounded-xl color-bg-grey-5 color-txt-main px-4 py-3 text-sm outline-none resize-none placeholder:color-txt-sub"
                                />
                                <p className="text-[11px] color-txt-sub text-right">
                                    {description.length}/{MAX_DESCRIPTION}
                                </p>
                            </div>

                            {/* Website URL */}
                            <div className="space-y-2">
                                <label className="text-xs font-semibold color-txt-sub uppercase tracking-wide">
                                    Link
                                </label>
                                <div className="flex items-center gap-2 rounded-xl color-bg-grey-5 px-4 py-3 focus-within:ring-2 focus-within:ring-color-accent/40">
                                    <LuLink size={16} className="color-txt-sub shrink-0" />
                                    <input
                                        type="url"
                                        value={websiteUrl}
                                        onChange={(e) => setWebsiteUrl(e.target.value)}
                                        placeholder="https://yournotes.com"
                                        className="flex-1 bg-transparent color-txt-main text-sm outline-none placeholder:color-txt-sub"
                                    />
                                </div>
                            </div>
                        </div>

                        {formError && (
                            <p className="text-sm text-red-500">{formError}</p>
                        )}

                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={closeForm}
                                disabled={submitting}
                                className="px-4 py-2 rounded-xl text-sm color-txt-sub hover:color-txt-main transition-colors cursor-pointer disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleSubmit}
                                disabled={submitting}
                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl color-bg-accent color-txt-accent font-semibold text-sm hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {submitting ? (
                                    <>
                                        <LuLoader size={16} className="animate-spin" />
                                        Publishing…
                                    </>
                                ) : (
                                    <>
                                        <LuPlus size={16} />
                                        Publish
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
