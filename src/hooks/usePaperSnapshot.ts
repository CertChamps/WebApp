import { useEffect, useState } from "react";
import { getDocumentCached } from "../utils/pdfDocumentCache";

const RENDER_SCALE = 1.5;
const MAX_WIDTH = 800;

/** LRU cache for snapshot data URLs (blob ref + page -> url) to avoid re-rendering same page. */
const SNAPSHOT_CACHE_MAX = 15;
const snapshotCache: { blob: Blob; page: number; url: string }[] = [];

function getCachedSnapshot(blob: Blob, page: number): string | null {
  const i = snapshotCache.findIndex((e) => e.blob === blob && e.page === page);
  if (i < 0) return null;
  const [entry] = snapshotCache.splice(i, 1);
  snapshotCache.push(entry);
  return entry.url;
}

function setCachedSnapshot(blob: Blob, page: number, url: string) {
  snapshotCache.push({ blob, page, url });
  if (snapshotCache.length > SNAPSHOT_CACHE_MAX) snapshotCache.shift();
}

/**
 * Renders a given page of a PDF blob to an image data URL so the AI can "see" the paper.
 * Returns null while loading or if blob is null. Page is 1-based; clamped to document range.
 * Uses shared document cache and snapshot cache for speed.
 */
export function usePaperSnapshot(paperBlob: Blob | null, pageNumber: number = 1): string | null {
  const [dataUrl, setDataUrl] = useState<string | null>(() =>
    paperBlob ? getCachedSnapshot(paperBlob, Math.max(1, Math.floor(pageNumber))) : null
  );

  useEffect(() => {
    if (!paperBlob) {
      setDataUrl(null);
      return;
    }
    const pageNo = Math.max(1, Math.floor(pageNumber));
    const cached = getCachedSnapshot(paperBlob, pageNo);
    if (cached) {
      setDataUrl(cached);
      return;
    }
    setDataUrl(null);
    let cancelled = false;

    (async () => {
      try {
        const doc = await getDocumentCached(paperBlob);
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
        const url = canvas.toDataURL("image/png");
        setCachedSnapshot(paperBlob, pageNo, url);
        setDataUrl(url);
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
