import { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  LuArrowLeft,
  LuCircleCheck,
  LuExternalLink,
  LuLifeBuoy,
  LuLoaderCircle,
  LuMail,
  LuPaperclip,
  LuRotateCcw,
  LuX,
} from "react-icons/lu";
import { db } from "../../firebase";
import { UserContext } from "../context/UserContext";
import { isAdminUid } from "../constants/adminUids";

type SupportAttachment = {
  name: string;
  url: string;
  path: string;
  size: number;
  contentType: string;
};

type SupportReport = {
  id: string;
  userId: string;
  username: string;
  contactEmail: string;
  userEmail: string;
  subject: string;
  description: string;
  issueType: string;
  status: "open" | "resolved";
  attachments: SupportAttachment[];
  createdAt: number | null;
  source?: string;
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

function formatBytes(size: number): string {
  if (!size) return "";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function HelpReports() {
  const navigate = useNavigate();
  const { user } = useContext(UserContext);
  const isAdmin = isAdminUid(user?.uid, user?.email);
  const [items, setItems] = useState<SupportReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    const reportsQuery = query(
      collection(db, "feedback"),
      orderBy("timestamp", "desc"),
      limit(100)
    );

    const unsub = onSnapshot(
      reportsQuery,
      (snap) => {
        setItems(
          snap.docs
          .map((entry) => {
            const data = entry.data() as any;
            return {
              id: entry.id,
              userId: data.userId ?? "",
              username: data.username ?? "Unknown",
              contactEmail: data.contactEmail ?? "",
              userEmail: data.userEmail ?? "",
              subject: data.subject ?? "No subject",
              description: data.description ?? data.message ?? "",
              issueType: data.issueType ?? "Other",
              status: data.status === "resolved" ? "resolved" as const : "open" as const,
              attachments: Array.isArray(data.attachments) ? data.attachments : [],
              createdAt: data.timestamp?.seconds ?? data.createdAt?.seconds ?? null,
              source: data.source ?? "",
            };
          })
          .filter((item) => item.source === "help")
        );
        setLoading(false);
      },
      (err) => {
        console.error("Help reports listener failed:", err);
        setError(err.message ?? "Failed to load support reports.");
        setLoading(false);
      }
    );

    return () => unsub();
  }, [isAdmin]);

  const setReportStatus = async (item: SupportReport, status: SupportReport["status"]) => {
    setBusyId(item.id);
    setError(null);
    try {
      await updateDoc(doc(db, "feedback", item.id), {
        status,
        reviewedBy: user?.uid ?? "",
        updatedAt: serverTimestamp(),
      });
    } catch (err: any) {
      setError(err?.message ?? "Could not update report.");
    } finally {
      setBusyId(null);
    }
  };

  const openCount = items.filter((item) => item.status === "open").length;

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
              <h1 className="color-txt-main text-2xl font-bold">Help Reports</h1>
              <p className="color-txt-sub text-sm">Review support requests sent from the account help form.</p>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl color-bg-grey-5 color-txt-sub text-sm font-semibold">
            <LuLifeBuoy size={16} />
            {openCount} open
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
            Loading help reports...
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl color-bg-grey-5 p-10 text-center color-txt-sub">
            No help reports yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {items.map((item) => (
              <article key={item.id} className="rounded-2xl color-bg-grey-5 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full color-bg-accent color-txt-accent px-3 py-1 text-xs font-bold">
                        {item.issueType}
                      </span>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${
                          item.status === "open"
                            ? "bg-amber-500/15 text-amber-500"
                            : "bg-green-500/15 text-green-500"
                        }`}
                      >
                        {item.status === "open" ? "Open" : "Resolved"}
                      </span>
                      {item.createdAt && (
                        <span className="color-txt-sub text-xs font-semibold">{timeAgo(item.createdAt)}</span>
                      )}
                    </div>
                    <h2 className="mt-3 color-txt-main text-lg font-bold break-words">{item.subject}</h2>
                  </div>
                </div>

                <div className="mt-4 rounded-xl color-bg p-4">
                  <p className="color-txt-main text-sm leading-relaxed whitespace-pre-wrap">{item.description}</p>
                </div>

                <div className="mt-4 grid gap-2 text-sm color-txt-sub">
                  <p>
                    From <span className="font-semibold color-txt-main">{item.username}</span>
                    {item.userId ? <span className="text-xs"> · {item.userId}</span> : null}
                  </p>
                  <a
                    href={`mailto:${item.contactEmail || item.userEmail}?subject=${encodeURIComponent(`Re: ${item.subject}`)}`}
                    className="inline-flex w-fit items-center gap-2 font-semibold color-txt-accent hover:underline"
                  >
                    <LuMail size={15} />
                    {item.contactEmail || item.userEmail || "No email"}
                  </a>
                </div>

                {item.attachments.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wide color-txt-sub">Attachments</p>
                    {item.attachments.map((attachment) => (
                      <a
                        key={attachment.path || attachment.url}
                        href={attachment.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-3 rounded-xl color-bg px-3 py-2 text-sm color-txt-main hover:opacity-80"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <LuPaperclip size={15} className="shrink-0 color-txt-accent" />
                          <span className="truncate">{attachment.name || "Attachment"}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2 color-txt-sub text-xs">
                          {formatBytes(attachment.size)}
                          <LuExternalLink size={13} />
                        </span>
                      </a>
                    ))}
                  </div>
                )}

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  {item.status === "open" ? (
                    <button
                      type="button"
                      onClick={() => void setReportStatus(item, "resolved")}
                      disabled={busyId === item.id}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl color-bg-accent color-txt-accent text-sm font-semibold hover:opacity-90 cursor-pointer disabled:opacity-50"
                    >
                      <LuCircleCheck size={15} />
                      Mark resolved
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void setReportStatus(item, "open")}
                      disabled={busyId === item.id}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl color-bg color-txt-main text-sm font-semibold hover:opacity-90 cursor-pointer disabled:opacity-50"
                    >
                      <LuRotateCcw size={15} />
                      Reopen
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
