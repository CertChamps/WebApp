import { fetchStorageBlob } from "../utils/fetchStorageBlob";
import { getDocumentCached } from "../utils/pdfDocumentCache";
import { getDiscoverVideoEmbed, getDiscoverVideoPoster } from "./discoverMedia";

export type DiscoverPreviewKind = "video" | "pdf" | "website" | "none";

export type DiscoverPreviewSource = {
  title?: string;
  websiteUrl?: string | null;
  resourceSource?: "website" | "pdf" | null;
  pdfPath?: string | null;
  thumbnailUrl?: string | null;
  faviconUrl?: string | null;
};

const pdfThumbCache = new Map<string, string>();
const pdfThumbInflight = new Map<string, Promise<string | null>>();

function safeUrl(input: string | undefined | null): URL | null {
  if (!input?.trim()) return null;
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

export function isPdfDiscoverResource(resource: DiscoverPreviewSource): boolean {
  if (resource.resourceSource === "pdf" || Boolean(resource.pdfPath)) return true;
  const parsed = safeUrl(resource.websiteUrl);
  if (!parsed) return false;
  return /\.pdf$/i.test(parsed.pathname);
}

export function getDiscoverPreviewKind(resource: DiscoverPreviewSource): DiscoverPreviewKind {
  if (getDiscoverVideoEmbed(resource.websiteUrl)) return "video";
  if (isPdfDiscoverResource(resource)) return "pdf";
  if (resource.websiteUrl?.trim()) return "website";
  return "none";
}

export function hasMeaningfulThumbnail(resource: DiscoverPreviewSource): boolean {
  const url = resource.thumbnailUrl?.trim();
  if (!url) return false;
  if (resource.faviconUrl && url === resource.faviconUrl) return false;
  if (/\/favicon\.ico(\?|#|$)/i.test(url)) return false;
  return true;
}

export function getStoredOrRemoteThumbnail(resource: DiscoverPreviewSource): string | null {
  const poster = getDiscoverVideoPoster(resource.websiteUrl);
  if (poster) return poster;
  if (hasMeaningfulThumbnail(resource) && resource.thumbnailUrl) return resource.thumbnailUrl;
  return null;
}

export async function renderPdfFirstPageJpeg(blob: Blob, maxWidth = 960): Promise<Blob | null> {
  try {
    const doc = await getDocumentCached(blob);
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(1.35, maxWidth / Math.max(1, base.width));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    await page.render({ canvasContext: ctx, viewport }).promise;
    return await new Promise((resolve) => {
      canvas.toBlob((jpeg) => resolve(jpeg), "image/jpeg", 0.82);
    });
  } catch {
    return null;
  }
}

async function blobToDataUrl(blob: Blob): Promise<string | null> {
  return await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

export async function loadDiscoverPdfBlob(
  pdfPath?: string | null,
  websiteUrl?: string | null
): Promise<Blob | null> {
  if (pdfPath?.trim()) {
    try {
      return await fetchStorageBlob(pdfPath);
    } catch {
      // Fall through to the download URL when Storage getBlob is blocked.
    }
  }
  if (!websiteUrl?.trim()) return null;
  try {
    const response = await fetch(websiteUrl);
    if (!response.ok) return null;
    return await response.blob();
  } catch {
    return null;
  }
}

function pdfCacheKey(pdfPath?: string | null, websiteUrl?: string | null): string | null {
  return pdfPath?.trim() || websiteUrl?.trim() || null;
}

export async function getPdfFirstPageDataUrl(
  pdfPath?: string | null,
  websiteUrl?: string | null
): Promise<string | null> {
  const key = pdfCacheKey(pdfPath, websiteUrl);
  if (!key) return null;
  const cached = pdfThumbCache.get(key);
  if (cached) return cached;

  const inflight = pdfThumbInflight.get(key);
  if (inflight) return inflight;

  const request = (async () => {
    const blob = await loadDiscoverPdfBlob(pdfPath, websiteUrl);
    if (!blob) return null;
    const jpeg = await renderPdfFirstPageJpeg(blob, 720);
    if (!jpeg) return null;
    const dataUrl = await blobToDataUrl(jpeg);
    if (dataUrl) pdfThumbCache.set(key, dataUrl);
    return dataUrl;
  })().finally(() => {
    pdfThumbInflight.delete(key);
  });

  pdfThumbInflight.set(key, request);
  return request;
}
