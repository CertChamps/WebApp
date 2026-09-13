import { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { deleteObject, ref as storageRef } from "firebase/storage";
import {
  LuArrowLeft,
  LuArrowRight,
  LuCheck,
  LuExternalLink,
  LuLoaderCircle,
  LuShieldCheck,
  LuX,
} from "react-icons/lu";
import { db, storage } from "../../firebase";
import { UserContext } from "../context/UserContext";
import { isAdminUid } from "../constants/adminUids";
import { notifyPostOwner } from "../lib/notifications";
import {
  parseDiscoverModerationNote,
  timeAgo,
  RESOURCE_LEVELS,
  type DiscoverModerationNote,
  type ResourceLevel,
} from "../lib/discoverModeration";
import { getPracticeSubjectId, getSubjectLabel } from "../data/practiceHubSubjects";
import DiscoverMediaPreview from "../components/discover/DiscoverMediaPreview";

const FILTER_LEVELS = [...RESOURCE_LEVELS, "Common"] as const;
const UNLEVELLED = "Unspecified";

function noteSubjectId(item: DiscoverModerationNote): string {
  const raw = item.subjectId || item.linkedQuestionSubjectId || item.subjectLabel;
  return raw ? getPracticeSubjectId(raw) : "";
}

function noteLevelLabels(item: DiscoverModerationNote): string[] {
  const raw = [
    ...item.levels,
    item.linkedQuestionLevel,
    ...item.linkedQuestions.map((question) => question.level ?? ""),
  ];
  const labels = raw
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => value.charAt(0).toUpperCase() + value.slice(1).toLowerCase());
  return [...new Set(labels)];
}

function parseCsvParam(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function toggleValue(current: string[], value: string): string[] {
  return current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];
}

export default function DiscoverModeration() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useContext(UserContext);
  const isAdmin = isAdminUid(user?.uid, user?.email);
  const [items, setItems] = useState<DiscoverModerationNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedSubjects = parseCsvParam(searchParams.get("subject"));
  const selectedLevels = parseCsvParam(searchParams.get("level"));
  const filterQuery = searchParams.toString();
  const listSearch = filterQuery ? `?${filterQuery}` : "";

  const setFilterParam = (key: "subject" | "level", values: string[]) => {
    const next = new URLSearchParams(searchParams);
    if (values.length > 0) next.set(key, values.join(","));
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isAdmin) return;
    const pendingQuery = query(
      collection(db, "discover-notes"),
      where("moderationStatus", "==", "pending"),
      limit(100)
    );

    const unsub = onSnapshot(
      pendingQuery,
      (snap) => {
        const pendingItems = snap.docs
          .map((entry) => parseDiscoverModerationNote(entry.id, entry.data() as Record<string, unknown>))
          .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
        setItems(pendingItems);
        setLoading(false);
      },
      (err) => {
        console.error("Discover moderation listener failed:", err);
        setError(err.message ?? "Failed to load pending resources.");
        setLoading(false);
      }
    );

    return () => unsub();
  }, [isAdmin]);

  const openReview = (item: DiscoverModerationNote) => {
    navigate(`/admin/discover-moderation/${item.id}`);
  };

  const approve = async (item: DiscoverModerationNote) => {
    setBusyId(item.id);
    setError(null);
    try {
      await updateDoc(doc(db, "discover-notes", item.id), {
        moderationStatus: "approved",
        thumbnailModeratedBy: user?.uid ?? "",
        thumbnailModeratedAt: new Date(),
        ...(item.uploadedThumbnailUrl
          ? {
              thumbnailUrl: item.uploadedThumbnailUrl,
              thumbnailStatus: "approved",
            }
          : {}),
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not approve resource.");
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (item: PendingResource) => {
    const reason = (rejectReasons[item.id] ?? "").trim();
    if (!reason) {
      setError("Add a reason before rejecting.");
      return;
    }
  const reject = async (item: DiscoverModerationNote) => {
    if (!window.confirm("Reject and delete this Discover resource?")) return;
    setBusyId(item.id);
    setError(null);
    try {
      await updateDoc(doc(db, "discover-notes", item.id), {
        moderationStatus: "rejected",
        rejectionReason: reason,
        thumbnailModeratedBy: user?.uid ?? "",
        thumbnailModeratedAt: new Date(),
      });
      await deleteDoc(doc(db, "discover-notes", item.id));
      if (item.uploadedThumbnailPath) {
        try {
          await deleteObject(storageRef(storage, item.uploadedThumbnailPath));
        } catch (deleteErr) {
          console.warn("Failed to delete rejected resource thumbnail:", deleteErr);
        }
      }
      if (item.pdfPath) {
        try {
          await deleteObject(storageRef(storage, item.pdfPath));
        } catch (deleteErr) {
          console.warn("Failed to delete rejected PDF:", deleteErr);
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not reject resource.");
    } finally {
      setBusyId(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex-1 w-full h-full color-bg flex items-center justify-center p-6">
        <div className="color-bg-grey-5 p-8 rounded-xl text-center">
          <LuX size={48} className="color-txt-accent mx-auto mb-4" />
          <h2 className="txt-heading-colour text-2xl mb-2">Access Denied</h2>
          <p className="color-txt-sub">You don't have permission to view this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0 w-full h-full overflow-y-auto color-bg scrollbar-minimal">
      <div className="w-full max-w-7xl mx-auto px-6 py-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="color-bg-grey-5 p-2.5 rounded-xl hover:color-bg-grey-10 transition-all"
              aria-label="Go back"
            >
              <LuArrowLeft size={22} className="color-txt-accent" />
            </button>
            <div>
              <h1 className="color-txt-main text-2xl font-bold">Discover Moderation</h1>
              <p className="color-txt-sub text-sm">
                Open a pending listing to compare it with the linked question, edit fields, then approve or reject.
              </p>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl color-bg-grey-5 color-txt-sub text-sm font-semibold">
            <LuShieldCheck size={16} />
            {items.length} pending
          </div>
        </div>

        {error && (
          <div className="rounded-xl color-bg-grey-5 px-4 py-3 text-sm text-red-500">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 color-txt-sub">
            <LuLoaderCircle className="animate-spin" size={18} />
            Loading pending resources...
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl color-bg-grey-5 p-10 text-center color-txt-sub">
            No pending Discover resources.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {items.map((item) => (
              <article
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => openReview(item)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openReview(item);
                  }
                }}
                className="rounded-2xl color-bg-grey-5 overflow-hidden text-left cursor-pointer hover:color-bg-grey-10 transition-colors"
              >
                <div className="aspect-video color-bg-grey-10 overflow-hidden">
                  <DiscoverMediaPreview
                    resource={{
                      title: item.title,
                      websiteUrl: item.websiteUrl,
                      resourceSource: item.resourceSource,
                      pdfPath: item.pdfPath,
                      thumbnailUrl: item.uploadedThumbnailUrl || item.thumbnailUrl,
                      faviconUrl: item.faviconUrl,
                    }}
                    variant="thumb"
                    className="w-full h-full"
                  />
                </div>

                <div className="p-4 space-y-4">
                  <div>
                    <h2 className="font-bold color-txt-main">{item.title}</h2>
                    <p className="text-sm color-txt-sub line-clamp-2 mt-1">{item.description}</p>
                    <p className="text-xs color-txt-sub mt-2">
                      {item.subjectLabel}
                      {item.linkedQuestionName
                        ? item.linkedQuestions.length > 1
                          ? ` · ${item.linkedQuestions.length} linked questions`
                          : ` · ${item.linkedQuestionName}`
                        : ""}
                      {` · ${item.resourceSource === "pdf" ? item.pdfFileName || "PDF" : item.siteName || "Website"}`}
                      {` · ${item.username}`}
                      {item.timestamp ? ` · ${timeAgo(item.timestamp)}` : ""}
                    </p>
                  </div>

                  <input
                    type="text"
                    value={rejectReasons[item.id] ?? ""}
                    onChange={(e) =>
                      setRejectReasons((prev) => ({ ...prev, [item.id]: e.target.value.slice(0, 200) }))
                    }
                    placeholder="Reason if you reject"
                    className="w-full px-3 py-2 rounded-xl color-bg color-txt-main text-sm outline-none"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openReview(item);
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl color-bg-accent color-txt-accent text-sm font-semibold hover:opacity-90 cursor-pointer"
                    >
                      Review
                      <LuArrowRight size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void approve(item);
                      }}
                      disabled={busyId === item.id}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl color-bg color-txt-main text-sm font-semibold hover:opacity-90 cursor-pointer disabled:opacity-50"
                    >
                      <LuCheck size={15} />
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void reject(item);
                      }}
                      disabled={busyId === item.id}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl color-bg color-txt-main text-sm font-semibold hover:opacity-90 cursor-pointer disabled:opacity-50"
                    >
                      <LuX size={15} />
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        window.open(item.websiteUrl, "_blank", "noopener,noreferrer");
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl color-bg color-txt-main text-sm font-semibold hover:opacity-90 cursor-pointer"
                    >
                      <LuExternalLink size={15} />
                      Open
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
