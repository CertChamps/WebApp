import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    increment,
    limit,
    onSnapshot,
    orderBy,
    query,
    runTransaction,
    serverTimestamp,
    setDoc,
    updateDoc,
} from "firebase/firestore";
import { aiResponseError, authenticatedAiFetch, METERED_CHAT_API_URL } from "../lib/aiApi";
import { deleteObject, getDownloadURL, ref as storageRef } from "firebase/storage";
import { db, storage } from "../../firebase";
import { UserContext } from "../context/UserContext";
import { isAdminUid } from "../constants/adminUids";
import { notifyPostOwner } from "../lib/notifications";
import NotificationBell from "../components/social/NotificationBell";
import DiscoverFiltersModal, { type DiscoverSortBy } from "../components/discover/DiscoverFiltersModal";
import DiscoverShareModal from "../components/discover/DiscoverShareModal";
import {
    FAVOURITES_CHANGED_EVENT,
    getFavouriteSubjectIds,
    PRACTICE_HUB_SUBJECTS,
    useSyncedFavouriteSubjectIds,
} from "../data/practiceHubSubjects";
import { SubjectDropdown } from "../components/practiceHub";
import {
    LuArrowLeft,
    LuArrowRight,
    LuArrowUpRight,
    LuBookOpen,
    LuBookmark,
    LuExternalLink,
    LuLink,
    LuLoader,
    LuPlus,
    LuSearch,
    LuStar,
    LuTrash,
    LuUsers,
    LuX,
    LuChevronDown,
} from "react-icons/lu";
import { useNavigate, useSearchParams } from "react-router-dom";
import VideoEmbedModal from "../components/discover/VideoEmbedModal";
import DiscoverMediaPreview from "../components/discover/DiscoverMediaPreview";

type DiscoverNote = {
    id: string;
    userId: string;
    username: string;
    userPicture: string | null;
    title: string;
    description: string;
    websiteUrl: string;
    resourceSource?: ResourceSource;
    pdfPath?: string | null;
    pdfFileName?: string | null;
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
    linkedQuestionId?: string;
    linkedQuestionName?: string;
    linkedQuestionPracticeUrl?: string;
    linkedQuestionSubjectId?: string;
    linkedQuestionSubjectLabel?: string;
    linkedQuestionLevel?: string;
    linkedQuestionTopic?: string;
    linkedQuestionSource?: string;
};

type DiscoverQuestionPost = {
    id: string;
    questionId: string;
    questionName: string;
    subjectId?: string;
    subjectLabel?: string;
    level?: string;
    topic?: string;
    practiceUrl: string;
    content: string;
    sourceContext?: string;
    timestamp: number | null;
};

type ResourceType = "Notes" | "Videos" | "Sample Answers" | "Flashcards" | "Website" | "Other";
type ResourceLevel = "Higher" | "Ordinary" | "Foundation";
type ResourceSource = "website" | "pdf";

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
    resourceSource?: ResourceSource;
    pdfPath?: string | null;
    thumbnailUrl?: string;
    userId?: string;
    username?: string;
    userPicture?: string | null;
    timestamp?: number | null;
    note?: DiscoverNote;
};

const MAX_COMMENT = 500;
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

function timeAgo(seconds: number | null): string {
    if (!seconds) return "";
    const diff = Math.floor(Date.now() / 1000 - seconds);
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    if (diff < 2629800) return `${Math.floor(diff / 604800)}w ago`;
    if (diff < 31557600) return `${Math.floor(diff / 2629800)}mo ago`;
    return `${Math.floor(diff / 31557600)}y ago`;
}

function displayHostname(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return url;
    }
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

type DiscoverAIReply = {
    status: "ok" | "no_match";
    message: string;
    resourceIds: string[];
};

async function requestDiscoverAI(context: string, userPrompt: string): Promise<string> {
    const response = await authenticatedAiFetch(METERED_CHAT_API_URL, {
            messages: [{ role: "user", content: userPrompt }],
            context,
            temperature: 0.2,
        }, "discover");
    if (!response.ok) throw await aiResponseError(response, "AI resource search failed");

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No AI response body");
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            try {
                const parsed = JSON.parse(data) as {
                    choices?: Array<{ delta?: { content?: string } }>;
                    error?: { message?: string };
                };
                if (parsed.error) throw new Error(parsed.error.message || "AI stream error");
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) fullText += content;
            } catch (err) {
                if (err instanceof SyntaxError) continue;
                throw err;
            }
        }
    }

    return fullText;
}

function parseDiscoverAIReply(raw: string): DiscoverAIReply | null {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
        const parsed = JSON.parse(raw.slice(start, end + 1)) as Partial<DiscoverAIReply>;
        const status = parsed.status === "ok" || parsed.status === "no_match" ? parsed.status : null;
        if (!status) return null;
        return {
            status,
            message: typeof parsed.message === "string" ? parsed.message : "",
            resourceIds: Array.isArray(parsed.resourceIds)
                ? parsed.resourceIds.filter((id): id is string => typeof id === "string")
                : [],
        };
    } catch {
        return null;
    }
}

const AI_SEARCH_STATUS_MESSAGES = [
    "Scanning the library...",
    "Matching titles and tags...",
    "Checking subjects and comments...",
    "Ranking the best fits...",
];

type AiSearchOverlayPhase = "in" | "out" | "enter";

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenizeSearch(query: string): string[] {
    return query
        .toLowerCase()
        .split(/[^a-z0-9+#]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length > 0);
}

function fieldMatchScore(haystack: string, token: string, weight: number): number {
    if (!haystack || !token) return 0;
    const value = haystack.toLowerCase();
    if (value === token) return weight;
    if (value.startsWith(token)) return Math.round(weight * 0.9);
    const wordStart = new RegExp(`(?:^|[^a-z0-9+#])${escapeRegExp(token)}`);
    if (wordStart.test(value)) return Math.round(weight * 0.8);
    if (value.includes(token)) return Math.round(weight * 0.55);
    return 0;
}

function bestFieldScore(values: Array<string | null | undefined>, token: string, weight: number): number {
    return values.reduce<number>((best, value) => Math.max(best, fieldMatchScore(value ?? "", token, weight)), 0);
}

function scoreDiscoverSearch(
    resource: DiscoverResource,
    tokens: string[],
    fullQuery: string,
    commentTexts: string[]
): number {
    if (tokens.length === 0) return 0;
    const title = resource.title ?? "";
    const username = resource.username ?? "";
    const subject = resource.subject ?? "";
    const description = resource.description ?? "";
    const sourceName = resource.sourceName ?? "";
    const siteName = resource.note?.siteName ?? "";
    const linkedName = resource.note?.linkedQuestionName ?? "";
    const tags = [
        ...resource.tags,
        ...(resource.types ?? [resource.type]),
        ...(resource.levels ?? []),
    ];

    let score = 0;
    for (const token of tokens) {
        const tokenScore = Math.max(
            fieldMatchScore(title, token, 100),
            fieldMatchScore(username, token, 46),
            fieldMatchScore(linkedName, token, 40),
            bestFieldScore(tags, token, 34),
            fieldMatchScore(subject, token, 32),
            fieldMatchScore(sourceName, token, 28),
            fieldMatchScore(siteName, token, 28),
            fieldMatchScore(description, token, 14),
            bestFieldScore(commentTexts, token, 12)
        );
        if (tokenScore === 0) return 0;
        score += tokenScore;
    }

    const titleLower = title.toLowerCase();
    if (titleLower === fullQuery) score += 120;
    else if (titleLower.startsWith(fullQuery)) score += 55;
    else if (titleLower.includes(fullQuery)) score += 28;
    return score;
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
        resourceSource: note.resourceSource ?? (note.pdfPath ? "pdf" : "website"),
        pdfPath: note.pdfPath,
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
    const [searchParams, setSearchParams] = useSearchParams();
    const linkedQuestion = useMemo(() => {
        const id = searchParams.get("questionId")?.trim();
        if (!id) return null;
        return {
            id,
            name: searchParams.get("questionName")?.trim() || "Practice question",
            subjectId: searchParams.get("subject")?.trim() || undefined,
            subjectLabel: searchParams.get("subjectLabel")?.trim() || undefined,
            level: searchParams.get("level")?.trim() || undefined,
            topic: searchParams.get("topic")?.trim() || undefined,
            practiceUrl: searchParams.get("practiceUrl")?.trim() || undefined,
            source: searchParams.get("source")?.trim() === "whiteboard" ? "whiteboard" as const
                : searchParams.get("source")?.trim() === "practice" ? "practice" as const
                : undefined,
        };
    }, [searchParams]);

    const [notes, setNotes] = useState<DiscoverNote[]>([]);
    const [questionPosts, setQuestionPosts] = useState<DiscoverQuestionPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [submittedQuery, setSubmittedQuery] = useState<string | null>(null);
    const [searchFocused, setSearchFocused] = useState(false);
    const [searchLoading, setSearchLoading] = useState(false);
    const [aiSearching, setAiSearching] = useState(false);
    const [aiSearchEnabled, setAiSearchEnabled] = useState(false);
    const [aiResultIds, setAiResultIds] = useState<string[] | null>(null);
    const [commentsByNoteId, setCommentsByNoteId] = useState<Record<string, string[]>>({});
    const [aiOverlay, setAiOverlay] = useState<{ text: string; phase: AiSearchOverlayPhase }>({
        text: "",
        phase: "in",
    });
    const aiSearchGen = useRef(0);
    const searchInputRef = useRef<HTMLInputElement | null>(null);
    const searchDelayRef = useRef<number | null>(null);
    const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
    const [selectedTypes, setSelectedTypes] = useState<ResourceType[]>([]);
    const [sortBy, setSortBy] = useState<DiscoverSortBy>("date");
    const [showFilters, setShowFilters] = useState(false);
    const filtersButtonRef = useRef<HTMLButtonElement | null>(null);
    const [favouriteSubjectIds, setFavouriteSubjectIds] = useState<string[]>(() => getFavouriteSubjectIds());
    const syncedFavouriteSubjectIds = useSyncedFavouriteSubjectIds();

    const [showForm, setShowForm] = useState(false);
    const [submittedToast, setSubmittedToast] = useState(false);
    const [selectedResource, setSelectedResource] = useState<DiscoverResource | null>(null);
    const [videoResource, setVideoResource] = useState<DiscoverResource | null>(null);
    const [comments, setComments] = useState<DiscoverComment[]>([]);
    const [commentText, setCommentText] = useState("");
    const [commentComposerOpen, setCommentComposerOpen] = useState(false);
    const [commentSubmitting, setCommentSubmitting] = useState(false);
    const [userRating, setUserRating] = useState<number | null>(null);
    const [userSaved, setUserSaved] = useState(false);
    const [ratingSubmitting, setRatingSubmitting] = useState(false);
    const [saveSubmitting, setSaveSubmitting] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const commentInputRef = useRef<HTMLInputElement | null>(null);
    const pageMenuRef = useRef<HTMLDivElement | null>(null);
    const pageScrollRef = useRef<HTMLElement | null>(null);
    const [pageMenuOpen, setPageMenuOpen] = useState(false);

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
        function handleOutside(e: MouseEvent) {
            if (pageMenuRef.current && !pageMenuRef.current.contains(e.target as Node)) {
                setPageMenuOpen(false);
            }
        }
        document.addEventListener("mousedown", handleOutside);
        return () => document.removeEventListener("mousedown", handleOutside);
    }, []);

    useEffect(() => {
        setFavouriteSubjectIds(syncedFavouriteSubjectIds);
    }, [syncedFavouriteSubjectIds]);

    useEffect(() => {
        if (!linkedQuestion) return;
        if (linkedQuestion.subjectId) {
            setSelectedSubjectId(linkedQuestion.subjectId);
        }
        if (searchParams.get("share") === "1") setShowForm(true);
    }, [linkedQuestion, searchParams]);

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
                    const data = d.data();
                    return {
                        id: d.id,
                        userId: data.userId ?? "",
                        username: data.username ?? "Unknown",
                        userPicture: data.userPicture ?? null,
                        title: data.title ?? "",
                        description: data.description ?? "",
                        websiteUrl: data.websiteUrl ?? "",
                        resourceSource: data.resourceSource === "pdf" ? "pdf" : "website",
                        pdfPath: data.pdfPath ?? null,
                        pdfFileName: data.pdfFileName ?? null,
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
                        linkedQuestionId: data.linkedQuestionId ?? undefined,
                        linkedQuestionName: data.linkedQuestionName ?? undefined,
                        linkedQuestionPracticeUrl: data.linkedQuestionPracticeUrl ?? undefined,
                        linkedQuestionSubjectId: data.linkedQuestionSubjectId ?? undefined,
                        linkedQuestionSubjectLabel: data.linkedQuestionSubjectLabel ?? undefined,
                        linkedQuestionLevel: data.linkedQuestionLevel ?? undefined,
                        linkedQuestionTopic: data.linkedQuestionTopic ?? undefined,
                        linkedQuestionSource: data.linkedQuestionSource ?? undefined,
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

    useEffect(() => {
        const notesWithComments = notes.filter((note) => (note.commentCount ?? 0) > 0);
        if (notesWithComments.length === 0) {
            setCommentsByNoteId({});
            return;
        }

        let cancelled = false;
        Promise.all(
            notesWithComments.map(async (note) => {
                const snap = await getDocs(
                    query(collection(db, "discover-notes", note.id, "comments"), limit(80))
                );
                const texts = snap.docs.map((row) => {
                    const data = row.data();
                    return `${data.username ?? ""} ${data.text ?? ""}`.trim();
                }).filter(Boolean);
                return [note.id, texts] as const;
            })
        ).then((entries) => {
            if (!cancelled) setCommentsByNoteId(Object.fromEntries(entries));
        }).catch((err) => {
            console.warn("Discover comment index error:", err);
        });

        return () => {
            cancelled = true;
        };
    }, [notes]);

    useEffect(() => {
        if (!aiSearching) return;
        const queryText = searchTerm.trim();
        let cancelled = false;
        let showQuery = true;
        let messageIndex = 0;
        const timeouts: number[] = [];
        setAiOverlay({ text: queryText, phase: "in" });

        const later = (fn: () => void, ms: number) => {
            const id = window.setTimeout(fn, ms);
            timeouts.push(id);
        };

        const cycle = () => {
            later(() => {
                if (cancelled) return;
                setAiOverlay((current) => ({ ...current, phase: "out" }));
                later(() => {
                    if (cancelled) return;
                    showQuery = !showQuery;
                    const nextText = showQuery
                        ? queryText
                        : AI_SEARCH_STATUS_MESSAGES[messageIndex++ % AI_SEARCH_STATUS_MESSAGES.length];
                    setAiOverlay({ text: nextText, phase: "enter" });
                    requestAnimationFrame(() => {
                        if (cancelled) return;
                        requestAnimationFrame(() => {
                            if (cancelled) return;
                            setAiOverlay({ text: nextText, phase: "in" });
                            cycle();
                        });
                    });
                }, 320);
            }, 1500);
        };

        cycle();
        return () => {
            cancelled = true;
            timeouts.forEach(clearTimeout);
        };
    }, [aiSearching, searchTerm]);

    useEffect(() => {
        return () => {
            if (searchDelayRef.current) window.clearTimeout(searchDelayRef.current);
        };
    }, []);

    useEffect(() => {
        const postsQuery = query(collection(db, "posts"), orderBy("timestamp", "desc"), limit(60));
        const unsub = onSnapshot(
            postsQuery,
            (snap) => {
                const seen = new Set<string>();
                const rows: DiscoverQuestionPost[] = [];
                snap.docs.forEach((row) => {
                    const data = row.data();
                    const questionId = String(data.discoverQuestionId ?? "").trim();
                    const practiceUrl = String(data.practiceUrl ?? "").trim();
                    if (!data.isQuestionPost || !questionId || !practiceUrl || seen.has(questionId)) return;
                    seen.add(questionId);
                    rows.push({
                        id: row.id,
                        questionId,
                        questionName: data.questionName || "Practice question",
                        subjectId: data.subject || undefined,
                        subjectLabel: data.subjectLabel || undefined,
                        level: data.level || undefined,
                        topic: data.topic || undefined,
                        practiceUrl,
                        content: data.content || "",
                        sourceContext: data.sourceContext || undefined,
                        timestamp: data.timestamp?.seconds ?? null,
                    });
                });
                setQuestionPosts(rows.slice(0, 8));
            },
            (err) => console.warn("Discover question posts listener error:", err)
        );
        return () => unsub();
    }, []);

    const favouriteSubjects = useMemo(() => {
        const byId = new Map(PRACTICE_HUB_SUBJECTS.map((subject) => [subject.id, subject]));
        return favouriteSubjectIds.map((id) => byId.get(id)).filter(Boolean);
    }, [favouriteSubjectIds]);

    const selectedSubject = selectedSubjectId
        ? PRACTICE_HUB_SUBJECTS.find((subject) => subject.id === selectedSubjectId)
        : null;

    const subjectChips = useMemo(
        () => favouriteSubjects.filter((subject): subject is NonNullable<typeof subject> => Boolean(subject)),
        [favouriteSubjects]
    );

    const resources = useMemo(() => {
        const liveResources = notes
            .filter((note) => note.moderationStatus === "approved")
            .map(noteToResource);
        return liveResources.length > 0 ? liveResources : STARTER_RESOURCES;
    }, [notes]);

    const clearAiSearch = useCallback(() => {
        aiSearchGen.current += 1;
        setAiSearching(false);
        setAiSearchEnabled(false);
        setAiResultIds(null);
        setSearchLoading(false);
        if (searchDelayRef.current) {
            window.clearTimeout(searchDelayRef.current);
            searchDelayRef.current = null;
        }
    }, []);

    const handleAISearch = useCallback(async () => {
        const prompt = searchTerm.trim();
        if (!prompt) {
            setSearchLoading(false);
            setAiSearching(false);
            return;
        }

        const selectedSubjectLabel = selectedSubject?.label.toLowerCase();
        const candidateResources = resources.filter((resource) => {
            const matchesSubject = selectedSubjectLabel
                ? resource.subject.toLowerCase() === selectedSubjectLabel ||
                  resource.tags.some((tag) => tag.toLowerCase() === selectedSubjectLabel)
                : true;
            const matchesType =
                selectedTypes.length === 0 ||
                (resource.types ?? [resource.type]).some((type) => selectedTypes.includes(type));
            return matchesSubject && matchesType;
        });

        const requestId = ++aiSearchGen.current;
        setAiSearching(true);
        setSearchLoading(true);
        setSubmittedQuery(prompt);

        if (candidateResources.length === 0) {
            if (requestId !== aiSearchGen.current) return;
            setAiResultIds([]);
            setAiSearching(false);
            setSearchLoading(false);
            return;
        }

        try {
            const context = [
                "You are the AI search assistant for CertChamps Discover, a free community library of study resources.",
                "The student will describe what they need. Choose only resources from the provided JSON list that genuinely match.",
                "Use title, description, username, subject, type, source, level, topic tags, and comments. Interpret loose wording generously.",
                "Prefer a smaller useful set over padding weak matches. Return at most 12 resources.",
                "Respond with ONLY JSON in this exact shape:",
                '{"status":"ok"|"no_match","message":string,"resourceIds":string[]}',
                "resourceIds must be ids from the candidate list, ordered from best to weakest match.",
                "For no_match, resourceIds must be [] and message should kindly suggest rephrasing or changing filters.",
                "Candidate resources:",
                JSON.stringify(
                    candidateResources.map((resource) => ({
                        id: resource.id,
                        title: resource.title,
                        username: resource.username,
                        description: resource.description,
                        subject: resource.subject,
                        type: resource.type,
                        types: resource.types,
                        levels: resource.levels,
                        tags: resource.tags,
                        source: resource.sourceName,
                        comments: (commentsByNoteId[resource.id] ?? []).slice(0, 8),
                    }))
                ),
            ].join("\n");

            const raw = await requestDiscoverAI(context, prompt);
            if (requestId !== aiSearchGen.current) return;
            const reply = parseDiscoverAIReply(raw);
            if (!reply) throw new Error("Could not parse AI resource search response");

            const allowedIds = new Set(candidateResources.map((resource) => resource.id));
            const resultIds = reply.resourceIds.filter((id) => allowedIds.has(id)).slice(0, 12);
            setAiResultIds(resultIds);
        } catch (err) {
            if (requestId !== aiSearchGen.current) return;
            console.error("Discover AI search error:", err);
            setAiResultIds(null);
        } finally {
            if (requestId === aiSearchGen.current) {
                setAiSearching(false);
                setSearchLoading(false);
            }
        }
    }, [commentsByNoteId, resources, searchTerm, selectedSubject, selectedTypes]);

    const handleSearchSubmit = useCallback(() => {
        const query = searchTerm.trim();
        if (searchDelayRef.current) {
            window.clearTimeout(searchDelayRef.current);
            searchDelayRef.current = null;
        }

        if (!query) {
            setSubmittedQuery(null);
            setAiResultIds(null);
            setSearchLoading(false);
            return;
        }

        setSearchLoading(true);
        setSubmittedQuery(query);

        if (aiSearchEnabled) {
            void handleAISearch();
            return;
        }

        setAiResultIds(null);
        searchDelayRef.current = window.setTimeout(() => {
            setSearchLoading(false);
            searchDelayRef.current = null;
        }, 320);
    }, [aiSearchEnabled, handleAISearch, searchTerm]);

    const handleAiSearchToggle = useCallback((event?: { preventDefault: () => void; stopPropagation: () => void }) => {
        event?.preventDefault();
        event?.stopPropagation();
        if (aiSearchEnabled || aiSearching) {
            clearAiSearch();
            return;
        }
        setAiSearchEnabled(true);
    }, [aiSearchEnabled, aiSearching, clearAiSearch]);

    const filteredResources = useMemo(() => {
        const selectedSubjectLabel = selectedSubject?.label.toLowerCase();
        const aiOrder = aiResultIds ? new Map(aiResultIds.map((id, index) => [id, index])) : null;
        const searchQuery = (submittedQuery ?? "").trim().toLowerCase();
        const searchTokens = tokenizeSearch(searchQuery);

        const scored = resources.flatMap((resource) => {
            const matchesSubject = selectedSubjectLabel
                ? resource.subject.toLowerCase() === selectedSubjectLabel ||
                  resource.tags.some((tag) => tag.toLowerCase() === selectedSubjectLabel)
                : true;
            const matchesType =
                selectedTypes.length === 0 ||
                (resource.types ?? [resource.type]).some((type) => selectedTypes.includes(type));
            if (!matchesSubject || !matchesType) return [];

            if (aiOrder) {
                if (!aiOrder.has(resource.id)) return [];
                return [{ resource, score: 0 }];
            }

            if (searchTokens.length === 0) return [{ resource, score: 0 }];

            const score = scoreDiscoverSearch(
                resource,
                searchTokens,
                searchQuery,
                commentsByNoteId[resource.id] ?? []
            );
            if (score <= 0) return [];
            return [{ resource, score }];
        });

        return scored
            .sort((a, b) => {
                if (aiOrder) return (aiOrder.get(a.resource.id) ?? 999) - (aiOrder.get(b.resource.id) ?? 999);
                if (searchTokens.length > 0 && b.score !== a.score) return b.score - a.score;
                if (sortBy === "rating") {
                    const ratingDiff = (b.resource.ratingAverage ?? 0) - (a.resource.ratingAverage ?? 0);
                    if (ratingDiff !== 0) return ratingDiff;
                    return (b.resource.ratingCount ?? 0) - (a.resource.ratingCount ?? 0);
                }
                return (b.resource.timestamp ?? 0) - (a.resource.timestamp ?? 0);
            })
            .map((entry) => entry.resource);
    }, [aiResultIds, commentsByNoteId, resources, submittedQuery, selectedSubject, selectedTypes, sortBy]);

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
        return (base.length > 0 ? base : filteredResources).slice(0, 5);
    }, [filteredResources, favouriteSubjectLabels, selectedSubject]);

    const recentResources = useMemo(
        () =>
            [...filteredResources]
                .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
                .slice(0, 5),
        [filteredResources]
    );

    const linkedQuestionResources = useMemo(() => {
        if (!linkedQuestion) return { exact: [] as DiscoverResource[], fallback: [] as DiscoverResource[] };
        const exact = filteredResources.filter(
            (resource) => resource.note?.linkedQuestionId === linkedQuestion.id
        );
        const subjectId = linkedQuestion.subjectId?.toLowerCase();
        const subjectLabel = linkedQuestion.subjectLabel?.toLowerCase();
        const fallback = filteredResources.filter((resource) => {
            if (resource.note?.linkedQuestionId === linkedQuestion.id) return false;
            return (
                (subjectId && resource.note?.subjectId?.toLowerCase() === subjectId) ||
                (subjectLabel && resource.subject.toLowerCase() === subjectLabel)
            );
        });
        return { exact: exact.slice(0, 12), fallback: fallback.slice(0, 12) };
    }, [filteredResources, linkedQuestion]);

    const relatedResources = useMemo(() => {
        if (!selectedResource) return [];
        const subject = selectedResource.subject.toLowerCase();
        const tags = new Set(selectedResource.tags.map((tag) => tag.toLowerCase()));
        const scored = resources
            .filter((resource) => resource.id !== selectedResource.id)
            .map((resource) => {
                let score = 0;
                if (resource.subject.toLowerCase() === subject) score += 3;
                score += resource.tags.filter((tag) => tags.has(tag.toLowerCase())).length;
                return { resource, score };
            })
            .filter((entry) => entry.score > 0)
            .sort((a, b) => b.score - a.score || (b.resource.timestamp ?? 0) - (a.resource.timestamp ?? 0))
            .map((entry) => entry.resource);
        if (scored.length > 0) return scored.slice(0, 12);
        return resources.filter((resource) => resource.id !== selectedResource.id).slice(0, 8);
    }, [resources, selectedResource]);

    const closeForm = () => {
        setShowForm(false);
        if (searchParams.get("share") === "1") {
            const next = new URLSearchParams(searchParams);
            next.delete("share");
            setSearchParams(next, { replace: true });
        }
    };

    const handleDelete = async (note: DiscoverNote) => {
        if (!user?.uid || deleting) return;
        const canDelete = isAdmin || note.userId === user.uid;
        if (!canDelete) return;
        setDeleting(true);
        try {
            await deleteDoc(doc(db, "discover-notes", note.id));
            if (isAdmin && note.userId && note.userId !== user.uid) {
                notifyPostOwner({
                    ownerId: note.userId,
                    actorId: user.uid,
                    type: "post-removed",
                    postId: note.id,
                    postTitle: note.title,
                });
            }
            const storagePaths = [note.uploadedThumbnailPath, note.thumbnailPath, note.pdfPath].filter(Boolean) as string[];
            await Promise.all(storagePaths.map((path) =>
                deleteObject(storageRef(storage, path)).catch((err) => {
                    console.warn("Failed to delete Discover upload:", err);
                })
            ));
            setShowDeleteConfirm(false);
            setSelectedResource(null);
        } catch (err) {
            console.error("Failed to delete note:", err);
        } finally {
            setDeleting(false);
        }
    };

    const handleVisit = async (url: string | undefined, resource?: DiscoverResource) => {
        let target = url?.trim() || "";
        if (!target && resource?.pdfPath) {
            try {
                target = await getDownloadURL(storageRef(storage, resource.pdfPath));
            } catch (err) {
                console.error("Failed to open PDF:", err);
                return;
            }
        }
        if (!target) return;
        try {
            window.open(target, "_blank", "noopener,noreferrer");
        } catch (err) {
            console.error("Failed to open link:", err);
        }
    };

    const handleSave = async (resource: DiscoverResource) => {
        if (!user?.uid || !resource.note || saveSubmitting) return;
        const likeRef = doc(db, "discover-notes", resource.id, "likes", user.uid);
        const savedRef = doc(db, "user-data", user.uid, "saved-discover", resource.id);
        const resourceRef = doc(db, "discover-notes", resource.id);
        const currentlySaved = userSaved;
        const nextSaved = !currentlySaved;
        const nextSaves = Math.max(0, (resource.saves ?? 0) + (nextSaved ? 1 : -1));

        setSaveSubmitting(true);
        setUserSaved(nextSaved);
        setSelectedResource((current) =>
            current && current.id === resource.id ? { ...current, saves: nextSaves } : current
        );

        try {
            if (currentlySaved) {
                await deleteDoc(savedRef);
                try {
                    await deleteDoc(likeRef);
                    await updateDoc(resourceRef, { likeCount: increment(-1) });
                } catch {
                    // Public like count can be blocked by rules; the personal save still updated.
                }
            } else {
                await setDoc(savedRef, {
                    resourceId: resource.id,
                    title: resource.title,
                    websiteUrl: resource.websiteUrl ?? "",
                    thumbnailUrl: resource.thumbnailUrl ?? "",
                    timestamp: serverTimestamp(),
                });
                try {
                    await setDoc(likeRef, {
                        userId: user.uid,
                        timestamp: serverTimestamp(),
                    });
                    await updateDoc(resourceRef, { likeCount: increment(1) });
                } catch {
                    // Public like count can be blocked by rules; the personal save still updated.
                }
            }
        } catch (error) {
            console.error("Failed to save resource:", error);
            setUserSaved(currentlySaved);
            setSelectedResource((current) =>
                current && current.id === resource.id ? { ...current, saves: resource.saves } : current
            );
        } finally {
            setSaveSubmitting(false);
        }
    };

    const handleRate = async (value: number) => {
        if (!user?.uid || !selectedResource?.note || ratingSubmitting) return;
        const previousRating = userRating;
        setUserRating(value);
        setRatingSubmitting(true);
        const ratingRef = doc(db, "discover-notes", selectedResource.id, "ratings", user.uid);
        const resourceRef = doc(db, "discover-notes", selectedResource.id);
        try {
            let isNewRating = false;
            await runTransaction(db, async (transaction) => {
                const resourceSnap = await transaction.get(resourceRef);
                const ratingSnap = await transaction.get(ratingRef);
                const data = resourceSnap.data() as DiscoverNote | undefined;
                const currentAverage = data?.ratingAverage ?? 0;
                const currentCount = data?.ratingCount ?? 0;
                const previousValue = ratingSnap.exists() ? ratingSnap.data()?.value : null;
                isNewRating = typeof previousValue !== "number";
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
            if (isNewRating) {
                notifyPostOwner({
                    ownerId: selectedResource.userId,
                    actorId: user.uid,
                    type: "post-rating",
                    postId: selectedResource.id,
                    postTitle: selectedResource.title,
                });
            }
        } catch (error) {
            console.error("Failed to rate resource:", error);
            setUserRating(previousRating);
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
            notifyPostOwner({
                ownerId: selectedResource.userId,
                actorId: user.uid,
                type: "post-comment",
                postId: selectedResource.id,
                postTitle: selectedResource.title,
            });
            setCommentText("");
            setCommentComposerOpen(false);
        } catch (error) {
            console.error("Failed to comment:", error);
        } finally {
            setCommentSubmitting(false);
        }
    };

    const cancelComment = () => {
        setCommentText("");
        setCommentComposerOpen(false);
        commentInputRef.current?.blur();
    };

    const chooseSubject = (subjectId: string) => {
        setSelectedSubjectId((current) => (current === subjectId ? null : subjectId));
    };

    const renderResourceCard = (resource: DiscoverResource) => {
        const rating = resource.ratingAverage && resource.ratingAverage > 0 ? resource.ratingAverage : null;
        const username = resource.username || "Unknown";

        return (
            <article
                key={resource.id}
                className="group relative flex flex-col cursor-pointer p-2 hover:z-10"
                onClick={() => setSelectedResource(resource)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedResource(resource);
                    }
                }}
                role="button"
                tabIndex={0}
            >
                <div
                    className="absolute inset-0 rounded-xl color-bg-grey-5 pointer-events-none opacity-60 scale-100 group-hover:opacity-100 group-hover:scale-[1.015]"
                    style={{ transition: "scale 150ms ease-out, opacity 150ms ease-out, transform 150ms ease-out" }}
                    aria-hidden
                />
                <div className="relative z-10 flex flex-col">
                    <div className="relative aspect-[16/10] rounded-lg color-bg-grey-10 overflow-hidden">
                        <DiscoverMediaPreview resource={resource} variant="thumb" />
                        <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full color-bg color-txt-main text-xs font-bold">
                            {resource.resourceSource === "pdf" ? "PDF" : resource.type}
                        </span>
                    </div>

                    <div className="flex items-center gap-2 min-w-0 px-0.5 pt-2">
                        {resource.userId ? (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/viewProfile/${resource.userId}`);
                                }}
                                className="shrink-0 cursor-pointer"
                            >
                                {resource.userPicture ? (
                                    <img
                                        src={resource.userPicture}
                                        alt=""
                                        className="w-8 h-8 rounded-full object-cover"
                                    />
                                ) : (
                                    <div className="w-8 h-8 rounded-full color-bg-grey-10" />
                                )}
                            </button>
                        ) : (
                            <div className="w-8 h-8 rounded-full color-bg-grey-10 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="text-[11px] color-txt-sub truncate">
                                    {resource.userId ? username : resource.sourceName}
                                </span>
                                {resource.timestamp ? (
                                    <span className="text-[11px] color-txt-sub shrink-0">
                                        {timeAgo(resource.timestamp)}
                                    </span>
                                ) : null}
                                {rating && (
                                    <span className="inline-flex items-center gap-0.5 shrink-0 ml-auto text-xs font-semibold color-txt-sub">
                                        <LuStar size={12} fill="currentColor" className="color-txt-accent" />
                                        {rating.toFixed(1)}
                                        {resource.ratingCount ? ` (${resource.ratingCount})` : ""}
                                    </span>
                                )}
                            </div>
                            <h3 className="text-sm font-bold color-txt-main truncate">
                                {resource.title}
                            </h3>
                        </div>
                    </div>

                    {resource.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 px-0.5 pt-1.5">
                            {resource.tags.slice(0, 3).map((tag) => (
                                <span
                                    key={`${resource.id}-${tag}`}
                                    className="px-2 py-0.5 rounded-full color-bg text-[11px] font-semibold color-txt-sub"
                                >
                                    {tag}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </article>
        );
    };

    const renderSearchSkeleton = () => (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            {[...Array(5)].map((_, i) => (
                <div key={i} className="rounded-xl color-bg-grey-5 overflow-hidden animate-pulse">
                    <div className="aspect-[16/10] w-full color-bg-grey-10" />
                    <div className="px-2.5 py-2 space-y-1.5">
                        <div className="h-3.5 w-3/4 rounded color-bg-grey-10" />
                        <div className="h-3 w-1/2 rounded color-bg-grey-10" />
                        <div className="h-3 w-2/3 rounded color-bg-grey-10" />
                    </div>
                </div>
            ))}
        </div>
    );

    const renderResourceSection = (title: string, sectionResources: DiscoverResource[]) => (
        <section className="space-y-3">
            <h2 className="text-lg font-bold color-txt-main">{title}</h2>

            {sectionResources.length === 0 ? (
                <div className="rounded-2xl color-bg-grey-5 p-8 text-center space-y-3">
                    <div className="mx-auto w-12 h-12 rounded-full color-bg-accent flex items-center justify-center color-txt-accent">
                        <LuSearch size={22} />
                    </div>
                    <h3 className="text-lg font-semibold color-txt-main">No matches yet</h3>
                </div>
            ) : (
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                    {sectionResources.map(renderResourceCard)}
                </div>
            )}
        </section>
    );

    const visibleQuestionPosts = linkedQuestion
        ? questionPosts.filter((post) => post.questionId === linkedQuestion.id)
        : questionPosts;

    const renderResourceDetailPage = (resource: DiscoverResource) => {
        const username = resource.username || "Unknown";
        const canOpenResource = Boolean(resource.websiteUrl?.trim() || resource.pdfPath);
        const ownsResource = Boolean(user?.uid && resource.userId === user.uid);
        const linkedQuestionName = resource.note?.linkedQuestionName?.trim() || "";
        const linkedQuestionUrl = resource.note?.linkedQuestionPracticeUrl?.trim() || "";
        const commentCount = comments.length;
        const composerActive = commentComposerOpen || Boolean(commentText);

        return (
            <div className="w-full px-6 pt-4 pb-6 space-y-5">
                <div className="flex items-center justify-between gap-3">
                    <button
                        type="button"
                        onClick={() => setSelectedResource(null)}
                        className="inline-flex items-center gap-2 text-sm font-semibold color-txt-sub hover:color-txt-main cursor-pointer"
                    >
                        <LuArrowLeft size={16} />
                        Discover
                    </button>
                    {ownsResource && (
                        <button
                            type="button"
                            onClick={() => setShowDeleteConfirm(true)}
                            className="inline-flex items-center justify-center rounded-xl color-bg-grey-5 p-2 color-txt-sub hover:color-bg-accent hover:color-txt-accent cursor-pointer"
                            aria-label="Delete resource"
                        >
                            <LuTrash size={16} />
                        </button>
                    )}
                </div>

                <div className="relative">
                    <div className="space-y-4 lg:pr-[23.5rem] xl:pr-[27.5rem]">
                        <div className="relative min-h-[240px] h-[min(68vh,42rem)] rounded-2xl color-bg-grey-10 overflow-hidden">
                            <DiscoverMediaPreview key={resource.id} resource={resource} variant="hero" />
                            {canOpenResource && (
                                <button
                                    type="button"
                                    onClick={() => void handleVisit(resource.websiteUrl, resource)}
                                    className="absolute top-3 right-3 z-20 inline-flex items-center gap-2 rounded-xl color-bg color-txt-accent px-4 py-2 text-sm font-semibold shadow-md hover:opacity-90 cursor-pointer"
                                >
                                    <LuExternalLink size={15} />
                                    Open Resource
                                </button>
                            )}
                        </div>

                        <div className="flex items-start gap-2 min-w-0">
                            {resource.userId ? (
                                <button
                                    type="button"
                                    onClick={() => navigate(`/viewProfile/${resource.userId}`)}
                                    className="shrink-0 cursor-pointer"
                                >
                                    {resource.userPicture ? (
                                        <img
                                            src={resource.userPicture}
                                            alt=""
                                            className="w-8 h-8 rounded-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-8 h-8 rounded-full color-bg-grey-10" />
                                    )}
                                </button>
                            ) : (
                                <div className="w-8 h-8 rounded-full color-bg-grey-10 shrink-0" />
                            )}
                            <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-[11px] color-txt-sub truncate">
                                        {resource.userId ? username : resource.sourceName}
                                    </span>
                                    {resource.timestamp ? (
                                        <span className="text-[11px] color-txt-sub shrink-0">
                                            {timeAgo(resource.timestamp)}
                                        </span>
                                    ) : null}
                                </div>
                                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                    <h1 className="text-xl sm:text-2xl font-bold color-txt-main leading-snug">
                                        {resource.title}
                                    </h1>
                                    {linkedQuestionName && linkedQuestionUrl && (
                                        <button
                                            type="button"
                                            onClick={() => navigate(linkedQuestionUrl)}
                                            className="inline-flex items-center gap-1.5 max-w-full rounded-xl color-bg-accent color-txt-accent px-2.5 py-1 text-sm font-semibold cursor-pointer hover:opacity-90"
                                        >
                                            <LuArrowUpRight size={15} className="shrink-0" />
                                            <span className="truncate">{linkedQuestionName}</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 ml-auto pl-2">
                                <div className="flex items-center gap-0.5">
                                    {[1, 2, 3, 4, 5].map((value) => (
                                        <button
                                            type="button"
                                            key={value}
                                            onClick={() => handleRate(value)}
                                            className={`cursor-pointer ${
                                                (userRating ?? 0) >= value ? "color-txt-accent" : "color-txt-sub"
                                            }`}
                                            aria-label={`Rate ${value} stars`}
                                        >
                                            <LuStar
                                                size={18}
                                                fill={(userRating ?? 0) >= value ? "currentColor" : "none"}
                                            />
                                        </button>
                                    ))}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => void handleSave(resource)}
                                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer hover:opacity-90 ${
                                        userSaved
                                            ? "color-bg-accent color-txt-accent"
                                            : "color-bg-grey-5 color-txt-main"
                                    }`}
                                >
                                    <LuBookmark size={15} fill={userSaved ? "currentColor" : "none"} />
                                    {userSaved ? "Saved" : "Save"} · {resource.saves}
                                </button>
                            </div>
                        </div>

                        {resource.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                                {resource.tags.map((tag) => (
                                    <span
                                        key={`${resource.id}-detail-${tag}`}
                                        className="px-2 py-0.5 rounded-full color-bg-grey-5 text-[11px] font-semibold color-txt-sub"
                                    >
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        )}

                        {resource.description && (
                            <p className="text-sm color-txt-main whitespace-pre-wrap">{resource.description}</p>
                        )}

                        {relatedResources.length > 0 && (
                            <section className="space-y-3">
                                <h2 className="text-lg font-bold color-txt-main">Related</h2>
                                <div className="flex gap-3 overflow-x-auto scrollbar-minimal pb-1">
                                    {relatedResources.map((related) => (
                                        <button
                                            type="button"
                                            key={related.id}
                                            onClick={() => setSelectedResource(related)}
                                            className="shrink-0 w-52 text-left cursor-pointer"
                                        >
                                            <div className="aspect-[16/10] rounded-xl color-bg-grey-10 overflow-hidden mb-2">
                                                <DiscoverMediaPreview resource={related} variant="thumb" />
                                            </div>
                                            <p className="text-sm font-bold color-txt-main truncate">{related.title}</p>
                                            <p className="text-[11px] color-txt-sub truncate">{related.subject}</p>
                                        </button>
                                    ))}
                                </div>
                            </section>
                        )}
                    </div>

                    <aside className="w-full mt-6 lg:mt-0 lg:absolute lg:inset-y-0 lg:right-0 lg:w-[22rem] xl:w-[26rem] flex flex-col min-h-0 max-h-[28rem] lg:max-h-none overflow-hidden">
                        <h3 className="shrink-0 text-base font-bold color-txt-main pb-4">
                            {commentCount} {commentCount === 1 ? "Comment" : "Comments"}
                        </h3>
                        <div className="flex items-start gap-3 shrink-0 pb-4">
                            {user?.picture ? (
                                <img
                                    src={user.picture}
                                    alt=""
                                    className="w-8 h-8 rounded-full object-cover shrink-0"
                                />
                            ) : (
                                <div className="w-8 h-8 rounded-full color-bg-grey-10 shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                                <input
                                    ref={commentInputRef}
                                    type="text"
                                    value={commentText}
                                    onFocus={() => setCommentComposerOpen(true)}
                                    onChange={(e) => setCommentText(e.target.value.slice(0, MAX_COMMENT))}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault();
                                            void handleAddComment();
                                        }
                                        if (e.key === "Escape") cancelComment();
                                    }}
                                    placeholder={user?.uid ? "Add a comment..." : "Log in to comment"}
                                    disabled={!user?.uid || !resource.note}
                                    maxLength={MAX_COMMENT}
                                    className="w-full bg-transparent color-txt-main text-sm outline-none border-0 border-b border-color-border pb-1.5 placeholder:color-txt-sub disabled:opacity-60"
                                />
                                {composerActive && (
                                    <div className="flex items-center justify-end gap-2 pt-2">
                                        <span className="mr-auto text-xs color-txt-sub">
                                            {commentText.length}/{MAX_COMMENT}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={cancelComment}
                                            className="px-3 py-1.5 rounded-full text-sm font-semibold color-txt-sub hover:color-txt-main cursor-pointer"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void handleAddComment()}
                                            disabled={commentSubmitting || !commentText.trim() || !resource.note}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full color-bg-accent color-txt-accent text-sm font-semibold hover:opacity-90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {commentSubmitting && <LuLoader size={14} className="animate-spin" />}
                                            Send
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-minimal space-y-4 pr-1">
                            {commentCount === 0 ? (
                                <p className="text-sm color-txt-sub">
                                    No comments yet. Add context for the next student.
                                </p>
                            ) : (
                                comments.map((comment) => (
                                    <div key={comment.id} className="flex items-start gap-3">
                                        {comment.userId ? (
                                            <button
                                                type="button"
                                                onClick={() => navigate(`/viewProfile/${comment.userId}`)}
                                                className="shrink-0 cursor-pointer mt-0.5"
                                            >
                                                {comment.userPicture ? (
                                                    <img
                                                        src={comment.userPicture}
                                                        alt=""
                                                        className="w-8 h-8 rounded-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="w-8 h-8 rounded-full color-bg-grey-10" />
                                                )}
                                            </button>
                                        ) : comment.userPicture ? (
                                            <img
                                                src={comment.userPicture}
                                                alt=""
                                                className="w-8 h-8 rounded-full object-cover shrink-0"
                                            />
                                        ) : (
                                            <div className="w-8 h-8 rounded-full color-bg-grey-10 shrink-0" />
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className="text-xs font-bold color-txt-main truncate">
                                                    {comment.username || "Unknown"}
                                                </span>
                                                <span className="text-xs color-txt-sub shrink-0">
                                                    {comment.timestamp ? timeAgo(comment.timestamp) : ""}
                                                </span>
                                            </div>
                                            <p className="text-sm color-txt-main whitespace-pre-wrap pt-0.5">
                                                {comment.text}
                                            </p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </aside>
                </div>

                {showDeleteConfirm && resource.note && (
                    <div
                        className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                        onClick={() => !deleting && setShowDeleteConfirm(false)}
                    >
                        <div
                            className="w-full max-w-sm rounded-2xl color-bg p-6 space-y-4 shadow-md"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h3 className="text-lg font-bold color-txt-main text-center">Are you sure?</h3>
                            <p className="text-sm color-txt-sub text-center">
                                This will permanently delete this resource.
                            </p>
                            <div className="flex justify-center gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={() => setShowDeleteConfirm(false)}
                                    disabled={deleting}
                                    className="px-4 py-2 rounded-xl text-sm color-txt-sub hover:color-txt-main cursor-pointer disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void handleDelete(resource.note!)}
                                    disabled={deleting}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold color-bg-accent color-txt-accent cursor-pointer disabled:opacity-50"
                                >
                                    {deleting && <LuLoader size={14} className="animate-spin" />}
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="flex w-full h-full color-bg overflow-hidden">
            <main ref={pageScrollRef} className="flex-1 min-w-0 h-full overflow-y-auto scrollbar-minimal">
            {selectedResource ? renderResourceDetailPage(selectedResource) : (
            <div className="w-full px-6 pt-4 pb-6 space-y-4">
                <div className="space-y-5">
                <div className="relative flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                    <div ref={pageMenuRef} className="relative z-10 min-w-0 pointer-events-none">
                        <h1 className="text-3xl sm:text-4xl font-black leading-none color-txt-main">
                            <button
                                type="button"
                                onClick={() => setPageMenuOpen((open) => !open)}
                                aria-expanded={pageMenuOpen}
                                aria-haspopup="listbox"
                                aria-label="Switch community page"
                                className="inline-flex items-center gap-2 cursor-pointer pointer-events-auto"
                            >
                                Discover
                                <LuChevronDown
                                    size={22}
                                    className={`color-txt-sub transition-transform duration-200 ${pageMenuOpen ? "rotate-180" : ""}`}
                                />
                            </button>
                        </h1>
                        {pageMenuOpen && (
                            <div
                                role="listbox"
                                className="absolute left-0 top-full mt-2 z-20 min-w-[12rem] rounded-xl color-bg shadow-md border border-color-border p-1.5 flex flex-col gap-1 pointer-events-auto"
                            >
                                <button
                                    type="button"
                                    role="option"
                                    aria-selected
                                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg color-bg-accent color-txt-accent text-sm font-semibold cursor-pointer"
                                    onClick={() => setPageMenuOpen(false)}
                                >
                                    <LuSearch size={15} />
                                    Discover
                                </button>
                                <button
                                    type="button"
                                    role="option"
                                    aria-selected={false}
                                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg color-txt-sub hover:color-txt-main hover:color-bg-grey-5 text-sm font-semibold cursor-pointer"
                                    onClick={() => {
                                        setPageMenuOpen(false);
                                        navigate("/social/social");
                                    }}
                                >
                                    <LuUsers size={15} />
                                    Discussion
                                </button>
                            </div>
                        )}
                    </div>
                    <div
                        className={`relative z-20 w-full max-w-xl order-last md:order-none md:absolute md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[min(32rem,calc(100%-28rem))] flex items-center gap-1.5 rounded-full px-3.5 py-1.5 border-2 ${
                            searchFocused ? "color-shadow-accent" : "color-shadow"
                        }`}
                    >
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                handleSearchSubmit();
                            }}
                            className="relative min-w-0 flex-1 flex items-center"
                        >
                            <div className="relative min-w-0 flex-1 overflow-hidden">
                                <input
                                    ref={searchInputRef}
                                    type="search"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    onFocus={() => setSearchFocused(true)}
                                    onBlur={() => setSearchFocused(false)}
                                    placeholder="Find your next hidden gem..."
                                    disabled={aiSearching}
                                    className={`min-w-0 w-full bg-transparent outline-none text-sm [&::-webkit-search-cancel-button]:hidden ${
                                        aiSearching
                                            ? "text-transparent caret-transparent placeholder:text-transparent"
                                            : "color-txt-main placeholder:color-txt-sub"
                                    }`}
                                    aria-label="Find your next hidden gem"
                                />
                                {aiSearching && (
                                    <div
                                        className="absolute inset-0 overflow-hidden pointer-events-none flex items-center"
                                        aria-live="polite"
                                    >
                                        <span
                                            className="block w-full truncate text-sm color-txt-main"
                                            style={{
                                                transform:
                                                    aiOverlay.phase === "out"
                                                        ? "translateY(-110%)"
                                                        : aiOverlay.phase === "enter"
                                                          ? "translateY(110%)"
                                                          : "translateY(0)",
                                                opacity: aiOverlay.phase === "in" ? 1 : 0,
                                                transition:
                                                    aiOverlay.phase === "enter"
                                                        ? "none"
                                                        : "transform 320ms ease, opacity 320ms ease",
                                            }}
                                        >
                                            {aiOverlay.text}
                                        </span>
                                    </div>
                                )}
                            </div>
                            {(submittedQuery || searchTerm) && !aiSearching && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSearchTerm("");
                                        setSubmittedQuery(null);
                                        setAiResultIds(null);
                                        setSearchLoading(false);
                                    }}
                                    className="ml-1 color-txt-sub hover:color-txt-main cursor-pointer"
                                    aria-label="Clear search"
                                >
                                    <LuX size={17} />
                                </button>
                            )}
                        </form>
                        <button
                            type="button"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                            }}
                            onClick={handleAiSearchToggle}
                            aria-pressed={aiSearchEnabled || aiSearching}
                            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold whitespace-nowrap cursor-pointer transition-all duration-150 ${
                                aiSearchEnabled || aiSearching
                                    ? "shadow-sm"
                                    : "color-bg-grey-5 color-txt-sub hover:color-txt-main"
                            }`}
                            style={
                                aiSearchEnabled || aiSearching
                                    ? { backgroundColor: "var(--theme-txt-accent)", color: "var(--paper-card-fade)" }
                                    : undefined
                            }
                        >
                            AI Search
                        </button>
                        <button
                            type="button"
                            disabled={aiSearching}
                            onClick={() => handleSearchSubmit()}
                            className="shrink-0 rounded-full p-1.5 color-txt-accent cursor-pointer hover:color-bg-accent disabled:opacity-40 disabled:cursor-default disabled:hover:bg-transparent"
                            aria-label="Search Discover resources"
                        >
                            {aiSearching ? (
                                <LuLoader size={18} className="animate-spin" />
                            ) : (
                                <LuSearch size={18} />
                            )}
                        </button>
                    </div>
                    <div className="relative z-10 flex items-center gap-3 pointer-events-none">
                        <button
                            type="button"
                            onClick={() => setShowForm(true)}
                            className="pointer-events-auto inline-flex items-center gap-2 px-5 py-2.5 rounded-xl color-bg-accent color-txt-accent font-semibold text-sm hover:opacity-90 transition-opacity cursor-pointer"
                        >
                            <LuPlus size={16} />
                            Share resource
                        </button>
                        <div className="pointer-events-auto">
                            <NotificationBell />
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="flex items-center gap-2 overflow-x-auto scrollbar-minimal min-w-0">
                            {subjectChips.length === 0 ? (
                                <span className="text-sm color-txt-sub whitespace-nowrap">
                                    Pick subjects to personalise recommendations.
                                </span>
                            ) : (
                                subjectChips.map((subject) => (
                                    <button
                                        type="button"
                                        key={subject.id}
                                        onClick={() => chooseSubject(subject.id)}
                                        className={`shrink-0 px-3 py-1.5 rounded-md text-sm font-semibold cursor-pointer ${
                                            selectedSubjectId === subject.id
                                                ? "color-bg-accent color-txt-accent"
                                                : "color-bg-grey-5 color-txt-main hover:opacity-90"
                                        }`}
                                    >
                                        {subject.label}
                                    </button>
                                ))
                            )}
                        </div>
                        <SubjectDropdown
                            id="discover-subject"
                            value={selectedSubjectId}
                            onChange={setSelectedSubjectId}
                            onFavouritesChange={setFavouriteSubjectIds}
                            aria-label="View all subjects"
                            dropdownAlign="start"
                            renderTrigger={({ open, onToggle }) => (
                                <button
                                    type="button"
                                    onClick={onToggle}
                                    aria-expanded={open}
                                    aria-haspopup="listbox"
                                    className="shrink-0 inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-sm font-semibold color-txt-sub hover:color-txt-main hover:color-bg-grey-5 transition-colors cursor-pointer whitespace-nowrap"
                                >
                                    View all
                                    <LuArrowRight size={14} />
                                </button>
                            )}
                        />
                    </div>
                    <button
                        ref={filtersButtonRef}
                        type="button"
                        onClick={() => setShowFilters((open) => !open)}
                        className="shrink-0 inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-semibold color-bg-grey-5 color-txt-main cursor-pointer hover:opacity-90"
                    >
                        <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            aria-hidden
                        >
                            <line x1="3" y1="8" x2="21" y2="8" />
                            <circle cx="8" cy="8" r="2.25" fill="currentColor" />
                            <line x1="3" y1="16" x2="21" y2="16" />
                            <circle cx="16" cy="16" r="2.25" fill="currentColor" />
                        </svg>
                        Filters
                    </button>
                </div>
                </div>

                {submittedToast && (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm color-txt-main">
                        Thanks for sharing. Your resource has been sent to our team for moderation and will appear after approval.
                    </div>
                )}

                {linkedQuestion && (
                    <section className="rounded-3xl color-bg-grey-5 p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="min-w-0">
                            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide color-txt-sub">
                                <LuLink size={14} /> Discovering for this question
                            </p>
                            <h2 className="mt-1 text-lg font-bold color-txt-main truncate">{linkedQuestion.name}</h2>
                            <p className="text-sm color-txt-sub">
                                {[linkedQuestion.subjectLabel, linkedQuestion.level, linkedQuestion.topic].filter(Boolean).join(" · ")}
                            </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                            {linkedQuestion.practiceUrl && (
                                <button
                                    type="button"
                                    onClick={() => navigate(linkedQuestion.practiceUrl!)}
                                    className="inline-flex items-center gap-2 rounded-xl color-bg px-4 py-2 text-sm font-bold color-txt-main cursor-pointer"
                                >
                                    <LuBookOpen size={15} /> Open question
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setShowForm(true)}
                                className="inline-flex items-center gap-2 rounded-xl color-bg-accent color-txt-accent px-4 py-2 text-sm font-bold cursor-pointer"
                            >
                                <LuPlus size={15} /> Link a resource
                            </button>
                        </div>
                    </section>
                )}

                {visibleQuestionPosts.length > 0 && !submittedQuery && !searchLoading && !aiSearching && aiResultIds === null && (
                    <section className="space-y-3">
                        <div>
                            <h2 className="text-lg font-bold color-txt-main">
                                {linkedQuestion ? "Question discussion" : "Questions from Practice & Whiteboards"}
                            </h2>
                            <p className="text-sm color-txt-sub">
                                Open a shared question directly in Practice Hub, then join its Discussion or Discover resources.
                            </p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {visibleQuestionPosts.map((post) => (
                                <button
                                    type="button"
                                    key={post.id}
                                    onClick={() => navigate(post.practiceUrl)}
                                    className="group rounded-2xl color-bg-grey-5 p-4 text-left hover:shadow-md transition-shadow cursor-pointer"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <span className="inline-flex items-center gap-1.5 rounded-full color-bg-accent color-txt-accent px-2.5 py-1 text-[11px] font-bold">
                                            <LuBookOpen size={12} /> {post.sourceContext === "whiteboard" ? "From Whiteboard" : "From Practice"}
                                        </span>
                                        <LuArrowRight size={16} className="color-txt-sub transition-transform group-hover:translate-x-0.5" />
                                    </div>
                                    <h3 className="mt-3 line-clamp-2 text-base font-bold color-txt-main">{post.questionName}</h3>
                                    <p className="mt-1 text-xs color-txt-sub">
                                        {[post.subjectLabel, post.level, post.topic].filter(Boolean).join(" · ") || "Practice question"}
                                    </p>
                                    {post.content && <p className="mt-3 line-clamp-2 text-sm color-txt-sub">“{post.content}”</p>}
                                    <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold color-txt-accent">
                                        Go to question in Practice Hub <LuExternalLink size={12} />
                                    </span>
                                </button>
                            ))}
                        </div>
                    </section>
                )}

                {loading || searchLoading || aiSearching ? (
                    renderSearchSkeleton()
                ) : (
                    <div className="space-y-8">
                        {aiResultIds !== null ? (
                            renderResourceSection(
                                "AI search results",
                                filteredResources
                            )
                        ) : submittedQuery ? (
                            renderResourceSection(
                                "Search results",
                                filteredResources
                            )
                        ) : (
                            <>
                                {linkedQuestion && renderResourceSection(
                                    linkedQuestionResources.exact.length
                                        ? "Linked to this question"
                                        : `More ${linkedQuestion.subjectLabel ?? "subject"} content`,
                                    linkedQuestionResources.exact.length
                                        ? linkedQuestionResources.exact
                                        : linkedQuestionResources.fallback
                                )}
                                {!linkedQuestion && renderResourceSection(
                                    selectedSubject ? `${selectedSubject.label} resources` : "Recommended for you",
                                    recommendedResources
                                )}
                                {renderResourceSection(
                                    "Recently added free resources",
                                    recentResources
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
            )}
            </main>

            <DiscoverFiltersModal
                open={showFilters}
                onClose={() => setShowFilters(false)}
                anchorRef={filtersButtonRef}
                selectedTypes={selectedTypes}
                onSelectedTypesChange={setSelectedTypes}
                sortBy={sortBy}
                onSortByChange={setSortBy}
                resourceTypes={RESOURCE_TYPES}
            />

            {showForm && (
                <DiscoverShareModal
                    open={showForm}
                    onClose={closeForm}
                    onSubmitted={() => {
                        setSubmittedToast(true);
                        setTimeout(() => setSubmittedToast(false), 2800);
                    }}
                    linkedQuestion={linkedQuestion}
                />
            )}

            {videoResource?.websiteUrl && !selectedResource && (
                <VideoEmbedModal
                    url={videoResource.websiteUrl}
                    title={videoResource.title}
                    onClose={() => setVideoResource(null)}
                />
            )}
        </div>
    );
}
