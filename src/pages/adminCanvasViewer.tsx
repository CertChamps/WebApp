import { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";
import {
  LuArrowLeft,
  LuCalendarClock,
  LuClock3,
  LuDatabase,
  LuFileJson,
  LuLoaderCircle,
  LuSearch,
  LuUser,
  LuX,
} from "react-icons/lu";
import { UserContext } from "../context/UserContext";
import { isAdminUid } from "../constants/adminUids";
import { db, storage } from "../../firebase";

type Point = {
  x: number;
  y: number;
  pressure?: number;
};

type Stroke = {
  points: Point[];
  tool?: "pen" | "eraser" | string;
  color?: string;
  brushRadius?: number;
};

type CanvasDrawLinePoint = {
  x: number;
  y: number;
};

type CanvasDrawLine = {
  points: CanvasDrawLinePoint[];
  brushRadius?: number;
  brushColor?: string;
};

type CanvasJsonPayload = Stroke[] | { strokes?: Stroke[]; lines?: CanvasDrawLine[] };

type UserSummary = {
  uid: string;
  username: string;
  email: string;
  pictureUrl: string;
  userDoc: Record<string, unknown>;
  lastActivityMs: number | null;
};

type TrackedDoc = {
  id: string;
  data: Record<string, unknown>;
};

type UserDetails = {
  sessions: TrackedDoc[];
  questionLog: TrackedDoc[];
  questionData: TrackedDoc[];
  dailyLogins: TrackedDoc[];
  dailyAnswers: TrackedDoc[];
  paperProgress: TrackedDoc[];
  completedQuestions: TrackedDoc[];
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function toPoint(value: unknown): Point | null {
  if (Array.isArray(value) && value.length >= 2) {
    const x = Number(value[0]);
    const y = Number(value[1]);
    const pressure = Number(value[2]);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      return {
        x,
        y,
        ...(Number.isFinite(pressure) ? { pressure } : {}),
      };
    }
    return null;
  }

  if (!value || typeof value !== "object") return null;
  const p = value as Record<string, unknown>;
  const x = Number(p.x);
  const y = Number(p.y);
  const pressure = Number(p.pressure);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    x,
    y,
    ...(Number.isFinite(pressure) ? { pressure } : {}),
  };
}

function normalizeStroke(value: unknown): Stroke | null {
  if (!value || typeof value !== "object") return null;
  const stroke = value as Record<string, unknown>;
  const pointsRaw = Array.isArray(stroke.points) ? stroke.points : null;
  if (!pointsRaw || pointsRaw.length === 0) return null;

  const points = pointsRaw
    .map((point) => toPoint(point))
    .filter((point): point is Point => Boolean(point));

  if (points.length === 0) return null;

  return {
    points,
    tool: typeof stroke.tool === "string" ? stroke.tool : "pen",
    color: typeof stroke.color === "string" ? stroke.color : undefined,
    brushRadius: Number.isFinite(Number(stroke.brushRadius))
      ? Number(stroke.brushRadius)
      : undefined,
  };
}

function strokesFromObjectKeys(obj: Record<string, unknown>): Stroke[] {
  const guessedStrokeArrays = Object.values(obj).filter((v) => Array.isArray(v));
  for (const candidate of guessedStrokeArrays) {
    const normalized = (candidate as unknown[])
      .map((item) => normalizeStroke(item))
      .filter((item): item is Stroke => Boolean(item));
    if (normalized.length > 0) return normalized;
  }
  return [];
}

function parseCanvasJson(raw: string): Stroke[] {
  const firstPass = JSON.parse(raw) as unknown;
  const parsed: unknown = typeof firstPass === "string" ? JSON.parse(firstPass) : firstPass;

  if (Array.isArray(parsed)) {
    const strokes = parsed
      .map((item) => normalizeStroke(item))
      .filter((item): item is Stroke => Boolean(item));

    if (strokes.length === 0) {
      throw new Error("No valid strokes found in uploaded JSON array.");
    }

    return strokes;
  }

  if (parsed && typeof parsed === "object") {
    const payload = parsed as CanvasJsonPayload & Record<string, unknown>;

    const strokesFromObject = Array.isArray(payload.strokes) ? payload.strokes : null;
    if (strokesFromObject) {
      const normalized = strokesFromObject
        .map((s) => normalizeStroke(s))
        .filter((s): s is Stroke => Boolean(s));
      if (normalized.length > 0) {
        return normalized;
      }
    }

    const lines = Array.isArray(payload.lines) ? payload.lines : null;
    if (lines && lines.length > 0) {
      const converted: Stroke[] = lines
        .filter((line) => Array.isArray(line.points))
        .map((line) => ({
          points: (line.points ?? [])
            .map((point: unknown) => toPoint(point))
            .filter((point: Point | null): point is Point => Boolean(point)),
          tool: "pen",
          color: line.brushColor,
          brushRadius: line.brushRadius,
        }))
        .filter((line) => line.points.length > 0);

      if (converted.length === 0) {
        throw new Error("No drawable lines found in JSON lines payload.");
      }

      return converted;
    }

    const nestedJsonKeys = ["drawing", "canvas", "data", "payload", "value"];
    for (const key of nestedJsonKeys) {
      const maybe = payload[key];
      if (typeof maybe === "string") {
        try {
          const nested = parseCanvasJson(maybe);
          if (nested.length > 0) return nested;
        } catch {
          // Ignore and continue to other shapes.
        }
      }
    }

    const guessed = strokesFromObjectKeys(payload);
    if (guessed.length > 0) return guessed;
  }

  throw new Error("Could not find drawable strokes in this JSON file.");
}

function buildPath(points: Point[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x} ${p.y} l 0.01 0.01`;
  }

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i += 1) {
    const p = points[i];
    d += ` L ${p.x} ${p.y}`;
  }
  return d;
}

function toMillis(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();

  if (value && typeof value === "object") {
    const maybeTimestamp = value as { toMillis?: () => number; seconds?: number };
    if (typeof maybeTimestamp.toMillis === "function") {
      const ms = maybeTimestamp.toMillis();
      return Number.isFinite(ms) ? ms : null;
    }
    if (typeof maybeTimestamp.seconds === "number") {
      return maybeTimestamp.seconds * 1000;
    }
  }

  return null;
}

function cleanDocData(data: DocumentData): Record<string, unknown> {
  return Object.entries(data).reduce<Record<string, unknown>>((acc, [key, value]) => {
    if (value === undefined) return acc;
    acc[key] = value;
    return acc;
  }, {});
}

function extractDocs(snapshotDocs: QueryDocumentSnapshot<DocumentData, DocumentData>[]): TrackedDoc[] {
  return snapshotDocs.map((snap) => ({
    id: snap.id,
    data: cleanDocData(snap.data()),
  }));
}

async function resolveProfilePicture(pathOrUrl: string): Promise<string> {
  if (!pathOrUrl) return "";
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return pathOrUrl;
  }

  try {
    const imageRef = ref(storage, pathOrUrl);
    return await getDownloadURL(imageRef);
  } catch {
    return "";
  }
}

async function fetchLatestActivity(uid: string): Promise<number | null> {
  try {
    const [sessionsSnap, questionLogSnap, questionDataSnap, dailyLoginSnap] = await Promise.all([
      getDocs(query(collection(db, "user-data", uid, "sessions"), orderBy("endTime", "desc"), limit(1))),
      getDocs(query(collection(db, "user-data", uid, "question-log"), orderBy("timestamp", "desc"), limit(1))),
      getDocs(query(collection(db, "user-data", uid, "question-data"), orderBy("updatedAt", "desc"), limit(1))),
      getDocs(query(collection(db, "user-data", uid, "daily-logins"), orderBy("timestamp", "desc"), limit(1))),
    ]);

    const candidates: Array<number | null> = [
      toMillis(sessionsSnap.docs[0]?.data().endTime),
      toMillis(questionLogSnap.docs[0]?.data().timestamp),
      toMillis(questionDataSnap.docs[0]?.data().updatedAt),
      toMillis(dailyLoginSnap.docs[0]?.data().timestamp),
    ];

    const valid = candidates.filter((value): value is number => typeof value === "number");
    if (valid.length === 0) return null;
    return Math.max(...valid);
  } catch {
    return null;
  }
}

async function loadUserDetails(uid: string): Promise<UserDetails> {
  const [sessionsSnap, questionLogSnap, questionDataSnap, dailyLoginsSnap, dailyAnswersSnap, paperProgressSnap, completedQuestionsSnap] =
    await Promise.all([
      getDocs(query(collection(db, "user-data", uid, "sessions"), orderBy("endTime", "desc"), limit(200))),
      getDocs(query(collection(db, "user-data", uid, "question-log"), orderBy("timestamp", "desc"), limit(200))),
      getDocs(query(collection(db, "user-data", uid, "question-data"), orderBy("updatedAt", "desc"), limit(500))),
      getDocs(query(collection(db, "user-data", uid, "daily-logins"), orderBy("timestamp", "desc"), limit(60))),
      getDocs(query(collection(db, "user-data", uid, "daily-answers"), orderBy("date", "desc"), limit(60))),
      getDocs(collection(db, "user-data", uid, "paper-progress")),
      getDocs(collection(db, "user-data", uid, "completed-questions")),
    ]);

  return {
    sessions: extractDocs(sessionsSnap.docs),
    questionLog: extractDocs(questionLogSnap.docs),
    questionData: extractDocs(questionDataSnap.docs),
    dailyLogins: extractDocs(dailyLoginsSnap.docs),
    dailyAnswers: extractDocs(dailyAnswersSnap.docs),
    paperProgress: extractDocs(paperProgressSnap.docs),
    completedQuestions: extractDocs(completedQuestionsSnap.docs),
  };
}

function formatRelativeTime(ms: number | null): string {
  if (!ms) return "No tracked activity yet";
  const diff = Date.now() - ms;
  if (diff < 60_000) return "Active just now";
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 24 * 60 * 60_000) return `${Math.floor(diff / (60 * 60_000))}h ago`;
  return `${Math.floor(diff / (24 * 60 * 60_000))}d ago`;
}

export default function AdminCanvasViewer() {
  const { user } = useContext(UserContext);
  const navigate = useNavigate();

  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedUid, setSelectedUid] = useState<string>("");
  const [detailsByUid, setDetailsByUid] = useState<Record<string, UserDetails>>({});
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [pageError, setPageError] = useState("");

  const [selectedCanvasQuestionId, setSelectedCanvasQuestionId] = useState("");
  const [selectedCanvasRaw, setSelectedCanvasRaw] = useState("");
  const [selectedCanvasStrokes, setSelectedCanvasStrokes] = useState<Stroke[]>([]);
  const [loadingCanvas, setLoadingCanvas] = useState(false);
  const [canvasError, setCanvasError] = useState("");

  const isAdmin = isAdminUid(user?.uid);
  const selectedUser = users.find((entry) => entry.uid === selectedUid) ?? null;
  const selectedDetails = selectedUid ? detailsByUid[selectedUid] : undefined;

  useEffect(() => {
    if (!isAdmin) return;

    let cancelled = false;

    const fetchUsers = async () => {
      setLoadingUsers(true);
      setPageError("");
      try {
        const usersSnap = await getDocs(collection(db, "user-data"));
        const summaries = await Promise.all(
          usersSnap.docs.map(async (userSnap): Promise<UserSummary> => {
            const docData = cleanDocData(userSnap.data());
            const uid = typeof docData.uid === "string" && docData.uid ? docData.uid : userSnap.id;
            const username = typeof docData.username === "string" ? docData.username : "Unknown";
            const email = typeof docData.email === "string" ? docData.email : "";
            const picturePath = typeof docData.picture === "string" ? docData.picture : "";

            const [pictureUrl, lastActivityMs] = await Promise.all([
              resolveProfilePicture(picturePath),
              fetchLatestActivity(uid),
            ]);

            return {
              uid,
              username,
              email,
              pictureUrl,
              userDoc: docData,
              lastActivityMs,
            };
          })
        );

        summaries.sort((a, b) => {
          const aTime = a.lastActivityMs ?? 0;
          const bTime = b.lastActivityMs ?? 0;
          return bTime - aTime;
        });

        if (!cancelled) {
          setUsers(summaries);
          if (summaries.length > 0) {
            setSelectedUid((prev) => prev || summaries[0].uid);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setPageError(err instanceof Error ? err.message : "Failed to load users.");
        }
      } finally {
        if (!cancelled) {
          setLoadingUsers(false);
        }
      }
    };

    void fetchUsers();

    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!selectedUid || detailsByUid[selectedUid]) return;

    let cancelled = false;
    const fetchDetails = async () => {
      setLoadingDetails(true);
      try {
        const details = await loadUserDetails(selectedUid);
        if (!cancelled) {
          setDetailsByUid((prev) => ({ ...prev, [selectedUid]: details }));
          const firstCanvasDoc = details.questionData.find((entry) => typeof entry.data.storagePath === "string");
          setSelectedCanvasQuestionId(firstCanvasDoc?.id ?? "");
        }
      } catch {
        if (!cancelled) {
          setDetailsByUid((prev) => ({
            ...prev,
            [selectedUid]: {
              sessions: [],
              questionLog: [],
              questionData: [],
              dailyLogins: [],
              dailyAnswers: [],
              paperProgress: [],
              completedQuestions: [],
            },
          }));
        }
      } finally {
        if (!cancelled) {
          setLoadingDetails(false);
        }
      }
    };

    void fetchDetails();

    return () => {
      cancelled = true;
    };
  }, [selectedUid, detailsByUid]);

  useEffect(() => {
    if (!selectedUid || !selectedCanvasQuestionId) {
      setSelectedCanvasRaw("");
      setSelectedCanvasStrokes([]);
      setCanvasError("");
      return;
    }

    const details = detailsByUid[selectedUid];
    if (!details) return;
    const questionDoc = details.questionData.find((entry) => entry.id === selectedCanvasQuestionId);
    const storagePath = questionDoc?.data.storagePath;
    if (typeof storagePath !== "string" || !storagePath) {
      setSelectedCanvasRaw("");
      setSelectedCanvasStrokes([]);
      setCanvasError("No canvas storage path found for this question.");
      return;
    }

    let cancelled = false;
    const fetchCanvas = async () => {
      setLoadingCanvas(true);
      setCanvasError("");
      setSelectedCanvasRaw("");
      setSelectedCanvasStrokes([]);
      try {
        const url = await getDownloadURL(ref(storage, storagePath));
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch canvas file (${response.status}).`);
        }
        const text = await response.text();
        const parsed = parseCanvasJson(text);
        if (!cancelled) {
          setSelectedCanvasRaw(text);
          setSelectedCanvasStrokes(parsed);
        }
      } catch (err) {
        if (!cancelled) {
          setSelectedCanvasRaw("");
          setSelectedCanvasStrokes([]);
          setCanvasError(err instanceof Error ? err.message : "Failed to load canvas data.");
        }
      } finally {
        if (!cancelled) {
          setLoadingCanvas(false);
        }
      }
    };

    void fetchCanvas();
    return () => {
      cancelled = true;
    };
  }, [selectedCanvasQuestionId, selectedUid, detailsByUid]);

  const filteredUsers = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((entry) => {
      return (
        entry.username.toLowerCase().includes(needle) ||
        entry.email.toLowerCase().includes(needle) ||
        entry.uid.toLowerCase().includes(needle)
      );
    });
  }, [users, search]);

  const canvasBounds = useMemo(() => {
    const allPoints = selectedCanvasStrokes.flatMap((stroke) => stroke.points ?? []);
    if (allPoints.length === 0) return null;

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    allPoints.forEach((point) => {
      if (point.x < minX) minX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.x > maxX) maxX = point.x;
      if (point.y > maxY) maxY = point.y;
    });

    const pad = 24;
    return {
      minX: minX - pad,
      minY: minY - pad,
      width: Math.max(1, maxX - minX + pad * 2),
      height: Math.max(1, maxY - minY + pad * 2),
    };
  }, [selectedCanvasStrokes]);

  const canvasDocLabel = selectedCanvasQuestionId || "No question selected";

  const canvasAspectRatio = useMemo(() => {
    if (!canvasBounds) return 4 / 3;
    return Math.max(0.25, Math.min(4, canvasBounds.width / canvasBounds.height));
  }, [canvasBounds]);

  if (!isAdmin) {
    return (
      <div className="flex flex-1 min-w-0 min-h-0 w-full h-full items-center justify-center color-bg">
        <div className="color-bg-grey-5 p-8 rounded-xl text-center">
          <LuX size={48} className="color-txt-accent mx-auto mb-4" />
          <h2 className="txt-heading-colour text-2xl mb-2">Access Denied</h2>
          <p className="color-txt-sub">You don&apos;t have permission to view this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0 w-full h-full overflow-hidden color-bg">
      <div className="shrink-0 w-full mx-auto px-6 pt-6 pb-4 max-w-[1800px]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="color-bg-grey-5 p-2.5 rounded-xl hover:color-bg-grey-10 transition-all"
            aria-label="Go back"
          >
            <LuArrowLeft size={22} className="color-txt-accent" />
          </button>
          <div>
            <h1 className="color-txt-main text-2xl font-bold">Admin User Activity Tracker</h1>
            <p className="color-txt-sub text-sm">
              Full user stalking dashboard: activity, tracked documents, and per-question canvas playback.
            </p>
          </div>
        </div>
      </div>

      {pageError && (
        <div className="mt-4 px-4 py-3 rounded-xl color-bg-grey-5 color-txt-main border border-[var(--accent)]/30">
          {pageError}
        </div>
      )}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden w-full mx-auto px-6 pb-6 max-w-[1800px]">
      <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-5 h-full min-h-0">
        <section className="rounded-2xl color-bg-grey-5 p-4 flex flex-col min-h-0 h-full overflow-hidden">
          <div className="flex items-center gap-2 mb-3">
            <LuSearch size={16} className="color-txt-sub" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search username, email, UID"
              className="w-full rounded-lg px-3 py-2 text-sm color-bg-grey-10 color-txt-main outline-none border border-transparent focus:border-[var(--accent)]/50"
            />
          </div>

          <div className="color-txt-sub text-xs mb-2">
            {loadingUsers ? "Loading users..." : `${filteredUsers.length} users loaded`}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden space-y-2 pr-1 scrollbar-minimal">
            {loadingUsers && (
              <div className="flex items-center gap-2 color-txt-sub text-sm px-2 py-3">
                <LuLoaderCircle className="animate-spin" size={16} />
                Fetching user list and activity...
              </div>
            )}

            {!loadingUsers && filteredUsers.length === 0 && (
              <div className="color-txt-sub text-sm px-2 py-3">No users match your search.</div>
            )}

            {filteredUsers.map((entry) => {
              const isSelected = selectedUid === entry.uid;
              const isRecent = Boolean(entry.lastActivityMs && Date.now() - entry.lastActivityMs <= WEEK_MS);
              return (
                <button
                  key={entry.uid}
                  type="button"
                  onClick={() => {
                    setSelectedUid(entry.uid);
                    setSelectedCanvasQuestionId("");
                  }}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${
                    isSelected
                      ? "border-[var(--accent)]/60 color-bg-grey-10"
                      : isRecent
                        ? "border-emerald-400/50 color-bg-grey-10/70"
                        : "border-transparent color-bg-grey-10/40 hover:border-[var(--grey-20)]"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {entry.pictureUrl ? (
                      <img
                        src={entry.pictureUrl}
                        alt={entry.username}
                        className="w-10 h-10 rounded-full object-cover shrink-0 border border-[var(--grey-20)]"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full color-bg-grey-10 border border-[var(--grey-20)] flex items-center justify-center shrink-0">
                        <LuUser size={16} className="color-txt-sub" />
                      </div>
                    )}

                    <div className="min-w-0 w-full">
                      <div className="flex items-center justify-between gap-2">
                        <p className="color-txt-main text-sm font-semibold truncate">{entry.username || "Unknown"}</p>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full ${
                            isRecent ? "bg-emerald-500/20 text-emerald-300" : "color-bg-grey-5 color-txt-sub"
                          }`}
                        >
                          {isRecent ? "active (7d)" : "inactive"}
                        </span>
                      </div>
                      <p className="color-txt-sub text-xs truncate">{entry.email || "No email"}</p>
                      <p className="color-txt-sub text-[11px] truncate mt-1">UID: {entry.uid}</p>
                      <p className="color-txt-sub text-[11px] mt-1">{formatRelativeTime(entry.lastActivityMs)}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl color-bg-grey-5 p-4 min-h-0 h-full overflow-hidden flex flex-col">
          {!selectedUser ? (
            <div className="flex-1 flex items-center justify-center color-txt-sub">Select a user to inspect tracked data.</div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden space-y-5 pr-1 scrollbar-minimal">
              <div className="rounded-xl color-bg-grey-10 p-4 border border-[var(--grey-20)]">
                <div className="flex flex-wrap items-center gap-4">
                  {selectedUser.pictureUrl ? (
                    <img
                      src={selectedUser.pictureUrl}
                      alt={selectedUser.username}
                      className="w-16 h-16 rounded-full object-cover border border-[var(--grey-20)]"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full color-bg-grey-5 border border-[var(--grey-20)] flex items-center justify-center">
                      <LuUser size={24} className="color-txt-sub" />
                    </div>
                  )}

                  <div className="min-w-0">
                    <h2 className="color-txt-main text-xl font-bold truncate">{selectedUser.username || "Unknown user"}</h2>
                    <p className="color-txt-sub text-sm">{selectedUser.email || "No email"}</p>
                    <p className="color-txt-sub text-xs mt-1">UID: {selectedUser.uid}</p>
                  </div>

                  <div className="ml-auto flex items-center gap-4 text-xs color-txt-sub">
                    <span className="inline-flex items-center gap-1">
                      <LuClock3 size={14} />
                      {formatRelativeTime(selectedUser.lastActivityMs)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <LuCalendarClock size={14} />
                      {selectedUser.lastActivityMs ? new Date(selectedUser.lastActivityMs).toLocaleString() : "n/a"}
                    </span>
                  </div>
                </div>
              </div>

              {loadingDetails && !selectedDetails && (
                <div className="flex items-center gap-2 color-txt-sub text-sm px-2 py-3">
                  <LuLoaderCircle className="animate-spin" size={16} />
                  Loading tracked collections...
                </div>
              )}

              {selectedDetails && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
                    <StatCard label="Sessions" value={selectedDetails.sessions.length} />
                    <StatCard label="Question Logs" value={selectedDetails.questionLog.length} />
                    <StatCard label="Question Data" value={selectedDetails.questionData.length} />
                    <StatCard label="Daily Logins" value={selectedDetails.dailyLogins.length} />
                    <StatCard label="Daily Answers" value={selectedDetails.dailyAnswers.length} />
                    <StatCard label="Paper Progress" value={selectedDetails.paperProgress.length} />
                    <StatCard label="Completed Topics" value={selectedDetails.completedQuestions.length} />
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_1fr] gap-4">
                    <div className="rounded-xl color-bg-grey-10 p-4 border border-[var(--grey-20)]">
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <h3 className="color-txt-main font-semibold inline-flex items-center gap-2">
                          <LuDatabase size={16} />
                          Tracked User Doc
                        </h3>
                        <span className="text-xs color-txt-sub">root: user-data/{selectedUser.uid}</span>
                      </div>
                      <pre className="max-h-[300px] overflow-auto rounded-lg color-bg-grey-5 p-3 text-xs color-txt-main whitespace-pre-wrap break-words">
                        {JSON.stringify(selectedUser.userDoc, null, 2)}
                      </pre>
                    </div>

                    <div className="rounded-xl color-bg-grey-10 p-4 border border-[var(--grey-20)]">
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <h3 className="color-txt-main font-semibold">Recent Question Log</h3>
                        <span className="text-xs color-txt-sub">latest {Math.min(15, selectedDetails.questionLog.length)}</span>
                      </div>
                      <div className="space-y-2 max-h-[300px] overflow-auto pr-1">
                        {selectedDetails.questionLog.slice(0, 15).map((entry) => (
                          <div key={entry.id} className="rounded-lg color-bg-grey-5 p-2.5">
                            <p className="color-txt-main text-xs font-medium">{String(entry.data.questionName ?? "Unknown question")}</p>
                            <p className="color-txt-sub text-[11px]">questionId: {String(entry.data.questionId ?? entry.id)}</p>
                            <p className="color-txt-sub text-[11px]">
                              duration: {String(entry.data.durationSeconds ?? 0)}s | completed: {String(entry.data.completed ?? false)}
                            </p>
                          </div>
                        ))}
                        {selectedDetails.questionLog.length === 0 && (
                          <p className="color-txt-sub text-sm">No question-log entries.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr_1fr] gap-4">
                    <div className="rounded-xl color-bg-grey-10 p-4 border border-[var(--grey-20)]">
                      <h3 className="color-txt-main font-semibold mb-3">Canvas By Question</h3>
                      <div className="space-y-2 max-h-[360px] overflow-auto pr-1">
                        {selectedDetails.questionData.map((entry) => {
                          const storagePath = typeof entry.data.storagePath === "string" ? entry.data.storagePath : "";
                          const selected = entry.id === selectedCanvasQuestionId;
                          return (
                            <button
                              key={entry.id}
                              type="button"
                              onClick={() => setSelectedCanvasQuestionId(entry.id)}
                              className={`w-full text-left rounded-lg p-2.5 border transition-all ${
                                selected
                                  ? "border-[var(--accent)]/60 color-bg-grey-5"
                                  : "border-transparent color-bg-grey-5/60 hover:border-[var(--grey-20)]"
                              }`}
                            >
                              <p className="color-txt-main text-xs font-medium truncate">{entry.id}</p>
                              <p className="color-txt-sub text-[11px] truncate">{storagePath || "No storagePath"}</p>
                              <p className="color-txt-sub text-[11px]">strokes: {String(entry.data.strokeCount ?? 0)}</p>
                            </button>
                          );
                        })}
                        {selectedDetails.questionData.length === 0 && (
                          <p className="color-txt-sub text-sm">No canvas data stored for this user.</p>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl color-bg-grey-10 p-4 border border-[var(--grey-20)] flex flex-col">
                      <div className="flex items-center justify-between gap-2 mb-3 shrink-0">
                        <h3 className="color-txt-main font-semibold">Canvas Viewer</h3>
                        <span className="text-xs color-txt-sub truncate">{canvasDocLabel}</span>
                      </div>

                      {loadingCanvas && (
                        <div className="h-48 flex items-center justify-center color-txt-sub text-sm gap-2">
                          <LuLoaderCircle className="animate-spin" size={16} />
                          Loading canvas JSON...
                        </div>
                      )}

                      {!loadingCanvas && canvasError && (
                        <div className="h-48 rounded-xl border border-[var(--accent)]/30 px-3 py-2 color-txt-main text-sm flex items-center">
                          {canvasError}
                        </div>
                      )}

                      {!loadingCanvas && !canvasError && !canvasBounds && (
                        <div className="h-48 rounded-xl border border-dashed border-[var(--grey-20)] flex items-center justify-center color-txt-sub text-sm">
                          Select a question canvas to preview.
                        </div>
                      )}

                      {!loadingCanvas && !canvasError && canvasBounds && (
                        <div
                          className="w-full max-h-[min(360px,40vh)] overflow-hidden rounded-xl border border-[var(--grey-20)] bg-white"
                          style={{ aspectRatio: canvasAspectRatio }}
                        >
                          <svg
                            className="block w-full h-full"
                            viewBox={`${canvasBounds.minX} ${canvasBounds.minY} ${canvasBounds.width} ${canvasBounds.height}`}
                            preserveAspectRatio="xMidYMid meet"
                          >
                            <rect
                              x={canvasBounds.minX}
                              y={canvasBounds.minY}
                              width={canvasBounds.width}
                              height={canvasBounds.height}
                              fill="#ffffff"
                            />
                            {selectedCanvasStrokes.map((stroke, index) => {
                              const d = buildPath(stroke.points ?? []);
                              if (!d) return null;
                              const isEraser = stroke.tool === "eraser";
                              return (
                                <path
                                  key={`${index}-${stroke.points.length}`}
                                  d={d}
                                  fill="none"
                                  stroke={isEraser ? "#f3f4f6" : "#111827"}
                                  strokeWidth={
                                    stroke.brushRadius
                                      ? Math.max(1, stroke.brushRadius * 2)
                                      : isEraser
                                        ? 20
                                        : 3
                                  }
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  vectorEffect="non-scaling-stroke"
                                />
                              );
                            })}
                          </svg>
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl color-bg-grey-10 p-4 border border-[var(--grey-20)] flex flex-col">
                      <div className="flex items-center gap-2 mb-3 shrink-0">
                        <LuFileJson size={16} className="color-txt-sub" />
                        <h3 className="color-txt-main font-semibold">Canvas JSON</h3>
                      </div>
                      <pre className="max-h-[min(360px,40vh)] overflow-auto rounded-xl color-bg-grey-5 p-3 text-xs color-txt-main whitespace-pre-wrap break-words scrollbar-minimal">
                        {selectedCanvasRaw || "No canvas JSON loaded yet."}
                      </pre>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <CollectionPreview title="Sessions" docs={selectedDetails.sessions} />
                    <CollectionPreview title="Daily Logins" docs={selectedDetails.dailyLogins} />
                    <CollectionPreview title="Daily Answers" docs={selectedDetails.dailyAnswers} />
                    <CollectionPreview title="Paper Progress" docs={selectedDetails.paperProgress} />
                    <CollectionPreview title="Completed Questions" docs={selectedDetails.completedQuestions} />
                  </div>

                  <div className="rounded-xl color-bg-grey-10 p-4 border border-[var(--grey-20)]">
                    <h3 className="color-txt-main font-semibold mb-3">Selected User Full Snapshot</h3>
                    <pre className="max-h-[460px] overflow-auto rounded-xl color-bg-grey-5 p-3 text-xs color-txt-main whitespace-pre-wrap break-words">
                      {JSON.stringify(
                        {
                          user: selectedUser.userDoc,
                          tracked: selectedDetails,
                        },
                        null,
                        2
                      )}
                    </pre>
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl color-bg-grey-10 p-3 border border-[var(--grey-20)]">
      <p className="color-txt-sub text-xs">{label}</p>
      <p className="color-txt-main text-xl font-semibold mt-1">{value}</p>
    </div>
  );
}

function CollectionPreview({ title, docs }: { title: string; docs: TrackedDoc[] }) {
  return (
    <div className="rounded-xl color-bg-grey-10 p-4 border border-[var(--grey-20)]">
      <h3 className="color-txt-main font-semibold mb-3">{title}</h3>
      {docs.length === 0 ? (
        <p className="color-txt-sub text-sm">No documents.</p>
      ) : (
        <pre className="max-h-[280px] overflow-auto rounded-lg color-bg-grey-5 p-3 text-xs color-txt-main whitespace-pre-wrap break-words">
          {JSON.stringify(docs.slice(0, 30), null, 2)}
        </pre>
      )}
    </div>
  );
}
