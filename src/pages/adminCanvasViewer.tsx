import { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, doc, getDocs, limit, orderBy, query, setDoc, updateDoc, type DocumentData } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { LuBan, LuCheck, LuClock3, LuCopyPlus, LuFileQuestion, LuLoaderCircle, LuSearch, LuUser, LuX } from "react-icons/lu";
import { UserContext } from "../context/UserContext";
import { isAdminUid } from "../constants/adminUids";
import { db, storage } from "../../firebase";
import AdminShell from "../components/admin/AdminShell";
import { loadAdminUsers, loadUserLastActivity, valueToMillis, type AdminUserRecord } from "../lib/adminAnalytics";
import { getLastWhiteboardsSubject } from "../data/whiteboardSubject";
import { whiteboardCanvasId } from "../data/whiteboards";
import { sessionDeviceLabel } from "../lib/sessionDevice";

type Point = { x: number; y: number; pressure?: number };
type Stroke = { points: Point[]; tool?: string; color?: string; brushRadius?: number };
type CanvasObject = { id: string; src: string; x: number; y: number; width: number; height: number; pinnedToSide?: boolean };
type CanvasText = { id: string; text: string; x: number; y: number; width: number; height: number; fontSize: number };
type TrackedDoc = { id: string; data: Record<string, unknown> };
type UserDetails = { sessions: TrackedDoc[]; questionLog: TrackedDoc[]; questionData: TrackedDoc[]; dailyLogins: TrackedDoc[]; paperProgress: TrackedDoc[]; completedQuestions: TrackedDoc[] };
type UserListRecord = AdminUserRecord & { lastActivityMs: number | null; pictureUrl: string };
const EMPTY_DETAILS: UserDetails = { sessions: [], questionLog: [], questionData: [], dailyLogins: [], paperProgress: [], completedQuestions: [] };

function docs(snapshot: { docs: Array<{ id: string; data: () => DocumentData }> }): TrackedDoc[] {
  return snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() as Record<string, unknown> }));
}

async function loadDetails(uid: string): Promise<UserDetails> {
  const [sessions, questionLog, questionData, dailyLogins, paperProgress, completedQuestions] = await Promise.all([
    getDocs(query(collection(db, "user-data", uid, "sessions"), orderBy("endTime", "desc"), limit(200))),
    getDocs(query(collection(db, "user-data", uid, "question-log"), orderBy("timestamp", "desc"), limit(200))),
    getDocs(query(collection(db, "user-data", uid, "question-data"), orderBy("updatedAt", "desc"), limit(500))),
    getDocs(query(collection(db, "user-data", uid, "daily-logins"), orderBy("timestamp", "desc"), limit(180))),
    getDocs(collection(db, "user-data", uid, "paper-progress")),
    getDocs(collection(db, "user-data", uid, "completed-questions")),
  ]);
  return { sessions: docs(sessions), questionLog: docs(questionLog), questionData: docs(questionData), dailyLogins: docs(dailyLogins), paperProgress: docs(paperProgress), completedQuestions: docs(completedQuestions) };
}

function point(value: unknown): Point | null {
  if (Array.isArray(value)) {
    const x = Number(value[0]); const y = Number(value[1]); const pressure = Number(value[2]);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y, ...(Number.isFinite(pressure) ? { pressure } : {}) } : null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const x = Number(record.x); const y = Number(record.y); const pressure = Number(record.pressure);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y, ...(Number.isFinite(pressure) ? { pressure } : {}) } : null;
}

function parseStrokes(raw: string): Stroke[] {
  const first = JSON.parse(raw) as unknown;
  const parsed = typeof first === "string" ? JSON.parse(first) as unknown : first;
  const source = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" && Array.isArray((parsed as { strokes?: unknown }).strokes) ? (parsed as { strokes: unknown[] }).strokes : [];
  return source.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const entry = item as Record<string, unknown>;
    const points = Array.isArray(entry.points) ? entry.points.map(point).filter((p): p is Point => Boolean(p)) : [];
    if (!points.length) return [];
    return [{ points, tool: typeof entry.tool === "string" ? entry.tool : "pen", color: typeof entry.color === "string" ? entry.color : undefined, brushRadius: Number.isFinite(Number(entry.brushRadius)) ? Number(entry.brushRadius) : undefined }];
  });
}

function parseCanvasExtras(raw: string): { objects: CanvasObject[]; textBoxes: CanvasText[] } {
  const first = JSON.parse(raw) as unknown;
  const parsed = typeof first === "string" ? JSON.parse(first) as unknown : first;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { objects: [], textBoxes: [] };
  const value = parsed as { objects?: unknown; textBoxes?: unknown };
  const objects = Array.isArray(value.objects) ? value.objects.filter((item): item is CanvasObject => {
    if (!item || typeof item !== "object") return false;
    const object = item as Partial<CanvasObject>;
    return typeof object.id === "string" && typeof object.src === "string" && [object.x, object.y, object.width, object.height].every((number) => typeof number === "number" && Number.isFinite(number));
  }) : [];
  const textBoxes = Array.isArray(value.textBoxes) ? value.textBoxes.filter((item): item is CanvasText => {
    if (!item || typeof item !== "object") return false;
    const box = item as Partial<CanvasText>;
    return typeof box.id === "string" && typeof box.text === "string" && [box.x, box.y, box.width, box.height, box.fontSize].every((number) => typeof number === "number" && Number.isFinite(number));
  }) : [];
  return { objects, textBoxes };
}

function pathFor(points: Point[]): string { return points.reduce((path, current, index) => `${path}${index ? " L" : "M"} ${current.x} ${current.y}`, ""); }
function duration(seconds: number): string { if (seconds < 60) return `${Math.round(seconds)}s`; if (seconds < 3600) return `${Math.round(seconds / 60)}m`; return `${(seconds / 3600).toFixed(seconds < 36_000 ? 1 : 0)}h`; }
function relative(ms: number | null): string { if (!ms) return "No activity"; const diff = Date.now() - ms; if (diff < 60_000) return "Just now"; if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`; if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`; return `${Math.floor(diff / 86_400_000)}d ago`; }

export default function AdminCanvasViewer() {
  const { user } = useContext(UserContext);
  const navigate = useNavigate();
  const isAdmin = isAdminUid(user?.uid, user?.email);
  const [users, setUsers] = useState<UserListRecord[]>([]);
  const [search, setSearch] = useState("");
  const [selectedUid, setSelectedUid] = useState("");
  const [details, setDetails] = useState<Record<string, UserDetails>>({});
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [selectedCanvas, setSelectedCanvas] = useState("");
  const [canvasRaw, setCanvasRaw] = useState("");
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [canvasObjects, setCanvasObjects] = useState<CanvasObject[]>([]);
  const [canvasText, setCanvasText] = useState<CanvasText[]>([]);
  const [canvasBusy, setCanvasBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    loadAdminUsers().then(async (records) => {
      const enriched = await Promise.all(records.map(async (record): Promise<UserListRecord> => {
        const pictureUrl = !record.picture
          ? ""
          : record.picture.startsWith("http://") || record.picture.startsWith("https://")
            ? record.picture
            : await getDownloadURL(ref(storage, record.picture)).catch(() => "");
        const lastActivityMs = await loadUserLastActivity(record.uid).catch(() => null);
        return { ...record, pictureUrl, lastActivityMs };
      }));
      enriched.sort((a, b) => (b.lastActivityMs ?? 0) - (a.lastActivityMs ?? 0));
      if (!active) return;
      setUsers(enriched);
      setSelectedUid((current) => current || enriched[0]?.uid || "");
    })
      .catch((error) => setMessage(error instanceof Error ? error.message : "Could not load users."))
      .finally(() => active && setLoadingUsers(false));
    return () => { active = false; };
  }, [isAdmin]);

  useEffect(() => {
    if (!selectedUid || details[selectedUid]) return;
    let active = true; setLoadingDetails(true);
    loadDetails(selectedUid).then((value) => { if (!active) return; setDetails((current) => ({ ...current, [selectedUid]: value })); setSelectedCanvas(value.questionData.find((entry) => typeof entry.data.storagePath === "string")?.id ?? ""); })
      .catch(() => active && setDetails((current) => ({ ...current, [selectedUid]: EMPTY_DETAILS })))
      .finally(() => active && setLoadingDetails(false));
    return () => { active = false; };
  }, [details, selectedUid]);

  const currentDetails = details[selectedUid];
  const selectedUser = users.find((entry) => entry.uid === selectedUid) ?? null;

  useEffect(() => {
    const entry = currentDetails?.questionData.find((item) => item.id === selectedCanvas);
    const storagePath = entry?.data.storagePath;
    if (typeof storagePath !== "string" || !storagePath) { setCanvasRaw(""); setStrokes([]); setCanvasObjects([]); setCanvasText([]); return; }
    let active = true; setCanvasBusy(true); setMessage("");
    getDownloadURL(ref(storage, storagePath)).then((url) => fetch(url, { cache: "no-store" })).then((response) => { if (!response.ok) throw new Error("Could not download this whiteboard."); return response.text(); })
      .then((raw) => { if (!active) return; const extras = parseCanvasExtras(raw); setCanvasRaw(raw); setStrokes(parseStrokes(raw)); setCanvasObjects(extras.objects); setCanvasText(extras.textBoxes); })
      .catch((error) => active && setMessage(error instanceof Error ? error.message : "Could not preview this whiteboard."))
      .finally(() => active && setCanvasBusy(false));
    return () => { active = false; };
  }, [currentDetails, selectedCanvas]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return users
      .filter((entry) => !needle || [entry.username, entry.email, entry.uid].some((value) => value.toLowerCase().includes(needle)))
      .sort((a, b) => (b.lastActivityMs ?? 0) - (a.lastActivityMs ?? 0));
  }, [search, users]);
  const lastActivity = useMemo(() => { if (!currentDetails) return null; const values = [...currentDetails.sessions.map((entry) => valueToMillis(entry.data.endTime)), ...currentDetails.questionLog.map((entry) => valueToMillis(entry.data.timestamp)), ...currentDetails.dailyLogins.map((entry) => valueToMillis(entry.data.timestamp))].filter((value): value is number => value != null); return values.length ? Math.max(...values) : null; }, [currentDetails]);
  const totalSessionSeconds = useMemo(() => currentDetails?.sessions.reduce((sum, entry) => sum + (Number(entry.data.durationSeconds) || 0), 0) ?? 0, [currentDetails]);
  const completedCount = currentDetails?.questionLog.filter((entry) => entry.data.completed === true).length ?? 0;
  const activeWeeks = useMemo(() => {
    if (!currentDetails) return 0;
    const now = Date.now();
    return new Set(currentDetails.dailyLogins.map((entry) => valueToMillis(entry.data.timestamp)).filter((value): value is number => value != null && value >= now - 28 * 86_400_000).map((value) => Math.min(3, Math.floor((now - value) / (7 * 86_400_000))))).size;
  }, [currentDetails]);
  const bounds = useMemo(() => {
    const all = strokes.flatMap((stroke) => stroke.points);
    const xs = [...all.map((p) => p.x), ...canvasObjects.flatMap((object) => [object.x, object.x + object.width]), ...canvasText.flatMap((box) => [box.x, box.x + box.width])];
    const ys = [...all.map((p) => p.y), ...canvasObjects.flatMap((object) => [object.y, object.y + object.height]), ...canvasText.flatMap((box) => [box.y, box.y + box.height])];
    if (!xs.length || !ys.length) return null;
    const pad = 30; const minX = Math.min(...xs) - pad; const minY = Math.min(...ys) - pad;
    return { minX, minY, width: Math.max(100, Math.max(...xs) - Math.min(...xs) + pad * 2), height: Math.max(100, Math.max(...ys) - Math.min(...ys) + pad * 2) };
  }, [canvasObjects, canvasText, strokes]);

  const toggleExcluded = async () => {
    if (!selectedUser) return;
    const next = !selectedUser.excluded;
    setUsers((current) => current.map((entry) => entry.uid === selectedUser.uid ? { ...entry, excluded: next } : entry));
    try { await updateDoc(doc(db, "user-data", selectedUser.uid), { excludeFromAdminAnalytics: next }); setMessage(next ? "User excluded from dashboard metrics." : "User included in dashboard metrics."); }
    catch (error) { setUsers((current) => current.map((entry) => entry.uid === selectedUser.uid ? { ...entry, excluded: !next } : entry)); setMessage(error instanceof Error ? error.message : "Could not update analytics inclusion."); }
  };

  const copyToWhiteboards = async () => {
    if (!user?.uid || !selectedUser || !canvasRaw || !selectedCanvas) return;
    setCanvasBusy(true); setMessage("");
    try {
      const now = Date.now(); const pageId = `admin_import_${now.toString(36)}`; const storageId = whiteboardCanvasId(pageId);
      const subject = getLastWhiteboardsSubject() || user.studyingSubjects?.[0] || "maths"; const path = `question-data/${user.uid}/${storageId}.json`;
      await uploadBytes(ref(storage, path), new Blob([canvasRaw], { type: "application/json" }));
      await Promise.all([
        setDoc(doc(db, "user-data", user.uid, "whiteboards-pages", pageId), { name: `${selectedUser.username} · ${selectedCanvas}`, subject, folderId: null, emoji: "🔎", attachedQuestions: [], pageType: "whiteboard", documentContent: "", order: Number.MAX_SAFE_INTEGER, createdAt: now, updatedAt: now, lastOpenedAt: now }),
        setDoc(doc(db, "user-data", user.uid, "question-data", storageId), { storagePath: path, strokeCount: strokes.length, updatedAt: new Date(now), importedFromUserId: selectedUser.uid }),
      ]);
      navigate(`/whiteboards/page/${pageId}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not add this whiteboard."); setCanvasBusy(false); }
  };

  if (!isAdmin) return <div className="flex-1 color-bg grid place-items-center color-txt-sub"><LuX size={42} /></div>;
  return (
    <AdminShell title="Users">
      {message && <div role="status" className="mb-4 rounded-xl color-bg-grey-5 px-4 py-3 text-sm color-txt-main">{message}</div>}
      <div className="grid grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)] gap-4 min-h-[680px]">
        <section className="rounded-2xl color-bg-grey-5 border border-[color-mix(in_srgb,var(--theme-txt-sub)_12%,transparent)] p-3 flex flex-col max-h-[calc(100vh-150px)]">
          <label className="relative block mb-3"><LuSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 color-txt-sub" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users" className="w-full rounded-xl color-bg pl-9 pr-3 py-2.5 text-sm color-txt-main outline-none border border-transparent focus:border-[var(--accent)]" /></label>
          <p className="px-1 mb-2 text-xs color-txt-sub">{loadingUsers ? "Loading…" : `${filtered.length} users`}</p>
          <div className="min-h-0 overflow-y-auto space-y-1 scrollbar-minimal">
            {filtered.map((entry) => <button key={entry.uid} type="button" onClick={() => { setSelectedUid(entry.uid); setSelectedCanvas(""); setMessage(""); }} className={`w-full text-left rounded-xl px-3 py-3 transition-[background-color,transform] duration-150 active:scale-[0.99] ${selectedUid === entry.uid ? "color-bg-accent color-txt-accent" : "hover:color-bg-grey-10 color-txt-main"}`}><div className="flex items-center gap-3">{entry.pictureUrl ? <img src={entry.pictureUrl} alt="" className="w-9 h-9 rounded-full object-cover shrink-0 border border-black/10" /> : <span className="w-9 h-9 rounded-full color-bg grid place-items-center shrink-0"><LuUser size={15} /></span>}<span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="min-w-0 flex items-center gap-1.5"><span className="text-sm font-semibold truncate">{entry.username}</span>{entry.isAce && <span className="shrink-0 rounded-md bg-amber-400/20 px-1.5 py-0.5 text-[9px] font-extrabold tracking-wide text-amber-600 dark:text-amber-300">ACE</span>}</span><span className="text-[11px] opacity-70 whitespace-nowrap">{relative(entry.lastActivityMs)}</span></span><span className="block text-xs opacity-70 truncate">{entry.email || entry.uid}</span></span>{entry.excluded && <LuBan size={14} className="shrink-0" aria-label="Excluded from metrics" />}</div></button>)}
          </div>
        </section>

        <section className="min-w-0 max-w-full overflow-hidden">
          {!selectedUser ? <div className="h-full rounded-2xl color-bg-grey-5 grid place-items-center color-txt-sub">Select a user</div> : <div className="space-y-4">
            <div className="rounded-2xl color-bg-grey-5 border border-[color-mix(in_srgb,var(--theme-txt-sub)_12%,transparent)] p-5"><div className="flex flex-wrap items-center gap-4">{selectedUser.pictureUrl ? <img src={selectedUser.pictureUrl} alt="" className="w-14 h-14 rounded-full object-cover border border-black/10" /> : <span className="w-14 h-14 rounded-full color-bg grid place-items-center"><LuUser size={22} className="color-txt-sub" /></span>}<div className="min-w-0"><h2 className="font-bold text-xl color-txt-main truncate">{selectedUser.username}</h2><p className="text-sm color-txt-sub truncate">{selectedUser.email || selectedUser.uid}</p></div><div className="ml-auto"><button type="button" onClick={() => void toggleExcluded()} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold active:scale-[0.97] transition-transform ${selectedUser.excluded ? "color-bg-accent color-txt-accent" : "color-bg color-txt-main"}`}>{selectedUser.excluded ? <LuCheck /> : <LuBan />} {selectedUser.excluded ? "Include in metrics" : "Exclude from metrics"}</button></div></div></div>
            {loadingDetails && !currentDetails ? <div className="p-10 text-center color-txt-sub"><LuLoaderCircle className="animate-spin inline mr-2" /> Loading activity…</div> : currentDetails && <>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3"><Stat label="Last active" value={relative(lastActivity)} /><Stat label="Total study time" value={duration(selectedUser.totalStudySeconds || totalSessionSeconds)} /><Stat label="4-week retention" value={`${activeWeeks}/4 weeks`} /><Stat label="Recorded sessions" value={currentDetails.sessions.length.toLocaleString()} /><Stat label="Questions completed" value={completedCount.toLocaleString()} /></div>
              <section className="rounded-2xl color-bg-grey-5 border border-[color-mix(in_srgb,var(--theme-txt-sub)_12%,transparent)] p-5 overflow-hidden"><div className="flex items-center justify-between gap-3 mb-4"><h3 className="font-bold color-txt-main">Session time</h3><span className="text-xs color-txt-sub">Latest {Math.min(20, currentDetails.sessions.length)}</span></div><div className="flex gap-2 overflow-x-auto pb-2 scrollbar-minimal">{currentDetails.sessions.slice(0, 20).map((entry) => <div key={entry.id} className="min-w-[230px] max-w-[270px] rounded-xl color-bg px-4 py-3 flex items-center gap-3"><span className="w-9 h-9 rounded-lg color-bg-grey-5 grid place-items-center shrink-0"><LuClock3 className="color-txt-sub" /></span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="text-base font-bold color-txt-main">{duration(Number(entry.data.durationSeconds) || 0)}</p><span className="rounded-md color-bg-grey-5 px-1.5 py-0.5 text-[10px] font-semibold color-txt-sub whitespace-nowrap">{sessionDeviceLabel(entry.data.deviceCategory)}</span></div><p className="text-xs color-txt-sub truncate">{String(entry.data.subject ?? "General study")}</p><p className="text-[11px] color-txt-sub mt-0.5">{valueToMillis(entry.data.endTime) ? new Date(valueToMillis(entry.data.endTime)!).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}</p></div></div>)}{!currentDetails.sessions.length && <p className="py-5 color-txt-sub text-sm">No sessions recorded.</p>}</div></section>
              <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4 items-start">
                <section className="order-2 rounded-2xl color-bg-grey-5 border border-[color-mix(in_srgb,var(--theme-txt-sub)_12%,transparent)] p-5 overflow-hidden"><h3 className="font-bold color-txt-main mb-4">Question activity</h3><div className="max-h-[520px] overflow-y-auto pr-1 scrollbar-minimal"><table className="w-full table-fixed text-sm"><thead className="sticky top-0 color-bg-grey-5"><tr className="text-left color-txt-sub border-b border-[color-mix(in_srgb,var(--theme-txt-sub)_14%,transparent)]"><th className="w-[58%] font-semibold py-2 pr-4">Question</th><th className="w-[20%] font-semibold py-2 pr-4">Time</th><th className="w-[22%] font-semibold py-2">Result</th></tr></thead><tbody>{currentDetails.questionLog.map((entry) => <tr key={entry.id} className="border-b border-[color-mix(in_srgb,var(--theme-txt-sub)_8%,transparent)]"><td className="py-3 pr-4 color-txt-main"><span className="block font-medium truncate">{String(entry.data.questionName ?? "Question")}</span><span className="block text-xs color-txt-sub truncate">{String(entry.data.paperLabel ?? entry.data.subject ?? "")}</span></td><td className="py-3 pr-4 color-txt-sub">{duration(Number(entry.data.durationSeconds) || 0)}</td><td className="py-3"><span className={entry.data.completed === true ? "text-emerald-500" : "color-txt-sub"}>{entry.data.completed === true ? "Completed" : "Attempted"}</span></td></tr>)}</tbody></table>{!currentDetails.questionLog.length && <p className="py-8 text-center color-txt-sub">No question activity recorded.</p>}</div></section>
                <section className="order-1 rounded-2xl color-bg-grey-5 border border-[color-mix(in_srgb,var(--theme-txt-sub)_12%,transparent)] p-5 overflow-hidden">
<div className="flex items-center justify-between gap-3 mb-4">
<h3 className="font-bold color-txt-main">Whiteboards</h3>
<span className="text-xs color-txt-sub">{currentDetails.questionData.filter((entry) => typeof entry.data.storagePath === "string").length} saved</span>
</div>
<div className="space-y-1 max-h-40 overflow-y-auto pr-1 mb-3 scrollbar-minimal">{currentDetails.questionData.filter((entry) => typeof entry.data.storagePath === "string").map((entry) => <button key={entry.id} type="button" onClick={() => setSelectedCanvas(entry.id)} className={`w-full rounded-lg px-3 py-2 text-left text-xs font-semibold truncate ${selectedCanvas === entry.id ? "color-bg-accent color-txt-accent" : "color-bg color-txt-sub hover:color-txt-main"}`}>{entry.id}</button>)}</div>
<div className="h-[300px] rounded-xl bg-white border border-black/10 overflow-hidden grid place-items-center">{canvasBusy ? <LuLoaderCircle className="animate-spin text-slate-400" /> : bounds ? <svg viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">{canvasObjects.filter((object) => !object.pinnedToSide).map((object) => <image key={object.id} href={object.src} x={object.x} y={object.y} width={object.width} height={object.height} preserveAspectRatio="none" />)}{strokes.map((stroke, index) => <path key={index} d={pathFor(stroke.points)} fill="none" stroke={stroke.tool === "eraser" ? "#fff" : stroke.color || "#111827"} strokeWidth={stroke.brushRadius ? stroke.brushRadius * 2 : 3} strokeLinecap="round" strokeLinejoin="round" />)}{canvasText.map((box) => <foreignObject key={box.id} x={box.x} y={box.y} width={box.width} height={box.height}>
<div style={{ color: "#111827", fontSize: box.fontSize, whiteSpace: "pre-wrap", overflow: "hidden" }}>{box.text}</div>
</foreignObject>)}</svg> : <div className="text-center text-slate-400 text-sm">
<LuFileQuestion size={24} className="mx-auto mb-2" />Select a saved whiteboard</div>}</div>
<button type="button" disabled={!canvasRaw || canvasBusy} onClick={() => void copyToWhiteboards()} className="mt-3 w-full inline-flex justify-center items-center gap-2 rounded-xl color-bg-accent color-txt-accent px-3 py-2.5 text-sm font-semibold disabled:opacity-40 active:scale-[0.98] transition-transform">
<LuCopyPlus /> Add to my whiteboards</button>
</section>
              </div>
            </>}
          </div>}
        </section>
      </div>
    </AdminShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) { return <article className="rounded-2xl color-bg-grey-5 border border-[color-mix(in_srgb,var(--theme-txt-sub)_12%,transparent)] p-4"><p className="text-xs font-semibold color-txt-sub">{label}</p><p className="mt-2 text-xl font-bold color-txt-main truncate">{value}</p></article>; }
