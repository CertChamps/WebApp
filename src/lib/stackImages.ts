const DEFAULT_MAX_WIDTH = 1280;
const DEFAULT_MAX_TOTAL_HEIGHT = 14_000;
const DEFAULT_JPEG_QUALITY = 0.82;
/** Target max encoded size per stacked image (~1.2 MB base64 ≈ 1.6M chars). */
const DEFAULT_MAX_BYTES = 1_200_000;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url.slice(0, 80)}`));
    img.src = url;
  });
}

function estimateDataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.split(",")[1] ?? "";
  return Math.ceil((base64.length * 3) / 4);
}

function encodeCanvas(canvas: HTMLCanvasElement, quality: number): string | null {
  try {
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return null;
  }
}

/**
 * Stack multiple image URLs into one vertical JPEG (reading order: top → bottom).
 * Returns the original URL when only one image is provided.
 * Scales down to respect width/height limits and re-encodes to stay under a byte budget.
 */
export async function stackImagesVertically(
  urls: string[],
  options: {
    maxWidth?: number;
    maxTotalHeight?: number;
    jpegQuality?: number;
    maxBytes?: number;
  } = {},
): Promise<string | null> {
  const cleaned = urls.map((u) => u?.trim()).filter(Boolean) as string[];
  if (cleaned.length === 0) return null;
  if (cleaned.length === 1) return cleaned[0];

  const maxWidth = options.maxWidth ?? DEFAULT_MAX_WIDTH;
  const maxTotalHeight = options.maxTotalHeight ?? DEFAULT_MAX_TOTAL_HEIGHT;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  let quality = options.jpegQuality ?? DEFAULT_JPEG_QUALITY;

  const images = await Promise.all(cleaned.map(loadImage));

  const scaled = images.map((img) => {
    const scale = Math.min(1, maxWidth / Math.max(1, img.naturalWidth));
    return {
      width: Math.max(1, Math.round(img.naturalWidth * scale)),
      height: Math.max(1, Math.round(img.naturalHeight * scale)),
      img,
    };
  });

  let totalHeight = scaled.reduce((sum, item) => sum + item.height, 0);
  let heightScale = 1;
  if (totalHeight > maxTotalHeight) {
    heightScale = maxTotalHeight / totalHeight;
    totalHeight = maxTotalHeight;
  }

  const canvasWidth = Math.max(...scaled.map((item) => Math.round(item.width * heightScale)));
  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = Math.max(1, Math.round(totalHeight));
  const ctx = canvas.getContext("2d");
  if (!ctx) return cleaned[0] ?? null;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let y = 0;
  for (const item of scaled) {
    const drawWidth = Math.round(item.width * heightScale);
    const drawHeight = Math.round(item.height * heightScale);
    const x = Math.floor((canvasWidth - drawWidth) / 2);
    ctx.drawImage(item.img, x, y, drawWidth, drawHeight);
    y += drawHeight;
  }

  let dataUrl = encodeCanvas(canvas, quality);
  if (!dataUrl) return cleaned[0] ?? null;

  while (estimateDataUrlBytes(dataUrl) > maxBytes && quality > 0.45) {
    quality -= 0.08;
    const next = encodeCanvas(canvas, quality);
    if (!next) break;
    dataUrl = next;
  }

  if (estimateDataUrlBytes(dataUrl) > maxBytes && canvas.height > 800) {
    const shrink = canvas.cloneNode(false) as HTMLCanvasElement;
    shrink.width = Math.max(1, Math.round(canvas.width * 0.75));
    shrink.height = Math.max(1, Math.round(canvas.height * 0.75));
    const sctx = shrink.getContext("2d");
    if (sctx) {
      sctx.fillStyle = "#ffffff";
      sctx.fillRect(0, 0, shrink.width, shrink.height);
      sctx.drawImage(canvas, 0, 0, shrink.width, shrink.height);
      dataUrl = encodeCanvas(shrink, quality) ?? dataUrl;
    }
  }

  return dataUrl;
}

/** Stack a URL list into a single image for AI/grading, or pass through when ≤1. */
export async function stackImageUrlsForAi(urls: string[]): Promise<string[]> {
  const cleaned = urls.map((u) => u?.trim()).filter(Boolean) as string[];
  if (cleaned.length <= 1) return cleaned;
  try {
    const stacked = await stackImagesVertically(cleaned);
    return stacked ? [stacked] : [cleaned[0]];
  } catch {
    return [cleaned[0]];
  }
}

/** Rough base64 payload size for budget checks. */
export function dataUrlByteSize(dataUrl: string): number {
  return estimateDataUrlBytes(dataUrl);
}
