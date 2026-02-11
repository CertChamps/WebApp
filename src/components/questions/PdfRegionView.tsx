import { useEffect, useState, useRef } from "react";
import { getDocument } from "pdfjs-dist";

/** Region in PDF points (72 per inch). (x,y) = top-left of crop area. */
export type PdfRegion = {
  page: number; // 1-based
  x: number;
  y: number; // from top of page
  width: number;
  height: number;
};

const LOAD_TIMEOUT_MS = 12_000;

type PdfRegionViewProps = {
  /** PDF as Blob or URL string */
  file: string | Blob | null;
  /** Region to display. If null, shows full page. */
  region: PdfRegion | null;
  /** Max width of the rendered region in px */
  width?: number;
  className?: string;
};

/**
 * Renders only the specified region of a PDF page.
 * Uses pdfjs to render the full page to an offscreen canvas, then draws the cropped region.
 */
export default function PdfRegionView({
  file,
  region,
  width = 480,
  className = "",
}: PdfRegionViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  // Use primitive deps so effect only re-runs when region values actually change
  const hasRegion = !!region;
  const page = region?.page ?? 1;
  const x = region?.x ?? 0;
  const y = region?.y ?? 0;
  const rWidth = region?.width ?? 595;
  const rHeight = region?.height ?? 150;

  useEffect(() => {
    if (!file || !canvasRef.current) {
      setError(null);
      setLoading(false);
      setTimedOut(false);
      return;
    }
    setError(null);
    setTimedOut(false);
    setLoading(true);
    let cancelled = false;
    const timeoutId = setTimeout(() => {
      if (!cancelled) {
        setTimedOut(true);
      }
    }, LOAD_TIMEOUT_MS);

    (async () => {
      try {
        const data = typeof file === "string" ? file : await (file as Blob).arrayBuffer();
        const doc = await getDocument(data).promise;
        if (cancelled) return;

        const pageNum = hasRegion ? page : 1;
        const pdfPage = await doc.getPage(Math.max(1, Math.min(pageNum, doc.numPages)));
        if (cancelled) return;

        const scale = 1.5;
        const viewport = pdfPage.getViewport({ scale });

        // Render full page to offscreen canvas
        const offscreen = document.createElement("canvas");
        offscreen.width = viewport.width;
        offscreen.height = viewport.height;
        const ctx = offscreen.getContext("2d");
        if (!ctx) throw new Error("Could not get canvas context");
        await pdfPage.render({ canvasContext: ctx, viewport }).promise;
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        if (hasRegion) {
          // Crop: region is in PDF points. Viewport at scale 1 has 1:1 with PDF points.
          const s = viewport.width / pdfPage.getViewport({ scale: 1 }).width;
          const sx = x * s;
          const sy = y * s;
          const sw = rWidth * s;
          const sh = rHeight * s;

          if (sw <= 0 || sh <= 0) {
            setError("Invalid region dimensions");
            return;
          }

          const aspect = sw / sh;
          const displayHeight = width / aspect;
          canvas.width = width;
          canvas.height = displayHeight;
          const outCtx = canvas.getContext("2d");
          if (!outCtx) return;
          outCtx.drawImage(offscreen, sx, sy, sw, sh, 0, 0, width, displayHeight);
        } else {
          // Full page
          const aspect = viewport.height / viewport.width;
          const displayHeight = width * aspect;
          canvas.width = width;
          canvas.height = displayHeight;
          const outCtx = canvas.getContext("2d");
          if (!outCtx) return;
          outCtx.drawImage(offscreen, 0, 0, viewport.width, viewport.height, 0, 0, width, displayHeight);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to render PDF region");
        }
      } finally {
        clearTimeout(timeoutId);
        if (!cancelled) {
          setLoading(false);
          setTimedOut(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [file, hasRegion, page, x, y, rWidth, rHeight, width, retryKey]);

  if (!file) {
    return (
      <div className={`flex min-h-[120px] items-center justify-center color-txt-sub text-sm rounded-xl color-bg-grey-5 ${className}`}>
        No PDF loaded
      </div>
    );
  }

  const handleRetry = () => {
    setError(null);
    setTimedOut(false);
    setRetryKey((k) => k + 1);
  };

  return (
    <div className={`relative ${className}`}>
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 color-bg-grey-5/80 rounded-xl z-10">
          <span className="color-txt-sub text-sm">{timedOut ? "Taking longer than expected…" : "Loading..."}</span>
          {timedOut && (
            <button
              type="button"
              onClick={handleRetry}
              className="px-3 py-1.5 rounded-lg text-sm font-medium color-bg-accent color-txt-main hover:brightness-110"
            >
              Retry
            </button>
          )}
        </div>
      )}
      {error && (
        <div className="flex min-h-[120px] flex-col items-center justify-center gap-2 color-txt-sub text-sm rounded-xl color-bg-grey-5">
          <span>{error}</span>
          <button
            type="button"
            onClick={handleRetry}
            className="px-3 py-1.5 rounded-lg text-sm font-medium color-bg-accent color-txt-main hover:brightness-110"
          >
            Retry
          </button>
        </div>
      )}
      <canvas
        ref={canvasRef}
        className={`max-w-full rounded-xl color-shadow ${error ? "hidden" : ""}`}
        style={{ objectFit: "contain" }}
      />
    </div>
  );
}
