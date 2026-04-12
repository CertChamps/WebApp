import { useContext, useEffect, useMemo, useState } from "react";
import { doc, getDoc, getDocs, collection } from "firebase/firestore";
import { db } from "../../../firebase";
import { UserContext } from "../../context/UserContext";
import { getPastPaperTopicScope } from "../../data/mathsHigherTopics";
import type { PaperProgressEntry } from "../../hooks/usePaperProgress";
import logoImg from "../../assets/logo.png";

type TopicStat = { topic: string; completed: number; total: number };

type Props = {
  subject: string;
  level: string;
  entries: PaperProgressEntry[];
};

export default function TopicBarChart({ subject, level, entries }: Props) {
  const { user } = useContext(UserContext);
  const [topicStats, setTopicStats] = useState<TopicStat[] | null>(null);
  const [loading, setLoading] = useState(true);

  const scope = useMemo(
    () => getPastPaperTopicScope(subject, level),
    [subject, level]
  );

  const completedSet = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) {
      if (
        e.subject.toLowerCase() === subject.toLowerCase() &&
        e.level.toLowerCase() === level.toLowerCase()
      ) {
        for (const qId of e.completedQuestions) set.add(qId);
      }
    }
    return set;
  }, [entries, subject, level]);

  useEffect(() => {
    if (!user?.uid || !scope) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const levelRef = doc(
          db, "questions", "leavingcert", "subjects", subject.toLowerCase(), "levels", level.toLowerCase()
        );
        const levelSnap = await getDoc(levelRef);
        const sections = (levelSnap.data()?.sections as string[] | undefined) ?? [];
        const hasPapers = sections.includes("papers") ||
          subject.toLowerCase() === "maths" ||
          subject.toLowerCase() === "applied-maths";

        if (!hasPapers) {
          if (!cancelled) {
            setTopicStats(null);
            setLoading(false);
          }
          return;
        }

        const papersSnap = await getDocs(collection(
          db, "questions", "leavingcert", "subjects", subject.toLowerCase(), "levels", level.toLowerCase(), "papers"
        ));

        const topicMap = new Map<string, { completed: number; total: number }>();
        for (const t of scope.topics) {
          topicMap.set(t, { completed: 0, total: 0 });
        }

        for (const paperDoc of papersSnap.docs) {
          if (cancelled) return;
          const questionsSnap = await getDocs(collection(
            db, "questions", "leavingcert", "subjects", subject.toLowerCase(), "levels", level.toLowerCase(), "papers", paperDoc.id, "questions"
          ));

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
          setTopicStats(stats);
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to load topic stats:", err);
        if (!cancelled) {
          setTopicStats(null);
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [user?.uid, subject, level, scope, completedSet]);

  if (loading) {
    return (
      <div className="topic-bar-chart rounded-2xl color-bg-grey-5 p-6 animate-pulse">
        <div className="h-4 w-32 rounded color-bg-grey-10 mb-6" />
        <div className="flex items-end gap-2 h-48">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex-1 rounded-t color-bg-grey-10" style={{ height: `${20 + Math.random() * 60}%` }} />
          ))}
        </div>
      </div>
    );
  }

  if (!scope) {
    return (
      <div className="topic-bar-chart rounded-2xl color-bg-grey-5 p-6 flex flex-col items-center justify-center gap-3 min-h-[200px]">
        <p className="text-sm font-semibold color-txt-main">Topic Breakdown</p>
        <p className="text-xs color-txt-sub text-center max-w-xs">
          Topic data for this subject is being worked on and will be available soon.
        </p>
      </div>
    );
  }

  if (!topicStats || topicStats.length === 0) {
    return (
      <div className="topic-bar-chart rounded-2xl color-bg-grey-5 p-6 flex flex-col items-center justify-center gap-3 min-h-[200px]">
        <p className="text-sm font-semibold color-txt-main">Topic Breakdown</p>
        <p className="text-xs color-txt-sub text-center max-w-xs">No topic data available yet.</p>
      </div>
    );
  }

  const maxCompleted = Math.max(...topicStats.map((s) => s.completed), 1);
  const hasAnyCompleted = topicStats.some((s) => s.completed > 0);

  return (
    <div className="topic-bar-chart rounded-2xl color-bg-grey-5 p-6">
      <p className="text-base font-extrabold color-txt-main mb-4">Topic Breakdown</p>
      <div className="topic-bar-chart__container">
        <div className="topic-bar-chart__y-axis">
          <span className="text-[10px] color-txt-sub tabular-nums">{maxCompleted}</span>
          <span className="text-[10px] color-txt-sub tabular-nums">{Math.round(maxCompleted / 2)}</span>
          <span className="text-[10px] color-txt-sub tabular-nums">0</span>
        </div>
        <div className="topic-bar-chart__bars">
          {topicStats.map((stat) => {
            const pct = maxCompleted > 0 ? (stat.completed / maxCompleted) * 100 : 0;
            const isHighest = hasAnyCompleted && stat.completed === maxCompleted;
            return (
              <div key={stat.topic} className="topic-bar-chart__col">
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
  );
}
