import { useEffect, useRef, useState } from "react";
import ExportCrop from "./ExportCrop";
import { LuCrop, LuDownload, LuLoaderCircle, LuShare } from "react-icons/lu";
import WhiteboardModal from "./WhiteboardModal";
import {
  buildExportBlob,
  canShareFiles,
  cropImageDataUrl,
  downloadBlob,
  shareOrDownloadBlob,
  withExtension,
  type ExportFormat,
  type ExportImage,
} from "../../lib/exportFile";

type Props = {
  title?: string;
  defaultName: string;
  /** When true, show crop control on the preview (whiteboards / practice canvas). */
  allowCrop?: boolean;
  getImage: () => ExportImage | null | Promise<ExportImage | null>;
  onClose: () => void;
};

export default function ExportModal({
  title = "Export",
  defaultName,
  allowCrop = false,
  getImage,
  onClose,
}: Props) {
  const [fileName, setFileName] = useState(defaultName);
  const [format, setFormat] = useState<ExportFormat>("png");
  const [preview, setPreview] = useState<ExportImage | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [previewRequest, setPreviewRequest] = useState(0);
  const [previewError, setPreviewError] = useState("");
  const [busy, setBusy] = useState<"download" | "share" | null>(null);
  const [actionError, setActionError] = useState("");
  const [cropping, setCropping] = useState(false);
  const [cropBusy, setCropBusy] = useState(false);
  const [prepared, setPrepared] = useState<{ image: ExportImage; format: ExportFormat; blob: Blob; mimeType: string } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const shareAvailable = canShareFiles();

  const getImageRef = useRef(getImage);
  getImageRef.current = getImage;

  useEffect(() => {
    let cancelled = false;
    setLoadingPreview(true);
    setPreviewError("");
    void (async () => {
      try {
        const image = await getImageRef.current();
        if (cancelled) return;
        if (!image) {
          setPreview(null);
          setPreviewError("Nothing to export yet — add some content first.");
          return;
        }
        setPreview(image);
      } catch (error) {
        console.error("[ExportModal] preview failed", error);
        if (!cancelled) {
          setPreview(null);
          setPreviewError("Couldn't prepare a preview of this page.");
        }
      } finally {
        if (!cancelled) setLoadingPreview(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [previewRequest]);

  useEffect(() => {
    let cancelled = false;
    setPrepared(null);
    if (!preview) return;
    setPreparing(true);
    setActionError("");
    void buildExportBlob(preview, format).then((result) => {
      if (!cancelled) setPrepared({ ...result, image: preview, format });
    }).catch((error) => {
      console.error("[ExportModal] prepare failed", error);
      if (!cancelled) setActionError("Couldn't prepare this file. Please try again.");
    }).finally(() => { if (!cancelled) setPreparing(false); });
    return () => { cancelled = true; };
  }, [preview, format]);

  const ready = prepared?.image === preview && prepared?.format === format && !preparing;

  const runExport = async (mode: "download" | "share") => {
    if (!ready || !prepared || busy || cropping) return;
    setBusy(mode);
    setActionError("");
    try {
      const filename = withExtension(fileName || defaultName, format);
      const { blob, mimeType } = prepared;
      if (mode === "share") {
        await shareOrDownloadBlob({
          blob,
          filename,
          mimeType,
          title: filename,
        });
      } else {
        await downloadBlob(blob, filename);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("[ExportModal] export failed", error);
      setActionError(mode === "share" ? "Sharing failed. Try Download instead." : "Download failed. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const applyCrop = async (area: { x: number; y: number; width: number; height: number }) => {
    if (!preview || cropBusy) return;
    setCropBusy(true);
    try {
      const cropped = await cropImageDataUrl(preview.dataUrl, area);
      setPreview(cropped);
      setCropping(false);
    } catch (error) {
      console.error("[ExportModal] crop failed", error);
      setActionError("Couldn't apply that crop.");
    } finally {
      setCropBusy(false);
    }
  };

  return (
    <WhiteboardModal
      title={title}
      onClose={onClose}
      maxWidthClass="max-w-md"
      headerActions={
        <button
          type="button"
          onClick={() => void runExport("share")}
          disabled={!ready || Boolean(busy) || loadingPreview || cropping}
          className="p-1.5 rounded-lg color-txt-sub hover:color-bg-grey-5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label={shareAvailable ? "Share" : "Share or download"}
          title={shareAvailable ? "Share" : "Share (falls back to download)"}
        >
          {busy === "share" ? <LuLoaderCircle size={18} className="animate-spin" /> : <LuShare size={18} />}
        </button>
      }
      footer={
        <div className="flex flex-col gap-2">
          {actionError ? <p role="alert" className="text-xs color-txt-sub">{actionError}</p> : null}
          {(previewError || (actionError && !ready && !preparing)) && !loadingPreview ? (
            <button type="button" onClick={() => setPreviewRequest((value) => value + 1)} className="text-sm font-semibold color-txt-accent cursor-pointer">Try again</button>
          ) : null}
          <button
            type="button"
            onClick={() => void runExport("download")}
            disabled={!ready || Boolean(busy) || loadingPreview || cropping}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold color-bg-accent color-txt-accent hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {busy === "download" || preparing ? (
              <LuLoaderCircle size={16} className="animate-spin" />
            ) : (
              <LuDownload size={16} />
            )}
            {preparing ? "Preparing file…" : `Download ${format === "pdf" ? "PDF" : "image"}`}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold color-txt-sub">File name</span>
          <input
            type="text"
            value={fileName}
            onChange={(event) => setFileName(event.target.value)}
            className="rounded-xl border color-shadow px-3 py-2 text-sm color-bg color-txt-main outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
            maxLength={80}
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold color-txt-sub">Format</span>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { id: "png", label: "Image (PNG)" },
                { id: "pdf", label: "PDF" },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                disabled={Boolean(busy)}
                aria-pressed={format === option.id}
                onClick={() => setFormat(option.id)}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors cursor-pointer ${
                  format === option.id
                    ? "color-bg-accent color-txt-accent"
                    : "color-bg-grey-5 color-txt-main hover:color-bg-grey-10"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold color-txt-sub">Preview</span>
          <div className="relative overflow-hidden rounded-xl border color-shadow color-bg-grey-5 min-h-[180px] flex items-center justify-center">
            {loadingPreview ? (
              <LuLoaderCircle size={22} className="animate-spin color-txt-sub" />
            ) : preview ? (
              <>
                <img
                  src={preview.dataUrl}
                  alt="Export preview"
                  className="max-h-[240px] w-full object-contain bg-white"
                />
                {allowCrop ? (
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => setCropping(true)}
                    className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-lg color-bg color-shadow border color-txt-main hover:color-bg-grey-5 cursor-pointer"
                    aria-label="Crop export"
                    title="Crop"
                  >
                    <LuCrop size={16} />
                  </button>
                ) : null}
              </>
            ) : (
              <p className="px-4 py-8 text-center text-xs color-txt-sub">{previewError || "No preview"}</p>
            )}
          </div>
        </div>
      </div>

      {cropping && preview ? (
        <ExportCrop image={preview} busy={cropBusy} onClose={() => setCropping(false)} onApply={(area) => void applyCrop(area)} />
      ) : null}
    </WhiteboardModal>
  );
}
