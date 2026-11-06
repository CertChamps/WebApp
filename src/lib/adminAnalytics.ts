import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  type DocumentData,
} from "firebase/firestore";
import { db } from "../../firebase";

export type AdminUserRecord = {
  uid: string;
  username: string;
  email: string;
  picture: string;
  isAce: boolean;
  excluded: boolean;
  totalStudySeconds: number;
  createdAtMs: number | null;
  raw: Record<string, unknown>;
};

export type UserActivitySnapshot = {
  uid: string;
  sessions: Array<{ start: number; end: number; durationSeconds: number }>;
  loginDays: number[];
  firstTrackedAt: number | null;
  lastTrackedAt: number | null;
};

export function valueToMillis(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value;
  }
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === "object") {
    const timestamp = value as { toMillis?: () => number; seconds?: number };
    if (typeof timestamp.toMillis === "function") return timestamp.toMillis();
    if (typeof timestamp.seconds === "number") return timestamp.seconds * 1000;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export async function loadAdminUsers(): Promise<AdminUserRecord[]> {
  const snapshot = await getDocs(collection(db, "user-data"));
  return snapshot.docs.map((entry) => {
    const data = entry.data() as Record<string, unknown>;
    const createdAtMs = [data.createdAt, data.accountCreatedAt, data.termsAcceptedAt]
      .map(valueToMillis)
      .find((value): value is number => value != null) ?? null;
    return {
      uid: typeof data.uid === "string" && data.uid ? data.uid : entry.id,
      username: typeof data.username === "string" && data.username ? data.username : "Unknown user",
      email: typeof data.email === "string" ? data.email : "",
      picture: typeof data.picture === "string" ? data.picture : "",
      isAce: data.isPro === true,
      excluded: data.excludeFromAdminAnalytics === true,
      totalStudySeconds: Number(data.totalStudySeconds) || 0,
      createdAtMs,
      raw: data,
    };
  });
}

export async function loadUserActivity(uid: string): Promise<UserActivitySnapshot> {
  const [sessionSnapshot, loginSnapshot] = await Promise.all([
    getDocs(query(collection(db, "user-data", uid, "sessions"), orderBy("endTime", "desc"), limit(500))),
    getDocs(query(collection(db, "user-data", uid, "daily-logins"), orderBy("timestamp", "desc"), limit(500))),
  ]);
  const sessions = sessionSnapshot.docs.map((entry) => {
    const data = entry.data() as DocumentData;
    const end = valueToMillis(data.endTime) ?? 0;
    const durationSeconds = Math.max(0, Number(data.durationSeconds) || 0);
    const start = valueToMillis(data.startTime) ?? (end ? end - durationSeconds * 1000 : 0);
    return { start, end, durationSeconds };
  }).filter((session) => session.end > 0);
  const loginDays = loginSnapshot.docs
    .map((entry) => valueToMillis(entry.data().timestamp))
    .filter((value): value is number => value != null);
  const tracked = [...sessions.flatMap((session) => [session.start, session.end]), ...loginDays].filter(Boolean);
  return {
    uid,
    sessions,
    loginDays,
    firstTrackedAt: tracked.length ? Math.min(...tracked) : null,
    lastTrackedAt: tracked.length ? Math.max(...tracked) : null,
  };
}

export async function loadUserLastActivity(uid: string): Promise<number | null> {
  const [sessionSnapshot, loginSnapshot] = await Promise.all([
    getDocs(query(collection(db, "user-data", uid, "sessions"), orderBy("endTime", "desc"), limit(1))),
    getDocs(query(collection(db, "user-data", uid, "daily-logins"), orderBy("timestamp", "desc"), limit(1))),
  ]);
  const values = [
    valueToMillis(sessionSnapshot.docs[0]?.data().endTime),
    valueToMillis(loginSnapshot.docs[0]?.data().timestamp),
  ].filter((value): value is number => value != null);
  return values.length ? Math.max(...values) : null;
}
