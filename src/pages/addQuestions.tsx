import { useContext, useState, useRef } from "react";
import { UserContext } from "../context/UserContext";
import { useNavigate } from "react-router-dom";
import { ref, uploadBytes } from "firebase/storage";
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  collection,
  arrayUnion,
} from "firebase/firestore";
import { storage, db } from "../../firebase";
import {
  LuPlus,
  LuTrash2,
  LuX,
  LuArrowLeft,
  LuUpload,
  LuLoader,
  LuFileText,
} from "react-icons/lu";
import "../styles/settings.css";

const ADMIN_UIDS = [
  "NkN9UBqoPEYpE21MC89fipLn0SP2",
  "gJIqKYlc1OdXUQGZQkR4IzfCIoL2",
];

const SUBJECTS = ["maths", "irish"] as const;
const LEVELS = ["higher", "ordinary"] as const;

type SubjectId = (typeof SUBJECTS)[number];
type LevelId = (typeof LEVELS)[number];

type PaperRow = {
  id: string;
  file: File | null;
  year: number;
  label: string;
  paperId: string;
  existingStoragePath: string | null;
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function defaultPaperId(year: number, label: string): string {
  if (label.trim()) {
    const part = slugify(label).replace(/^paper-?/, "") || "p1";
    return `${year}-${part}`;
  }
  return `${year}-p1`;
}

// Firestore requires document paths to have an even number of segments.
// So we use subcollections "subjects" and "levels": leavingcert/subjects/maths, subjects/maths/levels/higher.
async function ensureParentStructure(
  subject: SubjectId,
  level: LevelId
): Promise<void> {
  const lcRef = doc(db, "questions", "leavingcert");
  const subjRef = doc(db, "questions", "leavingcert", "subjects", subject);
  const levelRef = doc(
    db,
    "questions",
    "leavingcert",
    "subjects",
    subject,
    "levels",
    level
  );

  // #region agent log
  fetch("http://127.0.0.1:7242/ingest/ee1cd547-a1ab-481b-934a-fc195bbd411c", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "addQuestions.tsx:ensureParentStructure",
      message: "Firestore paths",
      data: {
        subject,
        level,
        subjPath: subjRef.path,
        levelPath: levelRef.path,
        subjSegments: subjRef.path.split("/").length,
        levelSegments: levelRef.path.split("/").length,
      },
      timestamp: Date.now(),
      sessionId: "debug-session",
      runId: "run1",
      hypothesisId: "H1",
    }),
  }).catch(() => {});
  // #endregion

  const lcSnap = await getDoc(lcRef);
  const sections = (lcSnap.data()?.sections as string[] | undefined) ?? [];
  if (!sections.includes(subject)) {
    await setDoc(lcRef, { sections: arrayUnion(subject) }, { merge: true });
  }

  const subjSnap = await getDoc(subjRef);
  const levelIds = (subjSnap.data()?.sections as string[] | undefined) ?? [];
  if (!levelIds.includes(level)) {
    await setDoc(subjRef, { sections: arrayUnion(level) }, { merge: true });
  }

  const levelSnap = await getDoc(levelRef);
  const levelSections =
    (levelSnap.data()?.sections as string[] | undefined) ?? [];
  if (!levelSections.includes("papers")) {
    await setDoc(
      levelRef,
      { sections: arrayUnion("papers") },
      { merge: true }
    );
  }
}

function getStoragePath(
  subject: SubjectId,
  level: LevelId,
  filename: string
): string {
  const base = `exam-papers/leaving-cert/${subject}/${level}-level/full-papers`;
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.pdf$/i, "") || "paper";
  return `${base}/${safe}.pdf`;
}

export default function AddQuestions() {
  const { user } = useContext(UserContext);
  const navigate = useNavigate();
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [subject, setSubject] = useState<SubjectId>("maths");
  const [level, setLevel] = useState<LevelId>("higher");
  const [rows, setRows] = useState<PaperRow[]>([
    {
      id: crypto.randomUUID(),
      file: null,
      year: new Date().getFullYear(),
      label: "",
      paperId: "",
      existingStoragePath: null,
    },
  ]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [loadExistingError, setLoadExistingError] = useState<string | null>(
    null
  );

  const isAdmin = user?.uid && ADMIN_UIDS.includes(user.uid);

  const addRow = () => {
    const year = new Date().getFullYear();
    setRows((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        file: null,
        year,
        label: "",
        paperId: `${year}-p1`,
        existingStoragePath: null,
      },
    ]);
  };

  const removeRow = (id: string) => {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  };

  const updateRow = (
    id: string,
    updates: Partial<Omit<PaperRow, "id">>
  ) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...updates };
        if (
          (updates.year !== undefined || updates.label !== undefined) &&
          !updates.paperId
        ) {
          next.paperId =
            next.paperId ||
            defaultPaperId(next.year, next.label) ||
            `${next.year}-p1`;
        }
        return next;
      })
    );
  };

  const loadExisting = async () => {
    setLoadExistingError(null);
    try {
      const papersRef = collection(
        db,
        "questions",
        "leavingcert",
        "subjects",
        subject,
        "levels",
        level,
        "papers"
      );
      const snap = await getDocs(papersRef);
      const existing: PaperRow[] = snap.docs.map((d) => {
        const data = d.data();
        const year = typeof data.year === "number" ? data.year : new Date().getFullYear();
        const label = typeof data.label === "string" ? data.label : "";
        return {
          id: crypto.randomUUID(),
          file: null,
          year,
          label,
          paperId: d.id,
          existingStoragePath: typeof data.storagePath === "string" ? data.storagePath : null,
        };
      });
      if (existing.length === 0) {
        setLoadExistingError("No papers found for this subject/level.");
        return;
      }
      setRows(existing);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load papers";
      setLoadExistingError(msg);
    }
  };

  const handleSubmit = async () => {
    const toUpload = rows.filter(
      (r) => r.paperId.trim() && (r.file || r.existingStoragePath)
    );
    if (toUpload.length === 0) {
      alert("Add at least one paper with a PDF file or existing entry.");
      return;
    }
    if (rows.some((r) => !r.paperId.trim())) {
      alert("Every row needs a paper ID (slug).");
      return;
    }

    setIsUploading(true);
    setUploadProgress("Ensuring parent structure...");

    try {
      await ensureParentStructure(subject, level);

      for (let i = 0; i < toUpload.length; i++) {
        const row = toUpload[i];
        setUploadProgress(
          `Paper ${i + 1}/${toUpload.length}: ${row.paperId}...`
        );

        let storagePath = row.existingStoragePath;

        if (row.file) {
          const filename =
            row.paperId.endsWith(".pdf") ? row.paperId : `${row.paperId}.pdf`;
          storagePath = getStoragePath(subject, level, filename);
          const storageRef = ref(storage, storagePath);
          await uploadBytes(storageRef, row.file);
        }

        if (!storagePath) {
          throw new Error(`Row ${row.paperId}: no file and no existing path.`);
        }

        const docId = slugify(row.paperId.replace(/\.pdf$/i, "")) || row.paperId.replace(/\.pdf$/i, "");
        const paperRef = doc(
          db,
          "questions",
          "leavingcert",
          "subjects",
          subject,
          "levels",
          level,
          "papers",
          docId
        );
        await setDoc(
          paperRef,
          {
            year: row.year,
            storagePath,
            ...(row.label.trim() ? { label: row.label.trim() } : {}),
          },
          { merge: true }
        );
      }

      setUploadProgress("");
      alert(`Successfully saved ${toUpload.length} paper(s).`);
      setRows([
        {
          id: crypto.randomUUID(),
          file: null,
          year: new Date().getFullYear(),
          label: "",
          paperId: "",
          existingStoragePath: null,
        },
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setUploadProgress("");
      alert(`Upload failed: ${msg}`);
    } finally {
      setIsUploading(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="settings-page flex items-center justify-center">
        <div className="color-bg-grey-5 p-8 rounded-xl text-center">
          <LuX size={48} className="color-txt-accent mx-auto mb-4" />
          <h2 className="txt-heading-colour text-2xl mb-2">Access Denied</h2>
          <p className="color-txt-sub">
            You don't have permission to view this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-page w-full max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="color-bg-grey-5 p-2.5 rounded-xl hover:color-bg-grey-10 transition-all"
          >
            <LuArrowLeft size={22} className="color-txt-accent" />
          </button>
          <div>
            <h1 className="color-txt-main text-2xl font-bold">Exam Papers</h1>
            <p className="color-txt-sub text-sm">
              Add or edit full exam papers (Leaving Cert)
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 mb-6">
        <div>
          <label className="block color-txt-sub text-sm mb-1">Subject</label>
          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value as SubjectId)}
            className="px-4 py-2 rounded-xl color-bg-grey-5 color-txt-main text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
          >
            {SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block color-txt-sub text-sm mb-1">Level</label>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as LevelId)}
            className="px-4 py-2 rounded-xl color-bg-grey-5 color-txt-main text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button
            type="button"
            onClick={loadExisting}
            disabled={isUploading}
            className="px-4 py-2 rounded-xl color-bg-grey-5 color-txt-main text-sm hover:color-bg-grey-10 transition-all disabled:opacity-50"
          >
            Load existing papers
          </button>
        </div>
      </div>

      {loadExistingError && (
        <div className="mb-4 p-3 rounded-xl bg-red-500/20 text-red-400 text-sm">
          {loadExistingError}
        </div>
      )}

      <div className="rounded-2xl color-bg-grey-5 overflow-hidden">
        <div className="grid grid-cols-[1fr 80px 1fr 1fr 40px] gap-2 p-3 color-bg-grey-10 text-xs color-txt-sub font-medium">
          <span>PDF file</span>
          <span>Year</span>
          <span>Label</span>
          <span>Paper ID</span>
          <span />
        </div>
        {rows.map((row) => (
          <div
            key={row.id}
            className="grid grid-cols-[1fr 80px 1fr 1fr 40px] gap-2 p-3 items-center border-t border-[var(--grey-10)]"
          >
            <div className="min-w-0">
              <input
                ref={(el) => {
                  fileInputRefs.current[row.id] = el;
                }}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) updateRow(row.id, { file: f, existingStoragePath: null });
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRefs.current[row.id]?.click()}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-lg color-bg-grey-10 color-txt-main text-sm hover:color-bg-grey-5 truncate"
              >
                <LuFileText size={16} className="color-txt-accent shrink-0" />
                {row.file
                  ? row.file.name
                  : row.existingStoragePath
                    ? "(existing)"
                    : "Choose PDF"}
              </button>
            </div>
            <input
              type="number"
              min={1990}
              max={2100}
              value={row.year}
              onChange={(e) =>
                updateRow(row.id, {
                  year: parseInt(e.target.value, 10) || row.year,
                })
              }
              className="px-2 py-2 rounded-lg color-bg-grey-10 color-txt-main text-sm w-full"
            />
            <input
              type="text"
              placeholder="e.g. 2024 Paper 1"
              value={row.label}
              onChange={(e) =>
                updateRow(row.id, {
                  label: e.target.value,
                  paperId:
                    row.paperId ||
                    defaultPaperId(row.year, e.target.value),
                })
              }
              className="px-2 py-2 rounded-lg color-bg-grey-10 color-txt-main text-sm w-full placeholder:color-txt-sub"
            />
            <input
              type="text"
              placeholder="e.g. 2024-p1"
              value={row.paperId}
              onChange={(e) =>
                updateRow(row.id, {
                  paperId: slugify(e.target.value) || e.target.value,
                })
              }
              className="px-2 py-2 rounded-lg color-bg-grey-10 color-txt-main text-sm w-full font-mono placeholder:color-txt-sub"
            />
            <button
              type="button"
              onClick={() => removeRow(row.id)}
              className="p-2 rounded-lg hover:bg-red-500/20 text-red-400 transition-all"
              title="Remove row"
            >
              <LuTrash2 size={18} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 mt-4">
        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-2 px-4 py-2 rounded-xl color-bg-grey-5 color-txt-main text-sm hover:color-bg-grey-10 transition-all"
        >
          <LuPlus size={18} />
          Add paper
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isUploading}
          className="flex items-center gap-2 px-6 py-3 rounded-2xl color-bg-accent color-txt-main font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110"
        >
          {isUploading ? (
            <LuLoader size={18} className="animate-spin" />
          ) : (
            <LuUpload size={18} />
          )}
          {isUploading ? "Uploading..." : "Save papers"}
        </button>
      </div>

      {uploadProgress && (
        <div className="mt-4 flex items-center gap-2 p-3 rounded-xl color-bg-grey-10">
          <LuLoader size={16} className="color-txt-accent animate-spin" />
          <span className="color-txt-sub text-sm">{uploadProgress}</span>
        </div>
      )}
    </div>
  );
}
