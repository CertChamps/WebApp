import type { CanvasCapturePayload } from "./GradingTypes";

type CapturePoint = { x: number; y: number; pressure?: number };
type CaptureStroke = { tool: "pen" | "eraser"; points: CapturePoint[] };

const MIN_LONGEST_AXIS = 2400;
const JPEG_QUALITY = 0.92;
const BASE_PEN_WIDTH = 2;
const BLANK_PIXEL_DELTA_THRESHOLD = 15;
const BLANK_PIXEL_MIN_COUNT = 200;

export class BlankCanvasError extends Error {
  constructor(message = "Your canvas looks empty - write your workings and try again.") {
    super(message);
    this.name = "BlankCanvasError";
  }
}

export function hashSnapshot(dataUrl: string): string {
  // Lightweight deterministic hash; enough for cache-keying redraw retries.
  let hash = 5381;
  for (let i = 0; i < dataUrl.length; i += 8) {
    hash = ((hash << 5) + hash) ^ dataUrl.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

export function buildCapturePayload(args: {
  strokes: CaptureStroke[];
  viewportWidth: number;
  viewportHeight: number;
  offsetX: number;
  offsetY: number;
  scale: number;
  devicePixelRatio: number;
  forceFullInkBounds?: boolean;
  expandPaddingRatio?: number;
  jpegQuality?: number;
}): CanvasCapturePayload {
  const viewportBounds = {
    x: (-args.offsetX) / args.scale,
    y: (-args.offsetY) / args.scale,
    width: args.viewportWidth / args.scale,
    height: args.viewportHeight / args.scale,
  };

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const stroke of args.strokes) {
    if (stroke.tool !== "pen" || !Array.isArray(stroke.points)) continue;
    for (const point of stroke.points) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }

  const hasInk = Number.isFinite(minX) && Number.isFinite(minY) && Number.isFinite(maxX) && Number.isFinite(maxY);
  const inkBounds = hasInk
    ? {
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
      }
    : null;

  const inkExceedsViewport = inkBounds
    ? inkBounds.x < viewportBounds.x ||
      inkBounds.y < viewportBounds.y ||
      inkBounds.x + inkBounds.width > viewportBounds.x + viewportBounds.width ||
      inkBounds.y + inkBounds.height > viewportBounds.y + viewportBounds.height
    : false;
  const largeInkSpan = inkBounds
    ? inkBounds.width > viewportBounds.width * 0.8 || inkBounds.height > viewportBounds.height * 0.8
    : false;

  let captureWorldBounds = viewportBounds;
  const paddingRatio = typeof args.expandPaddingRatio === "number" ? args.expandPaddingRatio : 0.15;
  if (inkBounds && (args.forceFullInkBounds || inkExceedsViewport || largeInkSpan)) {
    const padX = inkBounds.width * paddingRatio;
    const padY = inkBounds.height * paddingRatio;
    captureWorldBounds = {
      x: inkBounds.x - padX,
      y: inkBounds.y - padY,
      width: inkBounds.width + padX * 2,
      height: inkBounds.height + padY * 2,
    };
  }

  const dpr2x = Math.max(2, Math.round(args.devicePixelRatio * 2));
  const sourceLongestPx = Math.max(args.viewportWidth, args.viewportHeight) * dpr2x;
  const targetLongest = Math.max(MIN_LONGEST_AXIS, Math.round(sourceLongestPx));
  const aspect = Math.max(0.1, captureWorldBounds.height / Math.max(1, captureWorldBounds.width));
  const targetWidth = Math.max(1, Math.round(targetLongest / Math.max(1, aspect)));
  const targetHeight = Math.max(1, Math.round(targetWidth * aspect));
  const longest = Math.max(targetWidth, targetHeight);
  const scaleDown = longest > targetLongest ? targetLongest / longest : 1;
  const finalWidth = Math.max(1, Math.round(targetWidth * scaleDown));
  const finalHeight = Math.max(1, Math.round(targetHeight * scaleDown));

  const canvas = document.createElement("canvas");
  canvas.width = finalWidth;
  canvas.height = finalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to create grading capture context.");
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, targetWidth, targetHeight);

  const sx = finalWidth / captureWorldBounds.width;
  const sy = finalHeight / captureWorldBounds.height;
  ctx.save();
  ctx.translate(-captureWorldBounds.x * sx, -captureWorldBounds.y * sy);
  ctx.scale(sx, sy);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#111827";

  for (const stroke of args.strokes) {
    if (stroke.tool !== "pen" || stroke.points.length < 2) continue;
    for (let i = 0; i < stroke.points.length - 1; i += 1) {
      const p0 = stroke.points[i];
      const p1 = stroke.points[i + 1];
      const pressure = Number.isFinite(p0.pressure) ? Number(p0.pressure) : 1;
      ctx.lineWidth = BASE_PEN_WIDTH * (Math.max(0.3, pressure) + 0.5);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
  }
  ctx.restore();

  const imageData = ctx.getImageData(0, 0, finalWidth, finalHeight).data;
  let nonBlankPixels = 0;
  for (let i = 0; i < imageData.length; i += 4) {
    const r = imageData[i];
    const g = imageData[i + 1];
    const b = imageData[i + 2];
    const brightnessDelta = Math.max(Math.abs(255 - r), Math.abs(255 - g), Math.abs(255 - b));
    if (brightnessDelta > BLANK_PIXEL_DELTA_THRESHOLD) {
      nonBlankPixels += 1;
      if (nonBlankPixels >= BLANK_PIXEL_MIN_COUNT) break;
    }
  }

  if (nonBlankPixels < BLANK_PIXEL_MIN_COUNT) {
    throw new BlankCanvasError();
  }

  const quality = typeof args.jpegQuality === "number" ? args.jpegQuality : JPEG_QUALITY;

  return {
    dataUrl: canvas.toDataURL("image/jpeg", quality),
    imageWidth: finalWidth,
    imageHeight: finalHeight,
    captureWorldBounds,
  };
}
