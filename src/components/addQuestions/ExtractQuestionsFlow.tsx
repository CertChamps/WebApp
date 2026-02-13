import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { LuFileText, LuLoader, LuSparkles, LuPlus, LuTrash2, LuBookOpen, LuUpload, LuClipboardList, LuDownload, LuSlidersHorizontal } from "react-icons/lu";
import { useAllPageSnapshots } from "../../hooks/useAllPageSnapshots";
import PdfRegionView, { type PdfRegion } from "../questions/PdfRegionView";
import PaperPdfPlaceholder from "../questions/PaperPdfPlaceholder";
import "../../styles/settings.css";

const EXTRACT_API_URL = "https://us-central1-certchamps-a7527.cloudfunctions.net/extractQuestions";
const LOG_TABLES_PDF_URL = "/assets/log_tables.pdf";
/** Marking schemes in public/assets/marking_schemes/ — 2-digit year: 22, 23, 24, 25 */
const MARKING_SCHEME_YEARS = [2022, 2023, 2024, 2025];
function markingSchemeUrlForYear(year: number): string {
  return `/assets/marking_schemes/${String(year).slice(-2)}.pdf`;
}

/** One page region: bounding box on a single PDF page. */
export type PageRegion = { page: number; x: number; y: number; width: number; height: number };

/** 1-based page range in a PDF (e.g. marking scheme). */
export type PageRange = { start: number; end: number };

/** One extracted region = one full question (all parts together), can span multiple pages. */
export type ExtractedRegion = {
  id: string;
  name: string;
  pageRegions: PageRegion[];
  /** Log Tables (Formulae and Tables) booklet page number, or null if not needed. */
  log_table_page?: number | null;
  /** Category tags (e.g. ["Quadratics", "Algebra"] from "Algebra - Quadratics"). Max 3 categories. */
  tags?: string[];
  /** When marking scheme is provided: page range in the marking scheme PDF for this question's marking. */
  marking_scheme_page_range?: PageRange | null;
};

function normalizeMarkingSchemeRange(v: unknown): PageRange | null {
  if (v && typeof v === "object" && "start" in v && "end" in v) {
    const s = Number((v as { start: unknown }).start);
    const e = Number((v as { end: unknown }).end);
    if (Number.isFinite(s) && Number.isFinite(e) && s >= 1 && e >= 1) return { start: s, end: e };
  }
  return null;
}

function normalizeRawRegion(r: Record<string, unknown>): ExtractedRegion {
  const logTablePage = r.log_table_page;
  const tagsRaw = r.tags;
  const tags = Array.isArray(tagsRaw)
    ? tagsRaw.filter((t): t is string => typeof t === "string")
    : [];
  const markingSchemeRange = normalizeMarkingSchemeRange(r.marking_scheme_page_range);

  const base = {
    log_table_page: typeof logTablePage === "number" ? logTablePage : null,
    tags,
    marking_scheme_page_range: markingSchemeRange,
  };

  // New format: pageRegions array
  const pr = r.pageRegions;
  if (Array.isArray(pr) && pr.length > 0) {
    return {
      id: (r.id as string) ?? "Q1",
      name: (r.name as string) ?? "",
      pageRegions: pr.map((p: Record<string, unknown>) => ({
        page: (p.page as number) ?? 1,
        x: (p.x as number) ?? 0,
        y: (p.y as number) ?? 0,
        width: (p.width as number) ?? 595,
        height: (p.height as number) ?? 150,
      })),
      ...base,
    };
  }
  // Legacy format: single page, x, y, width, height at top level
  return {
    id: (r.id as string) ?? "Q1",
    name: (r.name as string) ?? "",
    pageRegions: [{
      page: (r.page as number) ?? 1,
      x: (r.x as number) ?? 0,
      y: (r.y as number) ?? 0,
      width: (r.width as number) ?? 595,
      height: (r.height as number) ?? 150,
    }],
    ...base,
  };
}

type PaperMetadata = {
  paperId: string;
  year: number;
  label: string;
};

type ExtractQuestionsFlowProps = {
  onClose?: () => void;
  /** When set, preload this file (e.g. from Upload tab "Save papers") so user can extract/review. */
  initialFile?: File | null;
  /** Called after initialFile has been applied so parent can clear it. */
  onInitialFileConsumed?: () => void;
  /** From Upload tab when opened via "Save papers" – used for Firestore upload. */
  paperMetadata?: PaperMetadata | null;
  firestoreUploadPath?: string;
  subject?: string;
  level?: string;
  /** Called to upload current PDF + regions to Firestore after review. */
  onUploadToFirestore?: (file: File, regions: ExtractedRegion[]) => Promise<void>;
  isUploading?: boolean;
  uploadProgress?: string;
};

export default function ExtractQuestionsFlow({
  onClose: _onClose,
  initialFile = null,
  onInitialFileConsumed,
  paperMetadata = null,
  firestoreUploadPath,
  subject,
  level,
  onUploadToFirestore,
  isUploading = false,
  uploadProgress = "",
}: ExtractQuestionsFlowProps) {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [regions, setRegions] = useState<ExtractedRegion[]>([]);
  const [markingSchemeFile, setMarkingSchemeFile] = useState<File | null>(null);
  const [paperYear, setPaperYear] = useState<number | null>(() => paperMetadata?.year ?? null);
  const [logTablesBlob, setLogTablesBlob] = useState<Blob | null>(null);
  const [markingSchemeBlobFromYear, setMarkingSchemeBlobFromYear] = useState<Blob | null>(null);
  const [markingSchemeYearLoading, setMarkingSchemeYearLoading] = useState(false);
  const [includeLogTablesAndMarkingScheme, setIncludeLogTablesAndMarkingScheme] = useState(false);
  const initialFileConsumedRef = useRef(false);

  useEffect(() => {
    if (initialFile && !initialFileConsumedRef.current) {
      setPdfFile(initialFile);
      setRegions([]);
      setExtractError(null);
      setExtractStatus("idle");
      initialFileConsumedRef.current = true;
      onInitialFileConsumed?.();
    }
    return () => {
      initialFileConsumedRef.current = false;
    };
  }, [initialFile, onInitialFileConsumed]);

  useEffect(() => {
    if (paperMetadata?.year != null && paperYear !== paperMetadata.year) {
      setPaperYear(paperMetadata.year);
    }
  }, [paperMetadata?.year]);

  useEffect(() => {
    let cancelled = false;
    fetch(LOG_TABLES_PDF_URL)
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (!cancelled && blob) setLogTablesBlob(blob);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (paperYear == null || !MARKING_SCHEME_YEARS.includes(paperYear)) {
      setMarkingSchemeBlobFromYear(null);
      setMarkingSchemeYearLoading(false);
      return;
    }
    setMarkingSchemeYearLoading(true);
    let cancelled = false;
    fetch(markingSchemeUrlForYear(paperYear))
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (!cancelled) {
          setMarkingSchemeBlobFromYear(blob ?? null);
          setMarkingSchemeYearLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMarkingSchemeBlobFromYear(null);
          setMarkingSchemeYearLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [paperYear]);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [extractStatus, setExtractStatus] = useState<"idle" | "loading" | "error">("idle");
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractProgress, setExtractProgress] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const markingSchemeInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const [jsonLoadError, setJsonLoadError] = useState<string | null>(null);
  const [jsonFileName, setJsonFileName] = useState<string | null>(null);
  const [pastedJson, setPastedJson] = useState("");

  const { snapshots, loading: snapshotsLoading } = useAllPageSnapshots(pdfFile);
  const { snapshots: logTableSnapshots, loading: logTableSnapshotsLoading } = useAllPageSnapshots(logTablesBlob, 45);
  const markingSchemeSource: Blob | null = markingSchemeFile ?? markingSchemeBlobFromYear;
  const { snapshots: markingSchemeSnapshots, loading: markingSchemeSnapshotsLoading } = useAllPageSnapshots(
    markingSchemeSource,
    30
  );
  const pdfBlob = useMemo(
    () => (pdfFile ? new Blob([pdfFile], { type: "application/pdf" }) : null),
    [pdfFile]
  );

  const STEP_TIMEOUT_MS = 300_000; // 5 min per step
  const MAX_EXAM_PAGES_SENT = 12;
  const MAX_REGION_CONTINUATIONS = 8; // reprompt until paper_finished or this many extra calls

  const handleExtract = useCallback(async () => {
    if (!pdfFile || snapshots.length === 0) {
      setExtractError("Upload a PDF first and wait for pages to load.");
      return;
    }
    setExtractStatus("loading");
    setExtractError(null);
    setExtractProgress("Step 1/3: Finding question regions…");
    const examImages = snapshots.slice(0, MAX_EXAM_PAGES_SENT);

    const doFetch = async (
      body: Record<string, unknown>,
      stepLabel: string
    ): Promise<{ ok: boolean; data: Record<string, unknown>; res: Response }> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), STEP_TIMEOUT_MS);
      const res = await fetch(EXTRACT_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, data: data as Record<string, unknown>, res };
    };

    const setErrorFromResponse = (data: Record<string, unknown>, res: Response, fallback: string) => {
      const errMsg = (data.error as string) || `Request failed: ${res.status}`;
      const details = data.details != null ? String(data.details) : "";
      setExtractError(details ? `${errMsg}\n\n--- AI / server response ---\n${details}` : errMsg);
      setExtractStatus("error");
      setExtractProgress("");
    };

    try {
      // Step 1: regions — reprompt until AI marks paper_finished or we get no new regions
      let regionsList: ExtractedRegion[] = [];
      let paperFinished = false;
      let continueFrom: string | null = null;
      let continuationCount = 0;

      while (true) {
        const attemptNum = continuationCount + 1;
        const stepLabel =
          continuationCount === 0
            ? `Step 1/4: Extract questions (attempt ${attemptNum})…`
            : `Step 1/4: Getting more questions (attempt ${attemptNum})…`;
        setExtractProgress(stepLabel);
        const body: Record<string, unknown> = { pageImages: examImages, step: "regions" };
        if (continueFrom != null) body.continueFrom = continueFrom;
        const step1 = await doFetch(body, stepLabel);
        if (!step1.ok) {
          setErrorFromResponse(step1.data, step1.res, "Step 1 failed.");
          return;
        }
        const raw1 = Array.isArray(step1.data.regions) ? step1.data.regions : [];
        paperFinished = step1.data.paper_finished === true;
        if (raw1.length === 0) {
          if (regionsList.length === 0) {
            const details = step1.data.details != null ? String(step1.data.details) : "";
            setExtractError(
              details
                ? `No question regions returned.\n\n--- AI / server response ---\n${details}`
                : "No question regions were returned. Try again."
            );
            setExtractStatus("error");
            setExtractProgress("");
            return;
          }
          break;
        }
        const newRegions = raw1.map((r: Record<string, unknown>) => normalizeRawRegion(r));
        if (regionsList.length === 0) {
          regionsList = newRegions;
        } else {
          const existingIds = new Set(regionsList.map((r) => r.id));
          const onlyNew = newRegions.filter((r) => !existingIds.has(r.id));
          regionsList = [...regionsList, ...onlyNew];
          // Only stop when we explicitly get no new regions (don't trust paper_finished alone)
          if (onlyNew.length === 0) break;
        }
        const lastId = (regionsList[regionsList.length - 1] as ExtractedRegion | undefined)?.id ?? null;
        if (!lastId || continuationCount >= MAX_REGION_CONTINUATIONS) break;
        continueFrom = lastId;
        continuationCount += 1;
      }
      const regionIds = regionsList.map((r) => r.id);

      const MAX_MARKING_ATTEMPTS = 7;
      const MAX_LOG_TABLES_ATTEMPTS = 8;
      const MAX_TAGS_ATTEMPTS = 2;

      // Step 2/4: Marking scheme (essential — retry until all filled or 7 attempts)
      const needMarking = includeLogTablesAndMarkingScheme && markingSchemeSnapshots.length > 0;
      if (needMarking) {
        let markingAttempt = 0;
        let missingMarkingIds: string[] = regionIds;
        while (missingMarkingIds.length > 0 && markingAttempt < MAX_MARKING_ATTEMPTS) {
          markingAttempt += 1;
          setExtractProgress(`Step 2/4: Marking scheme (attempt ${markingAttempt}/${MAX_MARKING_ATTEMPTS})…`);
          const label = (paperMetadata?.label ?? "").toLowerCase();
          const markingSchemePaper =
            /\bpaper\s*2|p2\b|paper\s*ii\b/.test(label) ? 2
              : /\bpaper\s*1|p1\b|paper\s*i\b/.test(label) ? 1
              : undefined;
          const body: Record<string, unknown> = {
            pageImages: examImages,
            markingSchemeImages: markingSchemeSnapshots.slice(0, 10),
            step: "marking",
            regionIds,
          };
          if (markingSchemePaper !== undefined) body.markingSchemePaper = markingSchemePaper;
          if (missingMarkingIds.length < regionIds.length) body.missingMarkingIds = missingMarkingIds;
          const step2 = await doFetch(body, "Step 2/4");
          if (!step2.ok) {
            setErrorFromResponse(step2.data, step2.res, "Step 2 failed.");
            return;
          }
          if (Array.isArray(step2.data.regions)) {
            const markById = new Map<string, { start: number; end: number }>();
            for (const r of step2.data.regions as Array<{ id?: string; marking_scheme_page_range?: { start?: unknown; end?: unknown } | null }>) {
              const id = r.id ?? "Q1";
              const raw = r.marking_scheme_page_range;
              if (raw && raw.start != null && raw.end != null) {
                const start = Number(raw.start);
                const end = Number(raw.end);
                if (Number.isFinite(start) && Number.isFinite(end) && start >= 1 && end >= 1) {
                  const range = { start, end: Math.max(start, end) };
                  markById.set(id, range);
                  const baseMatch = id.match(/^([Qq]\d+)/i);
                  if (baseMatch) markById.set(baseMatch[1], range);
                }
              }
            }
            const rangeForRegion = (regId: string): { start: number; end: number } | null => {
              const direct = markById.get(regId);
              if (direct) return direct;
              const baseId = regId.match(/^([Qq]\d+)/i)?.[1];
              return (baseId && markById.get(baseId)) ?? null;
            };
            regionsList = regionsList.map((reg) => {
              const range = rangeForRegion(reg.id);
              return { ...reg, marking_scheme_page_range: range ?? reg.marking_scheme_page_range ?? null };
            });
            missingMarkingIds = regionsList.filter((r) => r.marking_scheme_page_range == null).map((r) => r.id);
          }
        }
        const stillMissing = regionsList.filter((r) => r.marking_scheme_page_range == null);
        if (stillMissing.length > 0) {
          setExtractError(
            `Marking scheme is essential but ${stillMissing.length} question(s) still have no page range after ${MAX_MARKING_ATTEMPTS} attempts: ${stillMissing.map((r) => r.id).join(", ")}.`
          );
          setExtractStatus("error");
          setExtractProgress("");
          return;
        }
      }

      // Step 3/4: Log tables (only add when necessary; 8 attempts max)
      if (includeLogTablesAndMarkingScheme && logTableSnapshots.length > 0) {
        let logTablesAttempt = 0;
        let logTablesOk = false;
        while (!logTablesOk && logTablesAttempt < MAX_LOG_TABLES_ATTEMPTS) {
          logTablesAttempt += 1;
          setExtractProgress(`Step 3/4: Log tables (attempt ${logTablesAttempt}/${MAX_LOG_TABLES_ATTEMPTS})…`);
          const step3 = await doFetch(
            {
              pageImages: examImages,
              logTablePageImages: logTableSnapshots.slice(0, 12),
              step: "log_tables",
              regionIds,
            },
            "Step 3/4"
          );
          if (step3.ok && Array.isArray(step3.data.regions)) {
            const logById = new Map<string, number | null>();
            for (const r of step3.data.regions as Array<{ id?: string; log_table_page?: number | null }>) {
              const id = r.id ?? "Q1";
              logById.set(id, typeof r.log_table_page === "number" ? r.log_table_page : null);
            }
            regionsList = regionsList.map((reg) => ({
              ...reg,
              log_table_page: logById.has(reg.id) ? logById.get(reg.id)! : reg.log_table_page ?? null,
            }));
            logTablesOk = true;
          } else if (!step3.ok && logTablesAttempt >= MAX_LOG_TABLES_ATTEMPTS) {
            setErrorFromResponse(step3.data, step3.res, "Step 3 failed.");
            return;
          }
        }
      }

      // Step 4/4: Tags (minimum 1 per question; 2 attempts max)
      let tagsAttempt = 0;
      let tagsComplete = false;
      while (!tagsComplete && tagsAttempt < MAX_TAGS_ATTEMPTS) {
        tagsAttempt += 1;
        setExtractProgress(`Step 4/4: Tags (attempt ${tagsAttempt}/${MAX_TAGS_ATTEMPTS})…`);
        const step4 = await doFetch(
          { pageImages: examImages, step: "tags", regionIds },
          "Step 4/4"
        );
        if (!step4.ok) {
          if (tagsAttempt >= MAX_TAGS_ATTEMPTS) {
            setErrorFromResponse(step4.data, step4.res, "Step 4 failed.");
            return;
          }
          continue;
        }
        if (Array.isArray(step4.data.regions)) {
          const tagsById = new Map<string, string[]>();
          for (const r of step4.data.regions as Array<{ id?: string; tags?: string[] }>) {
            const id = r.id ?? "Q1";
            const t = Array.isArray(r.tags) ? r.tags.filter((x): x is string => typeof x === "string") : [];
            tagsById.set(id, t);
          }
          regionsList = regionsList.map((reg) => {
            const t = tagsById.get(reg.id);
            return { ...reg, tags: t && t.length > 0 ? t : reg.tags ?? [] };
          });
          const missingTags = regionsList.filter((r) => !r.tags?.length);
          tagsComplete = missingTags.length === 0 || tagsAttempt >= MAX_TAGS_ATTEMPTS;
        }
      }

      setRegions(regionsList);
      setSelectedIndex(0);
      setExtractStatus("idle");
      setExtractProgress("");
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      const msg = isAbort
        ? "Request timed out (5 min per step). Try again or use fewer options."
        : err instanceof Error
          ? err.message
          : "Extraction failed";
      const isNetwork =
        !isAbort &&
        (msg.toLowerCase().includes("network") || msg.toLowerCase().includes("fetch") || msg.toLowerCase().includes("failed to fetch"));
      setExtractError(
        isNetwork ? `${msg} — Ensure extractQuestions is deployed.` : msg
      );
      setExtractStatus("error");
      setExtractProgress("");
    }
  }, [pdfFile, snapshots, logTableSnapshots, markingSchemeSnapshots, includeLogTablesAndMarkingScheme, paperMetadata]);

  const updateRegion = useCallback((index: number, updates: Partial<ExtractedRegion>) => {
    setRegions((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...updates } : r))
    );
  }, []);

  const updatePageRegion = useCallback(
    (regionIndex: number, pageRegionIndex: number, updates: Partial<PageRegion>) => {
      setRegions((prev) =>
        prev.map((r, i) => {
          if (i !== regionIndex || !r.pageRegions) return r;
          const pr = [...r.pageRegions];
          pr[pageRegionIndex] = { ...pr[pageRegionIndex], ...updates };
          return { ...r, pageRegions: pr };
        })
      );
    },
    []
  );

  const addPageRegion = useCallback((regionIndex: number) => {
    setRegions((prev) =>
      prev.map((r, i) => {
        if (i !== regionIndex) return r;
        const last = r.pageRegions[r.pageRegions.length - 1];
        const next = last
          ? { ...last, page: last.page + 1, y: 0, height: 150 }
          : { page: 1, x: 0, y: 0, width: 595, height: 150 };
        return { ...r, pageRegions: [...r.pageRegions, next] };
      })
    );
  }, []);

  const removePageRegion = useCallback((regionIndex: number, pageRegionIndex: number) => {
    setRegions((prev) =>
      prev.map((r, i) => {
        if (i !== regionIndex || r.pageRegions.length <= 1) return r;
        const pr = r.pageRegions.filter((_, j) => j !== pageRegionIndex);
        return { ...r, pageRegions: pr };
      })
    );
  }, []);

  const addRegion = useCallback(() => {
    const n = regions.length + 1;
    const newRegion: ExtractedRegion = {
      id: `Q${n}`,
      name: `Question ${n}`,
      pageRegions: [{ page: 1, x: 0, y: 0, width: 595, height: 150 }],
      log_table_page: null,
      tags: [],
      marking_scheme_page_range: null,
    };
    setRegions((prev) => [...prev, newRegion]);
    setSelectedIndex(regions.length);
  }, [regions.length]);

  const removeRegion = useCallback((index: number) => {
    setRegions((prev) => prev.filter((_, i) => i !== index));
    setSelectedIndex((prev) => {
      if (prev === index) return Math.max(0, index - 1);
      if (prev > index) return prev - 1;
      return prev;
    });
  }, []);

  const handleDownloadJson = useCallback(() => {
    const payload = { regions };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `regions-${pdfFile?.name?.replace(/\.pdf$/i, "") ?? "export"}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [regions, pdfFile?.name]);

  const handleLoadJson = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      setJsonLoadError(null);
      setJsonFileName(null);
      if (!file) return;
      if (!pdfFile) {
        setJsonLoadError("Upload a PDF paper first, then load the JSON.");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const text = reader.result;
          if (typeof text !== "string") {
            setJsonLoadError("Could not read file as text.");
            return;
          }
          const data = JSON.parse(text) as unknown;
          const rawList = Array.isArray(data) ? data : (data && typeof data === "object" && "regions" in data && Array.isArray((data as { regions: unknown }).regions) ? (data as { regions: unknown[] }).regions : null);
          if (!rawList || rawList.length === 0) {
            setJsonLoadError("JSON must be an array of regions or an object with a \"regions\" array.");
            return;
          }
          const normalized = rawList.map((r) => normalizeRawRegion(typeof r === "object" && r != null ? (r as Record<string, unknown>) : {}));
          setRegions(normalized);
          setSelectedIndex(0);
          setExtractError(null);
          setExtractStatus("idle");
          setJsonFileName(file.name);
        } catch (err) {
          setJsonLoadError(err instanceof Error ? err.message : "Invalid JSON");
        }
      };
      reader.onerror = () => setJsonLoadError("Failed to read file.");
      reader.readAsText(file, "utf-8");
    },
    [pdfFile]
  );

  const applyPastedJson = useCallback(() => {
    setJsonLoadError(null);
    if (!pdfFile) {
      setJsonLoadError("Upload a PDF paper first, then paste JSON.");
      return;
    }
    const trimmed = pastedJson.trim();
    if (!trimmed) {
      setJsonLoadError("Paste JSON first.");
      return;
    }
    try {
      const data = JSON.parse(trimmed) as unknown;
      const rawList = Array.isArray(data) ? data : (data && typeof data === "object" && "regions" in data && Array.isArray((data as { regions: unknown }).regions) ? (data as { regions: unknown[] }).regions : null);
      if (!rawList || rawList.length === 0) {
        setJsonLoadError("JSON must be an array of regions or an object with a \"regions\" array.");
        return;
      }
      const normalized = rawList.map((r) => normalizeRawRegion(typeof r === "object" && r != null ? (r as Record<string, unknown>) : {}));
      setRegions(normalized);
      setSelectedIndex(0);
      setExtractError(null);
      setExtractStatus("idle");
    } catch (err) {
      setJsonLoadError(err instanceof Error ? err.message : "Invalid JSON");
    }
  }, [pdfFile, pastedJson]);

  const [fixerMode, setFixerMode] = useState(false);
  const [fixerRegionIdx, setFixerRegionIdx] = useState(0);
  const [fixerPageRegionIdx, setFixerPageRegionIdx] = useState(0);
  const [fixerEditing, setFixerEditing] = useState<"y" | "height">("y");
  const [fixerDraftY, setFixerDraftY] = useState(0);
  const [fixerDraftHeight, setFixerDraftHeight] = useState(150);
  const [fixerDisplayY, setFixerDisplayY] = useState(0);
  const [fixerDisplayHeight, setFixerDisplayHeight] = useState(150);
  const fixerDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fixerReloadKey, setFixerReloadKey] = useState(0);
  const FIXER_STEP = 5;
  const FIXER_DEBOUNCE_MS = 400;
  const [showFullPdf, setShowFullPdf] = useState(true);
  const [showMarkingSchemePreview, setShowMarkingSchemePreview] = useState(true);
  const [showLogTablesPreview, setShowLogTablesPreview] = useState(true);
  const [logTablesCurrentPage, setLogTablesCurrentPage] = useState(1);
  const [logTablesNumPages, setLogTablesNumPages] = useState(0);
  const [logTablesScrollToPage, setLogTablesScrollToPage] = useState<number | null>(null);
  const [logTablesGoToInput, setLogTablesGoToInput] = useState("");
  const [markingSchemeCurrentPage, setMarkingSchemeCurrentPage] = useState(1);
  const [markingSchemeNumPages, setMarkingSchemeNumPages] = useState(0);
  const [markingSchemeScrollToPage, setMarkingSchemeScrollToPage] = useState<number | null>(null);
  const [markingSchemeGoToInput, setMarkingSchemeGoToInput] = useState("");
  const selected = regions[selectedIndex];
  const markingSchemeBlob = markingSchemeSource;

  const fixerRegion = regions[fixerRegionIdx];
  const fixerPageRegion = fixerRegion?.pageRegions?.[fixerPageRegionIdx];

  const prY = fixerPageRegion?.y ?? 0;
  const prHeight = fixerPageRegion?.height ?? 150;
  useEffect(() => {
    if (fixerMode && fixerPageRegion) {
      setFixerDraftY(prY);
      setFixerDraftHeight(prHeight);
      setFixerDisplayY(prY);
      setFixerDisplayHeight(prHeight);
    }
  }, [fixerMode, fixerRegionIdx, fixerPageRegionIdx, prY, prHeight]); // sync when navigating or region values change

  const fixerFlush = useCallback(() => {
    if (fixerDebounceRef.current) {
      clearTimeout(fixerDebounceRef.current);
      fixerDebounceRef.current = null;
    }
    const region = regions[fixerRegionIdx];
    const pr = region?.pageRegions?.[fixerPageRegionIdx];
    if (pr) {
      setFixerDisplayY(fixerDraftY);
      setFixerDisplayHeight(fixerDraftHeight);
      updatePageRegion(fixerRegionIdx, fixerPageRegionIdx, { y: fixerDraftY, height: fixerDraftHeight });
    }
  }, [fixerRegionIdx, fixerPageRegionIdx, fixerDraftY, fixerDraftHeight, regions, updatePageRegion]);

  useEffect(() => {
    if (!fixerMode || regions.length === 0) return;
    const handler = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const region = regions[fixerRegionIdx];
      const pr = region?.pageRegions?.[fixerPageRegionIdx];
      if (!pr) return;
      if (e.key === "Escape") {
        fixerFlush();
        setFixerMode(false);
        return;
      }
      if (e.key === "k" || e.key === "K") {
        setFixerEditing((v) => (v === "y" ? "height" : "y"));
        return;
      }
      if (e.key === "d" || e.key === "D") {
        setFixerReloadKey((k) => k + 1);
        return;
      }
      const doAdjust = (delta: number) => {
        if (fixerEditing === "y") {
          setFixerDraftY((prev) => {
            const newY = Math.max(0, Math.min(842 - fixerDraftHeight, prev + delta));
            if (fixerDebounceRef.current) clearTimeout(fixerDebounceRef.current);
            fixerDebounceRef.current = setTimeout(() => {
              setFixerDisplayY(newY);
              updatePageRegion(fixerRegionIdx, fixerPageRegionIdx, { y: newY });
              fixerDebounceRef.current = null;
            }, FIXER_DEBOUNCE_MS);
            return newY;
          });
        } else {
          setFixerDraftHeight((prev) => {
            const newH = Math.max(20, Math.min(842 - fixerDraftY, prev + delta));
            if (fixerDebounceRef.current) clearTimeout(fixerDebounceRef.current);
            fixerDebounceRef.current = setTimeout(() => {
              setFixerDisplayHeight(newH);
              updatePageRegion(fixerRegionIdx, fixerPageRegionIdx, { height: newH });
              fixerDebounceRef.current = null;
            }, FIXER_DEBOUNCE_MS);
            return newH;
          });
        }
      };
      if (e.key === "f" || e.key === "F") {
        doAdjust(-FIXER_STEP);
        return;
      }
      if (e.key === "j" || e.key === "J") {
        doAdjust(FIXER_STEP);
        return;
      }
      if (e.key === "Enter") {
        fixerFlush();
        const nextPrIdx = fixerPageRegionIdx + 1;
        if (nextPrIdx < (region?.pageRegions?.length ?? 0)) {
          setFixerPageRegionIdx(nextPrIdx);
        } else {
          const nextRegionIdx = fixerRegionIdx + 1;
          if (nextRegionIdx < regions.length) {
            setFixerRegionIdx(nextRegionIdx);
            setFixerPageRegionIdx(0);
            setSelectedIndex(nextRegionIdx);
          } else {
            setFixerMode(false);
          }
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      if (fixerDebounceRef.current) clearTimeout(fixerDebounceRef.current);
    };
  }, [
    fixerMode,
    fixerRegionIdx,
    fixerPageRegionIdx,
    fixerEditing,
    fixerDraftY,
    fixerDraftHeight,
    regions,
    updatePageRegion,
    fixerFlush,
  ]);

  useEffect(() => {
    if (fixerMode && regions.length > 0) {
      setFixerRegionIdx((i) => Math.min(i, regions.length - 1));
      const r = regions[Math.min(fixerRegionIdx, regions.length - 1)];
      setFixerPageRegionIdx((p) => Math.min(p, Math.max(0, (r?.pageRegions?.length ?? 1) - 1)));
    }
    if (fixerMode && regions.length === 0) setFixerMode(false);
  }, [fixerMode, regions.length, fixerRegionIdx]);

  if (fixerMode && pdfBlob && fixerPageRegion && fixerRegion) {
    const totalSegments = regions.reduce((sum, r) => sum + (r.pageRegions?.length ?? 0), 0);
    let currentSegment = 0;
    for (let i = 0; i < fixerRegionIdx; i++) currentSegment += regions[i]?.pageRegions?.length ?? 0;
    currentSegment += fixerPageRegionIdx + 1;
    const displayRegion: PdfRegion = {
      ...fixerPageRegion,
      y: fixerDraftY,
      height: fixerDraftHeight,
    };
    return (
      <div className="flex flex-col w-full h-[calc(100vh-8rem)]">
        <div className="flex items-center justify-between gap-4 mb-3">
          <h2 className="color-txt-main font-semibold">Y & Height Fixer</h2>
          <div className="flex items-center gap-2">
            <span className="color-txt-sub text-sm">
              {fixerRegion.name} — Page {fixerPageRegion.page} ({currentSegment}/{totalSegments})
            </span>
            <button
              type="button"
              onClick={() => {
                fixerFlush();
                setFixerMode(false);
              }}
              className="px-3 py-1.5 rounded-lg text-sm color-bg-grey-10 color-txt-main hover:color-bg-grey-5"
            >
              Exit (Esc)
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 flex gap-4">
          <div className="flex-1 flex flex-col items-center justify-center min-h-0">
            <div className="w-full max-w-2xl relative">
              <PdfRegionView key={fixerReloadKey} file={pdfBlob} region={displayRegion} width={600} />
              <button
                type="button"
                onClick={() => setFixerReloadKey((k) => k + 1)}
                className="absolute top-2 right-2 px-2 py-1 rounded text-xs color-bg-grey-10 color-txt-sub hover:color-bg-grey-5"
                title="Reload PDF preview"
              >
                Reload
              </button>
            </div>
          </div>
          <div className="w-56 shrink-0 flex flex-col gap-4 color-bg-grey-5 rounded-xl p-4">
            <div className="color-txt-sub text-xs font-medium">Editing: {fixerEditing === "y" ? "Top (y)" : "Height"}</div>
            <div className="flex flex-col gap-2">
              <div
                className={`px-3 py-2 rounded-lg font-mono text-lg ${fixerEditing === "y" ? "color-bg-accent color-txt-main" : "color-bg-grey-10 color-txt-sub"}`}
              >
                y: {fixerDraftY} pt
              </div>
              <div
                className={`px-3 py-2 rounded-lg font-mono text-lg ${fixerEditing === "height" ? "color-bg-accent color-txt-main" : "color-bg-grey-10 color-txt-sub"}`}
              >
                height: {fixerDraftHeight} pt
              </div>
            </div>
            <div className="color-txt-sub text-xs mt-auto space-y-1">
              <div><strong>F</strong> decrease</div>
              <div><strong>J</strong> increase</div>
              <div><strong>K</strong> switch y/height</div>
              <div><strong>D</strong> reload PDF</div>
              <div><strong>Enter</strong> next</div>
              <div><strong>Esc</strong> exit</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col w-full ${regions.length > 0 ? "h-[calc(100vh-12rem)] overflow-hidden" : ""}`}>
      {/* Header: PDF upload + Extract */}
      <div className="flex flex-wrap items-end gap-4 mb-4">
        <div>
          <label className="block color-txt-sub text-sm mb-1">PDF paper</label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setPdfFile(f ?? null);
              setRegions([]);
              setExtractStatus("idle");
              setExtractError(null);
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl color-bg-grey-5 color-txt-main text-sm hover:color-bg-grey-10 transition-all min-w-[200px]"
          >
            <LuFileText size={18} className="color-txt-accent shrink-0" />
            {pdfFile ? pdfFile.name : "Choose PDF"}
          </button>
        </div>
        <div>
          <label className="block color-txt-sub text-sm mb-1">Paper year</label>
          <select
            value={paperYear ?? ""}
            onChange={(e) => setPaperYear(e.target.value ? Number(e.target.value) : null)}
            className="px-3 py-2 rounded-xl color-bg-grey-5 color-txt-main text-sm min-w-[120px] border-0"
          >
            <option value="">No auto marking scheme</option>
            {MARKING_SCHEME_YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <p className="color-txt-sub text-xs mt-0.5">
            Picks marking scheme from assets. Log Tables load automatically.
          </p>
        </div>
        <div>
          <label className="block color-txt-sub text-sm mb-1">Marking scheme</label>
          <input
            ref={markingSchemeInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setMarkingSchemeFile(f ?? null);
            }}
          />
          <button
            type="button"
            onClick={() => markingSchemeInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl color-bg-grey-5 color-txt-main text-sm hover:color-bg-grey-10 transition-all min-w-[200px]"
          >
            <LuClipboardList size={18} className="color-txt-accent shrink-0" />
            {markingSchemeFile
              ? markingSchemeFile.name
              : markingSchemeBlobFromYear
                ? `Auto (${paperYear})`
                : "Override or choose PDF"}
          </button>
        </div>
        <label className="flex items-center gap-2 color-txt-sub text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={includeLogTablesAndMarkingScheme}
            onChange={(e) => setIncludeLogTablesAndMarkingScheme(e.target.checked)}
            className="rounded"
          />
          Include Log Tables &amp; Marking Scheme (slower)
        </label>
        <div className="flex flex-col gap-1.5">
          <label className="block color-txt-sub text-sm mb-0.5">Extract with JSON</label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="json-regions-input"
              ref={jsonInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleLoadJson}
            />
            <label
              htmlFor="json-regions-input"
              className="flex items-center gap-2 px-4 py-2 rounded-xl color-bg-grey-5 color-txt-main text-sm hover:color-bg-grey-10 transition-all min-w-[120px] cursor-pointer"
              title="Load pre-made regions from a JSON file"
            >
              <LuFileText size={18} className="color-txt-accent shrink-0" />
              {jsonFileName ?? "Choose file"}
            </label>
            <span className="color-txt-sub text-xs">or paste:</span>
            <textarea
              placeholder='{"regions": [...]} or [...]'
              value={pastedJson}
              onChange={(e) => {
                setPastedJson(e.target.value);
                if (jsonLoadError) setJsonLoadError(null);
              }}
              className="min-w-[180px] max-w-[280px] min-h-[36px] px-3 py-1.5 rounded-lg color-bg-grey-10 color-txt-main text-xs font-mono resize-y"
              rows={1}
            />
            <button
              type="button"
              onClick={applyPastedJson}
              disabled={!pdfFile || !pastedJson.trim()}
              className="flex items-center gap-1 px-3 py-2 rounded-xl color-bg-accent color-txt-main text-sm font-medium hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Load
            </button>
          </div>
          {jsonLoadError && (
            <span className="text-xs color-txt-sub" role="alert">
              {jsonLoadError}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleExtract}
          disabled={!pdfFile || snapshotsLoading || extractStatus === "loading"}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl color-bg-accent color-txt-main font-medium text-sm hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {(snapshotsLoading || extractStatus === "loading") ? (
            <LuLoader size={18} className="animate-spin shrink-0" />
          ) : (
            <LuSparkles size={18} className="shrink-0" />
          )}
          {snapshotsLoading
            ? "Loading pages…"
            : extractStatus === "loading"
              ? (extractProgress || "Extracting…")
              : "Extract regions"}
        </button>
        {pdfFile && regions.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => {
                setFixerMode(true);
                setFixerRegionIdx(0);
                setFixerPageRegionIdx(0);
                setFixerEditing("y");
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium color-bg-grey-5 color-txt-sub hover:color-bg-grey-10 transition-all"
              title="Adjust y and height for each region with keyboard shortcuts"
            >
              <LuSlidersHorizontal size={18} />
              Y & Height Fixer
            </button>
            <button
              type="button"
              onClick={handleDownloadJson}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium color-bg-grey-5 color-txt-sub hover:color-bg-grey-10 transition-all"
              title="Download regions as JSON with all your edits. Use this to save your work or reload later."
            >
              <LuDownload size={18} />
              Download JSON
            </button>
            <button
              type="button"
              onClick={() => setShowFullPdf((v) => !v)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                showFullPdf ? "color-bg-accent color-txt-accent" : "color-bg-grey-5 color-txt-sub hover:color-bg-grey-10"
              }`}
              title="Toggle full PDF reference"
            >
              <LuBookOpen size={18} />
              Full PDF
            </button>
            {logTablesBlob && (
              <button
                type="button"
                onClick={() => setShowLogTablesPreview((v) => !v)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  showLogTablesPreview ? "color-bg-accent color-txt-accent" : "color-bg-grey-5 color-txt-sub hover:color-bg-grey-10"
                }`}
                title="Toggle Log Tables reference"
              >
                <LuBookOpen size={18} />
                Log Tables
              </button>
            )}
            {markingSchemeBlob && (
              <button
                type="button"
                onClick={() => setShowMarkingSchemePreview((v) => !v)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  showMarkingSchemePreview ? "color-bg-accent color-txt-accent" : "color-bg-grey-5 color-txt-sub hover:color-bg-grey-10"
                }`}
                title="Toggle marking scheme preview"
              >
                <LuClipboardList size={18} />
                Marking scheme
              </button>
            )}
          </>
        )}
        {onUploadToFirestore && pdfFile && (
          <button
            type="button"
            onClick={() => onUploadToFirestore(pdfFile, regions)}
            disabled={isUploading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl color-bg-accent color-txt-main font-medium text-sm hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUploading ? (
              <LuLoader size={18} className="animate-spin shrink-0" />
            ) : (
              <LuUpload size={18} className="shrink-0" />
            )}
            {isUploading ? (uploadProgress || "Uploading…") : "Upload to Firestore"}
          </button>
        )}
        {extractError && (
          <div
            className="color-txt-sub text-sm max-w-2xl max-h-48 overflow-auto rounded-lg p-3 color-bg-grey-10 whitespace-pre-wrap break-words"
            role="alert"
          >
            {extractError}
          </div>
        )}
      </div>

      {regions.length === 0 && extractStatus !== "loading" && !snapshotsLoading && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 color-txt-sub text-sm">
          <p>Upload a PDF, then either click &quot;Extract regions&quot; (AI) or use &quot;Extract with JSON&quot; to load a pre-made regions file. One region per question part (Q1a, Q1b, …); width = full paper (595), height varies.</p>
          {pdfFile && (
            <button
              type="button"
              onClick={addRegion}
              className="flex items-center gap-2 px-4 py-2 rounded-xl color-bg-accent color-txt-main text-sm font-medium hover:brightness-110"
            >
              <LuPlus size={18} />
              Add region manually
            </button>
          )}
        </div>
      )}

      {regions.length > 0 && (
        <div className="flex flex-1 min-h-0 gap-4 overflow-hidden">
          {/* Left: Region list */}
          <div className="w-64 shrink-0 flex flex-col min-h-0 color-bg-grey-5 rounded-2xl overflow-hidden">
            <div className="p-3 color-bg-grey-10 color-txt-sub text-xs font-medium flex items-center justify-between gap-2">
              <span>Regions ({regions.length})</span>
              <button
                type="button"
                onClick={addRegion}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs color-bg-accent color-txt-accent hover:brightness-110 shrink-0"
                title="Add region manually"
              >
                <LuPlus size={12} />
                Add
              </button>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-minimal">
              {regions.map((r, i) => (
                <div
                  key={r.id}
                  className={`flex items-center gap-1 border-b border-[var(--grey-10)] ${
                    selectedIndex === i ? "color-bg-grey-10" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedIndex(i)}
                    className={`flex-1 min-w-0 text-left px-3 py-2.5 hover:color-bg-grey-10 transition-colors ${
                      selectedIndex === i ? "color-txt-accent font-medium" : "color-txt-main"
                    }`}
                  >
                    <span className="block truncate">{r.name || r.id}</span>
                    {r.pageRegions.length > 1 && (
                      <span className="block truncate text-xs color-txt-sub">
                        {r.pageRegions.length} pages
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeRegion(i);
                    }}
                    className="p-2 shrink-0 rounded hover:bg-red-500/20 text-red-400"
                    title="Delete question"
                  >
                    <LuTrash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Center: PDF preview + coord editor */}
          <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-4 overflow-y-auto">
            {selected && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* PDF region preview - stacked for multi-page */}
                <div className="flex flex-col gap-3">
                  <h3 className="color-txt-main font-semibold">Preview</h3>
                  <div className="flex flex-col gap-2 color-bg-grey-5 rounded-2xl p-2">
                    {selected.pageRegions.map((pr, i) => (
                      <div key={i} className="relative">
                        {selected.pageRegions.length > 1 && (
                          <span className="absolute top-1 left-1 z-10 px-1.5 py-0.5 rounded text-xs color-bg-grey-10 color-txt-sub">
                            Page {pr.page}
                          </span>
                        )}
                        <PdfRegionView
                          file={pdfBlob}
                          region={pr as PdfRegion}
                          width={500}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Region coords editor */}
                <div className="flex flex-col gap-3 color-bg-grey-5 rounded-2xl p-4">
                  <h3 className="color-txt-main font-semibold">Edit region</h3>
                  <div className="grid gap-2">
                    <label className="color-txt-sub text-xs">ID</label>
                    <input
                      type="text"
                      value={selected.id}
                      onChange={(e) => updateRegion(selectedIndex, { id: e.target.value })}
                      className="px-3 py-2 rounded-lg color-bg-grey-10 color-txt-main text-sm font-mono"
                    />
                  </div>
                  <div className="grid gap-2">
                    <label className="color-txt-sub text-xs">Name</label>
                    <input
                      type="text"
                      value={selected.name}
                      onChange={(e) => updateRegion(selectedIndex, { name: e.target.value })}
                      className="px-3 py-2 rounded-lg color-bg-grey-10 color-txt-main text-sm"
                    />
                  </div>
                  <div className="grid gap-2">
                    <label className="color-txt-sub text-xs">Log table page</label>
                    <input
                      type="number"
                      min={1}
                      placeholder="e.g. 22 or leave empty"
                      value={selected.log_table_page ?? ""}
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        updateRegion(selectedIndex, {
                          log_table_page: v === "" ? null : (parseInt(v, 10) || null),
                        });
                      }}
                      className="px-3 py-2 rounded-lg color-bg-grey-10 color-txt-main text-sm font-mono"
                    />
                  </div>
                  <div className="grid gap-2">
                    <label className="color-txt-sub text-xs">Tags (comma-separated)</label>
                    <input
                      type="text"
                      placeholder="e.g. Quadratics, Algebra"
                      value={(selected.tags ?? []).join(", ")}
                      onChange={(e) =>
                        updateRegion(selectedIndex, {
                          tags: e.target.value
                            .split(",")
                            .map((t) => t.trim())
                            .filter(Boolean),
                        })
                      }
                      className="px-3 py-2 rounded-lg color-bg-grey-10 color-txt-main text-sm"
                    />
                  </div>
                  <div className="grid gap-2 grid-cols-2">
                    <label className="color-txt-sub text-xs col-span-2">Marking scheme page range (optional)</label>
                    <input
                      type="number"
                      min={1}
                      placeholder="Start"
                      value={selected.marking_scheme_page_range?.start ?? ""}
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        const start = v === "" ? undefined : (parseInt(v, 10) || undefined);
                        const end = selected.marking_scheme_page_range?.end;
                        updateRegion(selectedIndex, {
                          marking_scheme_page_range:
                            start != null && end != null ? { start, end } : start != null ? { start, end: start } : null,
                        });
                      }}
                      className="px-3 py-2 rounded-lg color-bg-grey-10 color-txt-main text-sm font-mono"
                    />
                    <input
                      type="number"
                      min={1}
                      placeholder="End"
                      value={selected.marking_scheme_page_range?.end ?? ""}
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        const end = v === "" ? undefined : (parseInt(v, 10) || undefined);
                        const start = selected.marking_scheme_page_range?.start;
                        updateRegion(selectedIndex, {
                          marking_scheme_page_range:
                            start != null && end != null ? { start, end } : end != null ? { start: end, end } : null,
                        });
                      }}
                      className="px-3 py-2 rounded-lg color-bg-grey-10 color-txt-main text-sm font-mono"
                    />
                  </div>

                  {/* Page regions */}
                  <div className="grid gap-2">
                    <div className="flex items-center justify-between">
                      <label className="color-txt-sub text-xs">Pages</label>
                      <button
                        type="button"
                        onClick={() => addPageRegion(selectedIndex)}
                        className="flex items-center gap-1 px-2 py-1 rounded text-xs color-bg-accent color-txt-accent hover:brightness-110"
                      >
                        <LuPlus size={12} />
                        Add page
                      </button>
                    </div>
                    {selected.pageRegions.map((pr, prIndex) => (
                      <div
                        key={prIndex}
                        className="p-3 rounded-lg color-bg-grey-10 flex flex-col gap-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <label className="color-txt-sub text-xs font-medium shrink-0">Page</label>
                          <input
                            type="number"
                            min={1}
                            value={pr.page}
                            onChange={(e) => {
                              const v = parseInt(e.target.value, 10);
                              if (Number.isFinite(v) && v >= 1) {
                                updatePageRegion(selectedIndex, prIndex, { page: v });
                              }
                            }}
                            className="w-20 px-2 py-1.5 rounded color-bg-grey-5 color-txt-main text-sm font-mono"
                          />
                          {selected.pageRegions.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removePageRegion(selectedIndex, prIndex)}
                              className="p-1 rounded hover:bg-red-500/20 text-red-400"
                              title="Remove page"
                            >
                              <LuTrash2 size={14} />
                            </button>
                          )}
                        </div>
                        <div className="grid gap-3">
                          <div className="flex flex-col gap-1">
                            <label className="color-txt-sub text-xs flex justify-between">
                              <span>Top (y)</span>
                              <span className="font-mono color-txt-main">{pr.y} pt</span>
                            </label>
                            <input
                              type="range"
                              min={0}
                              max={842}
                              step={5}
                              value={pr.y}
                              onChange={(e) => {
                                const v = parseInt(e.target.value, 10);
                                if (Number.isFinite(v)) {
                                  updatePageRegion(selectedIndex, prIndex, { y: v });
                                }
                              }}
                              className="w-full h-2 rounded-full color-bg-grey-5 accent-[var(--accent)] cursor-pointer"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="color-txt-sub text-xs flex justify-between">
                              <span>Height</span>
                              <span className="font-mono color-txt-main">{pr.height} pt</span>
                            </label>
                            <input
                              type="range"
                              min={20}
                              max={842}
                              step={5}
                              value={pr.height}
                              onChange={(e) => {
                                const v = parseInt(e.target.value, 10);
                                if (Number.isFinite(v)) {
                                  updatePageRegion(selectedIndex, prIndex, { height: v });
                                }
                              }}
                              className="w-full h-2 rounded-full color-bg-grey-5 accent-[var(--accent)] cursor-pointer"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                    <p className="color-txt-sub text-xs">
                      Adjust where the question starts (y) and how tall the region is. Full page width is used. Add page for questions spanning multiple pages.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right: Full PDF reference */}
          {showFullPdf && pdfBlob && (
            <div className="w-80 shrink-0 flex flex-col min-h-0 color-bg-grey-5 rounded-2xl overflow-hidden">
              <div className="p-3 color-bg-grey-10 color-txt-sub text-xs font-medium flex items-center justify-between">
                <span>Full PDF reference</span>
                <button
                  type="button"
                  onClick={() => setShowFullPdf(false)}
                  className="p-1 rounded hover:color-bg-grey-5 color-txt-sub"
                  title="Close"
                >
                  ✕
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                <PaperPdfPlaceholder file={pdfBlob} pageWidth={280} />
              </div>
            </div>
          )}
          {/* Log Tables reference */}
          {showLogTablesPreview && logTablesBlob && (
            <div className="w-80 shrink-0 flex flex-col min-h-0 color-bg-grey-5 rounded-2xl overflow-hidden">
              <div className="p-3 color-bg-grey-10 color-txt-sub text-xs font-medium flex items-center justify-between">
                <span>Log Tables reference</span>
                <button
                  type="button"
                  onClick={() => setShowLogTablesPreview(false)}
                  className="p-1 rounded hover:color-bg-grey-5 color-txt-sub"
                  title="Close"
                >
                  ✕
                </button>
              </div>
              <div className="px-3 pb-2 flex flex-wrap items-center gap-2 color-txt-sub text-xs border-b border-[var(--grey-10)]">
                <span>Page {logTablesCurrentPage} of {logTablesNumPages || "—"}</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={logTablesNumPages || undefined}
                    placeholder="Go to"
                    value={logTablesGoToInput}
                    onChange={(e) => setLogTablesGoToInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const n = parseInt(logTablesGoToInput, 10);
                        if (Number.isFinite(n) && n >= 1) {
                          setLogTablesScrollToPage(Math.min(n, logTablesNumPages || n));
                          setLogTablesGoToInput("");
                        }
                      }
                    }}
                    className="w-14 px-2 py-1 rounded color-bg-grey-10 color-txt-main text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const n = parseInt(logTablesGoToInput, 10);
                      if (Number.isFinite(n) && n >= 1) {
                        setLogTablesScrollToPage(Math.min(n, logTablesNumPages || n));
                        setLogTablesGoToInput("");
                      }
                    }}
                    className="px-2 py-1 rounded color-bg-accent color-txt-accent text-xs font-medium hover:brightness-110"
                  >
                    Check page
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                <PaperPdfPlaceholder
                  file={logTablesBlob}
                  pageWidth={280}
                  onCurrentPageChange={setLogTablesCurrentPage}
                  onNumPages={setLogTablesNumPages}
                  scrollToPage={logTablesScrollToPage ?? undefined}
                  onScrolledToPage={() => setLogTablesScrollToPage(null)}
                />
              </div>
            </div>
          )}
          {/* Marking scheme preview */}
          {showMarkingSchemePreview && markingSchemeBlob && (
            <div className="w-80 shrink-0 flex flex-col min-h-0 color-bg-grey-5 rounded-2xl overflow-hidden">
              <div className="p-3 color-bg-grey-10 color-txt-sub text-xs font-medium flex items-center justify-between">
                <span>Marking scheme preview</span>
                <button
                  type="button"
                  onClick={() => setShowMarkingSchemePreview(false)}
                  className="p-1 rounded hover:color-bg-grey-5 color-txt-sub"
                  title="Close"
                >
                  ✕
                </button>
              </div>
              <div className="px-3 pb-2 flex flex-wrap items-center gap-2 color-txt-sub text-xs border-b border-[var(--grey-10)]">
                <span>Page {markingSchemeCurrentPage} of {markingSchemeNumPages || "—"}</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={markingSchemeNumPages || undefined}
                    placeholder="Go to"
                    value={markingSchemeGoToInput}
                    onChange={(e) => setMarkingSchemeGoToInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const n = parseInt(markingSchemeGoToInput, 10);
                        if (Number.isFinite(n) && n >= 1) {
                          setMarkingSchemeScrollToPage(Math.min(n, markingSchemeNumPages || n));
                          setMarkingSchemeGoToInput("");
                        }
                      }
                    }}
                    className="w-14 px-2 py-1 rounded color-bg-grey-10 color-txt-main text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const n = parseInt(markingSchemeGoToInput, 10);
                      if (Number.isFinite(n) && n >= 1) {
                        setMarkingSchemeScrollToPage(Math.min(n, markingSchemeNumPages || n));
                        setMarkingSchemeGoToInput("");
                      }
                    }}
                    className="px-2 py-1 rounded color-bg-accent color-txt-accent text-xs font-medium hover:brightness-110"
                  >
                    Check page
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                <PaperPdfPlaceholder
                  file={markingSchemeBlob}
                  pageWidth={280}
                  onCurrentPageChange={setMarkingSchemeCurrentPage}
                  onNumPages={setMarkingSchemeNumPages}
                  scrollToPage={markingSchemeScrollToPage ?? undefined}
                  onScrolledToPage={() => setMarkingSchemeScrollToPage(null)}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
