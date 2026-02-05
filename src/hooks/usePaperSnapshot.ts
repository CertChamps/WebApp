import { useEffect, useState } from "react";
import { getDocument } from "pdfjs-dist";

const RENDER_SCALE = 1.5;
const MAX_WIDTH = 800;

/**
 * Renders a given page of a PDF blob to an image data URL so the AI can "see" the paper.
 * Returns null while loading or if blob is null. Page is 1-based; clamped to document range.
 */
export function usePaperSnapshot(paperBlob: Blob | null, pageNumber: number = 1): string | null {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!paperBlob) {
      setDataUrl(null);
      return;
    }
    setDataUrl(null);
    let cancelled = false;
    const pageNo = Math.max(1, Math.floor(pageNumber));

    (async () => {
      try {
        const data = await paperBlob.arrayBuffer();
        if (cancelled) return;
        const doc = await getDocument(data).promise;
        if (cancelled) return;
        const numPages = doc.numPages;
        const clamped = Math.min(pageNo, numPages);
        const page = await doc.getPage(clamped);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: RENDER_SCALE });
        const width = Math.min(viewport.width, MAX_WIDTH);
        const scale = width / viewport.width;
        const scaledViewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setDataUrl(null);
          return;
        }
        await page.render({
          canvasContext: ctx,
          viewport: scaledViewport,
        }).promise;
        if (cancelled) return;
        setDataUrl(canvas.toDataURL("image/png"));
      } catch (e) {
        if (!cancelled) {
          console.warn("Paper snapshot failed:", e);
          setDataUrl(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [paperBlob, pageNumber]);

  return dataUrl;
}
