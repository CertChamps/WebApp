import { useContext, useEffect, useMemo, useState } from "react";
import { LuClock3, LuLoaderCircle, LuTrendingUp, LuUserPlus, LuUsers, LuX } from "react-icons/lu";
import { UserContext } from "../context/UserContext";
import { isAdminUid } from "../constants/adminUids";
import AdminShell from "../components/admin/AdminShell";
import { loadAdminUsers, loadUserActivity, type AdminUserRecord, type UserActivitySnapshot } from "../lib/adminAnalytics";

const PERIODS = [7, 30, 90] as const;

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0m";
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const hours = seconds / 3600;
  return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)}h`;
}

export default function AdminDashboard() {
  const { user } = useContext(UserContext);
  const isAdmin = isAdminUid(user?.uid, user?.email);
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>(30);
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [activity, setActivity] = useState<UserActivitySnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    setLoading(true);
    loadAdminUsers()
      .then(async (records) => {
        if (!active) return;
        setUsers(records);
        const included = records.filter((record) => !record.excluded);
        const snapshots = await Promise.all(included.map((record) => loadUserActivity(record.uid)));
        if (active) setActivity(snapshots);
      })
      .catch((reason: unknown) => active && setError(reason instanceof Error ? reason.message : "Could not load dashboard data."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [isAdmin]);

  const summary = useMemo(() => {
    const now = Date.now();
    const start = now - period * 86_400_000;
    const includedUsers = users.filter((entry) => !entry.excluded);
    const byUid = new Map(activity.map((entry) => [entry.uid, entry]));
    let newUsers = 0;
    let returningUsers = 0;
    const periodSessions: UserActivitySnapshot["sessions"] = [];
    const daily = Array.from({ length: period }, (_, index) => ({
      time: start + index * 86_400_000,
      count: 0,
    }));
    includedUsers.forEach((entry) => {
      const snapshot = byUid.get(entry.uid);
      if (!snapshot) return;
      const first = entry.createdAtMs ?? snapshot.firstTrackedAt;
      const activeTimes = [...snapshot.loginDays, ...snapshot.sessions.map((session) => session.end)];
      const activeInPeriod = activeTimes.some((time) => time >= start && time <= now);
      if (first && first >= start && first <= now) newUsers += 1;
      else if (activeInPeriod) returningUsers += 1;
      snapshot.sessions.forEach((session) => {
        if (session.end >= start && session.end <= now) periodSessions.push(session);
      });
      daily.forEach((day) => {
        const end = day.time + 86_400_000;
        if (activeTimes.some((time) => time >= day.time && time < end)) day.count += 1;
      });
    });
    const averageSession = periodSessions.length
      ? periodSessions.reduce((sum, session) => sum + session.durationSeconds, 0) / periodSessions.length
      : 0;
    return { newUsers, returningUsers, totalUsers: includedUsers.length, averageSession, daily };
  }, [activity, period, users]);

  if (!isAdmin) {
    return <div className="flex-1 color-bg grid place-items-center"><div className="text-center color-txt-sub"><LuX size={42} className="mx-auto mb-3" /><p>Access denied</p></div></div>;
  }

  const maxDaily = Math.max(1, ...summary.daily.map((day) => day.count));
  const points = summary.daily.map((day, index) => {
    const x = summary.daily.length === 1 ? 0 : (index / (summary.daily.length - 1)) * 100;
    const y = 88 - (day.count / maxDaily) * 76;
    return `${x},${y}`;
  }).join(" ");

  return (
    <AdminShell
      title="Overview"
      actions={
        <label className="inline-flex items-center gap-2 text-sm font-semibold color-txt-sub">
          Period
          <select value={period} onChange={(event) => setPeriod(Number(event.target.value) as typeof period)} className="rounded-xl color-bg-grey-5 color-txt-main px-3 py-2 outline-none border border-transparent focus:border-[var(--accent)]">
            {PERIODS.map((days) => <option key={days} value={days}>Last {days} days</option>)}
          </select>
        </label>
      }
    >
      {error && <div role="alert" className="mb-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</div>}
      {loading ? (
        <div className="min-h-72 grid place-items-center color-txt-sub"><span className="inline-flex items-center gap-2"><LuLoaderCircle className="animate-spin" /> Loading metrics…</span></div>
      ) : (
        <>
          <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <Metric label="New users" value={summary.newUsers.toLocaleString()} icon={<LuUserPlus />} />
            <Metric label="Returning users" value={summary.returningUsers.toLocaleString()} icon={<LuTrendingUp />} />
            <Metric label="Total users" value={summary.totalUsers.toLocaleString()} icon={<LuUsers />} />
            <Metric label="Average session" value={formatDuration(summary.averageSession)} icon={<LuClock3 />} />
          </section>

          <section className="mt-4 rounded-2xl color-bg-grey-5 border border-[color-mix(in_srgb,var(--theme-txt-sub)_12%,transparent)] p-5 sm:p-6">
            <div className="flex items-baseline justify-between gap-4 mb-5">
              <div>
                <h2 className="font-bold color-txt-main">Daily active users</h2>
                <p className="text-sm color-txt-sub mt-1">Unique users with a login or recorded study session.</p>
              </div>
              <span className="text-sm font-semibold color-txt-main">Peak {maxDaily}</span>
            </div>
            <div className="h-64 w-full rounded-xl color-bg px-3 py-4">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible" role="img" aria-label={`Daily active users over the last ${period} days`}>
                <line x1="0" x2="100" y1="88" y2="88" stroke="currentColor" className="color-txt-sub" opacity="0.18" vectorEffect="non-scaling-stroke" />
                <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              </svg>
            </div>
            <div className="mt-3 flex justify-between text-xs color-txt-sub">
              <span>{new Date(summary.daily[0]?.time ?? Date.now()).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
              <span>Today</span>
            </div>
          </section>
          {users.some((entry) => entry.excluded) && <p className="mt-3 text-xs color-txt-sub">{users.filter((entry) => entry.excluded).length} excluded user{users.filter((entry) => entry.excluded).length === 1 ? "" : "s"} omitted from all metrics.</p>}
        </>
      )}
    </AdminShell>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <article className="rounded-2xl color-bg-grey-5 border border-[color-mix(in_srgb,var(--theme-txt-sub)_12%,transparent)] p-5">
      <div className="flex items-center justify-between gap-3 color-txt-sub">
        <p className="text-sm font-semibold">{label}</p>
        <span className="[&>svg]:w-[17px] [&>svg]:h-[17px]">{icon}</span>
      </div>
      <p className="mt-5 text-3xl font-bold tracking-[-0.04em] color-txt-main">{value}</p>
    </article>
  );
}

