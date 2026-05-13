import { useContext, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { doc, getDoc, getDocs, collection } from "firebase/firestore";
import { db } from "../../../firebase";
import { UserContext } from "../../context/UserContext";
import { getPastPaperTopicScope } from "../../data/mathsHigherTopics";
import type { PaperProgressEntry } from "../../hooks/usePaperProgress";
import {
  buildImageTopicBarStatsFromStorage,
  buildImageTopicBreakdownStats,
} from "../../lib/imageTopicProgress";
import { paperProgressEntryMatchesSubjectLevel } from "../../lib/matchPaperProgressEntry";
import logoImg from "../../assets/logo.png";

type TopicStat = { topic: string; completed: number; total: number };

type Props = {
  subject: string;
  level: string;
  entries: PaperProgressEntry[];
};

export default function TopicBarChart({ subject, level, entries }: Props) {
  const { user } = useContext(UserContext);
  const scope = useMemo(
    () => getPastPaperTopicScope(subject, level),
    [subject, level]
  );

  const [paperTopicStats, setPaperTopicStats] = useState<TopicStat[] | null>(null);
  /** When a past-paper topic scope exists, stay in loading until the Firestore pass finishes. */
  const [paperLoading, setPaperLoading] = useState(false);

  const [storageImageBars, setStorageImageBars] = useState<TopicStat[] | null>(null);
  const [storageImageLoading, setStorageImageLoading] = useState(false);

  useLayoutEffect(() => {
    if (user?.uid && scope) {
      setPaperLoading(true);
      setPaperTopicStats(null);
    } else {
      setPaperLoading(false);
    }
  }, [user?.uid, subject, level, scope]);

  const imageTopicStats = useMemo(
    () => buildImageTopicBreakdownStats(entries, subject, level),
    [entries, subject, level]
  );

  const completedSet = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) {
      if (paperProgressEntryMatchesSubjectLevel(e, subject, level)) {
        for (const qId of e.completedQuestions) set.add(qId);
      }
    }
    return set;
  }, [entries, subject, level]);

  const paperHasTopicTotals = useMemo(
    () => Boolean(paperTopicStats && paperTopicStats.some((s) => s.total > 0)),
    [paperTopicStats]
  );

  const displayStats = useMemo(() => {
    if (scope) {
      if (paperLoading) return null;
      if (paperHasTopicTotals) {
        return paperTopicStats;
      }
    }
    if (storageImageBars && storageImageBars.length > 0) return storageImageBars;
    if (imageTopicStats.length > 0) return imageTopicStats;
    return paperTopicStats;
  }, [
    scope,
    paperTopicStats,
    paperHasTopicTotals,
    imageTopicStats,
    paperLoading,
    storageImageBars,
  ]);

  const loading = useMemo(() => {
    if (!user?.uid) return false;
    if (scope && paperLoading) return true;
    if (storageImageLoading) return true;
    return false;
  }, [user?.uid, scope, paperLoading, storageImageLoading]);

  useEffect(() => {
    if (!user?.uid) {
      setPaperTopicStats(null);
      setPaperLoading(false);
      return;
    }
    if (!scope) {
      setPaperTopicStats(null);
      setPaperLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const levelRef = doc(
          db,
          "questions",
          "leavingcert",
          "subjects",
          subject.toLowerCase(),
          "levels",
          level.toLowerCase()
        );
        const levelSnap = await getDoc(levelRef);
        const sections = (levelSnap.data()?.sections as string[] | undefined) ?? [];
        const hasPapers =
          sections.includes("papers") ||
          subject.toLowerCase() === "maths" ||
          subject.toLowerCase() === "applied-maths";

        if (!hasPapers) {
          if (!cancelled) {
            setPaperTopicStats(null);
            setPaperLoading(false);
          }
          return;
        }

        const papersSnap = await getDocs(
          collection(
            db,
            "questions",
            "leavingcert",
            "subjects",
            subject.toLowerCase(),
            "levels",
            level.toLowerCase(),
            "papers"
          )
        );

        const topicMap = new Map<string, { completed: number; total: number }>();
        for (const t of scope.topics) {
          topicMap.set(t, { completed: 0, total: 0 });
        }

        for (const paperDoc of papersSnap.docs) {
          if (cancelled) return;
          const questionsSnap = await getDocs(
            collection(
              db,
              "questions",
              "leavingcert",
              "subjects",
              subject.toLowerCase(),
              "levels",
              level.toLowerCase(),
              "papers",
              paperDoc.id,
              "questions"
            )
          );

          for (const qDoc of questionsSnap.docs) {
            const tags: string[] = qDoc.data()?.tags ?? [];
            const isCompleted = completedSet.has(qDoc.id);

            for (const topic of scope.topics) {
              if (tags.some((t) => t === topic || tags.includes(topic))) {
                const stat = topicMap.get(topic)!;
                stat.total++;
                if (isCompleted) stat.completed++;
                break;
              }
            }
          }
        }

        if (!cancelled) {
          const stats: TopicStat[] = [];
          for (const t of scope.topics) {
            const s = topicMap.get(t);
            if (s) stats.push({ topic: t, completed: s.completed, total: s.total });
          }
          setPaperTopicStats(stats);
          setPaperLoading(false);
        }
      } catch (err) {
        console.error("Failed to load topic stats:", err);
        if (!cancelled) {
          setPaperTopicStats(null);
          setPaperLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.uid, subject, level, scope, completedSet]);

  useEffect(() => {
    if (!user?.uid) {
      setStorageImageBars(null);
      setStorageImageLoading(false);
      return;
    }

    if (scope && paperLoading) {
      setStorageImageLoading(false);
      return;
    }

    if (scope && paperHasTopicTotals) {
      setStorageImageBars(null);
      setStorageImageLoading(false);
      return;
    }

    let cancelled = false;
    setStorageImageLoading(true);

    buildImageTopicBarStatsFromStorage(subject, level, entries)
      .then((rows) => {
        if (!cancelled) setStorageImageBars(rows.length > 0 ? rows : null);
      })
      .catch(() => {
        if (!cancelled) setStorageImageBars(null);
      })
      .finally(() => {
        if (!cancelled) setStorageImageLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.uid, subject, level, entries, scope, paperLoading, paperHasTopicTotals]);

  if (loading) {
    return (
      <div className="topic-bar-chart rounded-2xl color-bg-grey-5 p-6 animate-pulse">
        <div className="h-4 w-32 rounded color-bg-grey-10 mb-6" />
        <div className="flex items-end gap-2 h-48">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 rounded-t color-bg-grey-10"
              style={{ height: `${20 + (i % 5) * 12}%` }}
            />
          ))}
        </div>
      </div>
    );
  }

  const noStorageOrProgressImage =
    !storageImageBars?.length && imageTopicStats.length === 0;

  if (!scope && noStorageOrProgressImage) {
    return (
      <div className="topic-bar-chart rounded-2xl color-bg-grey-5 p-6 flex flex-col items-center justify-center gap-3 min-h-[200px]">
        <p className="text-sm font-semibold color-txt-main">Topic Breakdown</p>
        <p className="text-xs color-txt-sub text-center max-w-xs">
          No image topics found in Storage for this subject and level, or content is still loading.
        </p>
      </div>
    );
  }

  if (!displayStats || displayStats.length === 0) {
    return (
      <div className="topic-bar-chart rounded-2xl color-bg-grey-5 p-6 flex flex-col items-center justify-center gap-3 min-h-[200px]">
        <p className="text-sm font-semibold color-txt-main">Topic Breakdown</p>
        <p className="text-xs color-txt-sub text-center max-w-xs">No topic data available yet.</p>
      </div>
    );
  }

  const showingImageBreakdown = !paperHasTopicTotals;

  const maxCompleted = Math.max(...displayStats.map((s) => s.completed), 1);
  const hasAnyCompleted = displayStats.some((s) => s.completed > 0);

  return (
    <div className="topic-bar-chart rounded-2xl color-bg-grey-5 p-6 min-w-0 max-w-full">
      <p className="text-base font-extrabold color-txt-main mb-1">Topic Breakdown</p>
      {showingImageBreakdown ? (
        <p className="text-xs color-txt-sub mb-4">
          Image practice: one bar per topic folder in Storage. Names and totals come from image
          filenames (grouped like in Practice Hub); completed counts come from your saved progress.
        </p>
      ) : (
        <div className="mb-3" />
      )}
      <div className="topic-bar-chart__container">
        <div className="topic-bar-chart__y-axis">
          <span className="text-[10px] color-txt-sub tabular-nums">{maxCompleted}</span>
          <span className="text-[10px] color-txt-sub tabular-nums">{Math.round(maxCompleted / 2)}</span>
          <span className="text-[10px] color-txt-sub tabular-nums">0</span>
        </div>
        <div className="topic-bar-chart__bars-scroll">
        <div className="topic-bar-chart__bars">
          {displayStats.map((stat, i) => {
            const pct = maxCompleted > 0 ? (stat.completed / maxCompleted) * 100 : 0;
            const isHighest = hasAnyCompleted && stat.completed === maxCompleted;
            return (
              <div key={`${stat.topic}-${i}`} className="topic-bar-chart__col">
                {isHighest && (
                  <img src={logoImg} alt="Crown" className="topic-bar-chart__crown" />
                )}
                <div className="topic-bar-chart__bar-wrapper">
                  <div
                    className="topic-bar-chart__bar"
                    style={{ height: `${Math.max(pct, 2)}%` }}
                    title={`${stat.completed} / ${stat.total}`}
                  />
                </div>
                <span className="topic-bar-chart__label" title={stat.topic}>
                  {stat.topic}
                </span>
              </div>
            );
          })}
        </div>
        </div>
      </div>
    </div>
  );
}
