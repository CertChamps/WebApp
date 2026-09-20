import { Capacitor, registerPlugin } from "@capacitor/core";

const ShareBridge = registerPlugin<{
  exportFile(options: { base64: string; filename: string; mode: "share" | "save" }): Promise<{ cancelled?: boolean }>;
}>("ShareBridge");

async function nativeExport(blob: Blob, filename: string, mode: "share" | "save") {
  const dataUrl = await blobToDataUrl(blob);
  return ShareBridge.exportFile({ base64: dataUrl.split(",")[1], filename, mode });
}

/** Filename, image→PDF, download, and native share helpers for canvas/document export. */

const UNSAFE_FILENAME = /[^\p{L}\p{N}_\s\-().]+/gu;

export type ExportFormat = "png" | "pdf";

export type ExportImage = {
  dataUrl: string;
  width: number;
  height: number;
};

export function sanitizeExportFilename(name: string, fallback = "export"): string {
  const cleaned = name.replace(UNSAFE_FILENAME, "").replace(/\s+/g, " ").trim();
  return (cleaned || fallback).slice(0, 80);
}

export function withExtension(name: string, format: ExportFormat): string {
  const base = sanitizeExportFilename(sanitizeExportFilename(name).replace(/\.(png|jpg|jpeg|pdf)$/i, ""));
  return `${base}.${format === "pdf" ? "pdf" : "png"}`;
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read blob"));
    reader.readAsDataURL(blob);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load export image"));
    img.src = src;
  });
}

/** Crop a data-URL image to pixel bounds (from react-easy-crop). */
export async function cropImageDataUrl(
  dataUrl: string,
  crop: { x: number; y: number; width: number; height: number },
  mime: "image/png" | "image/jpeg" = "image/png",
): Promise<ExportImage> {
  const image = await loadImage(dataUrl);
  if (![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) || crop.width <= 0 || crop.height <= 0) {
    throw new Error("Please select a valid crop area.");
  }
  const x = Math.max(0, Math.min(image.naturalWidth - 1, Math.round(crop.x)));
  const y = Math.max(0, Math.min(image.naturalHeight - 1, Math.round(crop.y)));
  const width = Math.max(1, Math.min(image.naturalWidth - x, Math.round(crop.width)));
  const height = Math.max(1, Math.min(image.naturalHeight - y, Math.round(crop.height)));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not crop export image.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, x, y, width, height, 0, 0, width, height);
  return {
    dataUrl: canvas.toDataURL(mime, 0.92),
    width,
    height,
  };
}

async function imageDataUrlToJpegBytes(
  dataUrl: string,
  width: number,
  height: number,
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width || image.naturalWidth));
  canvas.height = Math.max(1, Math.round(height || image.naturalHeight));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare PDF image.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.92);
  const base64 = jpegDataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return { bytes, width: canvas.width, height: canvas.height };
}

/** Build a one-page PDF that embeds the image (JPEG). */
export async function imageDataUrlToPdfBlob(
  dataUrl: string,
  width: number,
  height: number,
): Promise<Blob> {
  const { bytes, width: w, height: h } = await imageDataUrlToJpegBytes(dataUrl, width, height);
  // PDF user space: 1pt ≈ 1px at 72dpi; keep pixel aspect, cap longest edge to letter-ish size.
  const maxPt = 720;
  const scale = Math.min(1, maxPt / Math.max(w, h));
  const pageW = Math.max(1, Math.round(w * scale));
  const pageH = Math.max(1, Math.round(h * scale));

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let offset = 0;
  const push = (part: string | Uint8Array) => {
    const bytesPart = typeof part === "string" ? encoder.encode(part) : part;
    chunks.push(bytesPart);
    offset += bytesPart.length;
  };
  const markObject = () => {
    offsets.push(offset);
  };

  push("%PDF-1.4\n");
  markObject();
  push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  markObject();
  push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  markObject();
  push(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >>\nendobj\n`,
  );
  const content = `q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Im0 Do\nQ\n`;
  markObject();
  push(`4 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`);
  markObject();
  push(
    `5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`,
  );
  push(bytes);
  push("\nendstream\nendobj\n");

  const xrefStart = offset;
  push(`xref\n0 ${offsets.length + 1}\n`);
  push("0000000000 65535 f \n");
  for (const objectOffset of offsets) {
    push(`${String(objectOffset).padStart(10, "0")} 00000 n \n`);
  }
  push(`trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  const total = chunks.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of chunks) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return new Blob([out], { type: "application/pdf" });
}

export async function buildExportBlob(
  image: ExportImage,
  format: ExportFormat,
): Promise<{ blob: Blob; mimeType: string; filenameExtension: string }> {
  if (format === "pdf") {
    const blob = await imageDataUrlToPdfBlob(image.dataUrl, image.width, image.height);
    return { blob, mimeType: "application/pdf", filenameExtension: "pdf" };
  }
  const blob = await dataUrlToBlob(image.dataUrl);
  return { blob, mimeType: blob.type || "image/png", filenameExtension: "png" };
}

/** Trigger a file download that works on desktop and usually on iPad Safari. */
export async function downloadBlob(blob: Blob, filename: string): Promise<void> {
  if (Capacitor.getPlatform() === "ios" && Capacitor.isNativePlatform()) {
    await nativeExport(blob, filename, "save");
    return;
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function canShareFiles(): boolean {
  if (Capacitor.getPlatform() === "ios" && Capacitor.isNativePlatform()) return true;
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
  try {
    const probe = new File(["x"], "probe.txt", { type: "text/plain" });
    return typeof navigator.canShare === "function" ? navigator.canShare({ files: [probe] }) : true;
  } catch {
    return false;
  }
}

/** Prefer the OS share sheet (Apple share on iPad); fall back to download. */
export async function shareOrDownloadBlob(args: {
  blob: Blob;
  filename: string;
  mimeType: string;
  title?: string;
}): Promise<"shared" | "downloaded"> {
  if (Capacitor.getPlatform() === "ios" && Capacitor.isNativePlatform()) {
    await nativeExport(args.blob, args.filename, "share");
    return "shared";
  }
  const file = new File([args.blob], args.filename, { type: args.mimeType });
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      if (!navigator.canShare || navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: args.title ?? args.filename,
        });
        return "shared";
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      throw error;
    }
  }
  await downloadBlob(args.blob, args.filename);
  return "downloaded";
}

/** Render the full styled document without Safari's SVG foreignObject restrictions. */
export async function captureElementToPng(element: HTMLElement): Promise<ExportImage> {
  const { default: html2canvas } = await import("html2canvas-pro");
  await document.fonts.ready;
  const width = Math.max(1, element.offsetWidth);
  const height = Math.max(1, element.scrollHeight);
  // Embed images before rendering so a missing/CORS-blocked attachment cannot
  // silently disappear from the file preview.
  const images = await Promise.all(Array.from(element.querySelectorAll("img")).map(async (image) => {
    const response = await fetch(image.currentSrc || image.src, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error("Could not load a document image for export.");
    return blobToDataUrl(await response.blob());
  }));
  const canvas = await html2canvas(element, {
    backgroundColor: "#ffffff",
    useCORS: true,
    allowTaint: false,
    scale: Math.min(2, 4096 / Math.max(width, height), Math.sqrt(12_000_000 / (width * height))),
    width,
    height,
    onclone: (_document, clone) => {
      clone.style.background = "#ffffff";
      clone.style.color = "#111827";
      clone.style.boxShadow = "none";
      clone.querySelectorAll<HTMLElement>(".color-txt-main").forEach((node) => {
        node.style.color = "#111827";
        node.style.caretColor = "transparent";
      });
      clone.querySelectorAll<HTMLElement>(".color-txt-sub").forEach((node) => { node.style.color = "#6b7280"; });
      clone.querySelectorAll("img").forEach((image, index) => {
        image.removeAttribute("srcset");
        image.src = images[index];
        image.loading = "eager";
      });
    },
  });
  return { dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
}

export async function compositeImages(
  base: ExportImage,
  overlayDataUrl: string | null,
): Promise<ExportImage> {
  if (!overlayDataUrl) return base;
  const canvas = document.createElement("canvas");
  canvas.width = base.width;
  canvas.height = base.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return base;
  const baseImg = await loadImage(base.dataUrl);
  ctx.drawImage(baseImg, 0, 0, base.width, base.height);
  try {
    const overlay = await loadImage(overlayDataUrl);
    ctx.drawImage(overlay, 0, 0, base.width, base.height);
  } catch (error) {
    throw new Error("Could not render document annotations.", { cause: error });
  }
  return {
    dataUrl: canvas.toDataURL("image/png"),
    width: base.width,
    height: base.height,
  };
}
