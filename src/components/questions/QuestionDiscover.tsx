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
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref as storageRef } from "firebase/storage";
import {
  LuArrowLeft,
  LuArrowUpRight,
  LuBookmark,
  LuExternalLink,
  LuLoader,
  LuPlus,
  LuStar,
  LuTrash,
} from "react-icons/lu";
import { useNavigate } from "react-router-dom";
import { db, storage } from "../../../firebase";
import { UserContext } from "../../context/UserContext";
import { notifyPostOwner } from "../../lib/notifications";
import DiscoverMediaPreview from "../discover/DiscoverMediaPreview";
import DiscoverShareModal from "../discover/DiscoverShareModal";
import { getQuestionDiscoveryContext } from "../../lib/questionDiscovery";

type ResourceType = "Notes" | "Videos" | "Sample Answers" | "Flashcards" | "Website" | "Other";
type ResourceLevel = "Higher" | "Ordinary" | "Foundation";
type ResourceSource = "website" | "pdf";

const MAX_COMMENT = 500;
const RESOURCE_TYPES: ResourceType[] = ["Notes", "Videos", "Sample Answers", "Flashcards", "Website", "Other"];
const RESOURCE_LEVELS: ResourceLevel[] = ["Higher", "Ordinary", "Foundation"];

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
  pdfPath?: string | null;
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
  linkedQuestionName?: string;
  linkedQuestionPracticeUrl?: string;
  linkedQuestionSubjectId?: string;
  linkedQuestionSubjectLabel?: string;
  linkedQuestionLevel?: string;
  linkedQuestionTopic?: string;
  linkedQuestionSource?: string;
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
  pdfPath?: string | null;
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

export default function QuestionDiscover({ question }: { question?: unknown }) {
  const { user } = useContext(UserContext);
  const navigate = useNavigate();
  const context = useMemo(() => getQuestionDiscoveryContext(question), [question]);
  const [notes, setNotes] = useState<DiscoverNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedResource, setSelectedResource] = useState<DiscoverResource | null>(null);
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
  const [showShareForm, setShowShareForm] = useState(false);
  const [shareToast, setShareToast] = useState(false);
  const commentInputRef = useRef<HTMLInputElement | null>(null);
  const listScrollRef = useRef<HTMLDivElement | null>(null);

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
              pdfPath: data.pdfPath ?? null,
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
              linkedQuestionName: data.linkedQuestionName,
              linkedQuestionPracticeUrl: data.linkedQuestionPracticeUrl,
              linkedQuestionSubjectId: data.linkedQuestionSubjectId,
              linkedQuestionSubjectLabel: data.linkedQuestionSubjectLabel,
              linkedQuestionLevel: data.linkedQuestionLevel,
              linkedQuestionTopic: data.linkedQuestionTopic,
              linkedQuestionSource: data.linkedQuestionSource,
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
    setCommentText("");
    setCommentComposerOpen(false);
    setShowDeleteConfirm(false);
    if (!selectedResource?.note) {
      setComments([]);
      setUserRating(null);
      setUserSaved(false);
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
      getDoc(doc(db, "discover-notes", selectedResource.id, "likes", user.uid)).then((snap) => {
        if (!cancelled) setUserSaved(snap.exists());
      });
    } else {
      setUserRating(null);
      setUserSaved(false);
    }

    return () => {
      cancelled = true;
      unsubComments();
    };
  }, [selectedResource?.id, selectedResource?.note, user?.uid]);

  useEffect(() => {
    listScrollRef.current?.scrollTo({ top: 0 });
  }, [selectedResource?.id]);

  const approved = useMemo(
    () => notes.filter((note) => note.moderationStatus === "approved").map(noteToResource),
    [notes]
  );

  const { questionResources, subjectResources } = useMemo(() => {
    if (!context) {
      return { questionResources: [] as DiscoverResource[], subjectResources: approved.slice(0, 12) };
    }

    const questionItems = approved.filter((resource) => resource.note?.linkedQuestionId === context.id);
    const questionIds = new Set(questionItems.map((resource) => resource.id));
    const subjectId = context.subjectId?.toLowerCase();
    const subjectLabel = context.subjectLabel?.toLowerCase();
    const subjectItems = approved.filter((resource) => {
      if (questionIds.has(resource.id)) return false;
      return (
        (subjectId && resource.note?.subjectId?.toLowerCase() === subjectId) ||
        (subjectLabel && resource.subject.toLowerCase() === subjectLabel)
      );
    });

    return {
      questionResources: questionItems.slice(0, 12),
      subjectResources: subjectItems.slice(0, 12),
    };
  }, [approved, context]);

  const relatedResources = useMemo(() => {
    if (!selectedResource) return [];
    const subject = selectedResource.subject.toLowerCase();
    const tags = new Set(selectedResource.tags.map((tag) => tag.toLowerCase()));
    const scored = approved
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
    if (scored.length > 0) return scored.slice(0, 8);
    return approved.filter((resource) => resource.id !== selectedResource.id).slice(0, 6);
  }, [approved, selectedResource]);

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

  const handleDelete = async (note: DiscoverNote) => {
    if (!user?.uid || deleting || note.userId !== user.uid) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, "discover-notes", note.id));
      if (note.pdfPath) {
        await deleteObject(storageRef(storage, note.pdfPath)).catch((err) => {
          console.warn("Failed to delete Discover upload:", err);
        });
      }
      setShowDeleteConfirm(false);
      setSelectedResource(null);
    } catch (err) {
      console.error("Failed to delete note:", err);
    } finally {
      setDeleting(false);
    }
  };

  const handleSave = async (resource: DiscoverResource) => {
    if (!user?.uid || !resource.note || saveSubmitting) return;
    const likeRef = doc(db, "discover-notes", resource.id, "likes", user.uid);
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
        await deleteDoc(likeRef);
        try {
          await updateDoc(resourceRef, { likeCount: increment(-1) });
        } catch {
          // Count update can be blocked by rules; the save itself already succeeded.
        }
      } else {
        await setDoc(likeRef, {
          userId: user.uid,
          timestamp: serverTimestamp(),
        });
        try {
          await updateDoc(resourceRef, { likeCount: increment(1) });
        } catch {
          // Count update can be blocked by rules; the save itself already succeeded.
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

  const renderResourceDetail = (resource: DiscoverResource) => {
    const username = resource.username || "Unknown";
    const canOpenResource = Boolean(resource.websiteUrl?.trim() || resource.pdfPath);
    const ownsResource = Boolean(user?.uid && resource.userId === user.uid);
    const linkedQuestionName = resource.note?.linkedQuestionName?.trim() || "";
    const linkedQuestionUrl = resource.note?.linkedQuestionPracticeUrl?.trim() || "";
    const commentCount = comments.length;
    const composerActive = commentComposerOpen || Boolean(commentText);

    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 px-3 pt-2 pb-1 flex items-center justify-between gap-2">
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
              className="inline-flex items-center justify-center rounded-lg color-bg-grey-5 p-1.5 color-txt-sub hover:color-bg-accent hover:color-txt-accent cursor-pointer"
              aria-label="Delete resource"
            >
              <LuTrash size={14} />
            </button>
          )}
        </div>

        <div ref={listScrollRef} className="min-h-0 flex-1 overflow-y-auto scrollbar-minimal px-4 pb-5 space-y-5">
          <div className="relative min-h-[240px] h-[min(52vh,30rem)] rounded-2xl color-bg-grey-10 overflow-hidden">
            <DiscoverMediaPreview key={resource.id} resource={resource} variant="hero" />
            {canOpenResource && (
              <button
                type="button"
                onClick={() => void handleVisit(resource.websiteUrl, resource)}
                className="absolute top-3 right-3 z-20 inline-flex items-center gap-1.5 rounded-lg color-bg color-txt-accent px-2.5 py-1.5 text-[11px] font-semibold shadow-md hover:opacity-90 cursor-pointer"
              >
                <LuExternalLink size={13} />
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
                    className="w-7 h-7 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full color-bg-grey-10" />
                )}
              </button>
            ) : (
              <div className="w-7 h-7 rounded-full color-bg-grey-10 shrink-0" />
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
                <h1 className="text-sm font-bold color-txt-main leading-snug">
                  {resource.title}
                </h1>
                {linkedQuestionName && linkedQuestionUrl && (
                  <button
                    type="button"
                    onClick={() => navigate(linkedQuestionUrl)}
                    className="inline-flex items-center gap-1 max-w-full rounded-lg color-bg-accent color-txt-accent px-2 py-0.5 text-[11px] font-semibold cursor-pointer hover:opacity-90"
                  >
                    <LuArrowUpRight size={13} className="shrink-0" />
                    <span className="truncate">{linkedQuestionName}</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  type="button"
                  key={value}
                  disabled={!resource.note}
                  onClick={() => handleRate(value)}
                  className={`cursor-pointer ${
                    (userRating ?? 0) >= value ? "color-txt-accent" : "color-txt-sub"
                  } ${!resource.note ? "opacity-50" : ""}`}
                  aria-label={`Rate ${value} stars`}
                >
                  <LuStar
                    size={16}
                    fill={(userRating ?? 0) >= value ? "currentColor" : "none"}
                  />
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void handleSave(resource)}
              disabled={!resource.note || !user?.uid}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer hover:opacity-90 ${
                userSaved
                  ? "color-bg-accent color-txt-accent"
                  : "color-bg-grey-5 color-txt-main"
              } ${!resource.note || !user?.uid ? "opacity-50" : ""}`}
            >
              <LuBookmark size={13} fill={userSaved ? "currentColor" : "none"} />
              {userSaved ? "Saved" : "Save"} · {resource.saves}
            </button>
          </div>

          {resource.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {resource.tags.map((tag) => (
                <span
                  key={`${resource.id}-detail-${tag}`}
                  className="px-2 py-0.5 rounded-full color-bg-grey-5 text-[10px] font-semibold color-txt-sub"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {resource.description && (
            <p className="text-xs color-txt-main whitespace-pre-wrap leading-relaxed">{resource.description}</p>
          )}

          {relatedResources.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs font-bold color-txt-main">Related</h2>
              <div className="flex gap-2.5 overflow-x-auto scrollbar-minimal pb-1">
                {relatedResources.map((related) => (
                  <button
                    type="button"
                    key={related.id}
                    onClick={() => setSelectedResource(related)}
                    className="shrink-0 w-32 text-left cursor-pointer"
                  >
                    <div className="aspect-[16/10] rounded-lg color-bg-grey-10 overflow-hidden mb-1.5">
                      <DiscoverMediaPreview resource={related} variant="thumb" />
                    </div>
                    <p className="text-xs font-bold color-txt-main truncate">{related.title}</p>
                    <p className="text-[10px] color-txt-sub truncate">{related.subject}</p>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-3 pt-1">
            <h3 className="text-xs font-bold color-txt-main">
              {commentCount} {commentCount === 1 ? "Comment" : "Comments"}
            </h3>
            <div className="flex items-start gap-3">
              {user?.picture ? (
                <img
                  src={user.picture}
                  alt=""
                  className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5"
                />
              ) : (
                <div className="w-7 h-7 rounded-full color-bg-grey-10 shrink-0 mt-0.5" />
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
                  className="w-full bg-transparent color-txt-main text-xs outline-none border-0 border-b border-color-border pb-1.5 placeholder:color-txt-sub disabled:opacity-60"
                />
                {composerActive && (
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <span className="mr-auto text-[11px] color-txt-sub">
                      {commentText.length}/{MAX_COMMENT}
                    </span>
                    <button
                      type="button"
                      onClick={cancelComment}
                      className="px-2.5 py-1 rounded-full text-xs font-semibold color-txt-sub hover:color-txt-main cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleAddComment()}
                      disabled={commentSubmitting || !commentText.trim() || !resource.note}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full color-bg-accent color-txt-accent text-xs font-semibold hover:opacity-90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {commentSubmitting && <LuLoader size={12} className="animate-spin" />}
                      Send
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-4">
              {commentCount === 0 ? (
                <p className="text-xs color-txt-sub">
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
                            className="w-7 h-7 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-full color-bg-grey-10" />
                        )}
                      </button>
                    ) : comment.userPicture ? (
                      <img
                        src={comment.userPicture}
                        alt=""
                        className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5"
                      />
                    ) : (
                      <div className="w-7 h-7 rounded-full color-bg-grey-10 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[11px] font-bold color-txt-main truncate">
                          {comment.username || "Unknown"}
                        </span>
                        <span className="text-[11px] color-txt-sub shrink-0">
                          {comment.timestamp ? timeAgo(comment.timestamp) : ""}
                        </span>
                      </div>
                      <p className="text-xs color-txt-main whitespace-pre-wrap pt-0.5 leading-relaxed">
                        {comment.text}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
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
    <div className="flex h-full min-h-0 flex-col color-bg">
      {selectedResource ? renderResourceDetail(selectedResource) : (
        <>
          <div className="shrink-0 px-3 pt-2 pb-1">
            <button
              type="button"
              onClick={() => setShowShareForm(true)}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl color-bg-accent color-txt-accent px-3 py-2 text-xs font-bold hover:opacity-90 cursor-pointer"
            >
              <LuPlus size={14} /> Add resource
            </button>
          </div>

          <div ref={listScrollRef} className="min-h-0 flex-1 overflow-y-auto scrollbar-minimal px-1 pb-3 space-y-5">
            <section>
              <div className="px-3 pt-3 pb-1">
                <h4 className="text-sm font-bold color-txt-main">Question Related Content</h4>
              </div>
              {loading ? (
                <div className="space-y-1" aria-label="Loading question resources">
                  {[0, 1].map((item) => (
                    <div key={item} className="p-2">
                      <div className="overflow-hidden rounded-xl color-bg-grey-5 animate-pulse">
                        <div className="aspect-[16/10] color-bg-grey-10" />
                        <div className="space-y-1.5 px-2.5 py-2">
                          <div className="h-3.5 w-3/4 rounded color-bg-grey-10" />
                          <div className="h-3 w-1/2 rounded color-bg-grey-10" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : questionResources.length ? (
                <div className="grid grid-cols-1 gap-1">
                  {questionResources.map(renderResourceCard)}
                </div>
              ) : (
                <div className="flex items-center justify-center px-4 py-10">
                  <p className="text-sm color-txt-sub text-center">
                    No content related to this question
                  </p>
                </div>
              )}
            </section>

            <section>
              <div className="px-3 pt-1 pb-1">
                <h4 className="text-sm font-bold color-txt-main">Subject Related Content</h4>
              </div>
              {loading ? (
                <div className="space-y-1" aria-label="Loading subject resources">
                  {[0, 1].map((item) => (
                    <div key={item} className="p-2">
                      <div className="overflow-hidden rounded-xl color-bg-grey-5 animate-pulse">
                        <div className="aspect-[16/10] color-bg-grey-10" />
                        <div className="space-y-1.5 px-2.5 py-2">
                          <div className="h-3.5 w-3/4 rounded color-bg-grey-10" />
                          <div className="h-3 w-1/2 rounded color-bg-grey-10" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : subjectResources.length ? (
                <div className="grid grid-cols-1 gap-1">
                  {subjectResources.map(renderResourceCard)}
                </div>
              ) : (
                <div className="flex items-center justify-center px-4 py-10">
                  <p className="text-sm color-txt-sub text-center">
                    No subject related content yet
                  </p>
                </div>
              )}
            </section>
          </div>
        </>
      )}

      <DiscoverShareModal
        open={showShareForm}
        onClose={() => setShowShareForm(false)}
        onSubmitted={() => {
          setShareToast(true);
          window.setTimeout(() => setShareToast(false), 2800);
        }}
        linkedQuestion={context}
      />

      {shareToast && (
        <div className="fixed bottom-20 left-1/2 z-[90] -translate-x-1/2 rounded-xl color-bg color-shadow border px-4 py-2 text-xs font-semibold color-txt-main">
          Thanks for sharing. Your resource has been sent for moderation.
        </div>
      )}
    </div>
  );
}

