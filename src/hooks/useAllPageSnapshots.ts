import { useEffect, useState } from "react";
import { getDocument } from "pdfjs-dist";

const RENDER_SCALE = 1;
const MAX_WIDTH = 600; // Smaller for API payload limits
const MAX_PAGES = 20;  // Send more pages so AI can extract all questions

/**
 * Renders all pages of a PDF blob to image data URLs for AI extraction.
 * Returns array of data URLs (index 0 = page 1).
 */
export function useAllPageSnapshots(blob: Blob | null): { snapshots: string[]; loading: boolean; error: string | null } {
  const [snapshots, setSnapshots] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setSnapshots([]);
      setLoading(false);
      setError(null);
      return;
    }
    setSnapshots([]);
    setError(null);
    setLoading(true);
    let cancelled = false;

    (async () => {
      try {
        const data = await blob.arrayBuffer();
        if (cancelled) return;
        const doc = await getDocument(data).promise;
        if (cancelled) return;
        const numPages = doc.numPages;
        const urls: string[] = [];

        const pagesToRender = Math.min(numPages, MAX_PAGES);
        for (let i = 1; i <= pagesToRender; i++) {
          if (cancelled) return;
          const page = await doc.getPage(i);
          if (cancelled) return;
          const viewport = page.getViewport({ scale: RENDER_SCALE });
          const width = Math.min(viewport.width, MAX_WIDTH);
          const scale = width / viewport.width;
          const scaledViewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = scaledViewport.width;
          canvas.height = scaledViewport.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Could not get canvas context");
          await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
          if (cancelled) return;
          // JPEG at 0.8 quality keeps payload smaller than PNG
          urls.push(canvas.toDataURL("image/jpeg", 0.8));
        }

        if (!cancelled) setSnapshots(urls);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to render PDF pages");
          setSnapshots([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [blob]);

  return { snapshots, loading, error };
}
