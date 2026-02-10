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

  useEffect(() => {
    if (!file || !canvasRef.current) {
      setError(null);
      return;
    }
    setError(null);
    setLoading(true);
    let cancelled = false;

    (async () => {
      try {
        const data = typeof file === "string" ? file : await (file as Blob).arrayBuffer();
        const doc = await getDocument(data).promise;
        if (cancelled) return;

        const pageNum = region?.page ?? 1;
        const page = await doc.getPage(Math.max(1, Math.min(pageNum, doc.numPages)));
        if (cancelled) return;

        const scale = 1.5;
        const viewport = page.getViewport({ scale });

        // Render full page to offscreen canvas
        const offscreen = document.createElement("canvas");
        offscreen.width = viewport.width;
        offscreen.height = viewport.height;
        const ctx = offscreen.getContext("2d");
        if (!ctx) throw new Error("Could not get canvas context");
        await page.render({ canvasContext: ctx, viewport }).promise;
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        if (region) {
          // Crop: region is in PDF points. Viewport at scale 1 has 1:1 with PDF points.
          const s = viewport.width / page.getViewport({ scale: 1 }).width;
          const sx = region.x * s;
          const sy = region.y * s;
          const sw = region.width * s;
          const sh = region.height * s;

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
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [file, region, width]);

  if (!file) {
    return (
      <div className={`flex min-h-[120px] items-center justify-center color-txt-sub text-sm rounded-xl color-bg-grey-5 ${className}`}>
        No PDF loaded
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center color-bg-grey-5/80 rounded-xl">
          <span className="color-txt-sub text-sm">Loading...</span>
        </div>
      )}
      {error && (
        <div className="flex min-h-[120px] items-center justify-center color-txt-sub text-sm rounded-xl color-bg-grey-5">
          {error}
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
