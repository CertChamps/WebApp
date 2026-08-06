import { getDocumentCached } from "./pdfDocumentCache";
import type { PaperPageRegion } from "../hooks/useExamPapers";

const DEFAULT_RENDER_SCALE = 2;
const MAX_PAGES = 12;

export type PdfRenderOptions = {
  /** PDF.js viewport scale. Default 2. Use ~1.35 for whiteboard previews. */
  scale?: number;
  /** Output mime type. Default image/png. */
  mimeType?: "image/png" | "image/jpeg";
  /** JPEG quality 0–1 when mimeType is image/jpeg. */
  quality?: number;
};

function canvasToDataUrl(
  canvas: HTMLCanvasElement,
  opts?: PdfRenderOptions
): string {
  const mime = opts?.mimeType ?? "image/png";
  if (mime === "image/jpeg") {
    return canvas.toDataURL("image/jpeg", opts?.quality ?? 0.85);
  }
  return canvas.toDataURL("image/png");
}

/** Render a page range of a PDF blob to image data URLs (1-based, inclusive). */
export async function renderPdfPages(
  blob: Blob,
  range?: [number, number],
  opts?: PdfRenderOptions
): Promise<string[]> {
  const docPdf = await getDocumentCached(blob);
  const scale = opts?.scale ?? DEFAULT_RENDER_SCALE;
  const start = Math.max(1, range?.[0] ?? 1);
  const end = Math.min(docPdf.numPages, range?.[1] ?? docPdf.numPages, start + MAX_PAGES - 1);
  const urls: string[] = [];
  for (let i = start; i <= end; i++) {
    const page = await docPdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get canvas context");
    // White backdrop so JPEG pages don't get a black background.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    urls.push(canvasToDataUrl(canvas, opts));
  }
  return urls;
}

/** Render cropped regions of a PDF blob (same region model as PdfRegionView). */
export async function renderPdfRegions(
  blob: Blob,
  regions: PaperPageRegion[],
  opts?: PdfRenderOptions
): Promise<string[]> {
  const docPdf = await getDocumentCached(blob);
  const scale = opts?.scale ?? DEFAULT_RENDER_SCALE;
  const urls: string[] = [];
  const pageCanvasCache = new Map<number, { canvas: HTMLCanvasElement; scale: number }>();

  for (const region of regions.slice(0, MAX_PAGES)) {
    const pageNum = Math.max(1, Math.min(region.page ?? 1, docPdf.numPages));
    let cached = pageCanvasCache.get(pageNum);
    if (!cached) {
      const page = await docPdf.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const pageScale = viewport.width / page.getViewport({ scale: 1 }).width;
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not get canvas context");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      cached = { canvas, scale: pageScale };
      pageCanvasCache.set(pageNum, cached);
    }

    const { canvas: pageCanvas, scale: pageScale } = cached;
    const minCropPx = 20;
    const rawSx = (region.x ?? 0) * pageScale;
    const rawSy = (region.y ?? 0) * pageScale;
    const rawSw = (region.width ?? 595) * pageScale;
    const rawSh = (region.height ?? 150) * pageScale;
    const sx = Math.max(0, Math.min(rawSx, Math.max(0, pageCanvas.width - minCropPx)));
    const sy = Math.max(0, Math.min(rawSy, Math.max(0, pageCanvas.height - minCropPx)));
    const sw = Math.max(minCropPx, Math.min(rawSw, pageCanvas.width - sx));
    const sh = Math.max(minCropPx, Math.min(rawSh, pageCanvas.height - sy));

    const out = document.createElement("canvas");
    out.width = sw;
    out.height = sh;
    const outCtx = out.getContext("2d");
    if (!outCtx) throw new Error("Could not get canvas context");
    outCtx.fillStyle = "#ffffff";
    outCtx.fillRect(0, 0, sw, sh);
    outCtx.drawImage(pageCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
    urls.push(canvasToDataUrl(out, opts));
  }
  return urls;
}
