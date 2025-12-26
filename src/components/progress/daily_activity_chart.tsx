import { useContext, useEffect, useMemo, useState } from "react";
import { collection, orderBy, query, limit, onSnapshot } from "firebase/firestore";
import { db } from "../../../firebase";
import { UserContext } from "../../context/UserContext";

type TimeScale = "week" | "month";

function formatDateKey(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getWeekKeys() {
  const today = new Date();
  const dayOfWeek = today.getDay();
  // Monday = 1, Sunday = 0
  const distanceToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(today);
  monday.setDate(monday.getDate() - distanceToMonday);

  const keys: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    keys.push(formatDateKey(d));
  }
  return keys;
}

function getMonthKeys(n: number = 30) {
  const keys: string[] = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    d.setDate(d.getDate() - i);
    keys.push(formatDateKey(d));
  }
  return keys;
}

const DailyActivityChart = () => {
  const { user } = useContext(UserContext);
  const [dailyMap, setDailyMap] = useState<Record<string, number>>({});
  const [timeScale, setTimeScale] = useState<TimeScale>("week");

  const daysToFetch = timeScale === "week" ? 7 : 30;

  useEffect(() => {
    if (!user?.uid) return;
    const ref = collection(db, "user-data", user.uid, "daily-answers");
    const q = query(ref, orderBy("dayStartUtcTs", "desc"), limit(daysToFetch));
    const unsubscribe = onSnapshot(q, (snap) => {
      const map: Record<string, number> = {};
      snap.forEach((doc) => {
        const data = doc.data() as any;
        const key = data?.dateKey || doc.id;
        const total = typeof data?.totalCount === "number" ? data.totalCount : 0;
        map[key] = total;
      });
      setDailyMap(map);
    }, (err) => {
      console.error("Failed to fetch daily answers", err);
    });
    return () => unsubscribe();
  }, [user?.uid, daysToFetch]);

  const days = useMemo(() => {
    return timeScale === "week" ? getWeekKeys() : getMonthKeys();
  }, [timeScale]);

  const maxVal = useMemo(() => {
    let m = 0;
    days.forEach((k) => {
      m = Math.max(m, dailyMap[k] || 0);
    });
    return Math.max(m, 5);
  }, [dailyMap, days]);

  const timeScaleLabel = timeScale === "week" ? "This Week" : "Last 30 Days";

  return (
    <div className="daily-chart">
      <div className="daily-chart-header">
        <span className="daily-chart-title">Daily Activity</span>
        <div className="daily-chart-controls">
          <span className="daily-chart-subtitle">{timeScaleLabel}</span>
          <select 
            value={timeScale} 
            onChange={(e) => setTimeScale(e.target.value as TimeScale)}
            className="daily-chart-dropdown"
          >
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
        </div>
      </div>

      <div className={`daily-chart-container ${timeScale === "month" ? "month-view" : ""}`}>
        {days.map((k) => {
          const val = dailyMap[k] || 0;
          const heightPct = maxVal > 0 ? Math.round((val / maxVal) * 100) : 0;
          const dayName = new Date(k + "T00:00:00").toLocaleDateString("en-US", { weekday: "short" });
          return (
            <div key={k} className="daily-bar-group">
              <div className="daily-bar-container" title={`${k}: ${val} correct`}>
                <div className="daily-bar" style={{ height: `${heightPct}%` }} />
              </div>
              <div className="daily-bar-label">{dayName}</div>
              <div className="daily-bar-count">{val}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DailyActivityChart;
