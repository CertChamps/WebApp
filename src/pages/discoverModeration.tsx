import { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  LuCheck,
  LuExternalLink,
  LuLoaderCircle,
  LuShieldCheck,
  LuX,
} from "react-icons/lu";
import { db, storage } from "../../firebase";
import { UserContext } from "../context/UserContext";
import { isAdminUid } from "../constants/adminUids";

type PendingResource = {
  id: string;
  title: string;
  description: string;
  websiteUrl: string;
  resourceSource: "website" | "pdf";
  pdfPath: string;
  pdfFileName: string;
  thumbnailUrl: string;
  uploadedThumbnailUrl: string;
  uploadedThumbnailPath: string;
  username: string;
  userId: string;
  subjectLabel: string;
  timestamp: number | null;
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

export default function DiscoverModeration() {
  const navigate = useNavigate();
  const { user } = useContext(UserContext);
  const isAdmin = isAdminUid(user?.uid, user?.email);
  const [items, setItems] = useState<PendingResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          .map((entry) => {
            const data = entry.data() as any;
            return {
              id: entry.id,
              title: data.title ?? "Untitled",
              description: data.description ?? "",
              websiteUrl: data.websiteUrl ?? "",
              resourceSource: data.resourceSource === "pdf" ? "pdf" as const : "website" as const,
              pdfPath: data.pdfPath ?? "",
              pdfFileName: data.pdfFileName ?? "",
              thumbnailUrl: data.thumbnailUrl ?? "",
              uploadedThumbnailUrl: data.uploadedThumbnailUrl ?? "",
              uploadedThumbnailPath: data.uploadedThumbnailPath ?? "",
              username: data.username ?? "Unknown",
              userId: data.userId ?? "",
              subjectLabel: data.subjectLabel ?? "General",
              timestamp: data.timestamp?.seconds ?? null,
            };
          })
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

  const approve = async (item: PendingResource) => {
    setBusyId(item.id);
    setError(null);
    try {
      const payload: Record<string, any> = {
        moderationStatus: "approved",
        thumbnailModeratedBy: user?.uid ?? "",
        thumbnailModeratedAt: new Date(),
      };
      if (item.uploadedThumbnailUrl) {
        payload.thumbnailUrl = item.uploadedThumbnailUrl;
        payload.thumbnailStatus = "approved";
      }
      await updateDoc(doc(db, "discover-notes", item.id), payload);
    } catch (err: any) {
      setError(err?.message ?? "Could not approve resource.");
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (item: PendingResource) => {
    if (!window.confirm("Reject and delete this Discover resource?")) return;
    setBusyId(item.id);
    setError(null);
    try {
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
    } catch (err: any) {
      setError(err?.message ?? "Could not reject resource.");
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
              <p className="color-txt-sub text-sm">Approve or reject submitted resources before they appear publicly.</p>
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
              <article key={item.id} className="rounded-2xl color-bg-grey-5 overflow-hidden">
                <div className="grid grid-cols-1 sm:grid-cols-2">
                  <div>
                    <div className="px-4 py-3 text-xs font-bold color-txt-sub uppercase tracking-wide">Current public</div>
                    <div className="aspect-video color-bg-grey-10 flex items-center justify-center overflow-hidden">
                      {item.thumbnailUrl ? (
                        <img src={item.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="color-txt-sub text-sm">No preview image</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="px-4 py-3 text-xs font-bold color-txt-sub uppercase tracking-wide">Uploaded thumbnail</div>
                    <div className="aspect-video color-bg-grey-10 flex items-center justify-center overflow-hidden">
                      {item.uploadedThumbnailUrl ? (
                        <img src={item.uploadedThumbnailUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="color-txt-sub text-sm">Missing upload</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-4 space-y-4">
                  <div>
                    <h2 className="font-bold color-txt-main">{item.title}</h2>
                    <p className="text-sm color-txt-sub line-clamp-2 mt-1">{item.description}</p>
                    <p className="text-xs color-txt-sub mt-2">
                      {item.subjectLabel} · {item.resourceSource === "pdf" ? item.pdfFileName || "PDF" : "Website"} · shared by {item.username} {item.timestamp ? `· ${timeAgo(item.timestamp)}` : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => approve(item)}
                      disabled={busyId === item.id}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl color-bg-accent color-txt-accent text-sm font-semibold hover:opacity-90 cursor-pointer disabled:opacity-50"
                    >
                      <LuCheck size={15} />
                      Approve post
                    </button>
                    <button
                      type="button"
                      onClick={() => reject(item)}
                      disabled={busyId === item.id}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl color-bg color-txt-main text-sm font-semibold hover:opacity-90 cursor-pointer disabled:opacity-50"
                    >
                      <LuX size={15} />
                      Reject post
                    </button>
                    <button
                      type="button"
                      onClick={() => window.open(item.websiteUrl, "_blank", "noopener,noreferrer")}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl color-bg color-txt-main text-sm font-semibold hover:opacity-90 cursor-pointer"
                    >
                      <LuExternalLink size={15} />
                      {item.resourceSource === "pdf" ? "Open PDF" : "Open link"}
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
