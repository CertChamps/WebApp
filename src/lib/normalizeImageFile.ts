/** Make shared / uploaded images web-viewable (JPEG/PNG/WebP/GIF).
 *
 * Teams, Photos, and the iOS share sheet often hand over HEIC, TIFF, BMP, or
 * `application/octet-stream` with no extension. `<img>` and Firebase then fail
 * to display them. Decode whatever the browser can, then re-encode as JPEG.
 */

const WEB_SAFE = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

function mimeFromMagic(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return "image/bmp";
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  const ftyp = String.fromCharCode(...bytes.slice(4, 8));
  if (ftyp === "ftyp") {
    const brand = String.fromCharCode(...bytes.slice(8, 12)).toLowerCase();
    if (brand.startsWith("hei") || brand.startsWith("mif")) return "image/heic";
    if (brand === "avif" || brand === "avis") return "image/avif";
  }
  if (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00) return "image/tiff";
  if (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a) return "image/tiff";
  return null;
}

function mimeFromName(name: string): string | null {
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
    case "jfif":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "heic":
    case "heif":
      return "image/heic";
    case "tif":
    case "tiff":
      return "image/tiff";
    case "bmp":
      return "image/bmp";
    default:
      return null;
  }
}

function withJpegName(name: string): string {
  const stem = name.replace(/\.[^.]+$/, "").trim() || "shared-image";
  return `${stem}.jpg`;
}

async function blobToJpeg(blob: Blob): Promise<Blob> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not draw image.");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
      if (jpeg) return jpeg;
    } catch {
      // Fall through to HTMLImageElement — iOS can decode HEIC that way.
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Unsupported image format."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not draw image.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0);
    const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!jpeg) throw new Error("Could not convert image.");
    return jpeg;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function assertReadableImage(blob: Blob): Promise<void> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      bitmap.close();
      return;
    } catch {
      // Try the browser's image element decoder as well.
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    await new Promise<void>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("This image could not be opened. Try sharing a JPEG or PNG copy."));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function normalizeImageFile(file: File): Promise<File> {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return file;

  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const sniffed = mimeFromMagic(header);
  const typed = sniffed || (file.type && file.type !== "application/octet-stream" ? file.type : mimeFromName(file.name));
  const labelled = typed && file.type === typed
    ? file
    : typed
      ? new File([file], file.name || `shared-image.${typed.split("/")[1] || "jpg"}`, { type: typed })
      : file;

  if (typed && WEB_SAFE.has(typed)) {
    await assertReadableImage(labelled);
    const extension = ({ "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" } as Record<string, string>)[typed];
    const stem = labelled.name.replace(/\.[^.]+$/, "").trim() || "shared-image";
    return new File([labelled], `${stem}.${extension}`, { type: typed });
  }

  try {
    const jpeg = await blobToJpeg(labelled);
    return new File([jpeg], withJpegName(labelled.name), { type: "image/jpeg" });
  } catch (error) {
    throw new Error("This image could not be decoded. Try sharing a JPEG or PNG copy.", { cause: error });
  }
}
