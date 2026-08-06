import { useContext, useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
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
import {
  LuBookmark,
  LuBookOpen,
  LuCirclePlay,
  LuCompass,
  LuExternalLink,
  LuFileText,
  LuLayers,
  LuLink,
  LuLoader,
  LuMessageCircle,
  LuPlus,
  LuSearch,
  LuX,
} from "react-icons/lu";
import { db } from "../../../firebase";
import { UserContext } from "../../context/UserContext";
import VideoEmbedModal from "../discover/VideoEmbedModal";
import { isDiscoverVideoUrl } from "../../lib/discoverMedia";
import {
  getQuestionDiscoveryContext,
  type QuestionDiscoveryContext,
} from "../../lib/questionDiscovery";

type ResourceType = "Notes" | "Videos" | "Sample Answers" | "Flashcards" | "Website" | "Other";
type ResourceLevel = "Higher" | "Ordinary" | "Foundation";
type ResourceSource = "website" | "pdf";

const MAX_COMMENT = 500;
const MAX_TITLE = 80;
const MAX_DESCRIPTION = 500;
const LINK_PREVIEW_URL = "https://us-central1-certchamps-a7527.cloudfunctions.net/fetchLinkPreview";
const RESOURCE_TYPES: ResourceType[] = ["Notes", "Videos", "Sample Answers", "Flashcards", "Website", "Other"];
const RESOURCE_LEVELS: ResourceLevel[] = ["Higher", "Ordinary", "Foundation"];

function normaliseUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProtocol);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function displayHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

type DiscoverNote = {
  id: string;
  userId: string;
  username: string;
  userPicture: string | null;
  title: string;
  description: string;
  websiteUrl: string;
  resourceSource?: ResourceSource;
  thumbnailUrl: string;
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
  moderationStatus?: string;
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
  resourceSource?: ResourceSource;
  thumbnailUrl?: string;
  userId?: string;
  username?: string;
  userPicture?: string | null;
  timestamp?: number | null;
  note?: DiscoverNote;
};

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
  return [...new Set([...fromArray, ...(fallbackType ? [fallbackType] : [])])];
}

function normalizeResourceLevels(values: unknown, fallback?: unknown): ResourceLevel[] {
  const isLevel = (value: unknown): value is ResourceLevel =>
    typeof value === "string" && RESOURCE_LEVELS.includes(value as ResourceLevel);
  const fromArray = Array.isArray(values) ? values.filter(isLevel) : [];
  return [...new Set([...fromArray, ...(isLevel(fallback) ? [fallback] : [])])];
}

function inferResourceType(note: DiscoverNote): ResourceType {
  const text = `${note.title} ${note.description}`.toLowerCase();
  if (text.includes("video") || text.includes("youtube")) return "Videos";
  if (text.includes("sample") || text.includes("answer") || text.includes("essay")) return "Sample Answers";
  if (text.includes("flashcard") || text.includes("quizlet")) return "Flashcards";
  if (text.includes("website") || text.includes("site")) return "Website";
  return "Notes";
}

function noteToResource(note: DiscoverNote): DiscoverResource {
  const types = normalizeResourceTypes(note.resourceTypes, note.resourceType);
  const type = types[0] ?? inferResourceType(note);
  const levels = normalizeResourceLevels(note.levels, note.level);
  const subject = note.subjectLabel ?? "General";
  return {
    id: note.id,
    title: note.title,
    subject,
    type,
    description: note.description,
    sourceName: note.siteName || (note.websiteUrl ? displayHostname(note.websiteUrl) : "Resource"),
    tags: [subject, ...levels, ...(note.topics ?? [])].filter(Boolean),
    comments: note.commentCount ?? 0,
    saves: note.likeCount ?? 0,
    levels,
    types: types.length > 0 ? types : [type],
    faviconUrl: note.faviconUrl,
    ratingAverage: note.ratingAverage ?? 0,
    ratingCount: note.ratingCount ?? 0,
    websiteUrl: note.websiteUrl,
    resourceSource: note.resourceSource ?? "website",
    thumbnailUrl: note.thumbnailUrl,
    userId: note.userId,
    username: note.username,
    userPicture: note.userPicture,
    timestamp: note.timestamp,
    note,
  };
}

export default function QuestionDiscover({ question }: { question?: unknown }) {
  const { user } = useContext(UserContext);
  const context = useMemo(() => getQuestionDiscoveryContext(question), [question]);
  const [notes, setNotes] = useState<DiscoverNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedResource, setSelectedResource] = useState<DiscoverResource | null>(null);
  const [videoResource, setVideoResource] = useState<DiscoverResource | null>(null);
  const [comments, setComments] = useState<DiscoverComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [userRating, setUserRating] = useState<number | null>(null);
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [showShareForm, setShowShareForm] = useState(false);
  const [shareTitle, setShareTitle] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [shareDescription, setShareDescription] = useState("");
  const [shareType, setShareType] = useState<ResourceType>("Notes");
  const [shareSubmitting, setShareSubmitting] = useState(false);
  const [shareError, setShareError] = useState("");
  const [shareToast, setShareToast] = useState(false);

  useEffect(() => {
    const resourcesQuery = query(
      collection(db, "discover-notes"),
      orderBy("timestamp", "desc"),
      limit(100)
    );
    return onSnapshot(
      resourcesQuery,
      (snapshot) => {
        setNotes(
          snapshot.docs.map((row) => {
            const data = row.data();
            return {
              id: row.id,
              userId: data.userId ?? "",
              username: data.username ?? "Unknown",
              userPicture: data.userPicture ?? null,
              title: data.title ?? "Untitled resource",
              description: data.description ?? "",
              websiteUrl: data.websiteUrl ?? "",
              resourceSource: data.resourceSource === "pdf" ? "pdf" : "website",
              thumbnailUrl: data.thumbnailUrl ?? "",
              faviconUrl: data.faviconUrl ?? null,
              siteName: data.siteName ?? "",
              subjectId: data.subjectId,
              subjectLabel: data.subjectLabel,
              level: data.level,
              levels: Array.isArray(data.levels) ? data.levels : [],
              resourceType: data.resourceType,
              resourceTypes: Array.isArray(data.resourceTypes) ? data.resourceTypes : [],
              topics: Array.isArray(data.topics) ? data.topics : [],
              likeCount: typeof data.likeCount === "number" ? data.likeCount : 0,
              commentCount: typeof data.commentCount === "number" ? data.commentCount : 0,
              ratingAverage: typeof data.ratingAverage === "number" ? data.ratingAverage : 0,
              ratingCount: typeof data.ratingCount === "number" ? data.ratingCount : 0,
              timestamp: data.timestamp?.seconds ?? null,
              linkedQuestionId: data.linkedQuestionId,
              moderationStatus: data.moderationStatus ?? "approved",
            };
          })
        );
        setLoading(false);
      },
      () => setLoading(false)
    );
  }, []);

  useEffect(() => {
    if (!selectedResource?.note) {
      setComments([]);
      setUserRating(null);
      setCommentText("");
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
          const data = d.data();
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
  }, [selectedResource?.id, selectedResource?.note, user?.uid]);

  const visible = useMemo(() => {
    const approved = notes
      .filter((note) => note.moderationStatus === "approved")
      .map(noteToResource);

    if (!context) {
      return { items: approved.slice(0, 12), exact: false, mode: "recommended" as const };
    }

    const exact = approved.filter((resource) => resource.note?.linkedQuestionId === context.id);
    if (exact.length) return { items: exact.slice(0, 12), exact: true, mode: "exact" as const };

    const subjectId = context.subjectId?.toLowerCase();
    const subjectLabel = context.subjectLabel?.toLowerCase();
    const relevant = approved.filter((resource) =>
      (subjectId && resource.note?.subjectId?.toLowerCase() === subjectId) ||
      (subjectLabel && resource.subject.toLowerCase() === subjectLabel)
    );
    if (relevant.length) {
      return { items: relevant.slice(0, 12), exact: false, mode: "subject" as const };
    }
    return { items: approved.slice(0, 12), exact: false, mode: "recommended" as const };
  }, [context, notes]);

  const openShareForm = () => {
    setShareError("");
    setShareTitle("");
    setShareUrl("");
    setShareDescription("");
    setShareType("Notes");
    setShowShareForm(true);
  };

  const handleShareSubmit = async () => {
    if (!user?.uid) {
      setShareError("Sign in to share a resource.");
      return;
    }
    const trimmedTitle = shareTitle.trim();
    const trimmedDescription = shareDescription.trim();
    const validUrl = normaliseUrl(shareUrl);
    if (!trimmedTitle) {
      setShareError("Add a title so people know what this is.");
      return;
    }
    if (trimmedTitle.length > MAX_TITLE) {
      setShareError(`Title is too long (max ${MAX_TITLE} characters).`);
      return;
    }
    if (trimmedDescription.length > MAX_DESCRIPTION) {
      setShareError(`Description is too long (max ${MAX_DESCRIPTION} characters).`);
      return;
    }
    if (!validUrl) {
      setShareError("Add a valid link (https://...).");
      return;
    }

    setShareSubmitting(true);
    setShareError("");
    try {
      let preview: { url?: string; title?: string; imageUrl?: string; faviconUrl?: string; siteName?: string } | null = null;
      try {
        const res = await fetch(LINK_PREVIEW_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: validUrl }),
        });
        if (res.ok) preview = await res.json();
      } catch {
        /* preview is optional */
      }

      const linkContext: QuestionDiscoveryContext | null = context;
      await addDoc(collection(db, "discover-notes"), {
        userId: user.uid,
        username: user.username ?? "",
        userPicture: user.picture ?? null,
        title: trimmedTitle,
        description: trimmedDescription,
        websiteUrl: preview?.url || validUrl,
        resourceSource: "website",
        thumbnailUrl: preview?.imageUrl ?? preview?.faviconUrl ?? "",
        uploadedThumbnailUrl: "",
        uploadedThumbnailPath: null,
        thumbnailStatus: "none",
        moderationStatus: "pending",
        faviconUrl: preview?.faviconUrl ?? "",
        siteName: preview?.siteName ?? displayHostname(validUrl),
        subjectId: linkContext?.subjectId ?? null,
        subjectLabel: linkContext?.subjectLabel ?? null,
        levels: [],
        resourceTypes: [shareType],
        resourceType: shareType,
        topics: linkContext?.topic ? [linkContext.topic] : [],
        likeCount: 0,
        commentCount: 0,
        ratingAverage: 0,
        ratingCount: 0,
        linkedQuestionId: linkContext?.id ?? null,
        linkedQuestionName: linkContext?.name ?? null,
        linkedQuestionPracticeUrl: linkContext?.practiceUrl ?? null,
        linkedQuestionSubjectId: linkContext?.subjectId ?? null,
        linkedQuestionSubjectLabel: linkContext?.subjectLabel ?? null,
        linkedQuestionLevel: linkContext?.level ?? null,
        linkedQuestionTopic: linkContext?.topic ?? null,
        linkedQuestionSource: linkContext?.source ?? "whiteboard",
        timestamp: serverTimestamp(),
      });
      setShowShareForm(false);
      setShareToast(true);
      window.setTimeout(() => setShareToast(false), 2800);
    } catch (error) {
      console.error("Failed to share discover resource:", error);
      setShareError("Couldn't publish. Try again in a moment.");
    } finally {
      setShareSubmitting(false);
    }
  };

  const openResource = (resource: DiscoverResource) => {
    if (isDiscoverVideoUrl(resource.websiteUrl)) {
      setVideoResource(resource);
      return;
    }
    if (resource.websiteUrl) {
      window.open(resource.websiteUrl, "_blank", "noopener,noreferrer");
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

  return (
    <div className="flex h-full min-h-0 flex-col color-bg">
      <div className="shrink-0 px-3 pt-2 pb-1 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide color-txt-sub">
              <LuCompass size={12} /> Discover
            </p>
            <h3 className="mt-0.5 line-clamp-2 text-sm font-bold color-txt-main">
              {context?.name ?? "Recommended for you"}
            </h3>
            <p className="mt-0.5 text-[11px] color-txt-sub">
              {context
                ? [context.subjectLabel, context.level, context.topic].filter(Boolean).join(" · ") || "Question resources"
                : "Popular resources from the community"}
            </p>
          </div>
          <button
            type="button"
            onClick={openShareForm}
            className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl color-bg-accent color-txt-accent px-3 py-2 text-xs font-bold hover:opacity-90 cursor-pointer"
          >
            <LuPlus size={14} /> Add
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-minimal p-3 space-y-3">
        <div>
          <h4 className="text-sm font-bold color-txt-main">
            {visible.mode === "exact"
              ? "Linked to this question"
              : visible.mode === "subject"
                ? "Relevant subject resources"
                : "Recommended"}
          </h4>
          <p className="text-xs color-txt-sub">
            {visible.mode === "exact"
              ? "Resources shared specifically for this question."
              : visible.mode === "subject"
                ? `No exact links yet, showing other ${context?.subjectLabel ?? "subject"} content.`
                : "Fresh community picks while you work."}
          </p>
        </div>

        {loading ? (
          <div className="space-y-3" aria-label="Loading Discover resources">
            {[0, 1, 2].map((item) => (
              <div key={item} className="overflow-hidden rounded-2xl color-bg-grey-5">
                <div className="aspect-video animate-pulse color-bg-grey-10" />
                <div className="space-y-2 p-3">
                  <div className="h-3 w-3/4 animate-pulse rounded color-bg-grey-10" />
                  <div className="h-3 w-full animate-pulse rounded color-bg-grey-10" />
                </div>
              </div>
            ))}
          </div>
        ) : visible.items.length ? (
          visible.items.map((resource) => {
            const isVideo = isDiscoverVideoUrl(resource.websiteUrl);
            return (
              <article
                key={resource.id}
                className="group overflow-hidden rounded-2xl color-bg-grey-5 flex flex-col"
              >
                <button
                  type="button"
                  onClick={() => openResource(resource)}
                  disabled={!resource.websiteUrl}
                  className="relative block w-full aspect-video overflow-hidden color-bg-grey-10 cursor-pointer disabled:cursor-default"
                  aria-label={`${isVideo ? "Watch" : resource.resourceSource === "pdf" ? "Open" : "Visit"} ${resource.title}`}
                >
                  {resource.thumbnailUrl && resource.thumbnailUrl !== resource.faviconUrl ? (
                    <img
                      src={resource.thumbnailUrl}
                      alt={resource.title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center color-txt-sub">
                      {resource.faviconUrl ? (
                        <img
                          src={resource.faviconUrl}
                          alt=""
                          className="h-12 w-12 rounded-2xl object-contain color-bg p-2 shadow-sm"
                          loading="lazy"
                        />
                      ) : resource.resourceSource === "pdf" ? (
                        <LuFileText size={28} />
                      ) : resource.type === "Videos" || isVideo ? (
                        <LuCirclePlay size={28} />
                      ) : resource.type === "Flashcards" ? (
                        <LuLayers size={28} />
                      ) : (
                        <LuBookOpen size={28} />
                      )}
                      <span className="text-xs font-semibold line-clamp-2">
                        {resource.sourceName || resource.subject}
                      </span>
                    </div>
                  )}
                  {(isVideo || resource.type === "Videos") && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/20">
                      <span className="rounded-full color-bg/90 p-2.5 shadow-sm">
                        <LuCirclePlay size={22} className="color-txt-main" />
                      </span>
                    </span>
                  )}
                  <span className="absolute top-2 right-2 rounded-full color-bg px-2 py-0.5 text-[10px] font-bold color-txt-main">
                    {resource.resourceSource === "pdf" ? "PDF" : resource.type}
                  </span>
                </button>

                <div className="flex flex-1 flex-col gap-2.5 p-3">
                  <h3 className="text-sm font-semibold color-txt-main line-clamp-2">{resource.title}</h3>
                  <p className="text-xs color-txt-sub line-clamp-3">{resource.description}</p>

                  {resource.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {resource.tags.slice(0, 3).map((tag) => (
                        <span
                          key={`${resource.id}-${tag}`}
                          className="rounded-full color-bg px-2 py-0.5 text-[10px] font-semibold color-txt-sub"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                    <div className="flex min-w-0 items-center gap-2">
                      {resource.userPicture ? (
                        <img
                          src={resource.userPicture}
                          alt=""
                          className="h-5 w-5 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <div className="h-5 w-5 shrink-0 rounded-full color-bg-grey-10" />
                      )}
                      <span className="truncate text-[11px] color-txt-sub">
                        {resource.username || resource.sourceName}
                        {resource.timestamp ? ` · ${timeAgo(resource.timestamp)}` : ""}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => openResource(resource)}
                      disabled={!resource.websiteUrl}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg color-bg-accent color-txt-accent px-2.5 py-1 text-[11px] font-semibold hover:opacity-90 cursor-pointer disabled:opacity-50"
                    >
                      {isVideo ? (
                        <><LuCirclePlay size={12} /> Watch</>
                      ) : (
                        <><LuExternalLink size={12} /> {resource.resourceSource === "pdf" ? "Open" : "Visit"}</>
                      )}
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1 text-[11px] color-txt-sub">
                    <span>
                      {resource.ratingAverage && resource.ratingAverage > 0
                        ? `${resource.ratingAverage.toFixed(1)} ★`
                        : "No ratings"}
                      {resource.ratingCount ? ` (${resource.ratingCount})` : ""}
                    </span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleLike(resource)}
                        className="inline-flex items-center gap-1 hover:color-txt-main cursor-pointer"
                      >
                        <LuBookmark size={13} />
                        {resource.saves}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedResource(resource)}
                        className="inline-flex items-center gap-1 hover:color-txt-main cursor-pointer"
                      >
                        <LuMessageCircle size={13} />
                        {resource.comments}
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })
        ) : (
          <div className="rounded-2xl border border-dashed border-color-border color-bg-grey-5 p-5 text-center">
            <LuSearch size={22} className="mx-auto color-txt-sub" />
            <p className="mt-2 text-sm font-bold color-txt-main">No resources yet</p>
            <p className="mt-1 text-xs color-txt-sub">Be the first to link something useful here.</p>
            <button
              type="button"
              onClick={openShareForm}
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl color-bg-accent color-txt-accent px-3 py-2 text-xs font-bold cursor-pointer"
            >
              <LuLink size={13} /> Link a resource
            </button>
          </div>
        )}
      </div>

      {selectedResource && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => setSelectedResource(null)}
        >
          <div
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl color-bg shadow-md scrollbar-minimal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col">
              <div className="color-bg-grey-5">
                <button
                  type="button"
                  onClick={() => openResource(selectedResource)}
                  disabled={!selectedResource.websiteUrl}
                  className="aspect-video w-full overflow-hidden color-bg-grey-10 cursor-pointer disabled:cursor-default"
                >
                  {selectedResource.thumbnailUrl && selectedResource.thumbnailUrl !== selectedResource.faviconUrl ? (
                    <img
                      src={selectedResource.thumbnailUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-3 px-5 text-center color-txt-sub">
                      {selectedResource.faviconUrl ? (
                        <img
                          src={selectedResource.faviconUrl}
                          alt=""
                          className="h-14 w-14 rounded-2xl object-contain color-bg p-2 shadow-sm"
                        />
                      ) : selectedResource.resourceSource === "pdf" ? (
                        <LuFileText size={30} />
                      ) : (
                        <LuBookOpen size={30} />
                      )}
                      <span className="font-semibold text-sm">
                        {selectedResource.sourceName || selectedResource.subject}
                      </span>
                    </div>
                  )}
                </button>
              </div>

              <div className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold color-txt-main">{selectedResource.title}</h2>
                    <p className="mt-1 text-xs color-txt-sub">
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
                    <LuX size={18} />
                  </button>
                </div>

                <p className="text-sm color-txt-sub">{selectedResource.description}</p>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openResource(selectedResource)}
                    className="inline-flex items-center gap-2 rounded-xl color-bg-accent color-txt-accent px-3.5 py-2 text-sm font-semibold hover:opacity-90 cursor-pointer"
                  >
                    {isDiscoverVideoUrl(selectedResource.websiteUrl) ? (
                      <><LuCirclePlay size={15} /> Watch</>
                    ) : (
                      <><LuExternalLink size={15} /> {selectedResource.resourceSource === "pdf" ? "Open PDF" : "Visit resource"}</>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLike(selectedResource)}
                    className="inline-flex items-center gap-2 rounded-xl color-bg-grey-5 color-txt-main px-3.5 py-2 text-sm font-semibold hover:opacity-90 cursor-pointer"
                  >
                    <LuBookmark size={15} />
                    Save · {selectedResource.saves}
                  </button>
                </div>

                <div className="rounded-xl color-bg-grey-5 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-bold color-txt-main text-sm">Rate this resource</h3>
                      <p className="text-[11px] color-txt-sub">
                        {selectedResource.ratingCount
                          ? `${selectedResource.ratingAverage?.toFixed(1)} average from ${selectedResource.ratingCount} ratings`
                          : "No ratings yet"}
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((value) => (
                        <button
                          type="button"
                          key={value}
                          disabled={ratingSubmitting || !selectedResource.note}
                          onClick={() => handleRate(value)}
                          className={`text-lg cursor-pointer disabled:cursor-not-allowed ${
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
                  <h3 className="font-bold color-txt-main text-sm">Comments</h3>
                  <div className="max-h-64 space-y-2 overflow-y-auto scrollbar-minimal pr-1">
                    {comments.length === 0 ? (
                      <p className="text-sm color-txt-sub">
                        No comments yet. Add context for the next student.
                      </p>
                    ) : (
                      comments.map((comment) => (
                        <div key={comment.id} className="rounded-xl color-bg-grey-5 p-3">
                          <div className="mb-1 flex items-center gap-2">
                            {comment.userPicture ? (
                              <img
                                src={comment.userPicture}
                                alt=""
                                className="h-5 w-5 rounded-full object-cover"
                              />
                            ) : (
                              <div className="h-5 w-5 rounded-full color-bg-grey-10" />
                            )}
                            <span className="text-xs font-semibold color-txt-main">
                              {comment.username || "Unknown"}
                            </span>
                            <span className="text-[11px] color-txt-sub">
                              {comment.timestamp ? timeAgo(comment.timestamp) : ""}
                            </span>
                          </div>
                          <p className="text-sm color-txt-sub whitespace-pre-wrap">{comment.text}</p>
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
                      className="w-full resize-none rounded-xl color-bg-grey-5 color-txt-main px-3 py-2.5 text-sm outline-none placeholder:color-txt-sub"
                    />
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] color-txt-sub">
                        {commentText.length}/{MAX_COMMENT}
                      </span>
                      <button
                        type="button"
                        onClick={handleAddComment}
                        disabled={commentSubmitting || !commentText.trim() || !selectedResource.note}
                        className="inline-flex items-center gap-2 rounded-xl color-bg-accent color-txt-accent px-3.5 py-2 text-sm font-semibold hover:opacity-90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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

      {showShareForm && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => !shareSubmitting && setShowShareForm(false)}
        >
          <div
            className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl color-bg shadow-md scrollbar-minimal p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold color-txt-main">Add a resource</h2>
                <p className="mt-1 text-xs color-txt-sub">
                  {context
                    ? `Share something useful for ${context.name}. Stays on this board.`
                    : "Share something useful with the community. Stays on this board."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => !shareSubmitting && setShowShareForm(false)}
                className="color-txt-sub hover:color-txt-main cursor-pointer"
                aria-label="Close"
              >
                <LuX size={18} />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold color-txt-sub uppercase tracking-wide">Title</label>
              <input
                type="text"
                value={shareTitle}
                onChange={(e) => setShareTitle(e.target.value.slice(0, MAX_TITLE))}
                placeholder="e.g. Macbeth essay structure"
                className="w-full rounded-xl color-bg-grey-5 color-txt-main px-3 py-2.5 text-sm outline-none placeholder:color-txt-sub"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold color-txt-sub uppercase tracking-wide">Link</label>
              <input
                type="url"
                value={shareUrl}
                onChange={(e) => setShareUrl(e.target.value)}
                placeholder="https://"
                className="w-full rounded-xl color-bg-grey-5 color-txt-main px-3 py-2.5 text-sm outline-none placeholder:color-txt-sub"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold color-txt-sub uppercase tracking-wide">Description</label>
              <textarea
                value={shareDescription}
                onChange={(e) => setShareDescription(e.target.value.slice(0, MAX_DESCRIPTION))}
                placeholder="Why is this helpful?"
                rows={3}
                className="w-full resize-none rounded-xl color-bg-grey-5 color-txt-main px-3 py-2.5 text-sm outline-none placeholder:color-txt-sub"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold color-txt-sub uppercase tracking-wide">Type</label>
              <div className="flex flex-wrap gap-2">
                {RESOURCE_TYPES.map((type) => (
                  <button
                    type="button"
                    key={type}
                    onClick={() => setShareType(type)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                      shareType === type
                        ? "color-bg-accent color-txt-accent"
                        : "color-bg-grey-5 color-txt-main hover:opacity-90"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {shareError && <p className="text-xs text-red-500">{shareError}</p>}

            <button
              type="button"
              onClick={() => void handleShareSubmit()}
              disabled={shareSubmitting}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl color-bg-accent color-txt-accent px-3.5 py-2.5 text-sm font-bold hover:opacity-90 cursor-pointer disabled:opacity-50"
            >
              {shareSubmitting && <LuLoader size={14} className="animate-spin" />}
              Publish for review
            </button>
          </div>
        </div>
      )}

      {shareToast && (
        <div className="fixed bottom-20 left-1/2 z-[80] -translate-x-1/2 rounded-xl color-bg color-shadow border px-4 py-2 text-xs font-semibold color-txt-main">
          Submitted — it'll show after review.
        </div>
      )}

      {videoResource?.websiteUrl && (
        <VideoEmbedModal
          url={videoResource.websiteUrl}
          title={videoResource.title}
          onClose={() => setVideoResource(null)}
        />
      )}
    </div>
  );
}
