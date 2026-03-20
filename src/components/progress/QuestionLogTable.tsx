import { useContext, useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../../firebase";
import { UserContext } from "../../context/UserContext";
import { LuCheck, LuX } from "react-icons/lu";

type LogEntry = {
  id: string;
  questionId: string;
  questionName: string;
  paperId: string;
  paperLabel: string;
  topics: string[];
  completed: boolean;
  durationSeconds: number;
  timestamp: number;
};

type Props = {
  subject: string;
  level: string;
};

const PAGE_SIZE = 10;

function shortLabel(name: string): string {
  const qMatch = name.match(/question\s+(\d+)/i);
  if (!qMatch) return name;
  const num = qMatch[1];
  const partMatch = name.match(/part\s+([a-z0-9\s,\-()]+)/i);
  if (!partMatch) return num;
  const raw = partMatch[1].trim().toLowerCase().replace(/[(),\s]+/g, "").replace(/-+/g, "-");
  return `${num}${raw}`;
}

function formatDuration(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m < 60) return sec > 0 ? `${m}m ${sec}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const day = d.getDate();
  const month = d.toLocaleString("en-IE", { month: "short" });
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${month} ${year}\n${hh}:${mm}`;
}

function shortPaper(label: string): string {
  return label
    .replace(/\b(20\d{2})\b/g, (_, y) => `'${y.slice(-2)}`)
    .replace(/\bPaper\s*/gi, "P");
}

export default function QuestionLogTable({ subject, level }: Props) {
  const { user } = useContext(UserContext);
  const [allEntries, setAllEntries] = useState<LogEntry[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setAllEntries([]);
    setVisibleCount(PAGE_SIZE);

    (async () => {
      try {
        const snap = await getDocs(
          collection(db, "user-data", user.uid, "question-log")
        );
        if (cancelled) return;

        const subLower = subject.toLowerCase();
        const lvlLower = level.toLowerCase();

        const list: LogEntry[] = [];
        for (const d of snap.docs) {
          const data = d.data();
          if (
            (data.subject ?? "").toLowerCase() !== subLower ||
            (data.level ?? "").toLowerCase() !== lvlLower
          ) continue;

          list.push({
            id: d.id,
            questionId: data.questionId ?? "",
            questionName: data.questionName ?? "",
            paperId: data.paperId ?? "",
            paperLabel: data.paperLabel ?? "",
            topics: Array.isArray(data.topics) ? data.topics : [],
            completed: !!data.completed,
            durationSeconds: typeof data.durationSeconds === "number" ? data.durationSeconds : 0,
            timestamp: typeof data.timestamp === "number" ? data.timestamp : 0,
          });
        }

        list.sort((a, b) => b.timestamp - a.timestamp);
        setAllEntries(list);
      } catch (err) {
        console.error("Failed to load question log:", err);
        if (!cancelled) setAllEntries([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user?.uid, subject, level]);

  const entries = allEntries.slice(0, visibleCount);
  const hasMore = visibleCount < allEntries.length;

  if (loading) {
    return (
      <div className="rounded-2xl color-bg-grey-5 p-6 animate-pulse">
        <div className="h-4 w-40 rounded color-bg-grey-10 mb-4" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 rounded color-bg-grey-10" />
          ))}
        </div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl color-bg-grey-5 p-6 flex flex-col items-center justify-center gap-3 min-h-[160px]">
        <p className="text-base font-extrabold color-txt-main">Question Log</p>
        <p className="text-xs color-txt-sub text-center max-w-xs">
          No question sessions logged yet. Start a past paper to begin tracking.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl color-bg-grey-5 p-6">
      <p className="text-base font-extrabold color-txt-main mb-4">Question Log</p>
      <div className="question-log-table__scroll overflow-x-auto">
        <table className="question-log-table w-full">
          <thead>
            <tr className="question-log-table__header">
              <th>question</th>
              <th>paper</th>
              <th>topic</th>
              <th>time</th>
              <th>completed</th>
              <th>date</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => (
              <tr
                key={entry.id}
                className={i % 2 === 0 ? "question-log-table__row" : "question-log-table__row question-log-table__row--alt"}
              >
                <td className="font-semibold">{shortLabel(entry.questionName)}</td>
                <td>{shortPaper(entry.paperLabel)}</td>
                <td className="truncate max-w-[120px]" title={entry.topics.join(", ")}>
                  {entry.topics.length > 0 ? entry.topics[0] : "—"}
                </td>
                <td className="tabular-nums">{formatDuration(entry.durationSeconds)}</td>
                <td>
                  <span className="inline-flex justify-center w-full">
                    {entry.completed ? (
                      <LuCheck size={14} className="color-txt-accent" />
                    ) : (
                      <LuX size={14} className="color-txt-sub opacity-40" />
                    )}
                  </span>
                </td>
                <td className="whitespace-pre-line">{formatDate(entry.timestamp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <button
          type="button"
          onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          className="question-log-table__load-more"
        >
          load more
        </button>
      )}
    </div>
  );
}
