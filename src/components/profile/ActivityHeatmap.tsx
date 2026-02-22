import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../../firebase";

type Props = {
  uid: string;
};

function formatDateKey(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_LABELS: Record<number, string> = { 1: "Mon", 3: "Wed", 5: "Fri" };
const TOTAL_WEEKS = 52;

export default function ActivityHeatmap({ uid }: Props) {
  const [loginDays, setLoginDays] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;

    (async () => {
      try {
        const ref = collection(db, "user-data", uid, "daily-logins");
        const snap = await getDocs(ref);
        const days = new Set<string>();
        snap.forEach((doc) => days.add(doc.id));
        if (!cancelled) {
          setLoginDays(days);
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to fetch login data", err);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [uid]);

  const { weeks, monthHeaders } = useMemo(() => {
    const today = new Date();
    const todayDow = today.getDay();
    const todayIdx = todayDow === 0 ? 6 : todayDow - 1;

    const totalDays = (TOTAL_WEEKS - 1) * 7 + todayIdx + 1;
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - totalDays + 1);

    const grid: { key: string; active: boolean; future: boolean }[][] = [];
    const months: { label: string; col: number }[] = [];
    let lastMonth = -1;

    let dayOffset = 0;
    for (let w = 0; w < TOTAL_WEEKS; w++) {
      const week: { key: string; active: boolean; future: boolean }[] = [];
      for (let d = 0; d < 7; d++) {
        const cellDate = new Date(startDate);
        cellDate.setDate(cellDate.getDate() + dayOffset);

        if (cellDate > today) {
          week.push({ key: "", active: false, future: true });
        } else {
          const key = formatDateKey(cellDate);
          week.push({ key, active: loginDays.has(key), future: false });
        }

        if (d === 0 && cellDate.getMonth() !== lastMonth) {
          lastMonth = cellDate.getMonth();
          months.push({ label: MONTH_LABELS[lastMonth], col: w });
        }

        dayOffset++;
      }
      grid.push(week);
    }

    return { weeks: grid, monthHeaders: months };
  }, [loginDays]);

  if (loading) {
    return (
      <div className="activity-heatmap rounded-lg p-4 animate-pulse">
        <div className="h-[100px] w-full rounded color-bg-grey-10" />
      </div>
    );
  }

  return (
    <div className="activity-heatmap rounded-lg p-4">
      <div className="overflow-x-auto scrollbar-minimal color-txt-accent">
        <div className="inline-grid gap-[3px]" style={{
          gridTemplateColumns: `auto repeat(${TOTAL_WEEKS}, 1fr)`,
          gridTemplateRows: `auto repeat(7, 1fr)`,
        }}>
          {/* Month headers row */}
          <div />
          {Array.from({ length: TOTAL_WEEKS }, (_, w) => {
            const header = monthHeaders.find((m) => m.col === w);
            return (
              <div key={`mh-${w}`} className="text-[10px] color-txt-sub leading-none h-3 whitespace-nowrap">
                {header ? header.label : ""}
              </div>
            );
          })}

          {/* Grid rows: 7 days (Mon=0 .. Sun=6) */}
          {Array.from({ length: 7 }, (_, d) => (
            <>
              <div key={`dl-${d}`} className="text-[10px] color-txt-sub leading-none flex items-center pr-1 h-[13px]">
                {DAY_LABELS[d] ?? ""}
              </div>
              {weeks.map((week, w) => {
                const cell = week[d];
                if (cell.future) {
                  return <div key={`c-${w}-${d}`} className="w-[13px] h-[13px]" />;
                }
                return (
                  <div
                    key={`c-${w}-${d}`}
                    className={`w-[13px] h-[13px] rounded-[2px] ${cell.active ? "bg-current" : "color-bg-grey-10"}`}
                    title={cell.key}
                  />
                );
              })}
            </>
          ))}
        </div>
      </div>
    </div>
  );
}
