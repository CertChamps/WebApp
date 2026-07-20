import { useContext, useEffect, useMemo, useRef, useState } from "react";
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    increment,
    limit,
    onSnapshot,
    orderBy,
    query,
    runTransaction,
    serverTimestamp,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { db, storage } from "../../firebase";
import { UserContext } from "../context/UserContext";
import { isAdminUid } from "../constants/adminUids";
import CommunityRightRail from "../components/social/CommunityRightRail";
import {
    FAVOURITES_CHANGED_EVENT,
    getFavouriteSubjectIds,
    PRACTICE_HUB_SUBJECTS,
} from "../data/practiceHubSubjects";
import { SubjectDropdown } from "../components/practiceHub";
import {
    LuBookOpen,
    LuBookmark,
    LuCompass,
    LuExternalLink,
    LuFilter,
    LuImage,
    LuLayers,
    LuLink,
    LuLoader,
    LuMessageCircle,
    LuCirclePlay,
    LuPlus,
    LuSearch,
    LuTrash2,
    LuUsers,
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
    uploadedThumbnailUrl?: string | null;
    uploadedThumbnailPath?: string | null;
    thumbnailStatus?: "none" | "pending" | "approved" | "rejected";
    moderationStatus?: "approved" | "pending";
    faviconUrl?: string | null;
    siteName?: string;
    subjectId?: string;
    subjectLabel?: string;
    level?: ResourceLevel;
    levels?: ResourceLevel[];
    resourceType?: ResourceType;
    resourceTypes?: ResourceType[];
    topics?: string[];
    likeCount?: number;
    commentCount?: number;
    ratingAverage?: number;
    ratingCount?: number;
    timestamp: number | null;
};

type ResourceType = "Notes" | "Videos" | "Sample Answers" | "Flashcards" | "Website" | "Other";
type ResourceLevel = "Higher" | "Ordinary" | "Foundation";

type LinkPreview = {
    url: string;
    title: string;
    description: string;
    imageUrl: string | null;
    faviconUrl: string | null;
    siteName: string;
    warning?: string;
};

type DiscoverComment = {
    id: string;
    userId: string;
    username: string;
    userPicture: string | null;
    text: string;
    timestamp: number | null;
};

type DiscoverResource = {
    id: string;
    title: string;
    subject: string;
    type: ResourceType;
    description: string;
    sourceName: string;
    tags: string[];
    comments: number;
    saves: number;
    levels?: ResourceLevel[];
    types?: ResourceType[];
    faviconUrl?: string | null;
    ratingAverage?: number;
    ratingCount?: number;
    websiteUrl?: string;
    thumbnailUrl?: string;
    userId?: string;
    username?: string;
    userPicture?: string | null;
    timestamp?: number | null;
    note?: DiscoverNote;
};

const MAX_TITLE = 80;
const MAX_DESCRIPTION = 240;
const MAX_COMMENT = 500;
const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024;

const LINK_PREVIEW_URL = "https://us-central1-certchamps-a7527.cloudfunctions.net/fetchLinkPreview";
const RESOURCE_TYPES: ResourceType[] = ["Notes", "Videos", "Sample Answers", "Flashcards", "Website", "Other"];
const RESOURCE_LEVELS: ResourceLevel[] = ["Higher", "Ordinary", "Foundation"];

const STARTER_RESOURCES: DiscoverResource[] = [
    {
        id: "starter-english-macbeth",
        title: "Macbeth theme notes and quote bank",
        subject: "English",
        type: "Notes",
        description: "A starter listing for Paper 2 revision: themes, character notes, and short quote prompts.",
        sourceName: "CertChamps starter idea",
        tags: ["Macbeth", "Paper 2", "Quotes"],
        comments: 12,
        saves: 86,
    },
    {
        id: "starter-biology-enzymes",
        title: "Biology enzymes explained quickly",
        subject: "Biology",
        type: "Videos",
        description: "Short video-style resource card for students who need the topic explained before doing questions.",
        sourceName: "CertChamps starter idea",
        tags: ["Enzymes", "Experiments", "Definitions"],
        comments: 7,
        saves: 64,
    },
    {
        id: "starter-irish-oral",
        title: "Irish oral opinion phrases",
        subject: "Irish",
        type: "Flashcards",
        description: "Useful phrases grouped by topic so students can build answers without starting from scratch.",
        sourceName: "CertChamps starter idea",
        tags: ["Oral", "Opinions", "Sraith Pictiur"],
        comments: 19,
        saves: 102,
    },
    {
        id: "starter-maths-calculus",
        title: "Higher Level calculus notes pack",
        subject: "Mathematics",
        type: "Notes",
        description: "A resource card for curated question practice, topic notes, and worked examples in one place.",
        sourceName: "CertChamps starter idea",
        tags: ["Calculus", "Higher Level"],
        comments: 5,
        saves: 48,
    },
];

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

function extractYoutubeId(url: string): string | null {
    try {
        const parsed = new URL(url);
        if (parsed.hostname.includes("youtu.be")) {
            return parsed.pathname.split("/").filter(Boolean)[0] ?? null;
        }
        if (parsed.hostname.includes("youtube.com")) {
            return parsed.searchParams.get("v");
        }
    } catch {
        return null;
    }
    return null;
}

function fallbackPreview(url: string): LinkPreview {
    const parsed = new URL(url);
    const youtubeId = extractYoutubeId(url);
    const hostname = parsed.hostname.replace(/^www\./, "");
    return {
        url,
        title: hostname,
        description: "",
        imageUrl: youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : null,
        faviconUrl: `${parsed.origin}/favicon.ico`,
        siteName: hostname,
    };
}

function normalizeResourceType(value: unknown): ResourceType | null {
    if (typeof value !== "string") return null;
    if (RESOURCE_TYPES.includes(value as ResourceType)) return value as ResourceType;
    return null;
}

function normalizeResourceTypes(values: unknown, fallback?: unknown): ResourceType[] {
    const fromArray = Array.isArray(values)
        ? values.map(normalizeResourceType).filter((type): type is ResourceType => Boolean(type))
        : [];
    const fallbackType = normalizeResourceType(fallback);
    const merged = [...fromArray, ...(fallbackType ? [fallbackType] : [])];
    return [...new Set(merged)];
}

function normalizeResourceLevels(values: unknown, fallback?: unknown): ResourceLevel[] {
    const isLevel = (value: unknown): value is ResourceLevel =>
        typeof value === "string" && RESOURCE_LEVELS.includes(value as ResourceLevel);
    const fromArray = Array.isArray(values)
        ? values.filter(isLevel)
        : [];
    const merged = [...fromArray, ...(isLevel(fallback) ? [fallback] : [])];
    return [...new Set(merged)];
}

function inferResourceType(note: DiscoverNote): ResourceType {
    const text = `${note.title} ${note.description}`.toLowerCase();
    if (text.includes("video") || text.includes("youtube")) return "Videos";
    if (text.includes("sample") || text.includes("answer") || text.includes("essay")) return "Sample Answers";
    if (text.includes("flashcard") || text.includes("quizlet")) return "Flashcards";
    if (text.includes("website") || text.includes("site")) return "Website";
    return "Notes";
}

function inferSubject(note: DiscoverNote): string {
    const text = `${note.title} ${note.description}`.toLowerCase();
    const match = PRACTICE_HUB_SUBJECTS.find((subject) =>
        text.includes(subject.label.toLowerCase()) || text.includes(subject.id.replace(/-/g, " "))
    );
    return match?.label ?? "General";
}

function noteToResource(note: DiscoverNote): DiscoverResource {
    const types = normalizeResourceTypes(note.resourceTypes, note.resourceType);
    const type = types[0] ?? inferResourceType(note);
    const levels = normalizeResourceLevels(note.levels, note.level);
    const subject = note.subjectLabel ?? inferSubject(note);
    return {
        id: note.id,
        title: note.title,
        subject,
        type,
        description: note.description,
        sourceName: note.siteName ?? displayHostname(note.websiteUrl),
        tags: [subject, ...levels, ...(note.topics ?? [])].filter(Boolean),
        comments: note.commentCount ?? 0,
        saves: note.likeCount ?? 0,
        levels,
        types: types.length > 0 ? types : [type],
        faviconUrl: note.faviconUrl,
        ratingAverage: note.ratingAverage ?? 0,
        ratingCount: note.ratingCount ?? 0,
        websiteUrl: note.websiteUrl,
        thumbnailUrl: note.thumbnailUrl,
        userId: note.userId,
        username: note.username,
        userPicture: note.userPicture,
        timestamp: note.timestamp,
        note,
    };
}

export default function Discover() {
    const { user } = useContext(UserContext);
    const isAdmin = isAdminUid(user?.uid, user?.email);
    const navigate = useNavigate();

    const [notes, setNotes] = useState<DiscoverNote[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [searchFocused, setSearchFocused] = useState(false);
    const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
    const [selectedType, setSelectedType] = useState<ResourceType | "All">("All");
    const [favouriteSubjectIds, setFavouriteSubjectIds] = useState<string[]>(() => getFavouriteSubjectIds());

    const [showForm, setShowForm] = useState(false);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [websiteUrl, setWebsiteUrl] = useState("");
    const [shareSubjectId, setShareSubjectId] = useState<string | null>(null);
    const [shareTypes, setShareTypes] = useState<ResourceType[]>(["Notes"]);
    const [shareLevels, setShareLevels] = useState<ResourceLevel[]>([]);
    const [topicDraft, setTopicDraft] = useState("");
    const [shareTopics, setShareTopics] = useState<string[]>([]);
    const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
    const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
    const [linkPreview, setLinkPreview] = useState<LinkPreview | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [submittedToast, setSubmittedToast] = useState(false);
    const [selectedResource, setSelectedResource] = useState<DiscoverResource | null>(null);
    const [comments, setComments] = useState<DiscoverComment[]>([]);
    const [commentText, setCommentText] = useState("");
    const [commentSubmitting, setCommentSubmitting] = useState(false);
    const [userRating, setUserRating] = useState<number | null>(null);
    const [ratingSubmitting, setRatingSubmitting] = useState(false);
    const thumbnailInputRef = useRef<HTMLInputElement | null>(null);

    const [placeholderTitle] = useState(
        () => PLACEHOLDER_TITLES[Math.floor(Math.random() * PLACEHOLDER_TITLES.length)]
    );

    useEffect(() => {
        const updateFavourites = () => setFavouriteSubjectIds(getFavouriteSubjectIds());
        window.addEventListener(FAVOURITES_CHANGED_EVENT, updateFavourites);
        window.addEventListener("storage", updateFavourites);
        return () => {
            window.removeEventListener(FAVOURITES_CHANGED_EVENT, updateFavourites);
            window.removeEventListener("storage", updateFavourites);
        };
    }, []);

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
                        uploadedThumbnailUrl: data.uploadedThumbnailUrl ?? null,
                        uploadedThumbnailPath: data.uploadedThumbnailPath ?? null,
                        thumbnailStatus: data.thumbnailStatus ?? "none",
                        moderationStatus: data.moderationStatus ?? "approved",
                        faviconUrl: data.faviconUrl ?? null,
                        siteName: data.siteName ?? "",
                        subjectId: data.subjectId ?? undefined,
                        subjectLabel: data.subjectLabel ?? undefined,
                        level: data.level ?? undefined,
                        levels: Array.isArray(data.levels) ? data.levels : [],
                        resourceType: data.resourceType ?? undefined,
                        resourceTypes: Array.isArray(data.resourceTypes) ? data.resourceTypes : [],
                        topics: Array.isArray(data.topics) ? data.topics : [],
                        likeCount: typeof data.likeCount === "number" ? data.likeCount : 0,
                        commentCount: typeof data.commentCount === "number" ? data.commentCount : 0,
                        ratingAverage: typeof data.ratingAverage === "number" ? data.ratingAverage : 0,
                        ratingCount: typeof data.ratingCount === "number" ? data.ratingCount : 0,
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

    const favouriteSubjects = useMemo(() => {
        const byId = new Map(PRACTICE_HUB_SUBJECTS.map((subject) => [subject.id, subject]));
        return favouriteSubjectIds.map((id) => byId.get(id)).filter(Boolean).slice(0, 8);
    }, [favouriteSubjectIds]);

    const selectedSubject = selectedSubjectId
        ? PRACTICE_HUB_SUBJECTS.find((subject) => subject.id === selectedSubjectId)
        : null;

    const shareSubject = shareSubjectId
        ? PRACTICE_HUB_SUBJECTS.find((subject) => subject.id === shareSubjectId)
        : null;

    const resources = useMemo(() => {
        const liveResources = notes
            .filter((note) => note.moderationStatus === "approved")
            .map(noteToResource);
        return liveResources.length > 0 ? liveResources : STARTER_RESOURCES;
    }, [notes]);

    const filteredResources = useMemo(() => {
        const selectedSubjectLabel = selectedSubject?.label.toLowerCase();
        const queryText = searchTerm.trim().toLowerCase();

        return resources.filter((resource) => {
            const matchesSubject = selectedSubjectLabel
                ? resource.subject.toLowerCase() === selectedSubjectLabel ||
                  resource.tags.some((tag) => tag.toLowerCase() === selectedSubjectLabel)
                : true;
            const matchesType = selectedType === "All" ? true : (resource.types ?? [resource.type]).includes(selectedType);
            const searchable = [
                resource.title,
                resource.subject,
                resource.type,
                resource.description,
                resource.sourceName,
                ...resource.tags,
            ]
                .join(" ")
                .toLowerCase();
            const matchesSearch = queryText ? searchable.includes(queryText) : true;
            return matchesSubject && matchesType && matchesSearch;
        });
    }, [resources, searchTerm, selectedSubject, selectedType]);

    const favouriteSubjectLabels = useMemo(
        () => new Set(favouriteSubjects.map((subject) => subject?.label.toLowerCase()).filter(Boolean)),
        [favouriteSubjects]
    );

    const recommendedResources = useMemo(() => {
        const base = filteredResources.filter((resource) => {
            if (selectedSubject) return resource.subject.toLowerCase() === selectedSubject.label.toLowerCase();
            if (favouriteSubjectLabels.size === 0) return true;
            return favouriteSubjectLabels.has(resource.subject.toLowerCase());
        });
        return (base.length > 0 ? base : filteredResources).slice(0, 6);
    }, [filteredResources, favouriteSubjectLabels, selectedSubject]);

    const popularResources = useMemo(
        () =>
            [...filteredResources]
                .sort((a, b) => b.saves + b.comments - (a.saves + a.comments))
                .slice(0, 6),
        [filteredResources]
    );

    const recentResources = useMemo(
        () =>
            [...filteredResources]
                .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
                .slice(0, 6),
        [filteredResources]
    );

    useEffect(() => {
        const validUrl = normaliseUrl(websiteUrl);
        if (!validUrl) {
            setLinkPreview(null);
            return;
        }

        const timeout = window.setTimeout(() => {
            fetchLinkPreview(validUrl);
        }, 700);

        return () => window.clearTimeout(timeout);
    }, [websiteUrl]);

    useEffect(() => {
        if (!selectedResource?.note) {
            setComments([]);
            setUserRating(null);
            return;
        }

        const commentsQuery = query(
            collection(db, "discover-notes", selectedResource.id, "comments"),
            orderBy("timestamp", "asc"),
            limit(100)
        );
        const unsubComments = onSnapshot(commentsQuery, (snap) => {
            setComments(
                snap.docs.map((d) => {
                    const data = d.data() as any;
                    return {
                        id: d.id,
                        userId: data.userId ?? "",
                        username: data.username ?? "Unknown",
                        userPicture: data.userPicture ?? null,
                        text: data.text ?? "",
                        timestamp: data.timestamp?.seconds ?? null,
                    };
                })
            );
        });

        let cancelled = false;
        if (user?.uid) {
            getDoc(doc(db, "discover-notes", selectedResource.id, "ratings", user.uid)).then((snap) => {
                if (!cancelled) {
                    const value = snap.data()?.value;
                    setUserRating(typeof value === "number" ? value : null);
                }
            });
        } else {
            setUserRating(null);
        }

        return () => {
            cancelled = true;
            unsubComments();
        };
    }, [selectedResource?.id, user?.uid]);

    const fetchLinkPreview = async (validUrl: string): Promise<LinkPreview> => {
        setPreviewLoading(true);
        setFormError(null);
        try {
            const response = await fetch(LINK_PREVIEW_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: validUrl }),
            });
            if (!response.ok) throw new Error("Preview request failed");
            const data = (await response.json()) as LinkPreview;
            const preview = {
                ...fallbackPreview(validUrl),
                ...data,
                url: data.url || validUrl,
            };
            setLinkPreview(preview);
            setTitle((current) => current.trim() ? current : preview.title.slice(0, MAX_TITLE));
            setDescription((current) => current.trim() ? current : preview.description.slice(0, MAX_DESCRIPTION));
            return preview;
        } catch (error) {
            const preview = fallbackPreview(validUrl);
            setLinkPreview(preview);
            setTitle((current) => current.trim() ? current : preview.title.slice(0, MAX_TITLE));
            return preview;
        } finally {
            setPreviewLoading(false);
        }
    };

    const resetForm = () => {
        setTitle("");
        setDescription("");
        setWebsiteUrl("");
        setShareSubjectId(null);
        setShareTypes(["Notes"]);
        setShareLevels([]);
        setTopicDraft("");
        setShareTopics([]);
        setThumbnailFile(null);
        setThumbnailPreview((current) => {
            if (current) URL.revokeObjectURL(current);
            return null;
        });
        if (thumbnailInputRef.current) thumbnailInputRef.current.value = "";
        setLinkPreview(null);
        setPreviewLoading(false);
        setFormError(null);
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
        const topics = shareTopics.slice(0, 8);

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
        if (!shareSubject) {
            setFormError("Choose the subject this resource is for.");
            return;
        }

        setSubmitting(true);
        setFormError(null);
        let uploadedThumbnailPath: string | null = null;
        try {
            const preview = linkPreview?.url === validUrl ? linkPreview : await fetchLinkPreview(validUrl);
            let uploadedThumbnailUrl = "";
            if (thumbnailFile) {
                const safeName = thumbnailFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
                uploadedThumbnailPath = `discover-thumbnail-uploads/${user.uid}/${Date.now()}-${safeName}`;
                const fileRef = storageRef(storage, uploadedThumbnailPath);
                await uploadBytes(fileRef, thumbnailFile);
                uploadedThumbnailUrl = await getDownloadURL(fileRef);
            }

            await addDoc(collection(db, "discover-notes"), {
                userId: user.uid,
                username: user.username ?? "",
                userPicture: user.picture ?? null,
                title: trimmedTitle,
                description: trimmedDescription,
                websiteUrl: preview.url || validUrl,
                thumbnailUrl: preview.imageUrl ?? preview.faviconUrl ?? "",
                uploadedThumbnailUrl,
                uploadedThumbnailPath,
                thumbnailStatus: thumbnailFile ? "pending" : "none",
                moderationStatus: "pending",
                faviconUrl: preview.faviconUrl ?? "",
                siteName: preview.siteName ?? displayHostname(validUrl),
                subjectId: shareSubject.id,
                subjectLabel: shareSubject.label,
                levels: shareLevels,
                resourceTypes: shareTypes,
                resourceType: shareTypes[0] ?? "Notes",
                topics,
                likeCount: 0,
                commentCount: 0,
                ratingAverage: 0,
                ratingCount: 0,
                timestamp: serverTimestamp(),
            });

            resetForm();
            setShowForm(false);
            setSubmittedToast(true);
            setTimeout(() => setSubmittedToast(false), 2800);
        } catch (e: any) {
            console.error("Failed to publish discover note:", e);
            setFormError(e?.message ?? "Couldn't publish. Try again in a moment.");
            if (uploadedThumbnailPath) {
                try {
                    await deleteObject(storageRef(storage, uploadedThumbnailPath));
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
        } catch (err) {
            console.error("Failed to delete note:", err);
        }
    };

    const toggleShareType = (type: ResourceType) => {
        setShareTypes((current) => {
            if (current.includes(type)) {
                const next = current.filter((item) => item !== type);
                return next.length > 0 ? next : current;
            }
            return [...current, type];
        });
    };

    const toggleShareLevel = (level: ResourceLevel) => {
        setShareLevels((current) =>
            current.includes(level)
                ? current.filter((item) => item !== level)
                : [...current, level]
        );
    };

    const addTopicsFromDraft = () => {
        const nextTopics = topicDraft
            .split(/[,\s]+/)
            .map((topic) => topic.trim().replace(/^#/, ""))
            .filter(Boolean)
            .map((topic) => topic.replace(/\s+/g, "-"))
            .slice(0, 8);
        if (nextTopics.length === 0) return;
        setShareTopics((current) => [...new Set([...current, ...nextTopics])].slice(0, 8));
        setTopicDraft("");
    };

    const removeShareTopic = (topic: string) => {
        setShareTopics((current) => current.filter((item) => item !== topic));
    };

    const handlePickThumbnail = (file: File | undefined | null) => {
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            setFormError("Thumbnail must be an image.");
            return;
        }
        if (file.size > MAX_THUMBNAIL_BYTES) {
            setFormError("Thumbnail must be under 2 MB.");
            return;
        }
        setFormError(null);
        setThumbnailFile(file);
        setThumbnailPreview((current) => {
            if (current) URL.revokeObjectURL(current);
            return URL.createObjectURL(file);
        });
    };

    const clearThumbnailUpload = () => {
        setThumbnailFile(null);
        setThumbnailPreview((current) => {
            if (current) URL.revokeObjectURL(current);
            return null;
        });
        if (thumbnailInputRef.current) thumbnailInputRef.current.value = "";
    };

    const handleVisit = (url: string | undefined) => {
        if (!url) return;
        try {
            window.open(url, "_blank", "noopener,noreferrer");
        } catch (err) {
            console.error("Failed to open link:", err);
        }
    };

    const handleLike = async (resource: DiscoverResource) => {
        if (!user?.uid || !resource.note) {
            setSelectedResource(resource);
            return;
        }
        const likeRef = doc(db, "discover-notes", resource.id, "likes", user.uid);
        const resourceRef = doc(db, "discover-notes", resource.id);
        try {
            await runTransaction(db, async (transaction) => {
                const likeSnap = await transaction.get(likeRef);
                if (likeSnap.exists()) return;
                transaction.set(likeRef, {
                    userId: user.uid,
                    timestamp: serverTimestamp(),
                });
                transaction.update(resourceRef, {
                    likeCount: increment(1),
                });
            });
        } catch (error) {
            console.error("Failed to like resource:", error);
        }
    };

    const handleRate = async (value: number) => {
        if (!user?.uid || !selectedResource?.note || ratingSubmitting) return;
        setRatingSubmitting(true);
        const ratingRef = doc(db, "discover-notes", selectedResource.id, "ratings", user.uid);
        const resourceRef = doc(db, "discover-notes", selectedResource.id);
        try {
            await runTransaction(db, async (transaction) => {
                const resourceSnap = await transaction.get(resourceRef);
                const ratingSnap = await transaction.get(ratingRef);
                const data = resourceSnap.data() as DiscoverNote | undefined;
                const currentAverage = data?.ratingAverage ?? 0;
                const currentCount = data?.ratingCount ?? 0;
                const previousValue = ratingSnap.exists() ? ratingSnap.data()?.value : null;
                const nextCount = typeof previousValue === "number" ? currentCount : currentCount + 1;
                const currentTotal = currentAverage * currentCount;
                const nextTotal = typeof previousValue === "number"
                    ? currentTotal - previousValue + value
                    : currentTotal + value;
                const nextAverage = nextCount > 0 ? nextTotal / nextCount : 0;

                transaction.set(ratingRef, {
                    userId: user.uid,
                    value,
                    timestamp: serverTimestamp(),
                });
                transaction.update(resourceRef, {
                    ratingAverage: Math.round(nextAverage * 10) / 10,
                    ratingCount: nextCount,
                });
            });
            setUserRating(value);
        } catch (error) {
            console.error("Failed to rate resource:", error);
        } finally {
            setRatingSubmitting(false);
        }
    };

    const handleAddComment = async () => {
        if (!user?.uid || !selectedResource?.note || commentSubmitting) return;
        const text = commentText.trim();
        if (!text) return;
        setCommentSubmitting(true);
        try {
            await addDoc(collection(db, "discover-notes", selectedResource.id, "comments"), {
                userId: user.uid,
                username: user.username ?? "",
                userPicture: user.picture ?? null,
                text: text.slice(0, MAX_COMMENT),
                timestamp: serverTimestamp(),
            });
            await runTransaction(db, async (transaction) => {
                transaction.update(doc(db, "discover-notes", selectedResource.id), {
                    commentCount: increment(1),
                });
            });
            setCommentText("");
        } catch (error) {
            console.error("Failed to comment:", error);
        } finally {
            setCommentSubmitting(false);
        }
    };

    const chooseSubject = (subjectId: string) => {
        setSelectedSubjectId((current) => (current === subjectId ? null : subjectId));
    };

    const renderResourceCard = (resource: DiscoverResource) => {
        const canDelete = resource.note && (isAdmin || resource.note.userId === user?.uid);

        return (
            <article
                key={resource.id}
                className="group rounded-2xl color-bg-grey-5 overflow-hidden flex flex-col hover:shadow-md transition-shadow"
            >
                <button
                    type="button"
                    onClick={() => handleVisit(resource.websiteUrl)}
                    disabled={!resource.websiteUrl}
                    className="block w-full aspect-video color-bg-grey-10 overflow-hidden relative cursor-pointer disabled:cursor-default"
                    aria-label={`Visit ${resource.title}`}
                >
                    {resource.thumbnailUrl && resource.thumbnailUrl !== resource.faviconUrl ? (
                        <img
                            src={resource.thumbnailUrl}
                            alt={resource.title}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                            loading="lazy"
                        />
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-3 color-txt-sub color-bg-grey-10 px-5 text-center">
                            {resource.faviconUrl ? (
                                <img
                                    src={resource.faviconUrl}
                                    alt=""
                                    className="w-14 h-14 rounded-2xl object-contain color-bg p-2 shadow-sm"
                                    loading="lazy"
                                />
                            ) : resource.type === "Videos" ? (
                                <LuCirclePlay size={34} />
                            ) : resource.type === "Flashcards" ? (
                                <LuLayers size={34} />
                            ) : (
                                <LuBookOpen size={34} />
                            )}
                            <span className="text-sm font-semibold line-clamp-2">
                                {resource.sourceName || resource.subject}
                            </span>
                        </div>
                    )}
                    <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/65 text-white text-xs font-bold">
                        Free
                    </span>
                    <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full color-bg color-txt-main text-xs font-bold">
                        {resource.type}
                    </span>
                </button>

                <div className="p-4 flex flex-col flex-1 gap-3">
                    <div className="flex items-start justify-between gap-3">
                        <h3 className="text-base font-semibold color-txt-main line-clamp-2">
                            {resource.title}
                        </h3>
                        {canDelete && resource.note && (
                            <button
                                type="button"
                                onClick={() => handleDelete(resource.note!)}
                                className="shrink-0 color-txt-sub hover:text-red-500 transition-colors cursor-pointer"
                                aria-label="Delete listing"
                                title="Delete"
                            >
                                <LuTrash2 size={16} />
                            </button>
                        )}
                    </div>

                    <p className="color-txt-sub text-sm line-clamp-3">{resource.description}</p>

                    <div className="flex flex-wrap gap-2">
                        {resource.tags.slice(0, 3).map((tag) => (
                            <span
                                key={`${resource.id}-${tag}`}
                                className="px-2.5 py-1 rounded-full color-bg text-xs font-semibold color-txt-sub"
                            >
                                {tag}
                            </span>
                        ))}
                    </div>

                    <div className="mt-auto flex items-center justify-between gap-3 pt-2">
                        <div className="flex items-center gap-3 min-w-0">
                            {resource.userId ? (
                                <button
                                    type="button"
                                    onClick={() => navigate(`/viewProfile/${resource.userId}`)}
                                    className="flex items-center gap-2 min-w-0 cursor-pointer group/author"
                                >
                                    {resource.userPicture ? (
                                        <img
                                            src={resource.userPicture}
                                            alt=""
                                            className="w-6 h-6 rounded-full object-cover shrink-0"
                                        />
                                    ) : (
                                        <div className="w-6 h-6 rounded-full color-bg-grey-10 shrink-0" />
                                    )}
                                    <span className="text-xs color-txt-sub truncate group-hover/author:color-txt-main">
                                        {resource.username || "Unknown"}
                                        {resource.timestamp ? ` · ${timeAgo(resource.timestamp)}` : ""}
                                    </span>
                                </button>
                            ) : (
                                <span className="text-xs color-txt-sub truncate">
                                    {resource.sourceName}
                                </span>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => handleVisit(resource.websiteUrl)}
                            disabled={!resource.websiteUrl}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg color-bg-accent color-txt-accent text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer shrink-0 disabled:opacity-70 disabled:cursor-default"
                            title={resource.websiteUrl ? displayHostname(resource.websiteUrl) : "Preview card"}
                        >
                            <LuExternalLink size={13} />
                            {resource.websiteUrl ? "Visit" : "Preview"}
                        </button>
                    </div>

                    <div className="flex items-center justify-between gap-3 border-t border-color-border/60 pt-3 text-xs color-txt-sub">
                        <div className="flex items-center gap-3 min-w-0">
                            <span className="inline-flex items-center gap-1.5">
                                {resource.ratingAverage && resource.ratingAverage > 0 ? `${resource.ratingAverage.toFixed(1)} ★` : "No ratings"}
                                {resource.ratingCount ? ` (${resource.ratingCount})` : ""}
                            </span>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => handleLike(resource)}
                                className="inline-flex items-center gap-1.5 hover:color-txt-main transition-colors cursor-pointer"
                            >
                            <LuBookmark size={14} />
                            {resource.saves}
                            </button>
                            <button
                                type="button"
                                onClick={() => setSelectedResource(resource)}
                                className="inline-flex items-center gap-1.5 hover:color-txt-main transition-colors cursor-pointer"
                            >
                                <LuMessageCircle size={14} />
                                {resource.comments}
                            </button>
                        </div>
                    </div>
                </div>
            </article>
        );
    };

    const renderResourceSection = (title: string, subtitle: string, sectionResources: DiscoverResource[]) => (
        <section className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
                <div>
                    <h2 className="text-lg font-bold color-txt-main">{title}</h2>
                    <p className="text-sm color-txt-sub">{subtitle}</p>
                </div>
                <span className="text-sm color-txt-sub">{sectionResources.length} shown</span>
            </div>

            {sectionResources.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-color-border color-bg-grey-5 p-8 text-center space-y-3">
                    <div className="mx-auto w-12 h-12 rounded-full color-bg-accent flex items-center justify-center color-txt-accent">
                        <LuSearch size={22} />
                    </div>
                    <h3 className="text-lg font-semibold color-txt-main">No matches yet</h3>
                    <p className="color-txt-sub text-sm max-w-md mx-auto">
                        Try clearing a filter or add the first free resource for this topic.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {sectionResources.map(renderResourceCard)}
                </div>
            )}
        </section>
    );

    return (
        <div className="flex w-full h-full color-bg overflow-hidden">
            <main className="flex-1 min-w-0 h-full overflow-y-auto scrollbar-minimal">
            <div className="w-full px-6 py-8 space-y-7">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <p className="inline-flex items-center gap-2 text-sm font-semibold color-txt-sub">
                            <LuUsers size={16} />
                            Community
                        </p>
                        <h1 className="text-3xl sm:text-4xl font-black color-txt-main mt-1">
                            Discover
                        </h1>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => setShowForm(true)}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl color-bg-accent color-txt-accent font-semibold text-sm hover:opacity-90 transition-opacity cursor-pointer"
                        >
                            <LuPlus size={16} />
                            Share resource
                        </button>
                        <div className="flex items-center gap-1 rounded-2xl color-bg-grey-5 p-1">
                            <button
                                type="button"
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl color-bg-accent color-txt-accent text-sm font-semibold cursor-pointer"
                            >
                                <LuCompass size={15} />
                                Resources
                            </button>
                            <button
                                type="button"
                                onClick={() => navigate("/social/social")}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl color-txt-sub hover:color-txt-main text-sm font-semibold cursor-pointer"
                            >
                                <LuUsers size={15} />
                                Discussion
                            </button>
                        </div>
                    </div>
                </div>

                {submittedToast && (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm color-txt-main">
                        Thanks for sharing. Your resource has been sent to our team for moderation and will appear after approval.
                    </div>
                )}

                <section className="space-y-4">
                    <div className="flex flex-col lg:flex-row lg:items-center gap-4 rounded-3xl color-bg-grey-5 p-4 sm:p-5">
                        <label
                            className="flex-1 flex items-center gap-3 rounded-2xl color-bg px-4 py-3 transition-shadow"
                            style={{
                                boxShadow: searchFocused
                                    ? "0 0 0 2px color-mix(in srgb, var(--theme-txt-accent) 45%, transparent)"
                                    : "none",
                            }}
                        >
                            <LuSearch size={20} className="color-txt-sub shrink-0" />
                            <input
                                type="search"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onFocus={() => setSearchFocused(true)}
                                onBlur={() => setSearchFocused(false)}
                                placeholder="Search notes, videos, sample answers, topics..."
                                className="w-full bg-transparent outline-none color-txt-main placeholder:color-txt-sub text-base"
                            />
                        </label>
                        <div className="flex items-center gap-2 overflow-x-auto scrollbar-minimal pb-1 lg:pb-0">
                            <button
                                type="button"
                                onClick={() => setSelectedType("All")}
                                className={`shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
                                    selectedType === "All"
                                        ? "color-bg-accent color-txt-accent"
                                        : "color-bg color-txt-main"
                                }`}
                            >
                                <LuFilter size={15} />
                                All
                            </button>
                            {RESOURCE_TYPES.map((type) => (
                                <button
                                    type="button"
                                    key={type}
                                    onClick={() => setSelectedType(type)}
                                    className={`shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
                                        selectedType === type
                                            ? "color-bg-accent color-txt-accent"
                                            : "color-bg color-txt-main"
                                    }`}
                                >
                                    {type}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold color-txt-sub uppercase tracking-wide mr-1">
                                Your subjects
                            </span>
                            {favouriteSubjects.length === 0 ? (
                                <span className="text-sm color-txt-sub">
                                    Pick subjects to personalise recommendations.
                                </span>
                            ) : (
                                favouriteSubjects.map(
                                    (subject) =>
                                        subject && (
                                            <button
                                                type="button"
                                                key={subject.id}
                                                onClick={() => chooseSubject(subject.id)}
                                                className={`px-3 py-1.5 rounded-full text-sm font-semibold transition-colors cursor-pointer ${
                                                    selectedSubjectId === subject.id
                                                        ? "color-bg-accent color-txt-accent"
                                                        : "color-bg color-txt-main hover:opacity-90"
                                                }`}
                                            >
                                                {subject.label}
                                            </button>
                                        )
                                )
                            )}
                            {selectedSubject && (
                                <button
                                    type="button"
                                    onClick={() => setSelectedSubjectId(null)}
                                    className="px-3 py-1.5 rounded-full color-bg text-sm font-semibold color-txt-sub hover:color-txt-main cursor-pointer"
                                >
                                    Clear
                                </button>
                            )}
                        </div>

                        <div className="min-w-[220px]">
                            <SubjectDropdown
                                id="discover-subject"
                                value={selectedSubjectId}
                                onChange={setSelectedSubjectId}
                                onFavouritesChange={setFavouriteSubjectIds}
                                aria-label="Choose another subject"
                            />
                        </div>
                    </div>
                </section>

                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {[...Array(6)].map((_, i) => (
                            <div key={i} className="rounded-2xl color-bg-grey-5 overflow-hidden animate-pulse">
                                <div className="aspect-video w-full color-bg-grey-10" />
                                <div className="p-4 space-y-3">
                                    <div className="h-4 w-3/4 rounded color-bg-grey-10" />
                                    <div className="h-3 w-full rounded color-bg-grey-10" />
                                    <div className="h-3 w-5/6 rounded color-bg-grey-10" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="space-y-8">
                        {renderResourceSection(
                            selectedSubject ? `${selectedSubject.label} resources` : "Recommended for you",
                            notes.length === 0
                                ? "Starter cards show the shape of the free-resource library while you add real links."
                                : "Based on your Practice Hub subjects and current filters.",
                            recommendedResources
                        )}
                        {renderResourceSection(
                            "Popular this week",
                            "Resources with the strongest saves and comment activity.",
                            popularResources
                        )}
                        {renderResourceSection(
                            "Recently added free resources",
                            "Fresh links from the community.",
                            recentResources
                        )}
                    </div>
                )}
            </div>
            </main>

            <CommunityRightRail />

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
                                    Share a free resource
                                </h2>
                                <p className="color-txt-sub text-sm mt-1">
                                    Add a free Leaving Cert site, notes page, video, or study pack.
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
                            <div className="space-y-2">
                                <label className="text-xs font-semibold color-txt-sub uppercase tracking-wide">
                                    Link
                                </label>
                                <div className="flex items-center gap-2 rounded-xl color-bg-grey-5 px-4 py-3">
                                    <LuLink size={16} className="color-txt-sub shrink-0" />
                                    <input
                                        type="url"
                                        value={websiteUrl}
                                        onChange={(e) => setWebsiteUrl(e.target.value)}
                                        placeholder="https://free-notes-site.com"
                                        className="flex-1 bg-transparent color-txt-main text-sm outline-none placeholder:color-txt-sub"
                                    />
                                    {previewLoading && <LuLoader size={16} className="animate-spin color-txt-sub" />}
                                </div>
                            </div>

                            {linkPreview && (
                                <div className="rounded-xl color-bg-grey-5 overflow-hidden">
                                    <div className="aspect-video color-bg-grey-10 flex items-center justify-center overflow-hidden">
                                        {linkPreview.imageUrl ? (
                                            <img
                                                src={linkPreview.imageUrl}
                                                alt=""
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className="flex flex-col items-center gap-2 color-txt-sub">
                                                <LuBookOpen size={28} />
                                                <span className="text-sm font-semibold">{linkPreview.siteName}</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-3 flex items-start gap-3">
                                        {linkPreview.faviconUrl && (
                                            <img
                                                src={linkPreview.faviconUrl}
                                                alt=""
                                                className="w-6 h-6 rounded object-contain shrink-0"
                                            />
                                        )}
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold color-txt-main truncate">
                                                {linkPreview.title}
                                            </p>
                                            <p className="text-xs color-txt-sub truncate">
                                                {linkPreview.siteName}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2">
                                <label className="text-xs font-semibold color-txt-sub uppercase tracking-wide">
                                    Optional thumbnail
                                </label>
                                <label className="block w-full aspect-video rounded-xl color-bg-grey-5 border border-dashed border-color-border overflow-hidden relative cursor-pointer hover:opacity-90 transition-opacity">
                                    {thumbnailPreview ? (
                                        <img
                                            src={thumbnailPreview}
                                            alt="Custom thumbnail preview"
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center color-txt-sub gap-2 px-4 text-center">
                                            <LuImage size={28} />
                                            <span className="text-sm font-semibold">Upload custom thumbnail</span>
                                            <span className="text-xs">Shown publicly only after admin approval. JPG/PNG under 2 MB.</span>
                                        </div>
                                    )}
                                    <input
                                        ref={thumbnailInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => handlePickThumbnail(e.target.files?.[0])}
                                    />
                                </label>
                                {thumbnailPreview && (
                                    <button
                                        type="button"
                                        onClick={clearThumbnailUpload}
                                        className="text-xs color-txt-sub hover:text-red-500 transition-colors cursor-pointer"
                                    >
                                        Remove uploaded thumbnail
                                    </button>
                                )}
                            </div>

                            <div className="space-y-3">
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold color-txt-sub uppercase tracking-wide">
                                        Subject
                                    </label>
                                    <SubjectDropdown
                                        id="discover-share-subject"
                                        value={shareSubjectId}
                                        onChange={setShareSubjectId}
                                        onFavouritesChange={setFavouriteSubjectIds}
                                        aria-label="Choose resource subject"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold color-txt-sub uppercase tracking-wide">
                                        Type
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        {RESOURCE_TYPES.map((type) => (
                                            <button
                                                type="button"
                                                key={type}
                                                onClick={() => toggleShareType(type)}
                                                className={`px-3 py-2 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
                                                    shareTypes.includes(type)
                                                        ? "color-bg-accent color-txt-accent"
                                                        : "color-bg-grey-5 color-txt-main hover:opacity-90"
                                                }`}
                                            >
                                                {type}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold color-txt-sub uppercase tracking-wide">
                                        Level
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        {RESOURCE_LEVELS.map((level) => (
                                            <button
                                                type="button"
                                                key={level}
                                                onClick={() => toggleShareLevel(level)}
                                                className={`px-3 py-2 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
                                                    shareLevels.includes(level)
                                                        ? "color-bg-accent color-txt-accent"
                                                        : "color-bg-grey-5 color-txt-main hover:opacity-90"
                                                }`}
                                            >
                                                {level}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-xs color-txt-sub">
                                        Leave blank if it works for every level.
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-semibold color-txt-sub uppercase tracking-wide">
                                    Topics
                                </label>
                                <div className="flex items-center gap-2 rounded-xl color-bg-grey-5 px-3 py-2">
                                    <span className="text-sm color-txt-sub">#</span>
                                    <input
                                        type="text"
                                        value={topicDraft}
                                        onChange={(e) => setTopicDraft(e.target.value)}
                                        onBlur={addTopicsFromDraft}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" || e.key === "," || e.key === " ") {
                                                e.preventDefault();
                                                addTopicsFromDraft();
                                            }
                                        }}
                                        placeholder="macbeth"
                                        className="flex-1 bg-transparent color-txt-main text-sm outline-none placeholder:color-txt-sub"
                                    />
                                </div>
                                {shareTopics.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {shareTopics.map((topic) => (
                                            <button
                                                type="button"
                                                key={topic}
                                                onClick={() => removeShareTopic(topic)}
                                                className="px-2.5 py-1 rounded-full color-bg-grey-5 color-txt-sub text-xs font-semibold hover:color-txt-main cursor-pointer"
                                            >
                                                #{topic}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

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

                            <div className="space-y-2">
                                <label className="text-xs font-semibold color-txt-sub uppercase tracking-wide">
                                    Description
                                </label>
                                <textarea
                                    value={description}
                                    onChange={(e) =>
                                        setDescription(e.target.value.slice(0, MAX_DESCRIPTION))
                                    }
                                    placeholder="What's in the resource? Which subjects and topics does it cover?"
                                    rows={3}
                                    className="w-full rounded-xl color-bg-grey-5 color-txt-main px-4 py-3 text-sm outline-none resize-none placeholder:color-txt-sub"
                                />
                                <p className="text-[11px] color-txt-sub text-right">
                                    {description.length}/{MAX_DESCRIPTION}
                                </p>
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
                                        Publishing...
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

            {selectedResource && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                    onClick={() => setSelectedResource(null)}
                >
                    <div
                        className="w-full max-w-3xl rounded-2xl color-bg shadow-md max-h-[90vh] overflow-y-auto scrollbar-minimal"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr]">
                            <div className="color-bg-grey-5">
                                <div className="aspect-video md:aspect-auto md:h-full min-h-[220px] color-bg-grey-10 flex items-center justify-center overflow-hidden">
                                    {selectedResource.thumbnailUrl && selectedResource.thumbnailUrl !== selectedResource.faviconUrl ? (
                                        <img
                                            src={selectedResource.thumbnailUrl}
                                            alt=""
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="flex flex-col items-center gap-3 color-txt-sub px-5 text-center">
                                            {selectedResource.faviconUrl ? (
                                                <img
                                                    src={selectedResource.faviconUrl}
                                                    alt=""
                                                    className="w-16 h-16 rounded-2xl object-contain color-bg p-2 shadow-sm"
                                                />
                                            ) : (
                                                <LuBookOpen size={34} />
                                            )}
                                            <span className="font-semibold">
                                                {selectedResource.sourceName || selectedResource.subject}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="p-5 sm:p-6 space-y-5">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0">
                                        <h2 className="text-xl font-bold color-txt-main">
                                            {selectedResource.title}
                                        </h2>
                                        <p className="text-sm color-txt-sub mt-1">
                                            {selectedResource.subject} · {(selectedResource.types ?? [selectedResource.type]).join(", ")}
                                            {selectedResource.levels?.length ? ` · ${selectedResource.levels.join(", ")}` : ""}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedResource(null)}
                                        className="color-txt-sub hover:color-txt-main cursor-pointer"
                                        aria-label="Close"
                                    >
                                        <LuX size={20} />
                                    </button>
                                </div>

                                <p className="text-sm color-txt-sub">{selectedResource.description}</p>

                                <div className="flex flex-wrap gap-2">
                                    {selectedResource.tags.slice(0, 6).map((tag) => (
                                        <span
                                            key={`${selectedResource.id}-modal-${tag}`}
                                            className="px-2.5 py-1 rounded-full color-bg-grey-5 text-xs font-semibold color-txt-sub"
                                        >
                                            {tag}
                                        </span>
                                    ))}
                                </div>

                                <div className="flex flex-wrap items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => handleVisit(selectedResource.websiteUrl)}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl color-bg-accent color-txt-accent text-sm font-semibold hover:opacity-90 cursor-pointer"
                                    >
                                        <LuExternalLink size={15} />
                                        Visit resource
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleLike(selectedResource)}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl color-bg-grey-5 color-txt-main text-sm font-semibold hover:opacity-90 cursor-pointer"
                                    >
                                        <LuBookmark size={15} />
                                        Save · {selectedResource.saves}
                                    </button>
                                </div>

                                <div className="rounded-xl color-bg-grey-5 p-4 space-y-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <h3 className="font-bold color-txt-main">Rate this resource</h3>
                                            <p className="text-xs color-txt-sub">
                                                {selectedResource.ratingCount
                                                    ? `${selectedResource.ratingAverage?.toFixed(1)} average from ${selectedResource.ratingCount} ratings`
                                                    : "No ratings yet"}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            {[1, 2, 3, 4, 5].map((value) => (
                                                <button
                                                    type="button"
                                                    key={value}
                                                    disabled={ratingSubmitting || !selectedResource.note}
                                                    onClick={() => handleRate(value)}
                                                    className={`text-xl cursor-pointer disabled:cursor-not-allowed ${
                                                        (userRating ?? 0) >= value ? "color-txt-accent" : "color-txt-sub"
                                                    }`}
                                                    aria-label={`Rate ${value} stars`}
                                                >
                                                    ★
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <h3 className="font-bold color-txt-main">Comments</h3>
                                    <div className="space-y-3 max-h-56 overflow-y-auto scrollbar-minimal pr-1">
                                        {comments.length === 0 ? (
                                            <p className="text-sm color-txt-sub">
                                                No comments yet. Add context for the next student.
                                            </p>
                                        ) : (
                                            comments.map((comment) => (
                                                <div key={comment.id} className="rounded-xl color-bg-grey-5 p-3">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        {comment.userPicture ? (
                                                            <img
                                                                src={comment.userPicture}
                                                                alt=""
                                                                className="w-6 h-6 rounded-full object-cover"
                                                            />
                                                        ) : (
                                                            <div className="w-6 h-6 rounded-full color-bg-grey-10" />
                                                        )}
                                                        <span className="text-xs font-semibold color-txt-main">
                                                            {comment.username || "Unknown"}
                                                        </span>
                                                        <span className="text-xs color-txt-sub">
                                                            {comment.timestamp ? timeAgo(comment.timestamp) : ""}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm color-txt-sub whitespace-pre-wrap">
                                                        {comment.text}
                                                    </p>
                                                </div>
                                            ))
                                        )}
                                    </div>

                                    <div className="space-y-2">
                                        <textarea
                                            value={commentText}
                                            onChange={(e) => setCommentText(e.target.value.slice(0, MAX_COMMENT))}
                                            placeholder="Was it helpful? What topic is it best for?"
                                            rows={3}
                                            className="w-full rounded-xl color-bg-grey-5 color-txt-main px-4 py-3 text-sm outline-none resize-none placeholder:color-txt-sub"
                                        />
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="text-xs color-txt-sub">
                                                {commentText.length}/{MAX_COMMENT}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={handleAddComment}
                                                disabled={commentSubmitting || !commentText.trim() || !selectedResource.note}
                                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl color-bg-accent color-txt-accent text-sm font-semibold hover:opacity-90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {commentSubmitting && <LuLoader size={14} className="animate-spin" />}
                                                Comment
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
