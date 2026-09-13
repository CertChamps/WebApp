import { useMemo, useState } from "react";
import { useAllPaperProgress } from "../../hooks/usePaperProgress";
import { useSubjectLevels } from "../../hooks/useSubjectLevels";
import { normalizePaperLevel } from "../../hooks/useExamPapers";
import SubjectProgressCard from "../../components/progress/SubjectProgressCard";
import { paperProgressEntryMatchesSubjectLevel } from "../../lib/matchPaperProgressEntry";
import {
  subjectMatchesFavourite,
  useSyncedFavouriteSubjectIds,
} from "../../data/practiceHubSubjects";
import {
  progressSubjectLevelKey,
  useProgressHiddenSubjectLevelKeys,
} from "../../hooks/useProgressHiddenSubjectLevels";
import "../../styles/progress.css";

// Canvas progress UI temporarily disabled — restore from git history when re-enabling.
const QUOTES: [string, string][] = [
  ["You don't have to be great to start, but you have to start to be great.", "Zig Ziglar"],
  ["The expert in anything was once a beginner.", "Helen Hayes"],
  ["Believe you can and you're halfway there.", "Theodore Roosevelt"],
  ["Success is the sum of small efforts repeated daily.", "Robert Collier"],
  ["Don't watch the clock; do what it does — keep going.", "Sam Levenson"],
  ["It always seems impossible until it's done.", "Nelson Mandela"],
  ["Hard work beats talent when talent doesn't work hard.", "Tim Notke"],
  ["The only way to do great work is to love what you do.", "Steve Jobs"],
  ["Dream big. Start small. Act now.", "Robin Sharma"],
  ["Discipline is choosing between what you want now and what you want most.", "Abraham Lincoln"],
  ["The journey of a thousand miles begins with one step.", "Lao Tzu"],
  ["Whether you think you can or you think you can't, you're right.", "Henry Ford"],
  ["I have not failed. I've just found 10,000 ways that won't work.", "Thomas A. Edison"],
  ["You miss 100% of the shots you don't take.", "Wayne Gretzky"],
  ["Do, or do not. There is no try.", "Yoda"],
  ["Success is not final, failure is not fatal: it is the courage to continue that counts.", "Winston Churchill"],
  ["The future belongs to those who believe in the beauty of their dreams.", "Eleanor Roosevelt"],
  ["The only limit to our realization of tomorrow is our doubts of today.", "Franklin D. Roosevelt"],
  ["In the middle of every difficulty lies opportunity.", "Albert Einstein"],
  ["Fall seven times and stand up eight.", "Japanese Proverb"],
  ["The best time to plant a tree was 20 years ago. The second best time is now.", "Chinese Proverb"],
  ["Everything you've ever wanted is on the other side of fear.", "George Addair"],
  ["If you are going through hell, keep going.", "Winston Churchill"],
  ["We are what we repeatedly do. Excellence, then, is not an act, but a habit.", "Will Durant"],
  ["What you get by achieving your goals is not as important as what you become by achieving your goals.", "Zig Ziglar"],
  ["I attribute my success to this: I never gave or took any excuse.", "Florence Nightingale"],
  ["Definiteness of purpose is the starting point of all achievement.", "W. Clement Stone"],
  ["Twenty years from now you will be more disappointed by the things that you didn't do than by the ones you did do.", "Mark Twain"],
  ["Eighty percent of success is showing up.", "Woody Allen"],
  ["Your time is limited, so don't waste it living someone else's life.", "Steve Jobs"],
  ["Winning isn't everything, but wanting to win is.", "Vince Lombardi"],
  ["I am not a product of my circumstances. I am a product of my decisions.", "Stephen Covey"],
  ["Every strike brings me closer to the next home run.", "Babe Ruth"],
  ["The two most important days in your life are the day you are born and the day you find out why.", "Mark Twain"],
  ["There is only one way to avoid criticism: do nothing, say nothing, and be nothing.", "Aristotle"]
];

const Progress = () => {
  const { entries: progressEntries, loading: progressLoading } = useAllPaperProgress();
  const { pairs: subjectLevels, loading: subjectLevelsLoading } = useSubjectLevels();
  const favouriteSubjectIds = useSyncedFavouriteSubjectIds();
  const hiddenSubjectLevelKeys = useProgressHiddenSubjectLevelKeys(progressEntries);

  const visibleSubjectLevels = useMemo(() => {
    const normLevel = (l: string) => normalizePaperLevel(l) || l.trim().toLowerCase();

    // Prefer curriculum subject+level pairs the user has touched, plus favourites.
    // Avoids a full past-paper catalogue scan on the overview (was hundreds of reads).
    const fromCurriculum = subjectLevels.filter(({ subject, level }) => {
      const isFavourite = subjectMatchesFavourite(subject, favouriteSubjectIds);
      if (isFavourite) return true;
      return progressEntries.some((e) =>
        paperProgressEntryMatchesSubjectLevel(e, subject, level)
      );
    });

    const keys = new Set(
      fromCurriculum.map((p) => `${p.subject.toLowerCase()}||${normLevel(p.level)}`)
    );

    const extras: { subject: string; level: string }[] = [];
    for (const e of progressEntries) {
      const sub = e.subject.trim().toLowerCase();
      const lvl = normLevel(e.level);
      const key = `${sub}||${lvl}`;
      if (keys.has(key)) continue;

      const matchesCurriculumRow = subjectLevels.some((sl) =>
        paperProgressEntryMatchesSubjectLevel(e, sl.subject, sl.level)
      );
      if (matchesCurriculumRow) continue;

      keys.add(key);
      extras.push({ subject: sub, level: lvl });
    }

    return [...fromCurriculum, ...extras]
      .filter((p) => !hiddenSubjectLevelKeys.has(progressSubjectLevelKey(p.subject, p.level)))
      .sort((a, b) => {
        const af = subjectMatchesFavourite(a.subject, favouriteSubjectIds);
        const bf = subjectMatchesFavourite(b.subject, favouriteSubjectIds);
        if (af !== bf) return af ? -1 : 1;
        return a.subject.localeCompare(b.subject, undefined, { sensitivity: "base" });
      });
  }, [subjectLevels, progressEntries, hiddenSubjectLevelKeys, favouriteSubjectIds]);

  const subjectGridLoading = subjectLevelsLoading || progressLoading;
  const [quote] = useState(() => {
    const q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    return q;
  });

  if (progressLoading) {
    return (
      <div className="progress-dashboard">
        <div className="p-6 md:p-10 flex flex-wrap gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="progress-module animate-pulse" style={{ width: 220, height: 220 }}>
              <div className="h-4 w-28 rounded color-bg-grey-10 mb-4" />
              <div className="w-24 h-24 mx-auto rounded-full color-bg-grey-10" />
              <div className="h-4 w-20 mx-auto rounded color-bg-grey-10 mt-4" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="progress-dashboard">
      <div className="progress-by-subject p-6 md:p-10 flex flex-col gap-4 shrink-0">
        <div className="flex items-baseline gap-4 min-w-0">
          <h2 className="text-3xl font-black color-txt-main shrink-0">Progress by Subject</h2>
          <span className="text-sm color-txt-sub italic truncate">&ldquo;{quote[0]}&rdquo; ~ {quote[1]}</span>
        </div>
        {subjectGridLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="rounded-2xl color-bg-grey-5 p-4 animate-pulse flex items-center justify-between gap-4"
              >
                <div className="h-4 w-24 rounded color-bg-grey-10" />
                <div className="w-12 h-12 rounded-full color-bg-grey-10" />
              </div>
            ))}
          </div>
        ) : visibleSubjectLevels.length === 0 ? (
          <p className="text-sm color-txt-sub">
            No subject progress yet. Open a subject in Practice Hub to get started.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleSubjectLevels.map(({ subject, level }) => (
              <SubjectProgressCard
                key={`${subject}-${level}`}
                subject={subject}
                level={level}
                entries={progressEntries}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Progress;
