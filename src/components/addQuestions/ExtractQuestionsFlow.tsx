import { useState, useRef, useCallback, useEffect } from "react";
import { LuFileText, LuLoader, LuSparkles, LuPlus, LuTrash2, LuBookOpen, LuUpload } from "react-icons/lu";
import { useAllPageSnapshots } from "../../hooks/useAllPageSnapshots";
import PdfRegionView, { type PdfRegion } from "../questions/PdfRegionView";
import PaperPdfPlaceholder from "../questions/PaperPdfPlaceholder";
import "../../styles/settings.css";

const EXTRACT_API_URL = "https://us-central1-certchamps-a7527.cloudfunctions.net/extractQuestions";

/** One page region: bounding box on a single PDF page. */
export type PageRegion = { page: number; x: number; y: number; width: number; height: number };

/** One extracted region = one full question (all parts together), can span multiple pages. */
export type ExtractedRegion = {
  id: string;
  name: string;
  pageRegions: PageRegion[];
};

function normalizeRawRegion(r: Record<string, unknown>): ExtractedRegion {
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
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [extractStatus, setExtractStatus] = useState<"idle" | "loading" | "error">("idle");
  const [extractError, setExtractError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { snapshots, loading: snapshotsLoading } = useAllPageSnapshots(pdfFile);
  const pdfBlob = pdfFile ? new Blob([pdfFile], { type: "application/pdf" }) : null;

  const handleExtract = useCallback(async () => {
    if (!pdfFile || snapshots.length === 0) {
      setExtractError("Upload a PDF first and wait for pages to load.");
      return;
    }
    setExtractStatus("loading");
    setExtractError(null);
    try {
      const res = await fetch(EXTRACT_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageImages: snapshots }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || data.details || `Request failed: ${res.status}`);
      }
      const raw = Array.isArray(data.regions) ? data.regions : [];
      setRegions(raw.map((r: Record<string, unknown>) => normalizeRawRegion(r)));
      setSelectedIndex(0);
      setExtractStatus("idle");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Extraction failed";
      const isNetwork =
        msg.toLowerCase().includes("network") ||
        msg.toLowerCase().includes("fetch") ||
        msg.toLowerCase().includes("failed to fetch");
      setExtractError(
        isNetwork
          ? `${msg} — Make sure extractQuestions is deployed: firebase deploy --only functions:extractQuestions`
          : msg
      );
      setExtractStatus("error");
    }
  }, [pdfFile, snapshots]);

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
    };
    setRegions((prev) => [...prev, newRegion]);
    setSelectedIndex(regions.length);
  }, [regions.length]);

  const [showFullPdf, setShowFullPdf] = useState(true);
  const selected = regions[selectedIndex];

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
          {snapshotsLoading ? "Loading pages…" : extractStatus === "loading" ? "Extracting…" : "Extract regions"}
        </button>
        {pdfFile && regions.length > 0 && (
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
          <span className="color-txt-sub text-sm">{extractError}</span>
        )}
      </div>

      {regions.length === 0 && extractStatus !== "loading" && !snapshotsLoading && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 color-txt-sub text-sm">
          <p>Upload a PDF and click &quot;Extract regions&quot;. One region per full question (Q1, Q2, …); all parts (a), (b), (c) stay together. Width = full paper, height varies. Questions can span multiple pages.</p>
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
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedIndex(i)}
                  className={`w-full text-left px-3 py-2.5 border-b border-[var(--grey-10)] hover:color-bg-grey-10 transition-colors ${
                    selectedIndex === i ? "color-bg-grey-10 color-txt-accent font-medium" : "color-txt-main"
                  }`}
                >
                  <span className="block truncate">{r.name || r.id}</span>
                  {r.pageRegions.length > 1 && (
                    <span className="block truncate text-xs color-txt-sub">
                      {r.pageRegions.length} pages
                    </span>
                  )}
                </button>
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
                        className="p-3 rounded-lg color-bg-grey-10 flex flex-col gap-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="color-txt-sub text-xs font-medium">
                            Page {pr.page} segment
                          </span>
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
                        <div className="flex gap-2 flex-wrap">
                          {(["page", "x", "y", "width", "height"] as const).map((key) => (
                            <input
                              key={key}
                              type="number"
                              value={pr[key]}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                if (Number.isFinite(v)) {
                                  updatePageRegion(selectedIndex, prIndex, { [key]: v });
                                }
                              }}
                              placeholder={key}
                              className="w-16 px-2 py-1.5 rounded color-bg-grey-5 color-txt-main text-sm font-mono"
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                    <p className="color-txt-sub text-xs">
                      x=0, width=595 for full paper width. Add page for questions spanning multiple pages.
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
        </div>
      )}
    </div>
  );
}
