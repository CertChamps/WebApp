import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Pencil, Eraser, Grid3X3, Trash2, X, CircleDot, Undo2, Redo2, MessageCircle, Music, MousePointer2, FileText, Ban, Paperclip, LoaderCircle, Type, Bold, Italic, List, Pin, Upload, BookOpen, Move } from "lucide-react";
import type { CanvasAnnotation, CanvasCapturePayload } from "../../lib/grading/GradingTypes";
import { buildCapturePayload, drawCaptureTextBoxes } from "../../lib/grading/canvasCapture";
import { renderPdfPages } from "../../utils/pdfPagesToImages";
import type { CanvasObject } from "../../hooks/useCanvasStorage";
import { getThemedPortalTarget } from "../../utils/themedPortal";
import { isIPad } from "../../utils/isIPad";
import {
	CANVAS_FINGER_POINTER_EVENT,
	CANVAS_FINGER_SELECT_EVENT,
	CANVAS_PAN_BY_EVENT,
	PENCIL_DOUBLE_TAP_EVENT,
	touchEventHasStylus,
	type CanvasFingerPointerDetail,
	type CanvasPanByDetail,
} from "../../utils/pencilEvents";
import { getVisualViewportBounds, subscribeVisualViewport } from "../../utils/visualViewport";
import RenderMath from "../math/mathdisplay";
import {
	createBlankCanvasTextBox,
	getTextContentBounds,
	type CanvasTextBox,
	type CanvasTextDefaults,
} from "./CanvasTextBoxLayer";

export type { CanvasObject } from "../../hooks/useCanvasStorage";

type Point = { x: number; y: number; pressure: number };
type Stroke = { points: Point[]; tool: "pen" | "eraser"; colorIndex?: number; thicknessIndex?: number; color?: string };
export type ToolMode = "pen" | "eraser" | "lasso";
export type CanvasEditorMode = "pen" | "text";
export type CanvasToolbarPlacement = "floating-bottom" | "top";

export type DrawingCanvasTextFormat = {
	bold: boolean;
	italic: boolean;
	bullet: boolean;
	fontSize: number | string;
	fontSizeOptions: Array<{ value: number | string; label: string }>;
	onToggleBold: () => void;
	onToggleItalic: () => void;
	onToggleBullet: () => void;
	onFontSizeChange: (value: number | string) => void;
	onColorChange?: (colorIndex: number) => void;
	onUndo?: () => void;
	onRedo?: () => void;
};
type SelectionBounds = { minX: number; minY: number; maxX: number; maxY: number };
type TransformMode = "move" | "scale" | "rotate";
type TransformSession = {
	mode: TransformMode;
	startPointer: Point;
	baseStrokes: Stroke[];
	selectedIndexes: number[];
	center: { x: number; y: number };
	baseBounds: SelectionBounds;
	baseDistance?: number;
	startAngle?: number;
	previewDx: number;
	previewDy: number;
	previewScale: number;
	previewRotation: number;
};

export type WhiteboardFeedbackItem = {
	kind: "comment";
	lineIndex: number;
	text: string;
};

export type WhiteboardRelevantRegion = {
	x: number;
	y: number;
	width: number;
	height: number;
};

export type WhiteboardFeedbackOverlay = {
	runId: string;
	items: WhiteboardFeedbackItem[];
	relevantRegion?: WhiteboardRelevantRegion | null;
	finalMark?: string;
};

/** Grid display: off, square (lines), dots, music staves, or ruled essay lines. */
type GridMode = "off" | "lines" | "dots" | "music" | "essay";

type GridModeOption = {
	mode: GridMode;
	label: string;
	Icon: typeof Grid3X3;
};

const GRID_MODE_OPTIONS: GridModeOption[] = [
	{ mode: "off", label: "Off", Icon: Ban },
	{ mode: "lines", label: "Square", Icon: Grid3X3 },
	{ mode: "dots", label: "Dots", Icon: CircleDot },
	{ mode: "music", label: "Music", Icon: Music },
	{ mode: "essay", label: "Essay", Icon: FileText },
];

function getGridModeOption(mode: GridMode): GridModeOption {
	return GRID_MODE_OPTIONS.find((option) => option.mode === mode) ?? GRID_MODE_OPTIONS[1];
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 10;
const MAX_ATTACH_BYTES = 25 * 1024 * 1024;
const GRID_STEP = 40;
const GRID_DOT_RADIUS = 1.5;
const ESSAY_LINE_GAP = 32;
const ESSAY_MARGIN_X = 64;
const ESSAY_MARGIN_COLOR = "#E57373";
const MUSIC_LINE_GAP = 16;
const MUSIC_STAFF_LINES = 5;
const MUSIC_STAFF_HEIGHT = (MUSIC_STAFF_LINES - 1) * MUSIC_LINE_GAP;
const MUSIC_STAVE_REPEAT = MUSIC_STAFF_HEIGHT * 3;

const STAVE_LINE_LABELS = ["L5", "L4", "L3", "L2", "L1"];
const STAVE_SPACE_LABELS = ["S4", "S3", "S2", "S1"];

function drawEssayGrid(
	ctx: CanvasRenderingContext2D,
	left: number,
	top: number,
	right: number,
	bottom: number,
	scale: number,
	lineColor: string,
	opacity: number
) {
	const startY = Math.floor(top / ESSAY_LINE_GAP) * ESSAY_LINE_GAP;
	const endY = Math.ceil(bottom / ESSAY_LINE_GAP) * ESSAY_LINE_GAP;

	ctx.save();
	ctx.globalAlpha = opacity;
	ctx.strokeStyle = lineColor;
	ctx.lineWidth = 1 / scale;
	ctx.beginPath();
	for (let y = startY; y <= endY; y += ESSAY_LINE_GAP) {
		ctx.moveTo(left, y);
		ctx.lineTo(right, y);
	}
	ctx.stroke();

	if (ESSAY_MARGIN_X >= left && ESSAY_MARGIN_X <= right) {
		ctx.strokeStyle = ESSAY_MARGIN_COLOR;
		ctx.lineWidth = 1.25 / scale;
		ctx.beginPath();
		ctx.moveTo(ESSAY_MARGIN_X, top);
		ctx.lineTo(ESSAY_MARGIN_X, bottom);
		ctx.stroke();
	}
	ctx.restore();
}
const ERASER_SIZE_LEVELS = [12, 18, 24, 32, 48];
const DEFAULT_ERASER_SIZE_INDEX = 2;
const PEN_THICKNESS_LEVELS = [1.2, 2, 3.2, 4.6, 6.2];
const DEFAULT_PEN_THICKNESS_INDEX = 1;
const FIXED_SAMPLE_HZ = 240;
const FIXED_SAMPLE_INTERVAL_MS = 1000 / FIXED_SAMPLE_HZ;
const ERASE_TARGET_STROKE_COLOR = "rgba(128, 128, 128, 0.7)";
const TOOL_LONG_PRESS_MS = 420;
/** Hold still for this long (ms) to snap stroke to straight line */
const HOLD_TO_STRAIGHTEN_MS = 600;
const LASSO_MIN_POINTS = 3;
const TAP_SELECT_MOVE_PX = 8;
const MIN_SELECTION_SCALE = 0.08;

function seededUnit(seed: number): number {
	const x = Math.sin(seed * 12.9898) * 43758.5453;
	return x - Math.floor(x);
}

type BadgeLayout = {
	id: string;
	partId: string;
	text: string;
	worldX: number;
	worldY: number;
	radiusWorld: number;
	workingsRegionWorld: Extract<CanvasAnnotation, { type: "errorComment" }>['workingsRegionWorld'];
	errorBoxWorld: Extract<CanvasAnnotation, { type: "errorComment" }>['errorBoxWorld'];
};

function drawMarkAnnotation(
	ctx: CanvasRenderingContext2D,
	annotation: Extract<CanvasAnnotation, { type: "markAnnotation" }>,
	fontReady: boolean,
	markColor: string,
) {
	// Early return if font is not ready yet (canvas will retry on next draw loop)
	if (!fontReady) return;

	const seed = seededUnit(annotation.worldX);
	const angle = (-8 + seed * 16) * (Math.PI / 180);
	const fontSize = 72;
	const fontFamily = '"Caveat", "Patrick Hand", "Architects Daughter", cursive';
	const color = markColor || "#2563EB";
	ctx.save();
	ctx.translate(annotation.worldX, annotation.worldY);
	ctx.rotate(angle);
	ctx.fillStyle = color;
	ctx.font = `bold ${fontSize}px ${fontFamily}`;
	ctx.textBaseline = "middle";
	ctx.fillText(annotation.label, 0, 0);

	const textWidth = Math.max(1, ctx.measureText(annotation.label).width);
	const rx = textWidth / 2 + 28;
	const ry = fontSize / 2 + 22;
	const jitterX = rx * 0.12;
	const jitterY = ry * 0.12;
	const cx = textWidth / 2;
	const cy = 0;
	const k = 0.5522847498;
	const ox = rx * k;
	const oy = ry * k;
	const j = (index: number, axis: "x" | "y") => {
		const base = seededUnit(annotation.worldX + annotation.worldY + index * 17 + (axis === "x" ? 1 : 9));
		const span = axis === "x" ? jitterX : jitterY;
		return (base - 0.5) * span * 2;
	};

	const startX = cx;
	const startY = cy - ry;
	ctx.beginPath();
	ctx.moveTo(startX, startY);
	ctx.bezierCurveTo(
		cx + ox + j(1, "x"),
		cy - ry + j(1, "y"),
		cx + rx + j(2, "x"),
		cy - oy + j(2, "y"),
		cx + rx,
		cy,
	);
	ctx.bezierCurveTo(
		cx + rx + j(3, "x"),
		cy + oy + j(3, "y"),
		cx + ox + j(4, "x"),
		cy + ry + j(4, "y"),
		cx,
		cy + ry,
	);
	ctx.bezierCurveTo(
		cx - ox + j(5, "x"),
		cy + ry + j(5, "y"),
		cx - rx + j(6, "x"),
		cy + oy + j(6, "y"),
		cx - rx,
		cy,
	);
	ctx.bezierCurveTo(
		cx - rx + j(7, "x"),
		cy - oy + j(7, "y"),
		cx - ox + j(8, "x"),
		cy - ry + j(8, "y"),
		startX,
		startY,
	);
	const overshoot = 6 + seededUnit(annotation.worldX + 999) * 4;
	ctx.lineTo(startX + overshoot, startY + seededUnit(annotation.worldY + 123) * 3 - 1.5);
	ctx.strokeStyle = color;
	ctx.lineWidth = 2.5;
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	ctx.stroke();
	ctx.restore();
}

function distanceSquaredPointToSegment(point: Point, start: Point, end: Point): number {
	const dx = end.x - start.x;
	const dy = end.y - start.y;
	if (dx === 0 && dy === 0) {
		const deltaX = point.x - start.x;
		const deltaY = point.y - start.y;
		return deltaX * deltaX + deltaY * deltaY;
	}
	const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
	const projX = start.x + t * dx;
	const projY = start.y + t * dy;
	const diffX = point.x - projX;
	const diffY = point.y - projY;
	return diffX * diffX + diffY * diffY;
}

function orientation(a: Point, b: Point, c: Point): number {
	return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a: Point, b: Point, point: Point): boolean {
	return (
		Math.min(a.x, b.x) <= point.x &&
		point.x <= Math.max(a.x, b.x) &&
		Math.min(a.y, b.y) <= point.y &&
		point.y <= Math.max(a.y, b.y)
	);
}

function segmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
	const o1 = orientation(a1, a2, b1);
	const o2 = orientation(a1, a2, b2);
	const o3 = orientation(b1, b2, a1);
	const o4 = orientation(b1, b2, a2);

	if (o1 === 0 && onSegment(a1, a2, b1)) return true;
	if (o2 === 0 && onSegment(a1, a2, b2)) return true;
	if (o3 === 0 && onSegment(b1, b2, a1)) return true;
	if (o4 === 0 && onSegment(b1, b2, a2)) return true;

	return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
}

function distanceSquaredSegmentToSegment(a1: Point, a2: Point, b1: Point, b2: Point): number {
	if (segmentsIntersect(a1, a2, b1, b2)) return 0;
	return Math.min(
		distanceSquaredPointToSegment(a1, b1, b2),
		distanceSquaredPointToSegment(a2, b1, b2),
		distanceSquaredPointToSegment(b1, a1, a2),
		distanceSquaredPointToSegment(b2, a1, a2)
	);
}

function strokeIntersectsEraser(stroke: Stroke, eraserStroke: Stroke, hitRadius: number): boolean {
	if (stroke.tool !== "pen" || stroke.points.length === 0 || eraserStroke.points.length === 0) return false;
	const thresholdSquared = hitRadius * hitRadius;
	const strokeSegmentCount = Math.max(1, stroke.points.length - 1);
	const eraserSegmentCount = Math.max(1, eraserStroke.points.length - 1);

	for (let strokeIndex = 0; strokeIndex < strokeSegmentCount; strokeIndex++) {
		const strokeStart = stroke.points[strokeIndex];
		const strokeEnd = stroke.points[strokeIndex + 1] ?? strokeStart;
		for (let eraserIndex = 0; eraserIndex < eraserSegmentCount; eraserIndex++) {
			const eraserStart = eraserStroke.points[eraserIndex];
			const eraserEnd = eraserStroke.points[eraserIndex + 1] ?? eraserStart;
			if (distanceSquaredSegmentToSegment(strokeStart, strokeEnd, eraserStart, eraserEnd) <= thresholdSquared) {
				return true;
			}
		}
	}

	return false;
}

function pointInPolygon(point: Point, polygon: Point[]): boolean {
	let inside = false;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const xi = polygon[i].x;
		const yi = polygon[i].y;
		const xj = polygon[j].x;
		const yj = polygon[j].y;
		const intersect =
			(yi > point.y) !== (yj > point.y) &&
			point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + Number.EPSILON) + xi;
		if (intersect) inside = !inside;
	}
	return inside;
}

function rectFullyInsidePolygon(
	x: number,
	y: number,
	width: number,
	height: number,
	polygon: Point[],
): boolean {
	if (polygon.length < 3 || width <= 0 || height <= 0) return false;
	const corners: Point[] = [
		{ x, y, pressure: 0 },
		{ x: x + width, y, pressure: 0 },
		{ x: x + width, y: y + height, pressure: 0 },
		{ x, y: y + height, pressure: 0 },
	];
	return corners.every((corner) => pointInPolygon(corner, polygon));
}

function strokeIntersectsPolygon(stroke: Stroke, polygon: Point[]): boolean {
	if (stroke.tool !== "pen" || stroke.points.length === 0 || polygon.length < 3) return false;
	if (stroke.points.some((point) => pointInPolygon(point, polygon))) return true;
	for (let i = 0; i < stroke.points.length - 1; i += 1) {
		const a1 = stroke.points[i];
		const a2 = stroke.points[i + 1];
		for (let j = 0; j < polygon.length; j += 1) {
			const b1 = polygon[j];
			const b2 = polygon[(j + 1) % polygon.length];
			if (segmentsIntersect(a1, a2, b1, b2)) return true;
		}
	}
	return false;
}

function getSelectionBounds(strokes: Stroke[], selectedIndexes: number[]): SelectionBounds | null {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	let hasPoint = false;
	for (const index of selectedIndexes) {
		const stroke = strokes[index];
		if (!stroke || stroke.tool !== "pen") continue;
		for (const point of stroke.points) {
			hasPoint = true;
			if (point.x < minX) minX = point.x;
			if (point.y < minY) minY = point.y;
			if (point.x > maxX) maxX = point.x;
			if (point.y > maxY) maxY = point.y;
		}
	}
	return hasPoint ? { minX, minY, maxX, maxY } : null;
}

function unionRect(bounds: SelectionBounds | null, x: number, y: number, width: number, height: number): SelectionBounds {
	const maxX = x + width;
	const maxY = y + height;
	if (!bounds) return { minX: x, minY: y, maxX, maxY };
	return {
		minX: Math.min(bounds.minX, x),
		minY: Math.min(bounds.minY, y),
		maxX: Math.max(bounds.maxX, maxX),
		maxY: Math.max(bounds.maxY, maxY),
	};
}

function transformPoint(point: Point, center: { x: number; y: number }, dx: number, dy: number, scaleFactor: number, rotation: number): Point {
	const localX = point.x - center.x;
	const localY = point.y - center.y;
	const scaledX = localX * scaleFactor;
	const scaledY = localY * scaleFactor;
	const cos = Math.cos(rotation);
	const sin = Math.sin(rotation);
	const rotatedX = scaledX * cos - scaledY * sin;
	const rotatedY = scaledX * sin + scaledY * cos;
	return {
		x: center.x + rotatedX + dx,
		y: center.y + rotatedY + dy,
		pressure: point.pressure,
	};
}

function transformSelectedStrokes(
	sourceStrokes: Stroke[],
	selectedIndexes: number[],
	center: { x: number; y: number },
	options: { dx?: number; dy?: number; scaleFactor?: number; rotation?: number }
): Stroke[] {
	const dx = options.dx ?? 0;
	const dy = options.dy ?? 0;
	const scaleFactor = options.scaleFactor ?? 1;
	const rotation = options.rotation ?? 0;
	const selectedSet = new Set(selectedIndexes);
	return sourceStrokes.map((stroke, index) => {
		if (!selectedSet.has(index) || stroke.tool !== "pen") return stroke;
		return {
			...stroke,
			points: stroke.points.map((point) => transformPoint(point, center, dx, dy, scaleFactor, rotation)),
		};
	});
}

function eraseStrokesAtPoint(source: Stroke[], point: Point, hitRadius: number): Stroke[] {
	const radius = hitRadius;
	const radiusSq = radius * radius;
	let changed = false;
	const next: Stroke[] = [];
	for (const stroke of source) {
		if (stroke.tool !== "pen" || stroke.points.length === 0) {
			next.push(stroke);
			continue;
		}
		const keptSegments: Point[][] = [];
		let currentSegment: Point[] = [];
		for (const p of stroke.points) {
			const dx = p.x - point.x;
			const dy = p.y - point.y;
			const keep = dx * dx + dy * dy > radiusSq;
			if (keep) {
				currentSegment.push(p);
			} else {
				changed = true;
				if (currentSegment.length >= 2) keptSegments.push(currentSegment);
				currentSegment = [];
			}
		}
		if (currentSegment.length >= 2) keptSegments.push(currentSegment);
		if (keptSegments.length === 0) {
			if (!changed) next.push(stroke);
			continue;
		}
		if (keptSegments.length === 1 && keptSegments[0].length === stroke.points.length) {
			next.push(stroke);
			continue;
		}
		changed = true;
		for (const points of keptSegments) {
			next.push({ ...stroke, points });
		}
	}
	return changed ? next : source;
}

function normalizeStrokeColors(source: Stroke[] | null | undefined): Stroke[] {
	if (!source || source.length === 0) return [];
	return source.map((stroke) => {
		if (stroke.tool !== "pen") return stroke;
		return {
			...stroke,
			colorIndex: typeof stroke.colorIndex === "number" ? stroke.colorIndex : 0,
			thicknessIndex:
				typeof stroke.thicknessIndex === "number"
					? Math.max(0, Math.min(PEN_THICKNESS_LEVELS.length - 1, stroke.thicknessIndex))
					: DEFAULT_PEN_THICKNESS_INDEX,
		};
	});
}

function genObjectId(): string {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
	return `obj-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
	const res = await fetch(dataUrl);
	return res.blob();
}

function loadImageSize(url: string): Promise<{ width: number; height: number }> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve({ width: img.naturalWidth || 400, height: img.naturalHeight || 300 });
		img.onerror = () => reject(new Error("Failed to load image"));
		img.src = url;
	});
}

/**
 * Downscale + recompress an image before it's stored on the canvas.
 * Large phone photos (often several MB) upload slowly / bloat the saved canvas
 * JSON and sometimes fail to load; capping the resolution and re-encoding keeps
 * them sharp while dramatically reducing size. Returns the original blob if it's
 * already small or if anything goes wrong (so we never lose the attachment).
 */
async function prepareImageForCanvas(
	blob: Blob,
	opts: { maxDim?: number; quality?: number } = {}
): Promise<Blob> {
	const maxDim = opts.maxDim ?? 2000;
	const quality = opts.quality ?? 0.85;
	// SVG is vector + tiny — rasterizing would only make it worse.
	if (blob.type === "image/svg+xml") return blob;

	const url = URL.createObjectURL(blob);
	try {
		const img = await new Promise<HTMLImageElement>((resolve, reject) => {
			const el = new Image();
			el.onload = () => resolve(el);
			el.onerror = () => reject(new Error("Failed to decode image"));
			el.src = url;
		});
		const w = img.naturalWidth || 0;
		const h = img.naturalHeight || 0;
		if (!w || !h) return blob;

		const scale = Math.min(1, maxDim / Math.max(w, h));
		const alreadyCompressed = blob.type === "image/jpeg" || blob.type === "image/webp";
		// Nothing to gain: already within bounds and in a compressed format.
		if (scale === 1 && alreadyCompressed) return blob;

		const targetW = Math.max(1, Math.round(w * scale));
		const targetH = Math.max(1, Math.round(h * scale));
		const canvas = document.createElement("canvas");
		canvas.width = targetW;
		canvas.height = targetH;
		const ctx = canvas.getContext("2d");
		if (!ctx) return blob;
		ctx.drawImage(img, 0, 0, targetW, targetH);

		// Preserve transparency for png/gif via WebP (alpha-capable); photos → JPEG.
		const hasAlpha = blob.type === "image/png" || blob.type === "image/gif";
		const preferredType = hasAlpha ? "image/webp" : "image/jpeg";
		let out = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob(resolve, preferredType, quality)
		);
		// Fallback to PNG if the preferred type isn't supported by this browser.
		if (!out) {
			out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
		}
		if (!out) return blob;
		// If we didn't downscale and re-encoding grew the file, keep the original.
		if (scale === 1 && out.size >= blob.size) return blob;
		return out;
	} catch {
		return blob;
	} finally {
		URL.revokeObjectURL(url);
	}
}

function appendSampledPointsFixedHz(
	points: Point[],
	nextPoint: Point,
	eventTimeMs: number,
	lastSample: { point: Point; timeMs: number } | null,
): { points: Point[]; lastSample: { point: Point; timeMs: number } } {
	if (!lastSample) {
		return { points: [...points, nextPoint], lastSample: { point: nextPoint, timeMs: eventTimeMs } };
	}
	// Active stroke points are owned by a ref while drawing, so appending in place
	// avoids copying an ever-growing array for every pointer event.
	const appended = points;
	let { point: prevPoint, timeMs: prevTime } = lastSample;
	if (eventTimeMs <= prevTime) {
		return { points: appended, lastSample };
	}
	let cursorTime = prevTime + FIXED_SAMPLE_INTERVAL_MS;
	while (cursorTime <= eventTimeMs) {
		const t = (cursorTime - prevTime) / (eventTimeMs - prevTime);
		const sample: Point = {
			x: prevPoint.x + (nextPoint.x - prevPoint.x) * t,
			y: prevPoint.y + (nextPoint.y - prevPoint.y) * t,
			pressure: prevPoint.pressure + (nextPoint.pressure - prevPoint.pressure) * t,
		};
		appended.push(sample);
		prevPoint = sample;
		prevTime = cursorTime;
		cursorTime += FIXED_SAMPLE_INTERVAL_MS;
	}
	return { points: appended, lastSample: { point: nextPoint, timeMs: eventTimeMs } };
}

function strokesEqual(a: Stroke[] | null | undefined, b: Stroke[] | null | undefined): boolean {
	if (!a && !b) return true;
	if (!a || !b) return false;
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i += 1) {
		const sa = a[i];
		const sb = b[i];
		if (!sa || !sb) return false;
		if (sa.tool !== sb.tool) return false;
		if ((sa.colorIndex ?? 0) !== (sb.colorIndex ?? 0)) return false;
		if (sa.points.length !== sb.points.length) return false;
		for (let j = 0; j < sa.points.length; j += 1) {
			const pa = sa.points[j];
			const pb = sb.points[j];
			if (!pa || !pb) return false;
			if (pa.x !== pb.x || pa.y !== pb.y || pa.pressure !== pb.pressure) return false;
		}
	}
	return true;
}

/** Call with a function that returns the current drawing as PNG data URL, or null. Called on mount, cleared on unmount. */
export type RegisterDrawingSnapshot = (getSnapshot: (() => string | null) | null) => void;
/** Call with a function that returns the number of visual line clusters detected on the canvas. Called on mount, cleared on unmount. */
export type RegisterGetLineCount = (fn: ((region?: WhiteboardRelevantRegion | null) => number) | null) => void;
/** Call with a function that returns a fixed-size grading capture plus world bounds. Called on mount, cleared on unmount. */
export type RegisterGetGradingCapture = (fn: (((mode?: "default" | "full-ink" | "retry-aggressive") => CanvasCapturePayload | null) | null)) => void;
/** Call with a function that returns a stave analysis string (note positions), or null. */
export type RegisterGetStaveAnalysis = (fn: (() => string | null) | null) => void;
/**
 * Attach a question's page images as one continuous canvas object (stacked vertically).
 * Returns true when a new object was placed; false if skipped (already present / empty).
 */
export type AttachQuestionImagesFn = (attachmentId: string, imageUrls: string[]) => Promise<boolean>;
export type RegisterAttachQuestionImages = (fn: AttachQuestionImagesFn | null) => void;
/** Restore a previously pinned canvas object onto the board. */
export type RestoreCanvasObjectFn = (object: CanvasObject) => void;
export type RegisterRestoreCanvasObject = (fn: RestoreCanvasObjectFn | null) => void;
/** Programmatically attach image/PDF files (same path as the paperclip picker). */
export type AttachFilesFn = (files: FileList | null) => Promise<void>;
export type RegisterAttachFiles = (fn: AttachFilesFn | null) => void;

export type DrawingStroke = Stroke;

/** Stable canvas object id for an auto-placed question attachment. */
export function questionAttachmentObjectId(attachmentId: string): string {
	return `wb-q-${attachmentId}`;
}

function isQuestionAttachmentObjectId(id: string): boolean {
	return id.startsWith("wb-q-");
}

async function loadHtmlImage(url: string): Promise<{ img: HTMLImageElement; revoke?: () => void }> {
	// Prefer a blob URL so drawing onto an offscreen canvas stays untainted (Firebase CORS).
	let displayUrl = url;
	let revoke: (() => void) | undefined;
	if (!url.startsWith("data:") && !url.startsWith("blob:")) {
		try {
			const res = await fetch(url);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const blob = await res.blob();
			displayUrl = URL.createObjectURL(blob);
			revoke = () => URL.revokeObjectURL(displayUrl);
		} catch {
			/* fall through to direct URL */
		}
	}
	const img = await new Promise<HTMLImageElement>((resolve, reject) => {
		const el = new Image();
		el.onload = () => resolve(el);
		el.onerror = () => reject(new Error("Failed to load image"));
		el.src = displayUrl;
	});
	return { img, revoke };
}

/** Stack question page images into one continuous JPEG (white backdrop). */
async function stitchImagesVertically(urls: string[]): Promise<{ blob: Blob; width: number; height: number }> {
	const loaded = await Promise.all(urls.map((url) => loadHtmlImage(url)));
	try {
		const images = loaded.map((item) => item.img);
		const sourceMaxW = Math.max(1, ...images.map((img) => img.naturalWidth || 1));
		const targetW = Math.min(sourceMaxW, 1400);
		const scale = targetW / sourceMaxW;
		const heights = images.map((img) => Math.max(1, Math.round((img.naturalHeight || 1) * scale)));
		const totalH = Math.max(1, heights.reduce((sum, h) => sum + h, 0));
		const canvas = document.createElement("canvas");
		canvas.width = targetW;
		canvas.height = totalH;
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("Could not create stitch canvas");
		ctx.fillStyle = "#ffffff";
		ctx.fillRect(0, 0, targetW, totalH);
		let y = 0;
		for (let i = 0; i < images.length; i += 1) {
			const img = images[i];
			const drawW = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
			const drawH = heights[i];
			const x = Math.floor((targetW - drawW) / 2);
			ctx.drawImage(img, x, y, drawW, drawH);
			y += drawH;
		}
		const blob = await new Promise<Blob>((resolve, reject) => {
			canvas.toBlob(
				(out) => (out ? resolve(out) : reject(new Error("Failed to encode stitched question image"))),
				"image/jpeg",
				0.88
			);
		});
		return { blob, width: targetW, height: totalH };
	} finally {
		for (const item of loaded) item.revoke?.();
	}
}

/**
 * Analyse pen strokes against the music stave grid to detect note positions.
 * Returns a human-readable summary like "Notes (left to right): L3, S2, L5"
 */
function analyseStavePositions(allStrokes: Stroke[]): string | null {
	const penStrokes = allStrokes.filter((s) => s.tool === "pen" && s.points.length >= 2);
	if (penStrokes.length === 0) return null;

	type NoteHit = { x: number; position: string };
	const hits: NoteHit[] = [];

	for (const stroke of penStrokes) {
		const bounds = getStrokeBounds(stroke);
		if (!bounds) continue;

		const height = bounds.maxY - bounds.minY;
		const centerX = (bounds.minX + bounds.maxX) / 2;

		let noteY: number;
		if (height < MUSIC_LINE_GAP * 1.5) {
			noteY = (bounds.minY + bounds.maxY) / 2;
		} else {
			const topLine = Math.round(bounds.minY / MUSIC_LINE_GAP) * MUSIC_LINE_GAP;
			const botLine = Math.round(bounds.maxY / MUSIC_LINE_GAP) * MUSIC_LINE_GAP;
			const topDist = Math.abs(bounds.minY - topLine);
			const botDist = Math.abs(bounds.maxY - botLine);
			noteY = topDist < botDist ? bounds.minY : bounds.maxY;
		}

		const staveIndex = Math.round(noteY / MUSIC_STAVE_REPEAT);
		const staveTop = staveIndex * MUSIC_STAVE_REPEAT;
		const offset = noteY - staveTop;
		const halfGap = MUSIC_LINE_GAP / 2;

		const slot = Math.round(offset / halfGap);
		const clampedSlot = Math.max(0, Math.min(slot, MUSIC_STAFF_LINES * 2 - 2));

		let label: string;
		if (clampedSlot % 2 === 0) {
			const lineIdx = clampedSlot / 2;
			label = STAVE_LINE_LABELS[lineIdx] ?? `L?`;
		} else {
			const spaceIdx = (clampedSlot - 1) / 2;
			label = STAVE_SPACE_LABELS[spaceIdx] ?? `S?`;
		}

		if (slot < 0) label = `above-${label}`;
		else if (slot > MUSIC_STAFF_LINES * 2 - 2) label = `below-${label}`;

		hits.push({ x: centerX, position: label });
	}

	if (hits.length === 0) return null;

	const grouped: NoteHit[][] = [];
	const sorted = [...hits].sort((a, b) => a.x - b.x);
	for (const hit of sorted) {
		const last = grouped[grouped.length - 1];
		if (last && Math.abs(hit.x - last[last.length - 1].x) < MUSIC_LINE_GAP * 1.5) {
			last.push(hit);
		} else {
			grouped.push([hit]);
		}
	}

	const notes = grouped.map((group) => {
		const positions = group.map((h) => h.position);
		const unique = [...new Set(positions)];
		return unique.length === 1 ? unique[0] : unique.join("/");
	});

	return "Notes detected on stave (left to right): " + notes.join(", ");
}

type DrawingCanvasProps = {
	onClose?: () => void;
	/** Register a getter for the current canvas image (so e.g. AI can include it). */
	registerDrawingSnapshot?: RegisterDrawingSnapshot;
	/** Register a getter returning the current number of detected line clusters (so questions.tsx can pass the count to the AI). */
	registerGetLineCount?: RegisterGetLineCount;
	/** Register a getter for deterministic grading capture with world-space bounds. */
	registerGetGradingCapture?: RegisterGetGradingCapture;
	/** Register a getter for music stave analysis (note positions as text). */
	registerGetStaveAnalysis?: RegisterGetStaveAnalysis;
	/** Pre-populate canvas with previously saved strokes. */
	initialStrokes?: Stroke[] | null;
	/** Called (debounced) when strokes change (stroke completed, erased, or cleared). */
	onStrokesChange?: (strokes: Stroke[]) => void;
	/** Called immediately when user starts an edit interaction (draw/erase/undo/redo/clear). */
	onEditInteraction?: () => void;
	/** Optional class for the wrapper (e.g. color-bg-grey-5 for embedded grey background). */
	wrapperClassName?: string;
	/** When true, prevent drawing/pan/zoom (view-only). Toolbar still shows when editorMode is set. */
	readOnly?: boolean;
	/** Initial grid mode. Use "off" for no grid (e.g. in progress dashboard). */
	defaultGridMode?: GridMode;
	/** World-space grading annotations rendered in the canvas loop. */
	gradingAnnotations?: CanvasAnnotation[] | null;
	/** When false, skip on-canvas marks and feedback bubbles (chat-only grading). */
	showGradingOverlay?: boolean;
	/** Show the attach button + enable placing image/PDF objects on the canvas. */
	enableAttachments?: boolean;
	/** Register a function that places a question image strip as a normal canvas attachment. */
	registerAttachQuestionImages?: RegisterAttachQuestionImages;
	/** Register a function that restores a pinned object back onto the canvas. */
	registerRestoreCanvasObject?: RegisterRestoreCanvasObject;
	/** Register the file-attach handler so a parent modal can feed files in. */
	registerAttachFiles?: RegisterAttachFiles;
	/** Pin a selected attachment image/PDF page to the side paper panel. */
	onPinObjectToSide?: (object: CanvasObject) => void;
	/** When set with enableAttachments, adds a CertChamps-questions option to the attach popover. */
	onAttachQuestions?: () => void;
	/** When set without enableAttachments, attach button calls this instead (e.g. document insert). */
	onAttachRequest?: () => void;
	/** Pre-populate canvas with previously saved image/PDF objects. */
	initialObjects?: CanvasObject[] | null;
	/** Called (debounced) when objects change (added, moved, resized, deleted). */
	onObjectsChange?: (objects: CanvasObject[]) => void;
	/** Upload an attachment blob and return a durable URL. Falls back to a data URL when omitted. */
	onUploadImage?: (blob: Blob) => Promise<string>;
	/** Switch the shared editor toolbar into text mode. */
	onRequestTextMode?: () => void;
	/** Switch the shared editor toolbar back into pen mode. */
	onRequestPenMode?: () => void;
	/** Shared pen/text editor mode for the unified bottom toolbar. */
	editorMode?: CanvasEditorMode;
	/** Notifies parent when the active drawing tool changes (pen/eraser/lasso). */
	onToolChange?: (tool: ToolMode) => void;
	/** Text formatting controls shown in the middle of the unified toolbar. */
	textFormat?: DrawingCanvasTextFormat;
	/** Extra trailing controls (e.g. document insert-question / check-answer). */
	toolbarExtras?: ReactNode;
	/** Toolbar position/style. Top mode docks the tools inside the top of the canvas area. */
	toolbarPlacement?: CanvasToolbarPlacement;
	/** Optional element whose full bounds define the top toolbar, instead of the canvas itself. */
	toolbarAnchorRef?: RefObject<HTMLElement | null>;
	/** Hide the floating toolbar even when it would otherwise show. */
	suppressToolbar?: boolean;
	/** Keep the drawing toolbar anchored to the viewport while a document page scrolls. */
	toolbarFixed?: boolean;
	/** Optional viewport X center for the floating toolbar (overrides container measurement). */
	toolbarCenterX?: number | null;
	/** When true with toolbarCenterX, animate left (session/paper insets). Off during folders resize. */
	toolbarCenterAnimated?: boolean;
	/** Reports the resolved toolbar X center so sibling chrome (e.g. Check Answer) can stay aligned. */
	onToolbarCenterChange?: (centerX: number | null) => void;
	/** Disable canvas pan/zoom so the surrounding document remains the scroll owner. */
	allowViewportNavigation?: boolean;
	/** Reports the current whiteboard transform so overlay layers stay aligned. */
	onViewportChange?: (viewport: { pan: { x: number; y: number }; scale: number }) => void;
	/** Optional persisted text boxes included in snapshots and grading captures. */
	captureTextBoxes?: CanvasTextBox[];
	/** Currently selected whiteboard text boxes. */
	selectedTextBoxIds?: string[];
	/** Selects one or more text boxes from canvas hit-testing / lasso. */
	onSelectTextBoxes?: (ids: string[]) => void;
	/** Applies a full text-box collection after a group move. */
	onTextBoxesChange?: (boxes: CanvasTextBox[]) => void;
	/** Defaults used when a tap in text mode creates a new box. */
	textBoxDefaults?: CanvasTextDefaults;
};

function getStrokeBounds(stroke: Stroke): { minX: number; maxX: number; minY: number; maxY: number } | null {
	if (stroke.tool !== "pen" || stroke.points.length === 0) return null;
	let minX = stroke.points[0].x;
	let maxX = stroke.points[0].x;
	let minY = stroke.points[0].y;
	let maxY = stroke.points[0].y;
	for (const p of stroke.points) {
		if (p.x < minX) minX = p.x;
		if (p.x > maxX) maxX = p.x;
		if (p.y < minY) minY = p.y;
		if (p.y > maxY) maxY = p.y;
	}
	return { minX, maxX, minY, maxY };
}

function percentile75(sorted: number[]): number {
	if (sorted.length === 0) return 0;
	if (sorted.length === 1) return sorted[0];
	const idx = 0.75 * (sorted.length - 1);
	const lo = Math.floor(idx);
	const hi = Math.ceil(idx);
	return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

type WorldRect = { left: number; top: number; right: number; bottom: number };

function canvasRegionToWorldRect(
	region: WhiteboardRelevantRegion | null | undefined,
	canvas: HTMLCanvasElement | null,
	pan: { x: number; y: number },
	scale: number,
): WorldRect | null {
	if (!region || !canvas) return null;
	const rect = canvas.getBoundingClientRect();
	if (rect.width <= 0 || rect.height <= 0 || scale === 0) return null;
	return {
		left: (region.x - pan.x) / scale,
		top: (region.y - pan.y) / scale,
		right: (region.x + region.width - pan.x) / scale,
		bottom: (region.y + region.height - pan.y) / scale,
	};
}

function boundsFallWithinRect(
	bounds: { minX: number; maxX: number; minY: number; maxY: number } | null,
	rect: WorldRect | null,
): boolean {
	if (!bounds || !rect) return Boolean(bounds);
	return bounds.minX >= rect.left && bounds.maxX <= rect.right && bounds.minY >= rect.top && bounds.maxY <= rect.bottom;
}

function getScopedStrokes(
	strokes: Stroke[],
	relevantRegion: WhiteboardRelevantRegion | null | undefined,
	canvas: HTMLCanvasElement | null,
	pan: { x: number; y: number },
	scale: number,
): Stroke[] {
	const worldRect = canvasRegionToWorldRect(relevantRegion, canvas, pan, scale);
	if (!worldRect) return strokes;
	return strokes.filter((stroke) => boundsFallWithinRect(getStrokeBounds(stroke), worldRect));
}

function buildLineAnchors(
	strokes: Stroke[],
): Array<{ y: number; xLeft: number; xRight: number }> {
	const bounds = strokes.map(getStrokeBounds).filter((b): b is { minX: number; maxX: number; minY: number; maxY: number } => Boolean(b));
	if (bounds.length === 0) return [];

	const entries = bounds
		.map((b) => ({
			y: (b.minY + b.maxY) / 2,
			xLeft: b.minX,
			xRight: b.maxX,
			height: Math.max(8, b.maxY - b.minY),
		}))
		.sort((a, b) => a.y - b.y);

	// Collect all xRight values per cluster; use P75 so isolated side-notes don't push ticks far right
	const clusters: Array<{ y: number; xLeft: number; xRights: number[]; count: number }> = [];
	for (const entry of entries) {
		const threshold = Math.max(24, entry.height * 1.15);
		const cluster = clusters.find((c) => Math.abs(c.y - entry.y) <= threshold);
		if (!cluster) {
			clusters.push({ y: entry.y, xLeft: entry.xLeft, xRights: [entry.xRight], count: 1 });
			continue;
		}
		cluster.y = (cluster.y * cluster.count + entry.y) / (cluster.count + 1);
		cluster.xLeft = Math.min(cluster.xLeft, entry.xLeft);
		cluster.xRights.push(entry.xRight);
		cluster.count += 1;
	}

	return clusters
		.sort((a, b) => a.y - b.y)
		.map((c) => ({ y: c.y, xLeft: c.xLeft, xRight: percentile75([...c.xRights].sort((a, b) => a - b)) }));
}

export default function DrawingCanvas({
	onClose,
	registerDrawingSnapshot,
	registerGetLineCount,
	registerGetGradingCapture,
	registerGetStaveAnalysis,
	initialStrokes,
	onStrokesChange,
	onEditInteraction,
	wrapperClassName,
	readOnly = false,
	defaultGridMode = "lines",
	gradingAnnotations = null,
	showGradingOverlay = true,
	enableAttachments = false,
	registerAttachQuestionImages,
	registerRestoreCanvasObject,
	registerAttachFiles,
	onPinObjectToSide,
	onAttachQuestions,
	onAttachRequest,
	initialObjects = null,
	onObjectsChange,
	onUploadImage,
	onRequestTextMode,
	onRequestPenMode,
	editorMode,
	onToolChange,
	textFormat,
	toolbarExtras,
	toolbarPlacement = "floating-bottom",
	toolbarAnchorRef,
	suppressToolbar = false,
	toolbarFixed = false,
	toolbarCenterX = null,
	toolbarCenterAnimated = false,
	onToolbarCenterChange,
	allowViewportNavigation = true,
	onViewportChange,
	captureTextBoxes = [],
	selectedTextBoxIds = [],
	onSelectTextBoxes,
	onTextBoxesChange,
	textBoxDefaults,
}: DrawingCanvasProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const committedInkCanvasRef = useRef<HTMLCanvasElement>(null);
	const objectsCanvasRef = useRef<HTMLCanvasElement>(null);
	const penButtonRef = useRef<HTMLButtonElement>(null);
	const eraserButtonRef = useRef<HTMLButtonElement>(null);
	const gridButtonRef = useRef<HTMLButtonElement>(null);
	const attachButtonRef = useRef<HTMLButtonElement>(null);
	const penPopoverRef = useRef<HTMLDivElement>(null);
	const eraserPopoverRef = useRef<HTMLDivElement>(null);
	const gridPopoverRef = useRef<HTMLDivElement>(null);
	const attachPopoverRef = useRef<HTMLDivElement>(null);
	const colorSampleRef = useRef<HTMLDivElement>(null);
	const gridColorSampleRef = useRef<HTMLDivElement>(null);
	const accentColorSampleRef = useRef<HTMLDivElement>(null);
	const mutedBgSampleRef = useRef<HTMLDivElement>(null);
	const secondaryColorSampleRef = useRef<HTMLDivElement>(null);

	const [fixedToolbarLeft, setFixedToolbarLeft] = useState<number | null>(null);
	const [topToolbarBounds, setTopToolbarBounds] = useState<{
		left: number;
		top: number;
		width: number;
	} | null>(null);
	const topToolbar = toolbarPlacement === "top";
	const portalToolbar = topToolbar || toolbarFixed || (editorMode != null && Boolean(onRequestTextMode));
	useLayoutEffect(() => {
		if (!portalToolbar || (toolbarCenterX != null && !topToolbar)) {
			if (toolbarCenterX == null && !portalToolbar) setFixedToolbarLeft(null);
			if (!topToolbar) setTopToolbarBounds(null);
			return;
		}
		let frame = 0;
		const update = () => {
			window.cancelAnimationFrame(frame);
			frame = window.requestAnimationFrame(() => {
				const rect = (toolbarAnchorRef?.current ?? containerRef.current)?.getBoundingClientRect();
				if (!rect) return;
				if (topToolbar) {
					const viewport = getVisualViewportBounds();
					setTopToolbarBounds({
						left: rect.left,
						top: Math.max(rect.top, viewport.top),
						width: rect.width,
					});
				} else {
					setFixedToolbarLeft(rect.left + rect.width / 2);
				}
			});
		};
		update();
		window.addEventListener("resize", update);
		document.addEventListener("scroll", update, true);
		const stopViewport = subscribeVisualViewport(update);
		const container = containerRef.current;
		const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
		if (container) resizeObserver?.observe(container);
		return () => {
			window.cancelAnimationFrame(frame);
			window.removeEventListener("resize", update);
			document.removeEventListener("scroll", update, true);
			stopViewport();
			resizeObserver?.disconnect();
		};
	}, [portalToolbar, toolbarAnchorRef, toolbarCenterX, topToolbar]);
	const resolvedToolbarLeft = toolbarCenterX ?? fixedToolbarLeft;
	const animateToolbarLeft = Boolean(toolbarCenterX != null && toolbarCenterAnimated);
	useLayoutEffect(() => {
		onToolbarCenterChange?.(resolvedToolbarLeft);
		return () => onToolbarCenterChange?.(null);
	}, [onToolbarCenterChange, resolvedToolbarLeft]);

	const [strokes, setStrokes] = useState<Stroke[]>(normalizeStrokeColors(initialStrokes));
	const [undoStack, setUndoStack] = useState<Stroke[][]>([]);
	const [redoStack, setRedoStack] = useState<Stroke[][]>([]);
	const currentStrokeRef = useRef<Stroke | null>(null);
	const [pan, setPan] = useState({ x: 0, y: 0 });
	const [scale, setScale] = useState(1);
	useEffect(() => {
		onViewportChange?.({ pan, scale });
	}, [onViewportChange, pan, scale]);
	const [expandedCommentId, setExpandedCommentId] = useState<string | null>(null);
	const [fontReady, setFontReady] = useState(false);
	const badgeLayoutsRef = useRef<BadgeLayout[]>([]);

	// Load handwriting font for mark annotations
	useEffect(() => {
		const loadFont = async () => {
			try {
				await document.fonts.ready;
				// Attempt to load Caveat from Google Fonts
				const fontUrl = "https://fonts.gstatic.com/s/caveat/v17/WnznHAc5bAfYB2QRah7pcpNvOx-pjfJ9eIWpZA.woff2";
				const font = new FontFace("Caveat", `url(${fontUrl})`);
				await font.load();
				document.fonts.add(font);
				setFontReady(true);
			} catch {
				// If external load fails, check if font is available in document.fonts
				try {
					await document.fonts.load('16px "Caveat"');
					setFontReady(true);
				} catch {
					// Font unavailable, canvas will silently fall back to serif
					setFontReady(true);
				}
			}
		};
		loadFont();
	}, []);

	// Sync strokes when initialStrokes changes (question navigation)
	const prevInitialRef = useRef(initialStrokes);
	useEffect(() => {
		if (prevInitialRef.current !== initialStrokes) {
			prevInitialRef.current = initialStrokes;
			const normalizedIncoming = normalizeStrokeColors(initialStrokes);
			if (strokesEqual(normalizedIncoming, strokesRef.current)) return;
			setStrokes(normalizedIncoming);
			setUndoStack([]);
			setRedoStack([]);
			currentStrokeRef.current = null;
			setPan({ x: 0, y: 0 });
			setScale(1);
			setLassoPath(null);
			setSelectedStrokeIndexes([]);
			setTransformSession(null);
			lastPenSampleRef.current = null;
		}
	}, [initialStrokes]);

	// Debounced callback when strokes change
	const onStrokesChangeRef = useRef(onStrokesChange);
	onStrokesChangeRef.current = onStrokesChange;
	const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const strokesRef = useRef(strokes);
	strokesRef.current = strokes;
	const panRef = useRef(pan);
	panRef.current = pan;
	const scaleRef = useRef(scale);
	scaleRef.current = scale;
	const renderedViewportRef = useRef({ pan, scale });
	const undoStackRef = useRef(undoStack);
	undoStackRef.current = undoStack;
	const redoStackRef = useRef(redoStack);
	redoStackRef.current = redoStack;
	const isInitialMountRef = useRef(true);
	useEffect(() => {
		// Skip the initial render (don't fire callback for initialStrokes load)
		if (isInitialMountRef.current) {
			isInitialMountRef.current = false;
			return;
		}
		if (!onStrokesChangeRef.current) return;
		if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
		const s = strokes; // capture current value
		debounceTimerRef.current = setTimeout(() => {
			debounceTimerRef.current = null;
			onStrokesChangeRef.current?.(s);
		}, 2000);
		return () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current); };
	}, [strokes]);

	// Flush pending save on unmount so navigating away doesn't lose work
	useEffect(() => {
		return () => {
			if (debounceTimerRef.current) {
				clearTimeout(debounceTimerRef.current);
				debounceTimerRef.current = null;
				onStrokesChangeRef.current?.(strokesRef.current);
			}
		};
	}, []);
	const [tool, setTool] = useState<ToolMode>("pen");
	useEffect(() => {
		onToolChange?.(tool);
	}, [tool, onToolChange]);

	const [gridMode, setGridMode] = useState<GridMode>(defaultGridMode);
	const [strokeColor, setStrokeColor] = useState("");
	const [secondaryStrokeColor, setSecondaryStrokeColor] = useState("");
	const [gridColor, setGridColor] = useState("");
	const [accentColor, setAccentColor] = useState("");
	const [mutedBgColor, setMutedBgColor] = useState("");
	const [activePenColorIndex, setActivePenColorIndex] = useState(0);
	const [activePenThicknessIndex, setActivePenThicknessIndex] = useState(DEFAULT_PEN_THICKNESS_INDEX);
	const [isPenPopoverOpen, setIsPenPopoverOpen] = useState(false);
	const [isEraserPopoverOpen, setIsEraserPopoverOpen] = useState(false);
	const [isGridPopoverOpen, setIsGridPopoverOpen] = useState(false);
	const [isAttachPopoverOpen, setIsAttachPopoverOpen] = useState(false);
	const [eraserMode, setEraserMode] = useState<"point" | "stroke">("stroke");
	const [activeEraserSizeIndex, setActiveEraserSizeIndex] = useState(DEFAULT_ERASER_SIZE_INDEX);
	const [gridOpacity, setGridOpacity] = useState(0.28);
	const [lassoPath, setLassoPath] = useState<Point[] | null>(null);
	const [selectedStrokeIndexes, setSelectedStrokeIndexes] = useState<number[]>([]);
	const [transformSession, setTransformSession] = useState<TransformSession | null>(null);
	const penPalette = useMemo(
		() => [strokeColor, secondaryStrokeColor, accentColor].filter(Boolean),
		[strokeColor, secondaryStrokeColor, accentColor],
	);

	useEffect(() => {
		const toggleEraser = () => {
			setIsPenPopoverOpen(false);
			setIsEraserPopoverOpen(false);
			setIsGridPopoverOpen(false);
			setIsAttachPopoverOpen(false);
			onRequestPenMode?.();
			setTool((current) => (current === "eraser" ? "pen" : "eraser"));
		};
		window.addEventListener(PENCIL_DOUBLE_TAP_EVENT, toggleEraser);
		return () => window.removeEventListener(PENCIL_DOUBLE_TAP_EVENT, toggleEraser);
	}, [onRequestPenMode]);

	// Attached image / PDF-page objects placed on the canvas.
	const [objects, setObjects] = useState<CanvasObject[]>(() => initialObjects ?? []);
	const [selectedObjectIds, setSelectedObjectIds] = useState<string[]>([]);
	const [isAttaching, setIsAttaching] = useState(false);
	const [attachError, setAttachError] = useState<string | null>(null);
	/** Bumped when an attached image finishes decoding so the canvas redraws. */
	const [objectImagesVersion, setObjectImagesVersion] = useState(0);
	const attachErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const showAttachError = useCallback((message: string) => {
		setAttachError(message);
		if (attachErrorTimerRef.current) clearTimeout(attachErrorTimerRef.current);
		attachErrorTimerRef.current = setTimeout(() => {
			attachErrorTimerRef.current = null;
			setAttachError(null);
		}, 5000);
	}, []);
	useEffect(() => {
		return () => {
			if (attachErrorTimerRef.current) clearTimeout(attachErrorTimerRef.current);
		};
	}, []);
	const objectsRef = useRef(objects);
	objectsRef.current = objects;
	const captureTextBoxesRef = useRef(captureTextBoxes);
	captureTextBoxesRef.current = captureTextBoxes;
	const selectedObjectIdsRef = useRef(selectedObjectIds);
	selectedObjectIdsRef.current = selectedObjectIds;
	const selectedTextBoxIdsRef = useRef(selectedTextBoxIds);
	selectedTextBoxIdsRef.current = selectedTextBoxIds;
	const fileInputRef = useRef<HTMLInputElement>(null);
	const objectImageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
	const localBlobUrlsRef = useRef<Set<string>>(new Set());
	const onObjectsChangeRef = useRef(onObjectsChange);
	onObjectsChangeRef.current = onObjectsChange;
	const objectsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Sync objects when initialObjects changes (page navigation / external load).
	// Skip echo updates from our own onObjectsChange when membership is unchanged —
	// those often only swap blob → data/http URLs and cause a visible flash.
	const prevInitialObjectsRef = useRef(initialObjects);
	useEffect(() => {
		if (prevInitialObjectsRef.current === initialObjects) return;
		prevInitialObjectsRef.current = initialObjects;
		const incoming = initialObjects ?? [];
		let replaced = false;
		setObjects((current) => {
			if (current.length > 0 && current.length === incoming.length) {
				const currIds = current.map((o) => o.id).join("\0");
				const nextIds = incoming.map((o) => o.id).join("\0");
				if (currIds === nextIds) return current;
			}
			replaced = true;
			return incoming;
		});
		if (replaced) setSelectedObjectIds([]);
	}, [initialObjects]);

	const preloadObjectImage = useCallback((src: string) => {
		if (!src) return Promise.resolve();
		const existing = objectImageCacheRef.current.get(src);
		if (existing?.complete && existing.naturalWidth > 0) return Promise.resolve();
		return new Promise<void>((resolve) => {
			const img = existing && !existing.complete ? existing : new Image();
			const finish = () => resolve();
			img.onload = finish;
			img.onerror = finish;
			if (!existing || existing.complete) {
				objectImageCacheRef.current.set(src, img);
				img.src = src;
			}
			// Already cached as complete above; in-flight shares the same element.
			if (img.complete && img.naturalWidth > 0) resolve();
		});
	}, []);

	/** Swap an object src only after the new image has decoded — avoids a blank frame. */
	const upgradeObjectSrc = useCallback(
		async (id: string, nextSrc: string, previousSrc?: string) => {
			if (!nextSrc) return;
			await preloadObjectImage(nextSrc);
			setObjects((prev) =>
				prev.map((o) => (o.id === id && o.src !== nextSrc ? { ...o, src: nextSrc } : o))
			);
			setObjectImagesVersion((v) => v + 1);
			if (previousSrc?.startsWith("blob:")) {
				window.setTimeout(() => {
					const stillUsed = objectsRef.current.some((o) => o.src === previousSrc);
					if (!stillUsed && localBlobUrlsRef.current.has(previousSrc)) {
						URL.revokeObjectURL(previousSrc);
						localBlobUrlsRef.current.delete(previousSrc);
					}
					objectImageCacheRef.current.delete(previousSrc);
				}, 1500);
			}
		},
		[preloadObjectImage]
	);

	// Debounced persistence of objects (mirrors stroke saving).
	// Converts ephemeral blob: URLs to data URLs so a slow upload can't wipe the attachment.
	const objectsInitialMountRef = useRef(true);
	useEffect(() => {
		if (objectsInitialMountRef.current) {
			objectsInitialMountRef.current = false;
			return;
		}
		if (!onObjectsChangeRef.current) return;
		if (objectsDebounceRef.current) clearTimeout(objectsDebounceRef.current);
		const snapshot = objects;
		objectsDebounceRef.current = setTimeout(() => {
			objectsDebounceRef.current = null;
			void (async () => {
				const durable = await Promise.all(
					snapshot.map(async (o) => {
						if (!o.src.startsWith("blob:")) return o;
						try {
							const res = await fetch(o.src);
							const blob = await res.blob();
							const dataUrl = await blobToDataUrl(blob);
							return { ...o, src: dataUrl };
						} catch {
							return null;
						}
					})
				);
				onObjectsChangeRef.current?.(durable.filter((o): o is CanvasObject => o != null));
			})();
		}, 1200);
		return () => {
			if (objectsDebounceRef.current) clearTimeout(objectsDebounceRef.current);
		};
	}, [objects]);

	// Flush pending object save on unmount.
	useEffect(() => {
		return () => {
			if (objectsDebounceRef.current) {
				clearTimeout(objectsDebounceRef.current);
				objectsDebounceRef.current = null;
				onObjectsChangeRef.current?.(objectsRef.current);
			}
			for (const url of localBlobUrlsRef.current) {
				URL.revokeObjectURL(url);
			}
			localBlobUrlsRef.current.clear();
		};
	}, []);

	/** Decode attached images into a cache so we can paint them on the canvas. */
	useEffect(() => {
		let cancelled = false;
		const needed = new Set(objects.map((o) => o.src).filter(Boolean));

		for (const src of needed) {
			const cached = objectImageCacheRef.current.get(src);
			if (cached && cached.complete && cached.naturalWidth > 0) continue;
			if (cached && !cached.complete) continue; // already loading

			const img = new Image();
			// Don't set crossOrigin — Firebase download URLs often lack CORS for canvas,
			// and anonymous mode would make the image fail to load entirely.
			img.onload = () => {
				if (cancelled) return;
				setObjectImagesVersion((v) => v + 1);
			};
			img.onerror = () => {
				console.error("[DrawingCanvas] failed to decode attached image:", src.slice(0, 120));
				objectImageCacheRef.current.delete(src);
				if (!cancelled) setObjectImagesVersion((v) => v + 1);
			};
			objectImageCacheRef.current.set(src, img);
			img.src = src;
		}

		// Drop cache entries we no longer need (except in-flight local blob URLs still referenced).
		for (const key of Array.from(objectImageCacheRef.current.keys())) {
			if (!needed.has(key)) objectImageCacheRef.current.delete(key);
		}

		return () => {
			cancelled = true;
		};
	}, [objects]);

	const isDrawingRef = useRef(false);
	const lastPointRef = useRef<Point | null>(null);
	const pinchStartRef = useRef<{ distance: number; center: { x: number; y: number }; scale: number; pan: { x: number; y: number } } | null>(null);
	const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
	const lassoTapRef = useRef<{
		startX: number;
		startY: number;
		world: Point;
		moved: boolean;
	} | null>(null);
	const textTapRef = useRef<{
		startX: number;
		startY: number;
		world: Point;
		moved: boolean;
	} | null>(null);
	const textBoxDefaultsRef = useRef(textBoxDefaults);
	textBoxDefaultsRef.current = textBoxDefaults;
	const externalFingerPanRef = useRef<{
		pointerId: number;
		startX: number;
		startY: number;
		panX: number;
		panY: number;
	} | null>(null);
	const pointerIdsRef = useRef<Map<number, { x: number; y: number }>>(new Map());
	const penPointerIdsRef = useRef(new Set<number>());
	const holdStraightenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const lastPenSampleRef = useRef<{ point: Point; timeMs: number } | null>(null);
	const toolLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const longPressHandledRef = useRef(false);
	const pointEraseBaseRef = useRef<Stroke[] | null>(null);
	const pointEraseChangedRef = useRef(false);
	const selectedStrokeIndexesRef = useRef<number[]>([]);
	selectedStrokeIndexesRef.current = selectedStrokeIndexes;
	const transformSessionRef = useRef<TransformSession | null>(null);
	transformSessionRef.current = transformSession;
	const eraserWidth = ERASER_SIZE_LEVELS[activeEraserSizeIndex] ?? ERASER_SIZE_LEVELS[DEFAULT_ERASER_SIZE_INDEX];
	const eraserHitRadius = eraserWidth / 2 + 3;
	const eraserPreviewWidth = Math.max(2, eraserWidth * 0.125);
	const eraserHitRadiusRef = useRef(eraserHitRadius);
	eraserHitRadiusRef.current = eraserHitRadius;

	const commitStrokeChange = useCallback((updater: (previous: Stroke[]) => Stroke[]) => {
		setStrokes((previous) => {
			const next = updater(previous);
			const changed =
				next !== previous &&
				(next.length !== previous.length || next.some((stroke, index) => stroke !== previous[index]));
			if (!changed) return previous;
			onEditInteraction?.();
			setUndoStack((history) => [...history, previous]);
			setRedoStack([]);
			return next;
		});
	}, [onEditInteraction]);

	// Read theme colors from DOM (follows data-theme) - pen: color-txt-main, grid: color-bg-grey-5
	useLayoutEffect(() => {
		const strokeEl = colorSampleRef.current;
		const secondaryEl = secondaryColorSampleRef.current;
		const gridEl = gridColorSampleRef.current;
		const accentEl = accentColorSampleRef.current;
		const mutedBgEl = mutedBgSampleRef.current;
		if (!strokeEl || !secondaryEl || !gridEl || !accentEl || !mutedBgEl) return;
		const updateColors = () => {
			const primary = getComputedStyle(strokeEl).color;
			const secondary = getComputedStyle(secondaryEl).color;
			const accent = getComputedStyle(accentEl).color;
			setStrokeColor(primary);
			setSecondaryStrokeColor(secondary);
			setAccentColor(accent);
			setMutedBgColor(getComputedStyle(mutedBgEl).backgroundColor);
			setGridColor(getComputedStyle(gridEl).backgroundColor);
		};
		updateColors();
		const observer = new MutationObserver(updateColors);
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
		return () => observer.disconnect();
	}, []);

	const requestToggleComment = useCallback((id: string) => {
		setExpandedCommentId((current) => (current === id ? null : id));
	}, []);

	// Native touch listeners with passive: false so preventDefault works on iOS.
	// Whiteboard: lock all touches to the canvas (finger pans, pencil draws).
	// Document: only lock Apple Pencil so a finger can still scroll the page.
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const preventTouch = (e: TouchEvent) => {
			if (allowViewportNavigation) {
				e.preventDefault();
				return;
			}
			if (touchEventHasStylus(e) || penPointerIdsRef.current.size > 0) {
				e.preventDefault();
			}
		};
		const opts: AddEventListenerOptions = { passive: false, capture: true };
		canvas.addEventListener("touchstart", preventTouch, opts);
		canvas.addEventListener("touchmove", preventTouch, opts);
		if (allowViewportNavigation) {
			canvas.addEventListener("touchend", preventTouch, opts);
			canvas.addEventListener("touchcancel", preventTouch, opts);
		}
		return () => {
			canvas.removeEventListener("touchstart", preventTouch, opts);
			canvas.removeEventListener("touchmove", preventTouch, opts);
			canvas.removeEventListener("touchend", preventTouch, opts);
			canvas.removeEventListener("touchcancel", preventTouch, opts);
		};
	}, [allowViewportNavigation]);

	const screenToWorld = useCallback(
		(screenX: number, screenY: number): Point => {
			const rect = canvasRef.current?.getBoundingClientRect();
			if (!rect) return { x: screenX, y: screenY, pressure: 1 };
			const x = (screenX - rect.left - pan.x) / scale;
			const y = (screenY - rect.top - pan.y) / scale;
			return { x, y, pressure: 1 };
		},
		[pan, scale]
	);

	const getPressure = (e: PointerEvent): number => {
		return e.pressure !== undefined && e.pressure > 0 ? e.pressure : 1;
	};
	const drawStrokeRef = useRef(drawStroke);
	drawStrokeRef.current = drawStroke;
	const strokeRenderKey = `${penPalette.join("\0")}:${activePenColorIndex}:${eraserWidth}`;
	const drawCommittedInk = useCallback(() => {
		void strokeRenderKey;
		const canvas = committedInkCanvasRef.current;
		const ctx = canvas?.getContext("2d");
		if (!canvas || !ctx) return;

		const dpr = window.devicePixelRatio || 1;
		const rect = canvas.getBoundingClientRect();
		const w = rect.width;
		const h = rect.height;
		if (w <= 0 || h <= 0) return;
		const currentPan = panRef.current;
		const currentScale = scaleRef.current;
		if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
			canvas.width = w * dpr;
			canvas.height = h * dpr;
		}
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, w, h);
		ctx.save();
		ctx.translate(currentPan.x, currentPan.y);
		ctx.scale(currentScale, currentScale);
		for (const stroke of strokes) drawStrokeRef.current(ctx, stroke);
		ctx.restore();
	}, [strokes, strokeRenderKey]);
	const appendCommittedStroke = useCallback((stroke: Stroke): boolean => {
		void strokeRenderKey;
		const canvas = committedInkCanvasRef.current;
		const ctx = canvas?.getContext("2d");
		if (!canvas || !ctx || canvas.width === 0 || canvas.height === 0) return false;
		const dpr = window.devicePixelRatio || 1;
		const currentPan = panRef.current;
		const currentScale = scaleRef.current;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.save();
		ctx.translate(currentPan.x, currentPan.y);
		ctx.scale(currentScale, currentScale);
		drawStrokeRef.current(ctx, stroke);
		ctx.restore();
		return true;
	}, [strokeRenderKey]);

	const draw = useCallback(() => {
		void strokeRenderKey;
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext("2d");
		if (!canvas || !ctx) return;

		const targetedStrokeIndexes = new Set<number>();
		const selectedIndexSet = new Set(selectedStrokeIndexes);
		const liveStroke = currentStrokeRef.current;
		if (tool === "eraser" && eraserMode === "stroke" && liveStroke) {
			for (let index = 0; index < strokes.length; index++) {
				const stroke = strokes[index];
				if (stroke.tool === "pen" && strokeIntersectsEraser(stroke, liveStroke, eraserHitRadius)) {
					targetedStrokeIndexes.add(index);
				}
			}
		}

		const dpr = window.devicePixelRatio || 1;
		const rect = canvas.getBoundingClientRect();
		const w = rect.width;
		const h = rect.height;
		if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
			canvas.width = w * dpr;
			canvas.height = h * dpr;
		}
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, w, h);
		ctx.save();
		ctx.translate(pan.x, pan.y);
		ctx.scale(scale, scale);

		// Completed ink lives on the committed canvas. This layer only paints
		// transient input and interaction chrome.
		for (const index of targetedStrokeIndexes) {
			drawStrokeRef.current(ctx, strokes[index], { muted: true });
		}
		if (liveStroke) {
			drawStrokeRef.current(ctx, liveStroke, { preview: true });
		}
		if (lassoPath && lassoPath.length > 1) {
			ctx.save();
			ctx.globalCompositeOperation = "source-over";
			ctx.strokeStyle = accentColor || strokeColor || "#2563EB";
			ctx.setLineDash([10 / scale, 8 / scale]);
			ctx.lineWidth = 1.5 / scale;
			ctx.beginPath();
			ctx.moveTo(lassoPath[0].x, lassoPath[0].y);
			for (let i = 1; i < lassoPath.length; i += 1) ctx.lineTo(lassoPath[i].x, lassoPath[i].y);
			ctx.stroke();
			ctx.restore();
		}

		const selectionBounds = getSelectionBounds(strokes, selectedStrokeIndexes);
		if (selectionBounds && selectedStrokeIndexes.length > 0) {
			const selectedIndexSetGlow = selectedIndexSet;
			ctx.save();
			ctx.strokeStyle = accentColor || strokeColor || "#2563EB";
			for (let index = 0; index < strokes.length; index += 1) {
				if (!selectedIndexSetGlow.has(index)) continue;
				const stroke = strokes[index];
				if (stroke.tool !== "pen" || stroke.points.length < 2) continue;
				ctx.strokeStyle = accentColor || strokeColor || "#2563EB";
				ctx.globalAlpha = 0.28;
				ctx.lineCap = "round";
				ctx.lineJoin = "round";
				for (let i = 0; i < stroke.points.length - 1; i += 1) {
					const p0 = stroke.points[i];
					const p1 = stroke.points[i + 1];
					const baseWidth =
						PEN_THICKNESS_LEVELS[
							Math.max(0, Math.min(PEN_THICKNESS_LEVELS.length - 1, stroke.thicknessIndex ?? DEFAULT_PEN_THICKNESS_INDEX))
						];
					ctx.lineWidth = baseWidth * (Math.max(0.3, p0.pressure) + 0.5) + 1.3 / scale;
					ctx.beginPath();
					ctx.moveTo(p0.x, p0.y);
					ctx.lineTo(p1.x, p1.y);
					ctx.stroke();
				}
			}
			ctx.globalAlpha = 1;
			ctx.restore();
		}

		if (showGradingOverlay && gradingAnnotations && gradingAnnotations.length > 0) {
			const correctionColor = accentColor || strokeColor || "#D95F3B";

			for (const annotation of gradingAnnotations) {
				if (annotation.type !== "errorBox") continue;
				ctx.save();
				ctx.fillStyle = correctionColor;
				ctx.globalAlpha = 0;
				const boxPad = 10 / scale;
				ctx.beginPath();
				ctx.roundRect(
					annotation.worldX - boxPad,
					annotation.worldY - boxPad,
					annotation.worldWidth + boxPad * 2,
					annotation.worldHeight + boxPad * 2,
					6 / scale,
				);
				ctx.fill();
				ctx.restore();
			}

			const badgesByPart = new Map<string, BadgeLayout[]>();
			for (const annotation of gradingAnnotations) {
				if (annotation.type !== "errorComment") continue;
				const partId = annotation.partId || "unknown";
				const radiusWorld = 14 / scale;
				const boxPadWorld = 10 / scale;
				const anchoredX = annotation.errorBoxWorld
					? annotation.errorBoxWorld.right + boxPadWorld + 4 / scale
					: annotation.worldX;
				const arr = badgesByPart.get(partId) ?? [];
				arr.push({
					id: annotation.id,
					partId,
					text: annotation.text,
					worldX: anchoredX,
					worldY: annotation.worldY,
					radiusWorld,
					workingsRegionWorld: annotation.workingsRegionWorld,
					errorBoxWorld: annotation.errorBoxWorld,
				});
				badgesByPart.set(partId, arr);
			}

			const badgeLayouts: BadgeLayout[] = [];
			for (const [, badges] of badgesByPart) {
				badges.sort((a, b) => a.worldY - b.worldY);
				const minDistWorld = 36 / scale;
				for (let i = 0; i < badges.length; i += 1) {
					if (i === 0) continue;
					const prev = badges[i - 1];
					const curr = badges[i];
					if (curr.worldY - prev.worldY < minDistWorld) {
						curr.worldY = prev.worldY + minDistWorld;
					}
				}
				badgeLayouts.push(...badges);
			}

			badgeLayoutsRef.current = badgeLayouts;

			for (const annotation of gradingAnnotations) {
				if (annotation.type === "markAnnotation") {
					drawMarkAnnotation(ctx, annotation, fontReady, accentColor || strokeColor || "#2563EB");
				}
			}
		} else {
			// Ensure feedback bubbles disappear immediately when grading annotations are cleared.
			badgeLayoutsRef.current = [];
		}

		ctx.restore();
	}, [pan, scale, strokes, strokeColor, tool, gradingAnnotations, showGradingOverlay, accentColor, fontReady, lassoPath, selectedStrokeIndexes, eraserMode, eraserHitRadius, strokeRenderKey]);

	/** Paint grid then attached images (under ink) so images sit above the grid. */
	const drawObjects = useCallback(() => {
		const canvas = objectsCanvasRef.current;
		const ctx = canvas?.getContext("2d");
		if (!canvas || !ctx) return;

		const dpr = window.devicePixelRatio || 1;
		const rect = canvas.getBoundingClientRect();
		const w = rect.width;
		const h = rect.height;
		if (w <= 0 || h <= 0) return;
		const currentPan = panRef.current;
		const currentScale = scaleRef.current;
		if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
			canvas.width = w * dpr;
			canvas.height = h * dpr;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		}

		ctx.clearRect(0, 0, w, h);
		ctx.save();
		ctx.translate(currentPan.x, currentPan.y);
		ctx.scale(currentScale, currentScale);

		// Grid first so images render above it
		if (gridMode !== "off" && gridColor) {
			const left = -currentPan.x / currentScale;
			const top = -currentPan.y / currentScale;
			const right = left + w / currentScale;
			const bottom = top + h / currentScale;
			ctx.globalAlpha = gridOpacity;

			if (gridMode === "music") {
				ctx.strokeStyle = gridColor;
				ctx.lineWidth = 1.2 / currentScale;
				const startStave = Math.floor(top / MUSIC_STAVE_REPEAT);
				const endStave = Math.ceil(bottom / MUSIC_STAVE_REPEAT);
				ctx.beginPath();
				for (let s = startStave; s <= endStave; s++) {
					const staveTop = s * MUSIC_STAVE_REPEAT;
					for (let i = 0; i < MUSIC_STAFF_LINES; i++) {
						const y = staveTop + i * MUSIC_LINE_GAP;
						ctx.moveTo(left, y);
						ctx.lineTo(right, y);
					}
				}
				ctx.stroke();
			} else if (gridMode === "essay") {
				drawEssayGrid(ctx, left, top, right, bottom, currentScale, gridColor, gridOpacity);
			} else {
				const startX = Math.floor(left / GRID_STEP) * GRID_STEP;
				const endX = Math.ceil(right / GRID_STEP) * GRID_STEP;
				const startY = Math.floor(top / GRID_STEP) * GRID_STEP;
				const endY = Math.ceil(bottom / GRID_STEP) * GRID_STEP;
				if (gridMode === "lines") {
					ctx.strokeStyle = gridColor;
					ctx.lineWidth = 1 / currentScale;
					ctx.beginPath();
					for (let x = startX; x <= endX; x += GRID_STEP) {
						ctx.moveTo(x, top);
						ctx.lineTo(x, bottom);
					}
					for (let y = startY; y <= endY; y += GRID_STEP) {
						ctx.moveTo(left, y);
						ctx.lineTo(right, y);
					}
					ctx.stroke();
				} else {
					ctx.fillStyle = gridColor;
					for (let x = startX; x <= endX; x += GRID_STEP) {
						for (let y = startY; y <= endY; y += GRID_STEP) {
							ctx.beginPath();
							ctx.arc(x, y, GRID_DOT_RADIUS / currentScale, 0, Math.PI * 2);
							ctx.fill();
						}
					}
				}
			}
			ctx.globalAlpha = 1;
		}

		for (const obj of objects) {
			if (obj.pinnedToSide) continue;
			if (!obj.src || obj.width <= 0 || obj.height <= 0) continue;
			const img = objectImageCacheRef.current.get(obj.src);
			if (!img || !img.complete || img.naturalWidth <= 0) continue;
			try {
				ctx.drawImage(img, obj.x, obj.y, obj.width, obj.height);
			} catch (err) {
				console.error("[DrawingCanvas] drawImage failed:", err);
			}
		}

		ctx.restore();
	}, [objects, objectImagesVersion, gridMode, gridColor, gridOpacity]);

	const drawRef = useRef(draw);
	drawRef.current = draw;
	const drawCommittedInkRef = useRef(drawCommittedInk);
	drawCommittedInkRef.current = drawCommittedInk;
	const drawObjectsRef = useRef(drawObjects);
	drawObjectsRef.current = drawObjects;
	const liveDrawFrameRef = useRef<number | null>(null);
	const skipNextCommittedRedrawRef = useRef(false);
	const staticRedrawTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const scheduleLiveDraw = useCallback(() => {
		if (liveDrawFrameRef.current != null) return;
		liveDrawFrameRef.current = window.requestAnimationFrame(() => {
			liveDrawFrameRef.current = null;
			drawRef.current();
		});
	}, []);
	const resetStaticLayerTransforms = useCallback(() => {
		for (const canvas of [objectsCanvasRef.current, committedInkCanvasRef.current]) {
			if (!canvas) continue;
			canvas.style.transform = "";
			canvas.style.transformOrigin = "";
		}
	}, []);
	const redrawStaticLayers = useCallback(() => {
		if (staticRedrawTimerRef.current) {
			clearTimeout(staticRedrawTimerRef.current);
			staticRedrawTimerRef.current = null;
		}
		resetStaticLayerTransforms();
		drawObjectsRef.current();
		drawCommittedInkRef.current();
		const currentPan = panRef.current;
		renderedViewportRef.current = {
			pan: { x: currentPan.x, y: currentPan.y },
			scale: scaleRef.current,
		};
	}, [resetStaticLayerTransforms]);
	const scheduleStaticRedraw = useCallback(() => {
		if (staticRedrawTimerRef.current) clearTimeout(staticRedrawTimerRef.current);
		staticRedrawTimerRef.current = setTimeout(() => {
			staticRedrawTimerRef.current = null;
			redrawStaticLayers();
		}, 120);
	}, [redrawStaticLayers]);
	const previewStaticViewport = useCallback(() => {
		const rendered = renderedViewportRef.current;
		const currentPan = panRef.current;
		const currentScale = scaleRef.current;
		const ratio = currentScale / Math.max(rendered.scale, 0.0001);
		const translateX = currentPan.x - rendered.pan.x * ratio;
		const translateY = currentPan.y - rendered.pan.y * ratio;
		const transform = `translate(${translateX}px, ${translateY}px) scale(${ratio})`;
		for (const canvas of [objectsCanvasRef.current, committedInkCanvasRef.current]) {
			if (!canvas) continue;
			canvas.style.transformOrigin = "0 0";
			canvas.style.transform = transform;
		}
		scheduleStaticRedraw();
	}, [scheduleStaticRedraw]);

	useEffect(() => {
		if (skipNextCommittedRedrawRef.current) {
			skipNextCommittedRedrawRef.current = false;
			return;
		}
		redrawStaticLayers();
	}, [drawCommittedInk, redrawStaticLayers]);

	useEffect(() => {
		draw();
	}, [draw]);

	useEffect(() => {
		redrawStaticLayers();
	}, [drawObjects, redrawStaticLayers]);

	useLayoutEffect(() => {
		previewStaticViewport();
	}, [pan, scale, previewStaticViewport]);

	useEffect(() => {
		return () => {
			if (liveDrawFrameRef.current != null) {
				window.cancelAnimationFrame(liveDrawFrameRef.current);
				liveDrawFrameRef.current = null;
			}
			if (staticRedrawTimerRef.current) {
				clearTimeout(staticRedrawTimerRef.current);
				staticRedrawTimerRef.current = null;
			}
		};
	}, []);

	// Canvas bitmap dimensions do not automatically follow CSS dimensions. When a
	// surrounding sidebar animates, the browser otherwise stretches the previous
	// bitmap until the next pointer interaction happens to trigger a redraw.
	useLayoutEffect(() => {
		const container = toolbarAnchorRef?.current ?? containerRef.current;
		if (!container) return;

		let resizeTimer: ReturnType<typeof setTimeout> | null = null;
		const redrawAtCurrentSize = () => {
			if (resizeTimer) clearTimeout(resizeTimer);
			resizeTimer = setTimeout(() => {
				resizeTimer = null;
				redrawStaticLayers();
				drawRef.current();
			}, 140);
		};

		redrawStaticLayers();
		drawRef.current();
		window.addEventListener("resize", redrawAtCurrentSize);
		const stopViewport = subscribeVisualViewport(redrawAtCurrentSize);
		const resizeObserver =
			typeof ResizeObserver === "undefined"
				? null
				: new ResizeObserver(redrawAtCurrentSize);
		resizeObserver?.observe(container);

		return () => {
			if (resizeTimer) clearTimeout(resizeTimer);
			window.removeEventListener("resize", redrawAtCurrentSize);
			stopViewport();
			resizeObserver?.disconnect();
		};
	}, [toolbarAnchorRef, redrawStaticLayers]);

	useEffect(() => {
		setSelectedStrokeIndexes((previous) => {
			const next = previous.filter((index) => {
				const stroke = strokes[index];
				return Boolean(stroke && stroke.tool === "pen");
			});
			return next.length === previous.length ? previous : next;
		});
	}, [strokes]);

	useEffect(() => {
		if (tool === "lasso") return;
		if (selectedStrokeIndexesRef.current.length > 0) setSelectedStrokeIndexes([]);
		if (lassoPath) setLassoPath(null);
		if (transformSessionRef.current) setTransformSession(null);
		setSelectedObjectIds([]);
	}, [tool, lassoPath]);

	const clearToolLongPressTimer = useCallback(() => {
		if (toolLongPressTimerRef.current) {
			clearTimeout(toolLongPressTimerRef.current);
			toolLongPressTimerRef.current = null;
		}
	}, []);

	const startToolLongPress = useCallback((kind: "pen" | "eraser" | "grid") => {
		clearToolLongPressTimer();
		longPressHandledRef.current = false;
		toolLongPressTimerRef.current = setTimeout(() => {
			longPressHandledRef.current = true;
			if (kind === "pen") {
				setTool("pen");
				setIsPenPopoverOpen(true);
				setIsEraserPopoverOpen(false);
				setIsGridPopoverOpen(false);
			} else if (kind === "eraser") {
				setTool("eraser");
				setIsEraserPopoverOpen(true);
				setIsPenPopoverOpen(false);
				setIsGridPopoverOpen(false);
			} else {
				setIsGridPopoverOpen(true);
				setIsPenPopoverOpen(false);
				setIsEraserPopoverOpen(false);
			}
		}, TOOL_LONG_PRESS_MS);
	}, [clearToolLongPressTimer]);

	useEffect(() => () => clearToolLongPressTimer(), [clearToolLongPressTimer]);

	useEffect(() => {
		setIsPenPopoverOpen(false);
		setIsEraserPopoverOpen(false);
		setIsGridPopoverOpen(false);
		setIsAttachPopoverOpen(false);
	}, [editorMode]);

	useEffect(() => {
		if (!isPenPopoverOpen && !isEraserPopoverOpen && !isGridPopoverOpen && !isAttachPopoverOpen) return;
		const onPointerDown = (event: PointerEvent) => {
			const target = event.target as Node | null;
			if (!target) return;
			const inPenButton = penButtonRef.current?.contains(target);
			const inEraserButton = eraserButtonRef.current?.contains(target);
			const inGridButton = gridButtonRef.current?.contains(target);
			const inAttachButton = attachButtonRef.current?.contains(target);
			const inPenPopover = penPopoverRef.current?.contains(target);
			const inEraserPopover = eraserPopoverRef.current?.contains(target);
			const inGridPopover = gridPopoverRef.current?.contains(target);
			const inAttachPopover = attachPopoverRef.current?.contains(target);
			if (
				inPenButton || inEraserButton || inGridButton || inAttachButton ||
				inPenPopover || inEraserPopover || inGridPopover || inAttachPopover
			) return;
			setIsPenPopoverOpen(false);
			setIsEraserPopoverOpen(false);
			setIsGridPopoverOpen(false);
			setIsAttachPopoverOpen(false);
		};
		document.addEventListener("pointerdown", onPointerDown, true);
		return () => document.removeEventListener("pointerdown", onPointerDown, true);
	}, [isPenPopoverOpen, isEraserPopoverOpen, isGridPopoverOpen, isAttachPopoverOpen]);

	useEffect(() => {
		if (!expandedCommentId) return;
		if (!gradingAnnotations?.some((annotation) => annotation.type === "errorComment" && annotation.id === expandedCommentId)) {
			setExpandedCommentId(null);
		}
	}, [gradingAnnotations, expandedCommentId]);

	/** Snap stroke to nearest angle (snap step in degrees, e.g. 15 = every 15°) */
	const ANGLE_SNAP_DEG = 15;
	function straightenStroke(stroke: Stroke): Stroke {
		if (stroke.tool !== "pen" || stroke.points.length < 2) return stroke;
		const start = stroke.points[0];
		const end = stroke.points[stroke.points.length - 1];
		const dx = end.x - start.x;
		const dy = end.y - start.y;
		const dist = Math.hypot(dx, dy);
		if (dist < 1e-6) return stroke;

		const angleRad = Math.atan2(dy, dx);
		const snapStepRad = (ANGLE_SNAP_DEG * Math.PI) / 180;
		const snappedAngle = Math.round(angleRad / snapStepRad) * snapStepRad;
		const snappedEnd: Point = {
			x: start.x + dist * Math.cos(snappedAngle),
			y: start.y + dist * Math.sin(snappedAngle),
			pressure: end.pressure,
		};
		return { ...stroke, points: [start, snappedEnd] };
	}

	const scheduleHoldStraighten = useCallback(() => {
		if (holdStraightenTimerRef.current) clearTimeout(holdStraightenTimerRef.current);
		holdStraightenTimerRef.current = setTimeout(() => {
			holdStraightenTimerRef.current = null;
			const stroke = currentStrokeRef.current;
			if (stroke && stroke.tool === "pen" && stroke.points.length >= 2) {
				const straightened = straightenStroke(stroke);
				currentStrokeRef.current = straightened;
				scheduleLiveDraw();
			}
		}, HOLD_TO_STRAIGHTEN_MS);
	}, [scheduleLiveDraw]);

	const cancelHoldStraighten = useCallback(() => {
		if (holdStraightenTimerRef.current) {
			clearTimeout(holdStraightenTimerRef.current);
			holdStraightenTimerRef.current = null;
		}
	}, []);

	// Expose current drawing as PNG for AI/vision (includes music staves when active)
	const getSnapshot = useCallback(() => {
		const liveStroke = currentStrokeRef.current;
		if (strokes.length === 0 && !liveStroke && objects.length === 0 && !captureTextBoxes.some((box) => box.text.trim())) return null;
		const canvas = canvasRef.current;
		if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
		const dpr = window.devicePixelRatio || 1;
		const rect = canvas.getBoundingClientRect();
		const w = rect.width;
		const h = rect.height;
		const off = document.createElement("canvas");
		off.width = w * dpr;
		off.height = h * dpr;
		const ctx = off.getContext("2d");
		if (!ctx) return null;
		ctx.scale(dpr, dpr);
		ctx.clearRect(0, 0, w, h);
		ctx.fillStyle = "#ffffff";
		ctx.fillRect(0, 0, w, h);
		ctx.save();
		ctx.translate(pan.x, pan.y);
		ctx.scale(scale, scale);

		if (gridMode === "music") {
			const left = -pan.x / scale;
			const top = -pan.y / scale;
			const right = left + w / scale;
			const bottom = top + h / scale;
			const startStave = Math.floor(top / MUSIC_STAVE_REPEAT);
			const endStave = Math.ceil(bottom / MUSIC_STAVE_REPEAT);

			ctx.strokeStyle = "#555555";
			ctx.lineWidth = 1.8 / scale;
			ctx.beginPath();
			for (let s = startStave; s <= endStave; s++) {
				const staveTop = s * MUSIC_STAVE_REPEAT;
				for (let i = 0; i < MUSIC_STAFF_LINES; i++) {
					const y = staveTop + i * MUSIC_LINE_GAP;
					ctx.moveTo(left, y);
					ctx.lineTo(right, y);
				}
			}
			ctx.stroke();

			ctx.strokeStyle = "#555555";
			ctx.lineWidth = 2.5 / scale;
			ctx.beginPath();
			for (let s = startStave; s <= endStave; s++) {
				const staveTop = s * MUSIC_STAVE_REPEAT;
				const bx = left + 4 / scale;
				ctx.moveTo(bx, staveTop);
				ctx.lineTo(bx, staveTop + MUSIC_STAFF_HEIGHT);
			}
			ctx.stroke();

			const fontSize = Math.max(9, 11 / scale);
			ctx.font = `bold ${fontSize}px sans-serif`;
			ctx.textBaseline = "middle";
			ctx.fillStyle = "#333333";
			const labelX = left + 10 / scale;
			for (let s = startStave; s <= endStave; s++) {
				const staveTop = s * MUSIC_STAVE_REPEAT;
				for (let i = 0; i < MUSIC_STAFF_LINES; i++) {
					const y = staveTop + i * MUSIC_LINE_GAP;
					ctx.fillText(STAVE_LINE_LABELS[i], labelX, y);
				}
				for (let i = 0; i < MUSIC_STAFF_LINES - 1; i++) {
					const y = staveTop + i * MUSIC_LINE_GAP + MUSIC_LINE_GAP / 2;
					ctx.fillText(STAVE_SPACE_LABELS[i], labelX, y);
				}
			}
		} else if (gridMode === "essay") {
			const left = -pan.x / scale;
			const top = -pan.y / scale;
			const right = left + w / scale;
			const bottom = top + h / scale;
			drawEssayGrid(ctx, left, top, right, bottom, scale, "#BBBBBB", 1);
		}

		// Images above grid, under ink
		for (const obj of objects) {
			if (obj.pinnedToSide) continue;
			if (!obj.src || obj.width <= 0 || obj.height <= 0) continue;
			const img = objectImageCacheRef.current.get(obj.src);
			if (!img || !img.complete || img.naturalWidth <= 0) continue;
			try {
				ctx.drawImage(img, obj.x, obj.y, obj.width, obj.height);
			} catch {
				/* skip tainted / failed images in snapshot */
			}
		}

		drawCaptureTextBoxes(ctx, captureTextBoxes);
		const drawSnapshotPenStroke = (stroke: Stroke) => {
			if (stroke.tool !== "pen" || stroke.points.length < 2) return;
			ctx.globalCompositeOperation = "source-over";
			const paletteColor =
				typeof stroke.colorIndex === "number"
					? penPalette[Math.max(0, Math.min(penPalette.length - 1, stroke.colorIndex))]
					: penPalette[0];
			ctx.strokeStyle = paletteColor || penPalette[activePenColorIndex] || "#111827";
			ctx.lineCap = "round";
			ctx.lineJoin = "round";
			const baseWidth =
				PEN_THICKNESS_LEVELS[
					Math.max(0, Math.min(PEN_THICKNESS_LEVELS.length - 1, stroke.thicknessIndex ?? DEFAULT_PEN_THICKNESS_INDEX))
				];
			for (let i = 1; i < stroke.points.length - 1; i++) {
				const prev = stroke.points[i - 1];
				const curr = stroke.points[i];
				const next = stroke.points[i + 1];
				const startX = (prev.x + curr.x) / 2;
				const startY = (prev.y + curr.y) / 2;
				const endX = (curr.x + next.x) / 2;
				const endY = (curr.y + next.y) / 2;
				ctx.lineWidth = baseWidth * (Math.max(0.2, curr.pressure) + 0.55);
				ctx.beginPath();
				ctx.moveTo(startX, startY);
				ctx.quadraticCurveTo(curr.x, curr.y, endX, endY);
				ctx.stroke();
			}
			if (stroke.points.length === 2) {
				const p0 = stroke.points[0];
				const p1 = stroke.points[1];
				ctx.lineWidth = baseWidth * (Math.max(0.2, p0.pressure) + 0.55);
				ctx.beginPath();
				ctx.moveTo(p0.x, p0.y);
				ctx.lineTo(p1.x, p1.y);
				ctx.stroke();
			}
		};

		for (const stroke of strokes) drawSnapshotPenStroke(stroke);
		if (liveStroke?.tool === "pen") drawSnapshotPenStroke(liveStroke);
		ctx.restore();
		try {
			return off.toDataURL("image/png");
		} catch (err) {
			console.error("[DrawingCanvas] snapshot failed (possibly tainted canvas):", err);
			return null;
		}
	}, [pan, scale, strokes, gridMode, penPalette, activePenColorIndex, objects, objectImagesVersion, captureTextBoxes]);
	const getGradingCapture = useCallback((mode: "default" | "full-ink" | "retry-aggressive" = "default"): CanvasCapturePayload | null => {
		const liveStroke = currentStrokeRef.current;
		const renderStrokes = [...strokes, ...(liveStroke ? [liveStroke] : [])];
		if (!renderStrokes.some((stroke) => stroke.tool === "pen" && stroke.points.length > 1) && !captureTextBoxes.some((box) => box.text.trim())) return null;
		const canvas = canvasRef.current;
		if (!canvas) return null;
		const rect = canvas.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0 || scale === 0) return null;
		return buildCapturePayload({
			strokes: renderStrokes,
			textBoxes: captureTextBoxes,
			viewportWidth: rect.width,
			viewportHeight: rect.height,
			offsetX: pan.x,
			offsetY: pan.y,
			scale,
			devicePixelRatio: window.devicePixelRatio || 1,
			forceFullInkBounds: mode === "full-ink" || mode === "retry-aggressive",
			expandPaddingRatio: mode === "retry-aggressive" ? 0.25 : undefined,
			jpegQuality: mode === "retry-aggressive" ? 0.97 : undefined,
		});
	}, [strokes, pan, scale, captureTextBoxes]);
	useEffect(() => {
		if (!registerDrawingSnapshot) return;
		registerDrawingSnapshot(getSnapshot);
		return () => registerDrawingSnapshot(null);
	}, [registerDrawingSnapshot, getSnapshot]);
	useEffect(() => {
		if (!registerGetGradingCapture) return;
		registerGetGradingCapture(getGradingCapture);
		return () => registerGetGradingCapture(null);
	}, [registerGetGradingCapture, getGradingCapture]);

	const getStaveAnalysis = useCallback((): string | null => {
		if (gridMode !== "music") return null;
		const liveStroke = currentStrokeRef.current;
		const allStrokes = [...strokes, ...(liveStroke ? [liveStroke] : [])];
		return analyseStavePositions(allStrokes);
	}, [gridMode, strokes]);
	useEffect(() => {
		if (!registerGetStaveAnalysis) return;
		registerGetStaveAnalysis(getStaveAnalysis);
		return () => registerGetStaveAnalysis(null);
	}, [registerGetStaveAnalysis, getStaveAnalysis]);

	useEffect(() => {
		if (!registerGetLineCount) return;
		registerGetLineCount((region) =>
			buildLineAnchors(
				getScopedStrokes(strokesRef.current, region, canvasRef.current, panRef.current, scaleRef.current),
			).length,
		);
		return () => registerGetLineCount(null);
	}, [registerGetLineCount]);

	function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, options?: { preview?: boolean; muted?: boolean }) {
		const preview = options?.preview === true;
		const muted = options?.muted === true;
		if (stroke.points.length < 2) {
			if (stroke.tool === "eraser" && preview && stroke.points.length === 1) {
				ctx.globalCompositeOperation = "source-over";
				ctx.setLineDash([]);
				ctx.globalAlpha = 1;
				ctx.fillStyle = "rgba(128, 128, 128, 0.5)";
				ctx.beginPath();
				ctx.arc(stroke.points[0].x, stroke.points[0].y, eraserPreviewWidth / 2, 0, Math.PI * 2);
				ctx.fill();
			}
			return;
		}
		if (stroke.tool === "eraser") {
			if (preview) {
				ctx.globalCompositeOperation = "source-over";
				ctx.strokeStyle = "rgba(128, 128, 128, 0.75)";
				ctx.globalAlpha = 1;
				ctx.setLineDash([]);
				ctx.lineCap = "round";
				ctx.lineJoin = "round";
				ctx.lineWidth = eraserPreviewWidth;
				ctx.beginPath();
				ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
				for (let i = 1; i < stroke.points.length; i++) {
					ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
				}
				ctx.stroke();
				ctx.setLineDash([]);
				ctx.globalAlpha = 1;
				return;
			}
			ctx.globalCompositeOperation = "destination-out";
			ctx.strokeStyle = "rgba(0,0,0,1)";
			ctx.lineCap = "round";
			ctx.lineJoin = "round";
			ctx.lineWidth = eraserWidth;
			ctx.beginPath();
			ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
			for (let i = 1; i < stroke.points.length; i++) {
				ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
			}
			ctx.stroke();
			ctx.globalCompositeOperation = "source-over";
		} else {
			ctx.globalCompositeOperation = "source-over";
			ctx.setLineDash([]);
			ctx.globalAlpha = muted ? 0.5 : 1;
			const paletteColor =
				typeof stroke.colorIndex === "number"
					? penPalette[Math.max(0, Math.min(penPalette.length - 1, stroke.colorIndex))]
					: penPalette[0];
			ctx.strokeStyle = muted ? ERASE_TARGET_STROKE_COLOR : paletteColor || penPalette[activePenColorIndex] || penPalette[0] || strokeColor || "#111827";
			ctx.lineCap = "round";
			ctx.lineJoin = "round";
			const baseWidth =
				PEN_THICKNESS_LEVELS[
					Math.max(0, Math.min(PEN_THICKNESS_LEVELS.length - 1, stroke.thicknessIndex ?? DEFAULT_PEN_THICKNESS_INDEX))
				];
			for (let i = 1; i < stroke.points.length - 1; i += 1) {
				const prev = stroke.points[i - 1];
				const curr = stroke.points[i];
				const next = stroke.points[i + 1];
				const startX = (prev.x + curr.x) / 2;
				const startY = (prev.y + curr.y) / 2;
				const endX = (curr.x + next.x) / 2;
				const endY = (curr.y + next.y) / 2;
				ctx.lineWidth = baseWidth * (Math.max(0.2, curr.pressure) + 0.55);
				ctx.beginPath();
				ctx.moveTo(startX, startY);
				ctx.quadraticCurveTo(curr.x, curr.y, endX, endY);
				ctx.stroke();
			}
			if (stroke.points.length === 2) {
				const p0 = stroke.points[0];
				const p1 = stroke.points[1];
				ctx.lineWidth = baseWidth * (Math.max(0.2, p0.pressure) + 0.55);
				ctx.beginPath();
				ctx.moveTo(p0.x, p0.y);
				ctx.lineTo(p1.x, p1.y);
				ctx.stroke();
			}
		}
	}

	const applyTransformFromSession = useCallback((pointer: Point) => {
		const session = transformSessionRef.current;
		if (!session) return;
		let previewDx = 0;
		let previewDy = 0;
		let previewScale = 1;
		let previewRotation = 0;
		let nextStrokes = session.baseStrokes;
		if (session.mode === "move") {
			previewDx = pointer.x - session.startPointer.x;
			previewDy = pointer.y - session.startPointer.y;
			nextStrokes = transformSelectedStrokes(session.baseStrokes, session.selectedIndexes, session.center, { dx: previewDx, dy: previewDy });
		} else if (session.mode === "scale") {
			const currentDistance = Math.hypot(pointer.x - session.center.x, pointer.y - session.center.y);
			const baseDistance = Math.max(1e-4, session.baseDistance ?? 1);
			previewScale = Math.max(MIN_SELECTION_SCALE, currentDistance / baseDistance);
			nextStrokes = transformSelectedStrokes(session.baseStrokes, session.selectedIndexes, session.center, { scaleFactor: previewScale });
		} else if (session.mode === "rotate") {
			const currentAngle = Math.atan2(pointer.y - session.center.y, pointer.x - session.center.x);
			previewRotation = currentAngle - (session.startAngle ?? 0);
			nextStrokes = transformSelectedStrokes(session.baseStrokes, session.selectedIndexes, session.center, { rotation: previewRotation });
		}
		setStrokes(nextStrokes);
		setTransformSession((current) =>
			current
				? {
						...current,
						previewDx,
						previewDy,
						previewScale,
						previewRotation,
					}
				: current
		);
	}, []);

	const selectAtWorldPoint = useCallback((world: Point) => {
		const textHit = [...captureTextBoxes].reverse().find((box) =>
			Boolean(
				box.id &&
				world.x >= box.x &&
				world.x <= box.x + box.width &&
				world.y >= box.y &&
				world.y <= box.y + box.height
			)
		);
		if (textHit?.id) {
			setSelectedObjectIds([]);
			setSelectedStrokeIndexes([]);
			onSelectTextBoxes?.([textHit.id]);
			return true;
		}

		const hitRadius = 12 / Math.max(scaleRef.current, 0.01);
		const hitRadiusSquared = hitRadius * hitRadius;
		for (let index = strokesRef.current.length - 1; index >= 0; index -= 1) {
			const stroke = strokesRef.current[index];
			if (stroke.tool !== "pen" || stroke.points.length === 0) continue;
			const hit = stroke.points.length === 1
				? Math.hypot(world.x - stroke.points[0].x, world.y - stroke.points[0].y) <= hitRadius
				: stroke.points.slice(1).some((point, pointIndex) =>
						distanceSquaredPointToSegment(world, stroke.points[pointIndex], point) <= hitRadiusSquared
					);
			if (!hit) continue;
			setSelectedObjectIds([]);
			onSelectTextBoxes?.([]);
			setSelectedStrokeIndexes([index]);
			return true;
		}

		const objectHit = [...objectsRef.current].reverse().find((object) =>
			!object.pinnedToSide &&
			world.x >= object.x &&
			world.x <= object.x + object.width &&
			world.y >= object.y &&
			world.y <= object.y + object.height
		);
		if (objectHit) {
			setSelectedStrokeIndexes([]);
			onSelectTextBoxes?.([]);
			setSelectedObjectIds([objectHit.id]);
			return true;
		}

		setSelectedObjectIds([]);
		setSelectedStrokeIndexes([]);
		onSelectTextBoxes?.([]);
		return false;
	}, [captureTextBoxes, onSelectTextBoxes]);

	useEffect(() => {
		const enterSelectMode = () => setTool("lasso");
		const handleExternalFingerPointer = (event: Event) => {
			const detail = (event as CustomEvent<CanvasFingerPointerDetail>).detail;
			if (!detail) return;
			if (detail.phase === "start") {
				const currentPan = panRef.current;
				externalFingerPanRef.current = {
					pointerId: detail.pointerId,
					startX: detail.clientX,
					startY: detail.clientY,
					panX: currentPan.x,
					panY: currentPan.y,
				};
				return;
			}
			const session = externalFingerPanRef.current;
			if (!session || session.pointerId !== detail.pointerId) return;
			if (detail.phase === "move") {
				setPan({
					x: session.panX + detail.clientX - session.startX,
					y: session.panY + detail.clientY - session.startY,
				});
			} else {
				externalFingerPanRef.current = null;
			}
		};
		window.addEventListener(CANVAS_FINGER_SELECT_EVENT, enterSelectMode);
		window.addEventListener(CANVAS_FINGER_POINTER_EVENT, handleExternalFingerPointer);
		const handleCanvasPanBy = (event: Event) => {
			const dy = (event as CustomEvent<CanvasPanByDetail>).detail?.dy;
			if (!Number.isFinite(dy) || dy === 0) return;
			setPan((current) => ({ ...current, y: current.y + dy }));
		};
		window.addEventListener(CANVAS_PAN_BY_EVENT, handleCanvasPanBy);
		return () => {
			window.removeEventListener(CANVAS_FINGER_SELECT_EVENT, enterSelectMode);
			window.removeEventListener(CANVAS_FINGER_POINTER_EVENT, handleExternalFingerPointer);
			window.removeEventListener(CANVAS_PAN_BY_EVENT, handleCanvasPanBy);
		};
	}, []);

	const commitTransformSession = useCallback(() => {
		const session = transformSessionRef.current;
		if (!session) return;
		const before = session.baseStrokes;
		const after = strokesRef.current;
		const changed =
			before.length !== after.length ||
			before.some((stroke, index) => stroke !== after[index]);
		if (changed) {
			setUndoStack((history) => [...history, before]);
			setRedoStack([]);
		}
		setTransformSession(null);
		lastPenSampleRef.current = null;
	}, []);

	const handlePointerDown = useCallback(
		(e: React.PointerEvent) => {
			if (e.pointerType === "pen") {
				penPointerIdsRef.current.add(e.pointerId);
				// Pencil owns the gesture: drop incidental finger/palm pointers so we
				// don't pinch/pan AND ink at the same time.
				panStartRef.current = null;
				pinchStartRef.current = null;
				pointerIdsRef.current.clear();
			}
			const ignoreTouch = e.pointerType === "touch" && (penPointerIdsRef.current.size > 0 || !allowViewportNavigation);
			if (ignoreTouch) return;
			e.preventDefault();
			setIsPenPopoverOpen(false);
			setIsEraserPopoverOpen(false);
			setIsGridPopoverOpen(false);
			const canvas = canvasRef.current;
			if (!canvas) return;
			if (staticRedrawTimerRef.current) redrawStaticLayers();

			const rect = canvas.getBoundingClientRect();
			const isIPadFinger = e.pointerType === "touch" && isIPad();
			const isTextPlaceMode = editorMode === "text" && tool !== "lasso";

			if (readOnly && tool !== "lasso" && !isIPadFinger && !isTextPlaceMode) return;
			canvas.setPointerCapture(e.pointerId);
			const world = screenToWorld(e.clientX, e.clientY);
			world.pressure = getPressure(e.nativeEvent);

			const pointers = pointerIdsRef.current;
			pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

			if (pointers.size === 2) {
				// Start pinch
				lassoTapRef.current = null;
				textTapRef.current = null;
				if (holdStraightenTimerRef.current) {
					clearTimeout(holdStraightenTimerRef.current);
				}
				holdStraightenTimerRef.current = null;
				const [a, b] = Array.from(pointers.entries());
				const dx = a[1].x - b[1].x;
				const dy = a[1].y - b[1].y;
				const distance = Math.hypot(dx, dy);
				const center = { x: (a[1].x + b[1].x) / 2 - rect.left, y: (a[1].y + b[1].y) / 2 - rect.top };
				isDrawingRef.current = false;
				currentStrokeRef.current = null;
				setLassoPath(null);
				panStartRef.current = null;
				pinchStartRef.current = { distance, center, scale, pan };
				return;
			}

			if (pointers.size === 1) {
				// Outside select mode, iPad fingers pan. In select mode, pencil and touch both select.
				const isPen = e.pointerType === "pen";
				const isMouse = e.pointerType === "mouse";
				const isTouch = e.pointerType === "touch";
				if (isTextPlaceMode) {
					textTapRef.current = {
						startX: e.clientX,
						startY: e.clientY,
						world,
						moved: false,
					};
					if (isTouch) {
						panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
					}
					return;
				}
				if (isIPadFinger && tool !== "lasso") {
					panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
					return;
				}
				if (tool === "lasso" && (isPen || isMouse || isTouch)) {
					lassoTapRef.current = {
						startX: e.clientX,
						startY: e.clientY,
						world,
						moved: false,
					};
					setTransformSession(null);
					setSelectedStrokeIndexes([]);
					setSelectedObjectIds([]);
					onSelectTextBoxes?.([]);
					setLassoPath(null);
					isDrawingRef.current = false;
					return;
				}

				const shouldDraw = (isPen || isMouse || isTouch) && (tool === "pen" || tool === "eraser");
				if (shouldDraw) {
					isDrawingRef.current = true;
					if (tool === "eraser" && eraserMode === "point") {
						pointEraseBaseRef.current = strokesRef.current;
						pointEraseChangedRef.current = false;
						setStrokes((previous) => {
							const next = eraseStrokesAtPoint(previous, world, eraserHitRadiusRef.current);
							if (next !== previous) pointEraseChangedRef.current = true;
							return next;
						});
						currentStrokeRef.current = null;
					} else {
						const newStroke: Stroke = {
							points: [world],
							tool,
							colorIndex: tool === "pen" ? activePenColorIndex : undefined,
							thicknessIndex: tool === "pen" ? activePenThicknessIndex : undefined,
						};
						currentStrokeRef.current = newStroke;
						scheduleLiveDraw();
						lastPenSampleRef.current = tool === "pen" ? { point: world, timeMs: e.nativeEvent.timeStamp } : null;
					}
					lastPointRef.current = world;
				} else {
					panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
				}
			}
		},
		[pan, scale, screenToWorld, tool, readOnly, editorMode, onEditInteraction, eraserMode, activePenColorIndex, activePenThicknessIndex, allowViewportNavigation, onSelectTextBoxes, scheduleLiveDraw, redrawStaticLayers]
	);

	const handlePointerMove = useCallback(
		(e: React.PointerEvent) => {
			const ignoreTouch = e.pointerType === "touch" && (penPointerIdsRef.current.size > 0 || !allowViewportNavigation);
			if (ignoreTouch) return;
			e.preventDefault();
			const isIPadFinger = e.pointerType === "touch" && isIPad();
			const isTextPlaceMode = editorMode === "text" && tool !== "lasso";
			if (readOnly && tool !== "lasso" && !isIPadFinger && !isTextPlaceMode) return;
			const pointers = pointerIdsRef.current;
			const rect = canvasRef.current?.getBoundingClientRect();
			if (!rect) return;

			pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
			const lassoTap = lassoTapRef.current;
			if (lassoTap && !lassoTap.moved) {
				const distance = Math.hypot(e.clientX - lassoTap.startX, e.clientY - lassoTap.startY);
				if (distance > TAP_SELECT_MOVE_PX) {
					lassoTap.moved = true;
					const world = screenToWorld(e.clientX, e.clientY);
					setLassoPath([lassoTap.world, world]);
					isDrawingRef.current = true;
					return;
				}
			}
			const textTap = textTapRef.current;
			if (textTap && !textTap.moved) {
				const distance = Math.hypot(e.clientX - textTap.startX, e.clientY - textTap.startY);
				if (distance > TAP_SELECT_MOVE_PX) textTap.moved = true;
			}

			if (pointers.size === 2 && pinchStartRef.current) {
				const [a, b] = Array.from(pointers.entries());
				const dx = a[1].x - b[1].x;
				const dy = a[1].y - b[1].y;
				const distance = Math.hypot(dx, dy);
				const center = { x: (a[1].x + b[1].x) / 2 - rect.left, y: (a[1].y + b[1].y) / 2 - rect.top };
				const start = pinchStartRef.current;
				// Zoom: scale by distance ratio
				const ratio = distance / start.distance;
				let newScale = start.scale * ratio;
				newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
				// Pan: keep point under center fixed when zooming
				const scaleRatio = newScale / start.scale;
				let newPanX = center.x - (center.x - start.pan.x) * scaleRatio;
				let newPanY = center.y - (center.y - start.pan.y) * scaleRatio;
				// Two-finger pan: add movement of center between fingers
				const deltaCenterX = center.x - start.center.x;
				const deltaCenterY = center.y - start.center.y;
				newPanX += deltaCenterX;
				newPanY += deltaCenterY;
				setScale(newScale);
				setPan({ x: newPanX, y: newPanY });
				pinchStartRef.current = { distance, center, scale: newScale, pan: { x: newPanX, y: newPanY } };
				return;
			}

			if (panStartRef.current && pointers.size === 1) {
				const dx = e.clientX - panStartRef.current.x;
				const dy = e.clientY - panStartRef.current.y;
				setPan({ x: panStartRef.current.panX + dx, y: panStartRef.current.panY + dy });
				return;
			}

			if (transformSessionRef.current) {
				const world = screenToWorld(e.clientX, e.clientY);
				applyTransformFromSession(world);
				return;
			}

			if (tool === "lasso" && isDrawingRef.current && lassoPath) {
				const world = screenToWorld(e.clientX, e.clientY);
				setLassoPath((prev) => (prev ? [...prev, world] : [world]));
				return;
			}

			if (tool === "eraser" && eraserMode === "point" && isDrawingRef.current) {
				const world = screenToWorld(e.clientX, e.clientY);
				setStrokes((previous) => {
					const next = eraseStrokesAtPoint(previous, world, eraserHitRadiusRef.current);
					if (next !== previous) pointEraseChangedRef.current = true;
					return next;
				});
				return;
			}

			const liveStroke = currentStrokeRef.current;
			if (isDrawingRef.current && liveStroke) {
				const world = screenToWorld(e.clientX, e.clientY);
				world.pressure = getPressure(e.nativeEvent);
				if (liveStroke.tool === "pen") {
					const sampled = appendSampledPointsFixedHz(
						liveStroke.points,
						world,
						e.nativeEvent.timeStamp,
						lastPenSampleRef.current,
					);
					lastPenSampleRef.current = sampled.lastSample;
					currentStrokeRef.current = { ...liveStroke, points: sampled.points };
					scheduleLiveDraw();
				} else {
					currentStrokeRef.current = { ...liveStroke, points: [...liveStroke.points, world] };
					scheduleLiveDraw();
				}
				lastPointRef.current = world;
				if (liveStroke.tool === "pen") scheduleHoldStraighten();
			}
		},
		[screenToWorld, scheduleHoldStraighten, scheduleLiveDraw, readOnly, editorMode, tool, lassoPath, applyTransformFromSession, eraserMode, allowViewportNavigation]
	);

	const handlePointerUp = useCallback(
		(e: React.PointerEvent) => {
			if (e.pointerType === "pen") penPointerIdsRef.current.delete(e.pointerId);
			const ignoreTouch = e.pointerType === "touch" && (penPointerIdsRef.current.size > 0 || !allowViewportNavigation);
			if (ignoreTouch && !pointerIdsRef.current.has(e.pointerId)) return;
			e.preventDefault();
			const canvas = canvasRef.current;
			if (canvas) canvas.releasePointerCapture(e.pointerId);
			pointerIdsRef.current.delete(e.pointerId);

			if (pointerIdsRef.current.size === 0) {
				const textTap = textTapRef.current;
				if (editorMode === "text" && tool !== "lasso" && textTap && !textTap.moved) {
					const created = createBlankCanvasTextBox(
						captureTextBoxesRef.current,
						textTap.world.x,
						textTap.world.y,
						textBoxDefaultsRef.current ?? {
							fontSize: 18,
							colorIndex: 0,
							fontWeight: "normal",
							fontStyle: "normal",
							listStyle: "none",
						},
					);
					if (created) {
						onTextBoxesChange?.([...captureTextBoxesRef.current, created]);
						onSelectTextBoxes?.([created.id]);
					}
				}
				textTapRef.current = null;
				pinchStartRef.current = null;
				panStartRef.current = null;
				cancelHoldStraighten();
				if (transformSessionRef.current) {
					commitTransformSession();
				}
				if (tool === "eraser" && eraserMode === "point" && pointEraseBaseRef.current) {
					if (pointEraseChangedRef.current) {
						setUndoStack((history) => [...history, pointEraseBaseRef.current as Stroke[]]);
						setRedoStack([]);
					}
					pointEraseBaseRef.current = null;
					pointEraseChangedRef.current = false;
				}
				if (tool === "lasso") {
					const lassoTap = lassoTapRef.current;
					if (lassoTap && !lassoTap.moved) {
						selectAtWorldPoint(lassoTap.world);
					} else if (isDrawingRef.current && lassoPath && lassoPath.length >= LASSO_MIN_POINTS) {
						const selected = strokesRef.current
							.map((stroke, index) => ({ stroke, index }))
							.filter(({ stroke }) => stroke.tool === "pen")
							.filter(({ stroke }) => strokeIntersectsPolygon(stroke, lassoPath))
							.map(({ index }) => index);
						setSelectedStrokeIndexes(selected);
						const containedObjects = objectsRef.current.filter((object) =>
							!object.pinnedToSide &&
							rectFullyInsidePolygon(object.x, object.y, object.width, object.height, lassoPath)
						);
						setSelectedObjectIds(containedObjects.map((object) => object.id));
						const containedTextIds = captureTextBoxes
							.filter((box) => {
								if (!box.id) return false;
								const content = getTextContentBounds({
									text: box.text,
									x: box.x,
									y: box.y,
									width: box.width,
									height: box.height,
									fontSize: box.fontSize,
								});
								return Boolean(content && rectFullyInsidePolygon(content.x, content.y, content.width, content.height, lassoPath));
							})
							.map((box) => box.id)
							.filter((id): id is string => Boolean(id));
						onSelectTextBoxes?.(containedTextIds);
					}
					setLassoPath(null);
					lassoTapRef.current = null;
				}
				const liveStroke = currentStrokeRef.current;
				if (isDrawingRef.current && liveStroke && liveStroke.points.length > 0) {
					const world = screenToWorld(e.clientX, e.clientY);
					world.pressure = getPressure(e.nativeEvent);
					let finalizedStroke = liveStroke;
					if (liveStroke.tool === "pen") {
						const lastPoint = liveStroke.points[liveStroke.points.length - 1];
						if (!lastPoint || lastPoint.x !== world.x || lastPoint.y !== world.y) {
							finalizedStroke = { ...liveStroke, points: [...liveStroke.points, world] };
						}
					}
					if (liveStroke.tool === "eraser") {
						if (eraserMode === "stroke") {
							commitStrokeChange((previous) => {
								const next = previous.filter(
									(stroke) => stroke.tool !== "pen" || !strokeIntersectsEraser(stroke, liveStroke, eraserHitRadiusRef.current)
								);
								return next.length === previous.length ? previous : next;
							});
						} else {
							commitStrokeChange((previous) => [...previous, liveStroke]);
						}
					} else {
						skipNextCommittedRedrawRef.current = appendCommittedStroke(finalizedStroke);
						commitStrokeChange((previous) => [...previous, finalizedStroke]);
					}
					currentStrokeRef.current = null;
					lastPenSampleRef.current = null;
					scheduleLiveDraw();
				}
				isDrawingRef.current = false;
				if (tool !== "lasso") lassoTapRef.current = null;
			}
		},
		[cancelHoldStraighten, commitStrokeChange, tool, lassoPath, commitTransformSession, eraserMode, allowViewportNavigation, selectAtWorldPoint, captureTextBoxes, onSelectTextBoxes, editorMode, onTextBoxesChange, scheduleLiveDraw, screenToWorld, appendCommittedStroke]
	);

	const handleWheel = useCallback(
		(e: React.WheelEvent) => {
			if (!allowViewportNavigation) return;
			e.preventDefault();
			if (readOnly && editorMode !== "text") return;
			const canvas = canvasRef.current;
			if (!canvas) return;
			const rect = canvas.getBoundingClientRect();
			const mouseX = e.clientX - rect.left;
			const mouseY = e.clientY - rect.top;
			const delta = e.deltaY > 0 ? -0.1 : 0.1;
			const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * (1 + delta)));
			const scaleRatio = newScale / scale;
			const newPanX = mouseX - (mouseX - pan.x) * scaleRatio;
			const newPanY = mouseY - (mouseY - pan.y) * scaleRatio;
			setScale(newScale);
			setPan({ x: newPanX, y: newPanY });
		},
		[pan, scale, readOnly, editorMode, allowViewportNavigation]
	);

	const clearCanvas = useCallback(() => {
		commitStrokeChange((previous) => (previous.length > 0 ? [] : previous));
		currentStrokeRef.current = null;
		setLassoPath(null);
		setSelectedStrokeIndexes([]);
		lastPenSampleRef.current = null;
		setTransformSession(null);
		// Immediately notify parent of clear (bypass debounce)
		onStrokesChangeRef.current?.([]);
	}, [commitStrokeChange]);

	const deleteSelectedStrokes = useCallback(() => {
		const selectedSet = new Set(selectedStrokeIndexesRef.current);
		if (selectedSet.size === 0) return;
		commitStrokeChange((previous) => previous.filter((_, index) => !selectedSet.has(index)));
		setSelectedStrokeIndexes([]);
		setTransformSession(null);
		setLassoPath(null);
	}, [commitStrokeChange]);

	const deleteSelection = useCallback(() => {
		deleteSelectedStrokes();
		const objectIds = selectedObjectIdsRef.current;
		const removable = objectIds.filter((id) => !isQuestionAttachmentObjectId(id));
		if (removable.length > 0) {
			const remove = new Set(removable);
			setObjects((previous) => previous.filter((object) => !remove.has(object.id)));
		}
		setSelectedObjectIds(objectIds.filter((id) => isQuestionAttachmentObjectId(id)));
		const textIds = selectedTextBoxIdsRef.current;
		if (textIds.length > 0) {
			const remove = new Set(textIds);
			onTextBoxesChange?.(captureTextBoxesRef.current.filter((box) => !box.id || !remove.has(box.id)));
			onSelectTextBoxes?.([]);
		}
	}, [deleteSelectedStrokes, onTextBoxesChange, onSelectTextBoxes]);

	// --- Attached objects (images / PDF pages) ---

	/** Compute a nicely-sized, centered placement (world coords) for a new object. */
	const placeObjectRect = useCallback((naturalWidth: number, naturalHeight: number) => {
		const rect = canvasRef.current?.getBoundingClientRect();
		const viewportW = rect?.width ?? 800;
		const viewportH = rect?.height ?? 600;
		const currentScale = scaleRef.current || 1;
		const currentPan = panRef.current;
		const maxWorldW = (viewportW * 0.6) / currentScale;
		const maxWorldH = (viewportH * 0.7) / currentScale;
		const ratio = Math.min(maxWorldW / naturalWidth, maxWorldH / naturalHeight, 1);
		const width = Math.max(40, naturalWidth * ratio);
		const height = Math.max(40, naturalHeight * ratio);
		const centerWorldX = (viewportW / 2 - currentPan.x) / currentScale;
		const centerWorldY = (viewportH / 2 - currentPan.y) / currentScale;
		return { x: centerWorldX - width / 2, y: centerWorldY - height / 2, width, height };
	}, []);

	/**
	 * Place a question strip: moderately wide, top-aligned/centered horizontally.
	 * Tall papers still extend past the bottom; short ones are not forced to overflow.
	 */
	const placeTallQuestionRect = useCallback((naturalWidth: number, naturalHeight: number) => {
		const rect = canvasRef.current?.getBoundingClientRect();
		const viewportW = rect?.width ?? 800;
		const currentScale = scaleRef.current || 1;
		const currentPan = panRef.current;
		const maxWorldW = (viewportW * 0.55) / currentScale;
		const ratio = Math.min(1, maxWorldW / Math.max(1, naturalWidth));
		const width = Math.max(40, naturalWidth * ratio);
		const height = Math.max(40, naturalHeight * ratio);
		const centerWorldX = (viewportW / 2 - currentPan.x) / currentScale;
		const topMarginWorld = 56 / currentScale;
		const topWorldY = (0 - currentPan.y) / currentScale + topMarginWorld;
		return { x: centerWorldX - width / 2, y: topWorldY, width, height };
	}, []);

	const resolveAssetUrl = useCallback(
		async (blob: Blob): Promise<string> => {
			if (onUploadImage) {
				try {
					return await onUploadImage(blob);
				} catch (err) {
					console.error("[DrawingCanvas] asset upload failed, embedding inline:", err);
				}
			}
			return blobToDataUrl(blob);
		},
		[onUploadImage]
	);

	const handleAttachFiles = useCallback(
		async (files: FileList | null) => {
			if (!files || files.length === 0) return;
			setAttachError(null);
			setIsAttaching(true);
			const unsupported: string[] = [];
			const failed: string[] = [];
			const tooLarge: string[] = [];
			try {
				const created: CanvasObject[] = [];
				const pendingUpgrades: { id: string; blob: Blob; localSrc: string }[] = [];
				const gap = 24;
				let stackX: number | null = null;
				let stackY: number | null = null;

				const pushObject = (localSrc: string, naturalW: number, naturalH: number, blob: Blob) => {
					const placed = placeObjectRect(naturalW, naturalH);
					if (stackX == null || stackY == null) {
						stackX = placed.x;
						stackY = placed.y;
					}
					const obj: CanvasObject = {
						id: genObjectId(),
						src: localSrc,
						x: stackX,
						y: stackY,
						width: placed.width,
						height: placed.height,
					};
					stackY += placed.height + gap;
					created.push(obj);
					pendingUpgrades.push({ id: obj.id, blob, localSrc });
				};

				const isPdf = (file: File) =>
					file.type === "application/pdf" ||
					file.name.toLowerCase().endsWith(".pdf");
				const isImage = (file: File) =>
					file.type.startsWith("image/") ||
					/\.(png|jpe?g|gif|webp|bmp|svg|heic|heif)$/i.test(file.name);

				for (const file of Array.from(files)) {
					if (file.size > MAX_ATTACH_BYTES) {
						tooLarge.push(file.name);
						continue;
					}
					if (isPdf(file)) {
						let pageUrls: string[] = [];
						try {
							pageUrls = await renderPdfPages(file);
						} catch (err) {
							console.error("[DrawingCanvas] failed to render PDF:", err);
							failed.push(file.name);
							continue;
						}
						if (pageUrls.length === 0) {
							failed.push(file.name);
							continue;
						}
						for (const pageUrl of pageUrls) {
							try {
								const rawBlob = await dataUrlToBlob(pageUrl);
								const blob = await prepareImageForCanvas(rawBlob, { maxDim: 2400 });
								const localSrc = URL.createObjectURL(blob);
								localBlobUrlsRef.current.add(localSrc);
								const { width, height } = await loadImageSize(localSrc);
								pushObject(localSrc, width, height, blob);
							} catch (err) {
								console.error("[DrawingCanvas] failed to attach PDF page:", err);
								failed.push(file.name);
								break;
							}
						}
					} else if (isImage(file)) {
						try {
							const prepared = await prepareImageForCanvas(file);
							const localSrc = URL.createObjectURL(prepared);
							localBlobUrlsRef.current.add(localSrc);
							let dims = { width: 400, height: 300 };
							try {
								dims = await loadImageSize(localSrc);
							} catch {
								/* use fallback size */
							}
							pushObject(localSrc, dims.width, dims.height, prepared);
						} catch (err) {
							console.error("[DrawingCanvas] failed to attach image:", err);
							failed.push(file.name);
						}
					} else {
						unsupported.push(file.name);
					}
				}

				// Place objects immediately with local blob URLs so they render before upload.
				if (created.length > 0) {
					setObjects((prev) => [...prev, ...created]);
					setTool("lasso");
					setSelectedObjectIds([created[0].id]);
				}

				if (unsupported.length > 0 || failed.length > 0 || tooLarge.length > 0) {
					const parts: string[] = [];
					if (tooLarge.length > 0) {
						parts.push(
							tooLarge.length === 1
								? `"${tooLarge[0]}" is over 25 MB`
								: `${tooLarge.length} files are over 25 MB`
						);
					}
					if (unsupported.length > 0) {
						parts.push(
							unsupported.length === 1
								? `"${unsupported[0]}" isn't an image or PDF`
								: `${unsupported.length} files weren't images or PDFs`
						);
					}
					if (failed.length > 0) {
						parts.push(
							failed.length === 1
								? `couldn't open "${failed[0]}"`
								: `couldn't open ${failed.length} files`
						);
					}
					showAttachError(
						`${parts.join(" · ")}. Only images and PDFs up to 25 MB can be added.`
					);
				}

				// Upgrade local blob URLs to durable storage URLs in the background.
				for (const pending of pendingUpgrades) {
					void (async () => {
						try {
							const durable = await resolveAssetUrl(pending.blob);
							await upgradeObjectSrc(pending.id, durable, pending.localSrc);
						} catch (err) {
							console.error("[DrawingCanvas] durable upload failed, keeping local preview:", err);
						}
					})();
				}
			} catch (err) {
				console.error("[DrawingCanvas] attach failed:", err);
				showAttachError("Something went wrong adding that file. Please try again.");
			} finally {
				setIsAttaching(false);
			}
		},
		[placeObjectRect, resolveAssetUrl, showAttachError, upgradeObjectSrc]
	);

	const attachQuestionImages = useCallback<AttachQuestionImagesFn>(
		async (attachmentId, imageUrls) => {
			const urls = imageUrls.map((u) => u.trim()).filter(Boolean);
			if (!attachmentId || urls.length === 0) return false;
			const objectId = questionAttachmentObjectId(attachmentId);
			if (objectsRef.current.some((o) => o.id === objectId)) return true;

			try {
				let blob: Blob;
				let dims: { width: number; height: number };

				if (urls.length === 1) {
					// Fast path: single page — skip stitch + extra decode passes.
					const loaded = await loadHtmlImage(urls[0]);
					try {
						const img = loaded.img;
						const sourceW = Math.max(1, img.naturalWidth || 1);
						const sourceH = Math.max(1, img.naturalHeight || 1);
						const targetW = Math.min(sourceW, 1400);
						const scale = targetW / sourceW;
						const targetH = Math.max(1, Math.round(sourceH * scale));
						const canvas = document.createElement("canvas");
						canvas.width = targetW;
						canvas.height = targetH;
						const ctx = canvas.getContext("2d");
						if (!ctx) throw new Error("Could not create question canvas");
						ctx.fillStyle = "#ffffff";
						ctx.fillRect(0, 0, targetW, targetH);
						ctx.drawImage(img, 0, 0, targetW, targetH);
						blob = await new Promise<Blob>((resolve, reject) => {
							canvas.toBlob(
								(out) => (out ? resolve(out) : reject(new Error("Failed to encode question image"))),
								"image/jpeg",
								0.85
							);
						});
						dims = { width: targetW, height: targetH };
					} finally {
						loaded.revoke?.();
					}
				} else {
					const stitched = await stitchImagesVertically(urls);
					blob = stitched.blob;
					dims = { width: stitched.width, height: stitched.height };
				}

				const localSrc = URL.createObjectURL(blob);
				localBlobUrlsRef.current.add(localSrc);
				await preloadObjectImage(localSrc);
				const placed = placeTallQuestionRect(dims.width, dims.height);
				const obj: CanvasObject = {
					id: objectId,
					src: localSrc,
					x: placed.x,
					y: placed.y,
					width: placed.width,
					height: placed.height,
				};
				setObjects((prev) => (prev.some((o) => o.id === objectId) ? prev : [...prev, obj]));
				setObjectImagesVersion((v) => v + 1);
				// Keep the user's current tool — don't yank into lasso on auto-place.

				void (async () => {
					try {
						const durable = await resolveAssetUrl(blob);
						await upgradeObjectSrc(objectId, durable, localSrc);
					} catch (err) {
						console.error("[DrawingCanvas] question image upload failed, keeping local preview:", err);
					}
				})();

				return true;
			} catch (err) {
				console.error("[DrawingCanvas] failed to attach question images:", err);
				return false;
			}
		},
		[placeTallQuestionRect, resolveAssetUrl, upgradeObjectSrc, preloadObjectImage]
	);

	useEffect(() => {
		if (!registerAttachQuestionImages) return;
		registerAttachQuestionImages(attachQuestionImages);
		return () => registerAttachQuestionImages(null);
	}, [attachQuestionImages, registerAttachQuestionImages]);

	const restoreCanvasObject = useCallback<RestoreCanvasObjectFn>(
		(object) => {
			if (!object?.id || !object.src) return;
			const restored = { ...object, pinnedToSide: false };
			void preloadObjectImage(restored.src).then(() => {
				setObjects((prev) => {
					const exists = prev.some((o) => o.id === restored.id);
					if (exists) {
						return prev.map((o) => (o.id === restored.id ? restored : o));
					}
					return [...prev, restored];
				});
				setObjectImagesVersion((v) => v + 1);
			});
		},
		[preloadObjectImage]
	);

	useEffect(() => {
		if (!registerRestoreCanvasObject) return;
		registerRestoreCanvasObject(restoreCanvasObject);
		return () => registerRestoreCanvasObject(null);
	}, [registerRestoreCanvasObject, restoreCanvasObject]);

	useEffect(() => {
		if (!registerAttachFiles) return;
		registerAttachFiles(handleAttachFiles);
		return () => registerAttachFiles(null);
	}, [registerAttachFiles, handleAttachFiles]);

	const pinSelectionToSide = useCallback(() => {
		if (!onPinObjectToSide) return;
		const selected = new Set(selectedObjectIdsRef.current);
		const toPin = objectsRef.current.filter((object) => selected.has(object.id) && !object.pinnedToSide);
		if (toPin.length === 0) return;
		const pinIds = new Set(toPin.map((object) => object.id));
		setObjects((previous) =>
			previous.map((object) => (pinIds.has(object.id) ? { ...object, pinnedToSide: true } : object))
		);
		setSelectedObjectIds((ids) => ids.filter((id) => !pinIds.has(id)));
		for (const object of toPin) {
			onPinObjectToSide({ ...object, pinnedToSide: true });
		}
	}, [onPinObjectToSide]);

	const beginGroupMove = useCallback(
		(e: React.PointerEvent) => {
			e.preventDefault();
			e.stopPropagation();
			const startStrokes = strokesRef.current;
			const startObjects = objectsRef.current;
			const startTextBoxes = captureTextBoxesRef.current;
			const strokeIndexes = [...selectedStrokeIndexesRef.current];
			const objectIds = [...selectedObjectIdsRef.current];
			const textIds = [...selectedTextBoxIdsRef.current];
			if (strokeIndexes.length === 0 && objectIds.length === 0 && textIds.length === 0) return;
			const startClientX = e.clientX;
			const startClientY = e.clientY;
			const objectIdSet = new Set(objectIds);
			const textIdSet = new Set(textIds);

			const onMove = (ev: PointerEvent) => {
				const currentScale = scaleRef.current || 1;
				const dxWorld = (ev.clientX - startClientX) / currentScale;
				const dyWorld = (ev.clientY - startClientY) / currentScale;
				if (strokeIndexes.length > 0) {
					const bounds = getSelectionBounds(startStrokes, strokeIndexes);
					const center = bounds
						? { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }
						: { x: 0, y: 0 };
					setStrokes(transformSelectedStrokes(startStrokes, strokeIndexes, center, { dx: dxWorld, dy: dyWorld }));
				}
				if (objectIds.length > 0) {
					setObjects(
						startObjects.map((object) =>
							objectIdSet.has(object.id)
								? { ...object, x: object.x + dxWorld, y: object.y + dyWorld }
								: object
						)
					);
				}
				if (textIds.length > 0) {
					onTextBoxesChange?.(
						startTextBoxes.map((box) =>
							box.id && textIdSet.has(box.id)
								? { ...box, x: box.x + dxWorld, y: box.y + dyWorld }
								: box
						)
					);
				}
			};
			const onUp = () => {
				if (strokeIndexes.length > 0) {
					const after = strokesRef.current;
					const changed =
						after.length !== startStrokes.length ||
						after.some((stroke, index) => stroke !== startStrokes[index]);
					if (changed) {
						setUndoStack((history) => [...history, startStrokes]);
						setRedoStack([]);
					}
				}
				window.removeEventListener("pointermove", onMove);
				window.removeEventListener("pointerup", onUp);
				window.removeEventListener("pointercancel", onUp);
			};
			window.addEventListener("pointermove", onMove);
			window.addEventListener("pointerup", onUp);
			window.addEventListener("pointercancel", onUp);
		},
		[onTextBoxesChange]
	);

	const undo = useCallback(() => {
		if (undoStackRef.current.length === 0) return;
		onEditInteraction?.();
		cancelHoldStraighten();
		currentStrokeRef.current = null;
		isDrawingRef.current = false;
		setLassoPath(null);
		setTransformSession(null);
		setSelectedStrokeIndexes([]);
		lastPenSampleRef.current = null;
		setUndoStack((history) => {
			if (history.length === 0) return history;
			const previous = history[history.length - 1];
			setRedoStack((future) => [...future, strokesRef.current]);
			setStrokes(previous);
			return history.slice(0, -1);
		});
	}, [cancelHoldStraighten, onEditInteraction]);

	const redo = useCallback(() => {
		if (redoStackRef.current.length === 0) return;
		onEditInteraction?.();
		cancelHoldStraighten();
		currentStrokeRef.current = null;
		isDrawingRef.current = false;
		setLassoPath(null);
		setTransformSession(null);
		setSelectedStrokeIndexes([]);
		setRedoStack((future) => {
			if (future.length === 0) return future;
			const next = future[future.length - 1];
			setUndoStack((history) => [...history, strokesRef.current]);
			setStrokes(next);
			return future.slice(0, -1);
		});
	}, [cancelHoldStraighten, onEditInteraction]);

	const isEmbedded = onClose == null;
	const isTextEditorMode = editorMode === "text";
	const hasUnifiedEditor = editorMode != null && Boolean(onRequestTextMode);
	const isSelectMode = tool === "lasso";
	const isTextMode = Boolean(hasUnifiedEditor && isTextEditorMode && !isSelectMode);
	const isEraseMode = !isTextMode && tool === "eraser";
	const isPenMode = !isTextMode && !isSelectMode && tool === "pen";
	const showToolbar = !suppressToolbar && (hasUnifiedEditor || !readOnly);
	const interactionLocked = readOnly && tool !== "lasso";
	const canUndo = isTextMode ? true : undoStack.length > 0;
	const canRedo = isTextMode ? true : redoStack.length > 0;
	const handleUndo = () => {
		if (isTextMode && textFormat?.onUndo) {
			textFormat.onUndo();
			return;
		}
		undo();
	};
	const handleRedo = () => {
		if (isTextMode && textFormat?.onRedo) {
			textFormat.onRedo();
			return;
		}
		redo();
	};
	const closeToolPopovers = () => {
		setIsPenPopoverOpen(false);
		setIsEraserPopoverOpen(false);
		setIsGridPopoverOpen(false);
		setIsAttachPopoverOpen(false);
	};
	const ensurePenMode = () => {
		if (isTextEditorMode) onRequestPenMode?.();
	};
	const selectPenColor = (index: number) => {
		setActivePenColorIndex(index);
		if (isTextMode) textFormat?.onColorChange?.(index);
	};
	const toolbarButtonClass = "flex h-7 w-7 shrink-0 items-center justify-center rounded-in transition-colors color-txt-main hover:color-bg-grey-10 disabled:opacity-40 disabled:cursor-not-allowed";
	const toolbarActiveClass = "color-bg-accent color-txt-accent";
	const toolbarSeparator = <span className="mx-1 h-4 w-px shrink-0 color-bg-grey-10" aria-hidden />;
	const toolbarSliderStyle = {
		["--slider-track-color" as string]: mutedBgColor || "rgba(128, 128, 128, 0.3)",
		["--slider-thumb-color" as string]: accentColor || strokeColor || "#2563EB",
	};
	const penButtonRect = penButtonRef.current?.getBoundingClientRect() ?? null;
	const eraserButtonRect = eraserButtonRef.current?.getBoundingClientRect() ?? null;
	const gridButtonRect = gridButtonRef.current?.getBoundingClientRect() ?? null;
	const attachButtonRect = attachButtonRef.current?.getBoundingClientRect() ?? null;
	const popoverAnchorStyle = (rect: DOMRect) => ({
		left: rect.left + rect.width / 2,
		top: topToolbar ? rect.bottom + 10 : rect.top - 10,
		transform: topToolbar ? "translateX(-50%)" : "translate(-50%, -100%)",
		// Below modal overlays (z-50+) so backdrop blur covers the toolbar chrome.
		zIndex: 45,
	});
	const showAttachPopover = enableAttachments && !onAttachRequest;
	const groupSelectionBounds = (() => {
		if (tool !== "lasso") return null;
		let bounds = getSelectionBounds(strokes, selectedStrokeIndexes);
		for (const object of objects) {
			if (object.pinnedToSide || !selectedObjectIds.includes(object.id)) continue;
			bounds = unionRect(bounds, object.x, object.y, object.width, object.height);
		}
		for (const box of captureTextBoxes) {
			if (!box.id || !selectedTextBoxIds.includes(box.id)) continue;
			bounds = unionRect(bounds, box.x, box.y, box.width, box.height);
		}
		return bounds;
	})();
	const groupSelectionScreen = (() => {
		if (!groupSelectionBounds) return null;
		const rect = canvasRef.current?.getBoundingClientRect();
		if (!rect) return null;
		const pad = 8;
		const left = rect.left + groupSelectionBounds.minX * scale + pan.x - pad;
		const top = rect.top + groupSelectionBounds.minY * scale + pan.y - pad;
		const width = (groupSelectionBounds.maxX - groupSelectionBounds.minX) * scale + pad * 2;
		const height = (groupSelectionBounds.maxY - groupSelectionBounds.minY) * scale + pad * 2;
		return {
			left,
			top,
			width,
			height,
			centerX: left + width / 2,
			centerY: top + height / 2,
		};
	})();
	const canDeleteSelection =
		selectedStrokeIndexes.length > 0 ||
		selectedTextBoxIds.length > 0 ||
		selectedObjectIds.some((id) => !isQuestionAttachmentObjectId(id));
	const canPinSelection =
		Boolean(onPinObjectToSide) &&
		objects.some((object) => selectedObjectIds.includes(object.id) && !object.pinnedToSide);
	const groupChromeAccent = accentColor || strokeColor || "#2563EB";
	const overlayBubbles = showGradingOverlay ? badgeLayoutsRef.current.map((badge) => {
		const expanded = expandedCommentId === badge.id;
		
		// Compute single anchor point at error box top-right
		let anchorScreenX: number;
		let anchorScreenY: number;
		
		if (badge.errorBoxWorld) {
			// Anchor: error box right edge + 12px (screen space), error box top edge
			const anchorWorldX = badge.errorBoxWorld.right + 12 / scale;
			const anchorWorldY = badge.errorBoxWorld.top;
			anchorScreenX = anchorWorldX * scale + pan.x + 12;
			anchorScreenY = anchorWorldY * scale + pan.y;
		} else {
			// Fallback to badge world position
			anchorScreenX = badge.worldX * scale + pan.x;
			anchorScreenY = badge.worldY * scale + pan.y;
		}
		
		// Tail transition: centered when collapsed, at top when expanded
		const tailTop = expanded ? "14px" : "50%";
		const tailTransformY = expanded ? "translateY(0)" : "translateY(-50%)";
		
		return { badge, anchorScreenX, anchorScreenY, expanded, tailTop, tailTransformY };
	}) : [];



	return (
		<div
			ref={containerRef}
			className={`drawing-canvas-wrapper flex flex-col select-none ${wrapperClassName ?? "color-bg"} ${isEmbedded ? "absolute inset-0" : "fixed inset-0 z-50"}`}
			style={{
				touchAction: allowViewportNavigation ? "none" : "pan-y",
				WebkitUserSelect: "none",
				userSelect: "none",
				WebkitTouchCallout: "none",
				WebkitTapHighlightColor: "transparent",
			}}
		>
			{/* Hidden elements to sample theme colors (pen: color-txt-main, grid: color-bg-grey-5) */}
			<div ref={colorSampleRef} className="color-txt-main absolute opacity-0 w-0 h-0 pointer-events-none" aria-hidden />
			<div ref={secondaryColorSampleRef} className="color-txt-sub absolute opacity-0 w-0 h-0 pointer-events-none" aria-hidden />
			<div ref={gridColorSampleRef} className="color-bg-grey-10 absolute opacity-0 w-0 h-0 pointer-events-none" aria-hidden />
			<div ref={accentColorSampleRef} className="color-txt-accent absolute opacity-0 w-0 h-0 pointer-events-none" aria-hidden />
			<div ref={mutedBgSampleRef} className="color-bg-grey-5 absolute opacity-0 w-0 h-0 pointer-events-none" aria-hidden />
			{enableAttachments && (
				<input
					ref={fileInputRef}
					type="file"
					accept="image/*,application/pdf"
					multiple
					className="hidden"
					onChange={(e) => {
						void handleAttachFiles(e.target.files);
						e.target.value = "";
					}}
				/>
			)}
			{/* Canvas area */}
			<div
				className="flex-1 min-h-0 relative z-0 overflow-hidden select-none"
				style={{ WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none" }}
			>
				{/* Images / PDF pages — separate layer so ink eraser doesn't punch through them */}
				<canvas
					ref={objectsCanvasRef}
					className="absolute inset-0 w-full h-full block pointer-events-none"
					aria-hidden
				/>
				{/* Completed ink is retained separately so pen movement only repaints the live stroke. */}
				<canvas
					ref={committedInkCanvasRef}
					className="absolute inset-0 w-full h-full block pointer-events-none"
					aria-hidden
				/>
				<canvas
					ref={canvasRef}
					tabIndex={-1}
					className="absolute inset-0 w-full h-full block"
					onPointerDown={handlePointerDown}
					onPointerDownCapture={(e) => {
						if (e.pointerType === "touch" && !allowViewportNavigation) return;
						e.preventDefault();
					}}
					onPointerMove={handlePointerMove}
					onPointerUp={handlePointerUp}
					onPointerCancel={handlePointerUp}
					onPointerLeave={handlePointerUp}
					onWheel={handleWheel}
					onContextMenu={(e) => e.preventDefault()}
					style={{
						touchAction: allowViewportNavigation ? "none" : "pan-y",
						cursor: tool === "eraser" ? "cell" : tool === "lasso" ? "default" : "crosshair",
						WebkitUserSelect: "none",
						userSelect: "none",
						WebkitTouchCallout: "none",
						WebkitTapHighlightColor: "transparent",
					}}
				/>
				{!interactionLocked && groupSelectionScreen && createPortal(
					<>
						<div
							className="fixed z-[2090] pointer-events-none rounded-[4px]"
							style={{
								left: groupSelectionScreen.left,
								top: groupSelectionScreen.top,
								width: groupSelectionScreen.width,
								height: groupSelectionScreen.height,
								border: `1.5px solid ${groupChromeAccent}`,
							}}
						/>
						{(canDeleteSelection || canPinSelection) && (
							<div
								className="fixed z-[2100] flex items-center gap-1"
								style={{
									left: groupSelectionScreen.centerX,
									top: groupSelectionScreen.top - 8,
									transform: "translate(-50%, -100%)",
								}}
							>
								{canPinSelection && (
									<button
										type="button"
										onPointerDown={(e) => e.stopPropagation()}
										onClick={(e) => {
											e.stopPropagation();
											pinSelectionToSide();
										}}
										className="flex h-7 items-center gap-1 rounded-full color-bg color-shadow border color-txt-main px-2 hover:color-bg-grey-10"
										style={{
											borderColor: "color-mix(in srgb, currentColor 18%, transparent)",
										}}
										title="Pin to side"
										aria-label="Pin to side"
									>
										<Pin size={14} strokeWidth={2} />
									</button>
								)}
								{canDeleteSelection && (
									<button
										type="button"
										onPointerDown={(e) => e.stopPropagation()}
										onClick={(e) => {
											e.stopPropagation();
											deleteSelection();
										}}
										className="flex h-7 w-7 items-center justify-center rounded-full color-bg color-shadow border color-txt-main hover:color-bg-grey-10"
										style={{
											borderColor: "color-mix(in srgb, currentColor 18%, transparent)",
										}}
										title="Delete selection"
										aria-label="Delete selection"
									>
										<Trash2 size={14} strokeWidth={2} />
									</button>
								)}
							</div>
						)}
						<button
							type="button"
							onPointerDown={beginGroupMove}
							className="fixed z-[2100] flex h-7 w-7 items-center justify-center rounded-full color-bg color-shadow border color-txt-main hover:color-bg-grey-10"
							style={{
								left: groupSelectionScreen.centerX,
								top: groupSelectionScreen.centerY,
								transform: "translate(-50%, -50%)",
								cursor: "move",
								touchAction: "none",
								borderColor: "color-mix(in srgb, currentColor 18%, transparent)",
							}}
							title="Move selection"
							aria-label="Move selection"
						>
							<Move size={14} strokeWidth={2} />
						</button>
					</>,
					getThemedPortalTarget()
				)}
				{/* Attachment error toast (unsupported file types / failed loads) */}
				{!readOnly && enableAttachments && attachError && (
					<div
						className="absolute bottom-20 left-1/2 -translate-x-1/2 z-[2100] flex max-w-[min(90vw,26rem)] items-start gap-2 rounded-[var(--radius-out)] px-3 py-2 color-bg color-shadow border"
						style={{ borderColor: "color-mix(in srgb, currentColor 18%, transparent)" }}
						role="alert"
					>
						<Ban size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-red-500" />
						<span className="text-xs font-medium leading-snug color-txt-main">{attachError}</span>
						<button
							type="button"
							onClick={() => setAttachError(null)}
							className="ml-1 shrink-0 rounded-full p-0.5 color-txt-sub hover:color-bg-grey-10 transition-colors"
							aria-label="Dismiss"
						>
							<X size={14} strokeWidth={2} />
						</button>
					</div>
				)}
				{/* Portaled toolbar is measured against the canvas so overlay layers cannot steal clicks. */}
				{showToolbar && (() => {
				const toolbarClassName = topToolbar
					? "drawing-canvas-toolbar pointer-events-auto fixed z-40 flex items-center justify-center gap-0.5 overflow-x-auto color-bg px-3 py-1.5 scrollbar-minimal"
					: `drawing-canvas-toolbar pointer-events-auto ${portalToolbar ? "fixed" : "absolute"} bottom-4 left-1/2 -translate-x-1/2 z-40 flex h-8 max-w-[calc(100%-1rem)] items-center justify-center gap-0.5 px-1.5 rounded-out color-bg color-shadow border`;
				const toolbarSurfaceClassName = topToolbar
					? "flex h-8 min-w-0 max-w-full flex-nowrap items-center justify-center gap-0.5 overflow-x-auto overflow-y-hidden rounded-full color-bg-grey-5 px-2.5 scrollbar-minimal"
					: "contents";
				const toolbarStyle = topToolbar
					? {
						left: topToolbarBounds?.left ?? 0,
						top: topToolbarBounds?.top ?? 0,
						width: topToolbarBounds?.width ?? 0,
						visibility: topToolbarBounds ? "visible" as const : "hidden" as const,
					}
					: portalToolbar
						? {
							left: resolvedToolbarLeft ?? "50%",
							bottom: 16,
							...(animateToolbarLeft
								? { transition: "left 300ms cubic-bezier(0.25, 0.1, 0.25, 1)" }
								: null),
						}
						: undefined;
				const toolbar = (
				<div
					className={toolbarClassName}
					style={toolbarStyle}
				>
				<div className={toolbarSurfaceClassName}>
				{hasUnifiedEditor && (
					<>
						<button
							type="button"
							onPointerDown={(event) => { if (isTextMode) event.preventDefault(); }}
							onClick={() => {
								closeToolPopovers();
								setTool("pen");
								onRequestTextMode?.();
							}}
							className={`${toolbarButtonClass} ${isTextMode ? toolbarActiveClass : ""}`}
							title="Text"
							aria-label="Text"
							aria-pressed={isTextMode}
						>
							<Type size={16} strokeWidth={2} />
						</button>
						<button
							type="button"
							onPointerDown={(event) => { if (isTextMode) event.preventDefault(); }}
							onClick={() => {
								closeToolPopovers();
								setTool("pen");
								onRequestPenMode?.();
							}}
							className={`${toolbarButtonClass} ${isPenMode ? toolbarActiveClass : ""}`}
							title="Draw"
							aria-label="Draw"
							aria-pressed={isPenMode}
						>
							<Pencil size={16} strokeWidth={2} />
						</button>
						<button
							type="button"
							onPointerDown={(event) => { if (isTextMode) event.preventDefault(); }}
							onClick={() => {
								closeToolPopovers();
								setTool("eraser");
								onRequestPenMode?.();
							}}
							className={`${toolbarButtonClass} ${isEraseMode ? toolbarActiveClass : ""}`}
							title="Eraser"
							aria-label="Eraser"
							aria-pressed={isEraseMode}
						>
							<Eraser size={16} strokeWidth={2} />
						</button>
						<button
							type="button"
							onPointerDown={(event) => { if (isTextMode) event.preventDefault(); }}
							onClick={() => {
								closeToolPopovers();
								setTool("lasso");
							}}
							className={`${toolbarButtonClass} ${isSelectMode ? toolbarActiveClass : ""}`}
							title="Select"
							aria-label="Select"
							aria-pressed={isSelectMode}
						>
							<MousePointer2 size={16} strokeWidth={2} />
						</button>
						{toolbarSeparator}
						{isTextMode && textFormat ? (
							<>
								<div className="flex h-7 shrink-0 items-center justify-center gap-1.5 px-0.5">
									{penPalette.map((color, index) => (
										<button
											key={`${color}-${index}`}
											type="button"
											onPointerDown={(event) => event.preventDefault()}
											onClick={() => selectPenColor(index)}
											className={`size-4 shrink-0 rounded-full border-0 p-0 appearance-none transition-transform ${activePenColorIndex === index ? "scale-110 ring-2 ring-current/40" : ""}`}
											style={{ backgroundColor: color }}
											aria-label="Set colour"
											title="Set colour"
										/>
									))}
								</div>
								<button
									type="button"
									aria-pressed={textFormat.bold}
									className={`${toolbarButtonClass} ${textFormat.bold ? toolbarActiveClass : ""}`}
									onPointerDown={(event) => event.preventDefault()}
									onClick={textFormat.onToggleBold}
									title="Bold"
									aria-label="Bold"
								>
									<Bold size={16} strokeWidth={2} />
								</button>
								<button
									type="button"
									aria-pressed={textFormat.italic}
									className={`${toolbarButtonClass} ${textFormat.italic ? toolbarActiveClass : ""}`}
									onPointerDown={(event) => event.preventDefault()}
									onClick={textFormat.onToggleItalic}
									title="Italic"
									aria-label="Italic"
								>
									<Italic size={16} strokeWidth={2} />
								</button>
								<button
									type="button"
									aria-pressed={textFormat.bullet}
									className={`${toolbarButtonClass} ${textFormat.bullet ? toolbarActiveClass : ""}`}
									onPointerDown={(event) => event.preventDefault()}
									onClick={textFormat.onToggleBullet}
									title="Bullet list"
									aria-label="Bullet list"
								>
									<List size={16} strokeWidth={2} />
								</button>
								<select
									aria-label="Text size"
									title="Text size"
									value={String(textFormat.fontSize)}
									onPointerDown={(event) => event.preventDefault()}
									onChange={(event) => {
										const raw = event.target.value;
										const asNumber = Number(raw);
										textFormat.onFontSizeChange(Number.isFinite(asNumber) && String(asNumber) === raw ? asNumber : raw);
									}}
									className="h-7 min-h-7 max-h-7 shrink-0 rounded-in color-bg-grey-10 px-1.5 text-[11px] font-semibold color-txt-main outline-none"
								>
									{textFormat.fontSizeOptions.map((option) => (
										<option key={String(option.value)} value={String(option.value)}>{option.label}</option>
									))}
								</select>
								{toolbarSeparator}
							</>
						) : null}
						{isPenMode ? (
							<>
								<div className="flex h-7 w-[4.5rem] shrink-0 items-center px-0.5">
									<input
										type="range"
										min={0}
										max={PEN_THICKNESS_LEVELS.length - 1}
										step={1}
										value={activePenThicknessIndex}
										onChange={(e) => setActivePenThicknessIndex(Number(e.target.value))}
										className="pen-thickness-slider w-full"
										style={{
											...toolbarSliderStyle,
											["--slider-thumb-size" as string]: `${10 + activePenThicknessIndex * 1.5}px`,
										}}
										aria-label="Pen thickness"
									/>
								</div>
								<div className="flex h-7 shrink-0 items-center justify-center gap-1.5 px-0.5">
									{penPalette.map((color, index) => (
										<button
											key={`${color}-${index}`}
											type="button"
											onClick={() => selectPenColor(index)}
											className={`size-4 shrink-0 rounded-full border-0 p-0 appearance-none transition-transform ${activePenColorIndex === index ? "scale-110 ring-2 ring-current/40" : ""}`}
											style={{ backgroundColor: color }}
											aria-label="Set colour"
											title="Set colour"
										/>
									))}
								</div>
								{toolbarSeparator}
							</>
						) : null}
						{isEraseMode ? (
							<>
								<div className="flex h-7 shrink-0 items-center gap-0.5">
									<button
										type="button"
										onClick={() => setEraserMode("point")}
										className={`h-7 rounded-in px-1.5 text-[10px] font-semibold ${eraserMode === "point" ? toolbarActiveClass : "color-txt-main hover:color-bg-grey-10"}`}
										aria-pressed={eraserMode === "point"}
									>
										Point
									</button>
									<button
										type="button"
										onClick={() => setEraserMode("stroke")}
										className={`h-7 rounded-in px-1.5 text-[10px] font-semibold ${eraserMode === "stroke" ? toolbarActiveClass : "color-txt-main hover:color-bg-grey-10"}`}
										aria-pressed={eraserMode === "stroke"}
									>
										Stroke
									</button>
								</div>
								<div className="flex h-7 w-[4.5rem] shrink-0 items-center px-0.5">
									<input
										type="range"
										min={0}
										max={ERASER_SIZE_LEVELS.length - 1}
										step={1}
										value={activeEraserSizeIndex}
										onChange={(e) => setActiveEraserSizeIndex(Number(e.target.value))}
										className="pen-thickness-slider w-full"
										style={{
											...toolbarSliderStyle,
											["--slider-thumb-size" as string]: `${10 + activeEraserSizeIndex * 1.5}px`,
										}}
										aria-label="Eraser size"
									/>
								</div>
								{toolbarSeparator}
							</>
						) : null}
					</>
				)}
				<button
					type="button"
					onPointerDown={(event) => { if (isTextMode) event.preventDefault(); }}
					onClick={handleUndo}
					disabled={!canUndo}
					className={toolbarButtonClass}
					title="Undo"
					aria-label="Undo"
				>
					<Undo2 size={16} strokeWidth={2} />
				</button>
				<button
					type="button"
					onPointerDown={(event) => { if (isTextMode) event.preventDefault(); }}
					onClick={handleRedo}
					disabled={!canRedo}
					className={toolbarButtonClass}
					title="Redo"
					aria-label="Redo"
				>
					<Redo2 size={16} strokeWidth={2} />
				</button>
				{!hasUnifiedEditor && (
					<>
				<div className="relative">
					<button
						ref={penButtonRef}
						type="button"
						onPointerDown={() => startToolLongPress("pen")}
						onPointerUp={clearToolLongPressTimer}
						onPointerLeave={clearToolLongPressTimer}
						onPointerCancel={clearToolLongPressTimer}
						onClick={() => {
							if (longPressHandledRef.current) {
								longPressHandledRef.current = false;
								return;
							}
							if (tool !== "pen") {
								setTool("pen");
								setIsPenPopoverOpen(false);
							} else {
								setIsPenPopoverOpen((open) => !open);
							}
							setIsEraserPopoverOpen(false);
							setIsGridPopoverOpen(false);
						}}
						className={`${toolbarButtonClass} ${isPenPopoverOpen || tool === "pen" ? toolbarActiveClass : ""}`}
						title="Colour and thickness"
						aria-label="Colour and thickness"
						aria-expanded={isPenPopoverOpen}
					>
						<Pencil size={16} strokeWidth={2} />
					</button>
				</div>
					<div className="relative">
						<button
							ref={eraserButtonRef}
							type="button"
							onPointerDown={() => startToolLongPress("eraser")}
							onPointerUp={clearToolLongPressTimer}
							onPointerLeave={clearToolLongPressTimer}
							onPointerCancel={clearToolLongPressTimer}
							onClick={() => {
								if (longPressHandledRef.current) {
									longPressHandledRef.current = false;
									return;
								}
								if (tool === "eraser") {
									setIsEraserPopoverOpen((open) => !open);
								} else {
									setTool("eraser");
									setIsEraserPopoverOpen(false);
								}
								setIsPenPopoverOpen(false);
								setIsGridPopoverOpen(false);
							}}
							className={`${toolbarButtonClass} ${tool === "eraser" ? toolbarActiveClass : ""}`}
							title="Eraser"
							aria-label="Eraser"
						>
							<Eraser size={16} strokeWidth={2} />
						</button>
					</div>
				<button
					type="button"
					onClick={() => {
						setTool("lasso");
						setIsPenPopoverOpen(false);
						setIsEraserPopoverOpen(false);
						setIsGridPopoverOpen(false);
					}}
					className={`${toolbarButtonClass} ${tool === "lasso" ? toolbarActiveClass : ""}`}
					title="Select"
					aria-label="Select"
					aria-pressed={tool === "lasso"}
				>
					<MousePointer2 size={16} strokeWidth={2} />
				</button>
					</>
				)}
				<div className="relative">
				<button
					ref={gridButtonRef}
					type="button"
					onPointerDown={(event) => { if (isTextMode) event.preventDefault(); }}
					onClick={() => {
						setIsPenPopoverOpen(false);
						setIsEraserPopoverOpen(false);
						setIsAttachPopoverOpen(false);
						setIsGridPopoverOpen((open) => !open);
					}}
					className={`${toolbarButtonClass} ${gridMode !== "off" ? toolbarActiveClass : ""}`}
					title={
						gridMode === "off"
							? "Grid"
							: `Grid: ${getGridModeOption(gridMode).label.toLowerCase()}`
					}
					aria-expanded={isGridPopoverOpen}
					aria-haspopup="true"
				>
					{(() => {
						const { Icon } = getGridModeOption(gridMode);
						return <Icon size={16} strokeWidth={2} />;
					})()}
				</button>
				</div>
				{(enableAttachments || onAttachRequest) && (
					<div className="relative">
					<button
						ref={attachButtonRef}
						type="button"
						onPointerDown={(event) => { if (isTextMode) event.preventDefault(); }}
						onClick={() => {
							if (onAttachRequest) {
								onAttachRequest();
								return;
							}
							ensurePenMode();
							setIsPenPopoverOpen(false);
							setIsEraserPopoverOpen(false);
							setIsGridPopoverOpen(false);
							setIsAttachPopoverOpen((open) => !open);
						}}
						disabled={isAttaching}
						className={toolbarButtonClass}
						title="Attach"
						aria-label="Attach"
						aria-expanded={showAttachPopover ? isAttachPopoverOpen : undefined}
						aria-haspopup={showAttachPopover ? "true" : undefined}
					>
						{isAttaching ? (
							<LoaderCircle size={16} strokeWidth={2} className="animate-spin" />
						) : (
							<Paperclip size={16} strokeWidth={2} />
						)}
					</button>
					</div>
				)}
				<button
					type="button"
					onPointerDown={(event) => { if (isTextMode) event.preventDefault(); }}
					onClick={clearCanvas}
					className={toolbarButtonClass}
					title="Clear canvas"
					aria-label="Clear canvas"
				>
					<Trash2 size={16} strokeWidth={2} />
				</button>
				{toolbarExtras}
				{onClose && (
					<button
						type="button"
						onClick={onClose}
						className={`${toolbarButtonClass} ml-1`}
						title="Close whiteboard"
					>
						<X size={16} strokeWidth={2} />
					</button>
				)}
				</div>
				</div>
				);
				return portalToolbar ? createPortal(toolbar, getThemedPortalTarget()) : toolbar;
				})()}
				{penButtonRect && createPortal(
					<div
						ref={penPopoverRef}
						className={`fixed flex flex-col items-stretch gap-2 px-3 py-2 rounded-in color-bg color-txt-main color-shadow border transition-all duration-180 ease-out ${isPenPopoverOpen ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"}`}
						style={popoverAnchorStyle(penButtonRect)}
					>
						<div className="w-[58px] flex justify-center">
							<input
								type="range"
								min={0}
								max={PEN_THICKNESS_LEVELS.length - 1}
								step={1}
								value={activePenThicknessIndex}
								onChange={(e) => setActivePenThicknessIndex(Number(e.target.value))}
								className="pen-thickness-slider w-full"
								style={{
									["--slider-track-color" as string]: mutedBgColor || "rgba(128, 128, 128, 0.3)",
									["--slider-thumb-color" as string]: accentColor || strokeColor || "#2563EB",
									["--slider-thumb-size" as string]: `${10 + activePenThicknessIndex * 2.5}px`,
								}}
								aria-label="Pen thickness"
							/>
						</div>
						<div className="w-[58px] flex items-center justify-center gap-1.5 py-0.5">
							{penPalette.map((color, index) => (
								<button
									key={`${color}-${index}`}
									type="button"
									onClick={() => {
										selectPenColor(index);
									}}
									className={`size-4 shrink-0 rounded-full border-0 p-0 appearance-none transition-transform ${activePenColorIndex === index ? "scale-110 ring-2 ring-current/40" : ""}`}
									style={{ backgroundColor: color }}
									aria-label="Set colour"
									title="Set colour"
								/>
							))}
						</div>
					</div>,
					getThemedPortalTarget()
				)}
				{eraserButtonRect && createPortal(
					<div
						ref={eraserPopoverRef}
						className={`fixed flex flex-col items-stretch gap-2 px-3 py-2 rounded-in color-bg color-txt-main color-shadow border transition-all duration-180 ease-out ${isEraserPopoverOpen ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"}`}
						style={popoverAnchorStyle(eraserButtonRect)}
					>
						<div className="flex items-center gap-1">
							<button
								type="button"
								onClick={() => {
									setEraserMode("point");
								}}
								className={`rounded-in px-3 py-1 text-sm ${eraserMode === "point" ? "color-bg-accent color-txt-accent" : "color-bg-grey-5 color-txt-main"}`}
							>
								Point
							</button>
							<button
								type="button"
								onClick={() => {
									setEraserMode("stroke");
								}}
								className={`rounded-in px-3 py-1 text-sm ${eraserMode === "stroke" ? "color-bg-accent color-txt-accent" : "color-bg-grey-5 color-txt-main"}`}
							>
								Stroke
							</button>
						</div>
						<div className="w-[7.5rem] flex justify-center">
							<input
								type="range"
								min={0}
								max={ERASER_SIZE_LEVELS.length - 1}
								step={1}
								value={activeEraserSizeIndex}
								onChange={(e) => setActiveEraserSizeIndex(Number(e.target.value))}
								className="pen-thickness-slider w-full"
								style={{
									["--slider-track-color" as string]: mutedBgColor || "rgba(128, 128, 128, 0.3)",
									["--slider-thumb-color" as string]: accentColor || strokeColor || "#2563EB",
									["--slider-thumb-size" as string]: `${10 + activeEraserSizeIndex * 3}px`,
								}}
								aria-label="Eraser size"
							/>
						</div>
					</div>,
					getThemedPortalTarget()
				)}
				{gridButtonRect && createPortal(
					<div
						ref={gridPopoverRef}
						className={`fixed flex flex-col items-stretch gap-2 px-3 py-2 rounded-in color-bg color-txt-main color-shadow border transition-all duration-180 ease-out ${isGridPopoverOpen ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"}`}
						style={popoverAnchorStyle(gridButtonRect)}
					>
						<div className="grid grid-cols-3 gap-1.5">
							{GRID_MODE_OPTIONS.map(({ mode, label, Icon }) => {
								const selected = gridMode === mode;
								return (
									<button
										key={mode}
										type="button"
										onClick={() => setGridMode(mode)}
										className={`flex flex-col items-center justify-center gap-0.5 min-w-[3.25rem] px-2 py-1.5 rounded-[var(--radius-in)] transition-all ${
											selected
												? "color-bg-accent color-txt-accent"
												: "hover:color-bg-grey-10 color-txt-main"
										}`}
										title={label}
										aria-pressed={selected}
									>
										<Icon size={16} strokeWidth={2} />
										<span className="text-[10px] leading-none font-medium">{label}</span>
									</button>
								);
							})}
						</div>
						{gridMode !== "off" && (
							<div className="w-full flex justify-center pt-0.5 border-t border-[color-mix(in_srgb,currentColor_12%,transparent)]">
								<input
									type="range"
									min={5}
									max={100}
									step={1}
									value={Math.round(gridOpacity * 100)}
									onChange={(e) => setGridOpacity(Math.max(0.05, Math.min(1, Number(e.target.value) / 100)))}
									className="pen-thickness-slider w-[7.5rem]"
									style={{
										["--slider-track-color" as string]: mutedBgColor || "rgba(128, 128, 128, 0.3)",
										["--slider-thumb-color" as string]: accentColor || strokeColor || "#2563EB",
										["--slider-thumb-size" as string]: "12px",
									}}
									aria-label="Grid opacity"
								/>
							</div>
						)}
					</div>,
					getThemedPortalTarget()
				)}
				{showAttachPopover && attachButtonRect && createPortal(
					<div
						ref={attachPopoverRef}
						className={`fixed flex flex-col items-stretch gap-1 px-2 py-2 rounded-in color-bg color-txt-main color-shadow border transition-all duration-180 ease-out ${isAttachPopoverOpen ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"}`}
						style={popoverAnchorStyle(attachButtonRect)}
					>
						<button
							type="button"
							onClick={() => {
								setIsAttachPopoverOpen(false);
								ensurePenMode();
								if (!isAttaching) fileInputRef.current?.click();
							}}
							className="flex items-center gap-2 rounded-[var(--radius-in)] px-2.5 py-2 text-left transition-colors hover:color-bg-grey-10 color-txt-main"
							title="Your files (max 25 MB)"
						>
							<Upload size={16} strokeWidth={2} className="shrink-0" />
							<span className="flex min-w-0 flex-col">
								<span className="text-[11px] font-semibold leading-none">Your files</span>
								<span className="mt-0.5 text-[9px] color-txt-sub leading-none">Image or PDF · 25 MB max</span>
							</span>
						</button>
						{onAttachQuestions && (
							<button
								type="button"
								onClick={() => {
									setIsAttachPopoverOpen(false);
									onAttachQuestions();
								}}
								className="flex items-center gap-2 rounded-[var(--radius-in)] px-2.5 py-2 text-left transition-colors hover:color-bg-grey-10 color-txt-main"
								title="CertChamps questions"
							>
								<BookOpen size={16} strokeWidth={2} className="shrink-0" />
								<span className="flex min-w-0 flex-col">
									<span className="text-[11px] font-semibold leading-none">CertChamps questions</span>
									<span className="mt-0.5 text-[9px] color-txt-sub leading-none">Browse the question bank</span>
								</span>
							</button>
						)}
					</div>,
					getThemedPortalTarget()
				)}
			</div>
{overlayBubbles.map(({ badge, anchorScreenX, anchorScreenY, expanded, tailTop, tailTransformY }) => (
			<div
				key={badge.id}
				className="absolute pointer-events-auto"
				style={{
					left: anchorScreenX,
					top: anchorScreenY,
					zIndex: expanded ? 40 : 30,
					transformOrigin: "top left",
				}}
			>
				{/* Tail pointer */}
				<div
					className="absolute transition-[top,transform] duration-280 ease-out"
					style={{
						left: "-6px",
						top: tailTop,
						transform: tailTransformY,
						width: 0,
						height: 0,
						borderLeft: "6px solid transparent",
						borderTop: "6px solid var(--color-txt-accent)",
						borderBottom: "6px solid transparent",
					}}
				/>
				{/* Bubble container */}
				<div
					className={`relative overflow-hidden rounded-lg color-bg color-txt-accent border transition-[max-height,width] duration-280 ease-out cursor-pointer ${expanded ? "w-[240px] max-h-[200px]" : "w-[118px] max-h-7"}`}
					style={{
						borderColor: "var(--color-txt-accent)",
					}}
					onClick={() => requestToggleComment(badge.id)}
					>
						<div className="flex items-center justify-between px-3 h-7">
							<div className="flex items-center gap-1">
								<MessageCircle size={11} />
								<span className="text-[9px] opacity-80">Feedback</span>
							</div>
						</div>
						<div className="px-3 py-2 text-[11px] leading-relaxed max-h-[168px] overflow-y-auto">
							<RenderMath text={badge.text} className="[&>div]:text-[11px]" />
						</div>
					</div>
				</div>
			))}

		</div>
	);
}
