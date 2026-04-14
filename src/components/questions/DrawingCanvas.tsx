import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pencil, Eraser, Grid3X3, Trash2, X, CircleDot, Undo2, Redo2, MessageCircle, Music, MousePointer2 } from "lucide-react";
import type { CanvasAnnotation, CanvasCapturePayload } from "../../lib/grading/GradingTypes";
import { buildCapturePayload } from "../../lib/grading/canvasCapture";
import RenderMath from "../math/mathdisplay";

type Point = { x: number; y: number; pressure: number };
type Stroke = { points: Point[]; tool: "pen" | "eraser"; colorIndex?: number; thicknessIndex?: number; color?: string };
type ToolMode = "pen" | "eraser" | "lasso";
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

/** Grid display: off, square (lines), dots at intersections, or music staves. */
type GridMode = "off" | "lines" | "dots" | "music";

const MIN_SCALE = 0.1;
const MAX_SCALE = 10;
const GRID_STEP = 40;
const GRID_DOT_RADIUS = 1.5;
const MUSIC_LINE_GAP = 16;
const MUSIC_STAFF_LINES = 5;
const MUSIC_STAFF_HEIGHT = (MUSIC_STAFF_LINES - 1) * MUSIC_LINE_GAP;
const MUSIC_STAVE_REPEAT = MUSIC_STAFF_HEIGHT * 3;

const STAVE_LINE_LABELS = ["L5", "L4", "L3", "L2", "L1"];
const STAVE_SPACE_LABELS = ["S4", "S3", "S2", "S1"];
const ERASER_WIDTH = 24;
const ERASER_PREVIEW_WIDTH = 3;
const PEN_THICKNESS_LEVELS = [1.2, 2, 3.2, 4.6, 6.2];
const DEFAULT_PEN_THICKNESS_INDEX = 1;
const FIXED_SAMPLE_HZ = 240;
const FIXED_SAMPLE_INTERVAL_MS = 1000 / FIXED_SAMPLE_HZ;
const STROKE_ERASER_HIT_RADIUS = ERASER_WIDTH / 2 + 3;
const ERASE_TARGET_STROKE_COLOR = "rgba(128, 128, 128, 0.7)";
const TOOL_LONG_PRESS_MS = 420;
/** Hold still for this long (ms) to snap stroke to straight line */
const HOLD_TO_STRAIGHTEN_MS = 600;
const LASSO_MIN_POINTS = 3;
const SELECTION_HANDLE_RADIUS_PX = 8;
const SELECTION_HIT_PADDING_PX = 10;
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
) {
	// Early return if font is not ready yet (canvas will retry on next draw loop)
	if (!fontReady) return;

	const seed = seededUnit(annotation.worldX);
	const angle = (-8 + seed * 16) * (Math.PI / 180);
	const fontSize = 72;
	const fontFamily = '"Caveat", "Patrick Hand", "Architects Daughter", cursive';
	ctx.save();
	ctx.translate(annotation.worldX, annotation.worldY);
	ctx.rotate(angle);
	ctx.fillStyle = "#C0392B";
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
	ctx.strokeStyle = "#C0392B";
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

function eraseStrokesAtPoint(source: Stroke[], point: Point): Stroke[] {
	const radius = STROKE_ERASER_HIT_RADIUS;
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

function appendSampledPointsFixedHz(
	points: Point[],
	nextPoint: Point,
	eventTimeMs: number,
	lastSample: { point: Point; timeMs: number } | null,
): { points: Point[]; lastSample: { point: Point; timeMs: number } } {
	if (!lastSample) {
		return { points: [...points, nextPoint], lastSample: { point: nextPoint, timeMs: eventTimeMs } };
	}
	const appended: Point[] = [...points];
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

function applyVisualTransform(point: { x: number; y: number }, session: TransformSession): { x: number; y: number } {
	const transformed = transformPoint(
		{ x: point.x, y: point.y, pressure: 1 },
		session.center,
		session.previewDx,
		session.previewDy,
		session.previewScale,
		session.previewRotation
	);
	return { x: transformed.x, y: transformed.y };
}

/** Call with a function that returns the current drawing as PNG data URL, or null. Called on mount, cleared on unmount. */
export type RegisterDrawingSnapshot = (getSnapshot: (() => string | null) | null) => void;
/** Call with a function that returns the number of visual line clusters detected on the canvas. Called on mount, cleared on unmount. */
export type RegisterGetLineCount = (fn: ((region?: WhiteboardRelevantRegion | null) => number) | null) => void;
/** Call with a function that returns a fixed-size grading capture plus world bounds. Called on mount, cleared on unmount. */
export type RegisterGetGradingCapture = (fn: (((mode?: "default" | "full-ink" | "retry-aggressive") => CanvasCapturePayload | null) | null)) => void;
/** Call with a function that returns a stave analysis string (note positions), or null. */
export type RegisterGetStaveAnalysis = (fn: (() => string | null) | null) => void;

export type DrawingStroke = Stroke;

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
	/** When true, hide toolbar and prevent drawing/pan/zoom (view-only mode). */
	readOnly?: boolean;
	/** Initial grid mode. Use "off" for no grid (e.g. in progress dashboard). */
	defaultGridMode?: GridMode;
	/** World-space grading annotations rendered in the canvas loop. */
	gradingAnnotations?: CanvasAnnotation[] | null;
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

export default function DrawingCanvas({ onClose, registerDrawingSnapshot, registerGetLineCount, registerGetGradingCapture, registerGetStaveAnalysis, initialStrokes, onStrokesChange, onEditInteraction, wrapperClassName, readOnly = false, defaultGridMode = "lines", gradingAnnotations = null }: DrawingCanvasProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const penButtonRef = useRef<HTMLButtonElement>(null);
	const eraserButtonRef = useRef<HTMLButtonElement>(null);
	const gridButtonRef = useRef<HTMLButtonElement>(null);
	const penPopoverRef = useRef<HTMLDivElement>(null);
	const eraserPopoverRef = useRef<HTMLDivElement>(null);
	const gridPopoverRef = useRef<HTMLDivElement>(null);
	const popupBgSampleRef = useRef<HTMLDivElement>(null);
	const colorSampleRef = useRef<HTMLDivElement>(null);
	const gridColorSampleRef = useRef<HTMLDivElement>(null);
	const accentColorSampleRef = useRef<HTMLDivElement>(null);
	const accentBgSampleRef = useRef<HTMLDivElement>(null);
	const mutedBgSampleRef = useRef<HTMLDivElement>(null);
	const secondaryColorSampleRef = useRef<HTMLDivElement>(null);

	const [strokes, setStrokes] = useState<Stroke[]>(normalizeStrokeColors(initialStrokes));
	const [undoStack, setUndoStack] = useState<Stroke[][]>([]);
	const [redoStack, setRedoStack] = useState<Stroke[][]>([]);
	const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
	const [pan, setPan] = useState({ x: 0, y: 0 });
	const [scale, setScale] = useState(1);
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
			setCurrentStroke(null);
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
	const [gridMode, setGridMode] = useState<GridMode>(defaultGridMode);
	const [strokeColor, setStrokeColor] = useState("");
	const [secondaryStrokeColor, setSecondaryStrokeColor] = useState("");
	const [gridColor, setGridColor] = useState("");
	const [accentColor, setAccentColor] = useState("");
	const [accentBgColor, setAccentBgColor] = useState("");
	const [mutedBgColor, setMutedBgColor] = useState("");
	const [popupBgColor, setPopupBgColor] = useState("");
	const [activePenColorIndex, setActivePenColorIndex] = useState(0);
	const [activePenThicknessIndex, setActivePenThicknessIndex] = useState(DEFAULT_PEN_THICKNESS_INDEX);
	const [isPenPopoverOpen, setIsPenPopoverOpen] = useState(false);
	const [isEraserPopoverOpen, setIsEraserPopoverOpen] = useState(false);
	const [isGridPopoverOpen, setIsGridPopoverOpen] = useState(false);
	const [eraserMode, setEraserMode] = useState<"point" | "stroke">("stroke");
	const [gridOpacity, setGridOpacity] = useState(0.7);
	const [lassoPath, setLassoPath] = useState<Point[] | null>(null);
	const [selectedStrokeIndexes, setSelectedStrokeIndexes] = useState<number[]>([]);
	const [transformSession, setTransformSession] = useState<TransformSession | null>(null);
	const penPalette = [strokeColor, secondaryStrokeColor, accentColor].filter(Boolean);

	const isDrawingRef = useRef(false);
	const lastPointRef = useRef<Point | null>(null);
	const pinchStartRef = useRef<{ distance: number; center: { x: number; y: number }; scale: number; pan: { x: number; y: number } } | null>(null);
	const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
	const pointerIdsRef = useRef<Map<number, { x: number; y: number }>>(new Map());
	const holdStraightenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const currentStrokeRef = useRef<Stroke | null>(null);
	const lastPenSampleRef = useRef<{ point: Point; timeMs: number } | null>(null);
	const toolLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const longPressHandledRef = useRef(false);
	const pointEraseBaseRef = useRef<Stroke[] | null>(null);
	const pointEraseChangedRef = useRef(false);
	const selectedStrokeIndexesRef = useRef<number[]>([]);
	selectedStrokeIndexesRef.current = selectedStrokeIndexes;
	const transformSessionRef = useRef<TransformSession | null>(null);
	transformSessionRef.current = transformSession;

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
		const accentBgEl = accentBgSampleRef.current;
		const mutedBgEl = mutedBgSampleRef.current;
		const popupBgEl = popupBgSampleRef.current;
		if (!strokeEl || !secondaryEl || !gridEl || !accentEl || !accentBgEl || !mutedBgEl || !popupBgEl) return;
		const updateColors = () => {
			const primary = getComputedStyle(strokeEl).color;
			const secondary = getComputedStyle(secondaryEl).color;
			const accent = getComputedStyle(accentEl).color;
			setStrokeColor(primary);
			setSecondaryStrokeColor(secondary);
			setAccentColor(accent);
			setAccentBgColor(getComputedStyle(accentBgEl).backgroundColor);
			setMutedBgColor(getComputedStyle(mutedBgEl).backgroundColor);
			setGridColor(getComputedStyle(gridEl).backgroundColor);
			const containerBg = containerRef.current ? getComputedStyle(containerRef.current).backgroundColor : "";
			const sampledBg = getComputedStyle(popupBgEl).backgroundColor;
			setPopupBgColor(containerBg && containerBg !== "rgba(0, 0, 0, 0)" ? containerBg : sampledBg);
		};
		updateColors();
		const observer = new MutationObserver(updateColors);
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
		return () => observer.disconnect();
	}, []);

	const requestToggleComment = useCallback((id: string) => {
		setExpandedCommentId((current) => (current === id ? null : id));
	}, []);

	// Native touch listeners with passive: false so preventDefault works on iOS (Apple Pencil)
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const preventTouch = (e: TouchEvent) => e.preventDefault();
		const opts: AddEventListenerOptions = { passive: false, capture: true };
		canvas.addEventListener("touchstart", preventTouch, opts);
		canvas.addEventListener("touchmove", preventTouch, opts);
		canvas.addEventListener("touchend", preventTouch, opts);
		canvas.addEventListener("touchcancel", preventTouch, opts);
		return () => {
			canvas.removeEventListener("touchstart", preventTouch, opts);
			canvas.removeEventListener("touchmove", preventTouch, opts);
			canvas.removeEventListener("touchend", preventTouch, opts);
			canvas.removeEventListener("touchcancel", preventTouch, opts);
		};
	}, []);

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
	const lineAnchors = buildLineAnchors(strokes);

	const draw = useCallback(() => {
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext("2d");
		if (!canvas || !ctx) return;

		const targetedStrokeIndexes = new Set<number>();
		const selectedIndexSet = new Set(selectedStrokeIndexes);
		if (tool === "eraser" && eraserMode === "stroke" && currentStroke) {
			for (let index = 0; index < strokes.length; index++) {
				const stroke = strokes[index];
				if (stroke.tool === "pen" && strokeIntersectsEraser(stroke, currentStroke, STROKE_ERASER_HIT_RADIUS)) {
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
			ctx.scale(dpr, dpr);
		}

		ctx.clearRect(0, 0, w, h);
		ctx.save();
		ctx.translate(pan.x, pan.y);
		ctx.scale(scale, scale);

		// Grid under ink - lines, dots, or music staves
		if (gridMode !== "off" && gridColor) {
			const left = -pan.x / scale;
			const top = -pan.y / scale;
			const right = left + w / scale;
			const bottom = top + h / scale;
			ctx.globalAlpha = gridOpacity;

			if (gridMode === "music") {
				ctx.strokeStyle = gridColor;
				ctx.lineWidth = 1.2 / scale;
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
			} else {
				const startX = Math.floor(left / GRID_STEP) * GRID_STEP;
				const endX = Math.ceil(right / GRID_STEP) * GRID_STEP;
				const startY = Math.floor(top / GRID_STEP) * GRID_STEP;
				const endY = Math.ceil(bottom / GRID_STEP) * GRID_STEP;
				if (gridMode === "lines") {
					ctx.strokeStyle = gridColor;
					ctx.lineWidth = 1 / scale;
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
							ctx.arc(x, y, GRID_DOT_RADIUS / scale, 0, Math.PI * 2);
							ctx.fill();
						}
					}
				}
			}
			ctx.globalAlpha = 1;
		}

		// Draw strokes above the grid
		for (let index = 0; index < strokes.length; index++) {
			drawStroke(ctx, strokes[index], { muted: targetedStrokeIndexes.has(index) });
		}
		if (currentStroke) {
			drawStroke(ctx, currentStroke, { preview: true });
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
			const handleRadius = SELECTION_HANDLE_RADIUS_PX / scale;
			const activeSession = transformSession;
			const baseBounds = activeSession?.baseBounds ?? selectionBounds;
			const rawHandlePoints = [
				{ x: baseBounds.minX, y: baseBounds.minY },
				{ x: baseBounds.maxX, y: baseBounds.minY },
				{ x: baseBounds.maxX, y: baseBounds.maxY },
				{ x: baseBounds.minX, y: baseBounds.maxY },
			];
			const handlePoints = activeSession ? rawHandlePoints.map((point) => applyVisualTransform(point, activeSession)) : rawHandlePoints;
			ctx.save();
			ctx.strokeStyle = accentColor || strokeColor || "#2563EB";
			ctx.fillStyle = accentColor || strokeColor || "#2563EB";
			ctx.lineWidth = 1.5 / scale;
			ctx.setLineDash([6 / scale, 4 / scale]);
			ctx.beginPath();
			ctx.moveTo(handlePoints[0].x, handlePoints[0].y);
			for (let i = 1; i < handlePoints.length; i += 1) ctx.lineTo(handlePoints[i].x, handlePoints[i].y);
			ctx.closePath();
			ctx.stroke();
			ctx.setLineDash([]);
			for (const point of handlePoints) {
				ctx.beginPath();
				ctx.arc(point.x, point.y, handleRadius, 0, Math.PI * 2);
				ctx.fillStyle = "#ffffff";
				ctx.fill();
				ctx.strokeStyle = accentColor || strokeColor || "#2563EB";
				ctx.stroke();
			}
			for (let index = 0; index < strokes.length; index += 1) {
				if (!selectedIndexSet.has(index)) continue;
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

		if (gradingAnnotations && gradingAnnotations.length > 0) {
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
					drawMarkAnnotation(ctx, annotation, fontReady);
				}
			}
		} else {
			// Ensure feedback bubbles disappear immediately when grading annotations are cleared.
			badgeLayoutsRef.current = [];
		}

		ctx.restore();
	}, [pan, scale, gridMode, strokes, currentStroke, strokeColor, gridColor, tool, lineAnchors, gradingAnnotations, accentColor, fontReady, lassoPath, selectedStrokeIndexes, transformSession, eraserMode, penPalette, activePenColorIndex, gridOpacity]);

	useEffect(() => {
		draw();
	}, [draw]);

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
		if (!isPenPopoverOpen && !isEraserPopoverOpen && !isGridPopoverOpen) return;
		const onPointerDown = (event: PointerEvent) => {
			const target = event.target as Node | null;
			if (!target) return;
			const inPenButton = penButtonRef.current?.contains(target);
			const inEraserButton = eraserButtonRef.current?.contains(target);
			const inGridButton = gridButtonRef.current?.contains(target);
			const inPenPopover = penPopoverRef.current?.contains(target);
			const inEraserPopover = eraserPopoverRef.current?.contains(target);
			const inGridPopover = gridPopoverRef.current?.contains(target);
			if (inPenButton || inEraserButton || inGridButton || inPenPopover || inEraserPopover || inGridPopover) return;
			setIsPenPopoverOpen(false);
			setIsEraserPopoverOpen(false);
			setIsGridPopoverOpen(false);
		};
		document.addEventListener("pointerdown", onPointerDown, true);
		return () => document.removeEventListener("pointerdown", onPointerDown, true);
	}, [isPenPopoverOpen, isEraserPopoverOpen, isGridPopoverOpen]);

	useEffect(() => {
		if (!expandedCommentId) return;
		if (!gradingAnnotations?.some((annotation) => annotation.type === "errorComment" && annotation.id === expandedCommentId)) {
			setExpandedCommentId(null);
		}
	}, [gradingAnnotations, expandedCommentId]);

	// Keep ref in sync for timer callback
	useEffect(() => {
		currentStrokeRef.current = currentStroke;
	}, [currentStroke]);

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
				setCurrentStroke(straightenStroke(stroke));
			}
		}, HOLD_TO_STRAIGHTEN_MS);
	}, []);

	const cancelHoldStraighten = useCallback(() => {
		if (holdStraightenTimerRef.current) {
			clearTimeout(holdStraightenTimerRef.current);
			holdStraightenTimerRef.current = null;
		}
	}, []);

	// Expose current drawing as PNG for AI/vision (includes music staves when active)
	const getSnapshot = useCallback(() => {
		if (strokes.length === 0 && !currentStroke) return null;
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
		}

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
		if (currentStroke?.tool === "pen") drawSnapshotPenStroke(currentStroke);
		ctx.restore();
		return off.toDataURL("image/png");
	}, [pan, scale, strokes, currentStroke, gridMode, penPalette, activePenColorIndex]);
	const getGradingCapture = useCallback((mode: "default" | "full-ink" | "retry-aggressive" = "default"): CanvasCapturePayload | null => {
		const renderStrokes = [...strokes, ...(currentStroke ? [currentStroke] : [])];
		if (!renderStrokes.some((stroke) => stroke.tool === "pen" && stroke.points.length > 1)) return null;
		const canvas = canvasRef.current;
		if (!canvas) return null;
		const rect = canvas.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0 || scale === 0) return null;
		return buildCapturePayload({
			strokes: renderStrokes,
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
	}, [strokes, currentStroke, pan, scale]);
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
		const allStrokes = [...strokes, ...(currentStroke ? [currentStroke] : [])];
		return analyseStavePositions(allStrokes);
	}, [gridMode, strokes, currentStroke]);
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
				ctx.arc(stroke.points[0].x, stroke.points[0].y, ERASER_PREVIEW_WIDTH / 2, 0, Math.PI * 2);
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
				ctx.lineWidth = ERASER_PREVIEW_WIDTH;
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
			ctx.lineWidth = ERASER_WIDTH;
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

	const startTransformSession = useCallback(
		(mode: TransformMode, startPointer: Point) => {
			const selectedIndexes = selectedStrokeIndexesRef.current;
			if (selectedIndexes.length === 0) return;
			const bounds = getSelectionBounds(strokesRef.current, selectedIndexes);
			if (!bounds) return;
			const center = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
			const baseDistance = Math.hypot(startPointer.x - center.x, startPointer.y - center.y);
			const startAngle = Math.atan2(startPointer.y - center.y, startPointer.x - center.x);
			setTransformSession({
				mode,
				startPointer,
				baseStrokes: strokesRef.current,
				selectedIndexes,
				center,
				baseBounds: bounds,
				baseDistance,
				startAngle,
				previewDx: 0,
				previewDy: 0,
				previewScale: 1,
				previewRotation: 0,
			});
		},
		[]
	);

	const resolveSelectionHit = useCallback(
		(pointer: Point): TransformMode | null => {
			const bounds = getSelectionBounds(strokesRef.current, selectedStrokeIndexesRef.current);
			if (!bounds) return null;
			const handleRadius = SELECTION_HANDLE_RADIUS_PX / scaleRef.current;
			const hitPadding = SELECTION_HIT_PADDING_PX / scaleRef.current;
			const handlePoints = [
				{ x: bounds.minX, y: bounds.minY },
				{ x: bounds.maxX, y: bounds.minY },
				{ x: bounds.maxX, y: bounds.maxY },
				{ x: bounds.minX, y: bounds.maxY },
			];
			for (const point of handlePoints) {
				if (Math.hypot(pointer.x - point.x, pointer.y - point.y) <= handleRadius + hitPadding) return "scale";
			}
			const insideBounds =
				pointer.x >= bounds.minX - hitPadding &&
				pointer.x <= bounds.maxX + hitPadding &&
				pointer.y >= bounds.minY - hitPadding &&
				pointer.y <= bounds.maxY + hitPadding;
			return insideBounds ? "move" : null;
		},
		[]
	);

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
			e.preventDefault();
			setIsPenPopoverOpen(false);
			setIsEraserPopoverOpen(false);
			setIsGridPopoverOpen(false);
			const canvas = canvasRef.current;
			if (!canvas) return;

			const rect = canvas.getBoundingClientRect();

			if (readOnly) return;
			canvas.setPointerCapture(e.pointerId);
			const world = screenToWorld(e.clientX, e.clientY);
			world.pressure = getPressure(e.nativeEvent);

			const pointers = pointerIdsRef.current;
			pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

			if (pointers.size === 2) {
				// Start pinch
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
				setCurrentStroke(null);
				panStartRef.current = null;
				pinchStartRef.current = { distance, center, scale, pan };
				return;
			}

			if (pointers.size === 1) {
				// Pen, mouse, or 1 finger = draw. 2 fingers = pan/zoom.
				const isPen = e.pointerType === "pen";
				const isMouse = e.pointerType === "mouse";
				const isTouch = e.pointerType === "touch";
				if (tool === "lasso" && (isPen || isMouse || isTouch)) {
					const hitMode = resolveSelectionHit(world);
					if (hitMode && selectedStrokeIndexesRef.current.length > 0) {
						startTransformSession(hitMode, world);
					} else {
						setTransformSession(null);
						setSelectedStrokeIndexes([]);
						setLassoPath([world]);
						isDrawingRef.current = true;
					}
					return;
				}

				const shouldDraw = (isPen || isMouse || isTouch) && (tool === "pen" || tool === "eraser");
				if (shouldDraw) {
					isDrawingRef.current = true;
					if (tool === "eraser" && eraserMode === "point") {
						pointEraseBaseRef.current = strokesRef.current;
						pointEraseChangedRef.current = false;
						setStrokes((previous) => {
							const next = eraseStrokesAtPoint(previous, world);
							if (next !== previous) pointEraseChangedRef.current = true;
							return next;
						});
						setCurrentStroke(null);
					} else {
						const newStroke: Stroke = {
							points: [world],
							tool,
							colorIndex: tool === "pen" ? activePenColorIndex : undefined,
							thicknessIndex: tool === "pen" ? activePenThicknessIndex : undefined,
						};
						setCurrentStroke(newStroke);
						lastPenSampleRef.current = tool === "pen" ? { point: world, timeMs: e.nativeEvent.timeStamp } : null;
					}
					lastPointRef.current = world;
				} else {
					panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
				}
			}
		},
		[pan, scale, screenToWorld, tool, readOnly, onEditInteraction, resolveSelectionHit, startTransformSession, eraserMode, activePenColorIndex, activePenThicknessIndex]
	);

	const handlePointerMove = useCallback(
		(e: React.PointerEvent) => {
			e.preventDefault();
			if (readOnly) return;
			const pointers = pointerIdsRef.current;
			const rect = canvasRef.current?.getBoundingClientRect();
			if (!rect) return;

			pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

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
					const next = eraseStrokesAtPoint(previous, world);
					if (next !== previous) pointEraseChangedRef.current = true;
					return next;
				});
				return;
			}

			if (isDrawingRef.current && currentStroke) {
				const world = screenToWorld(e.clientX, e.clientY);
				world.pressure = getPressure(e.nativeEvent);
				setCurrentStroke((prev) => {
					if (!prev) return null;
					if (prev.tool !== "pen") return { ...prev, points: [...prev.points, world] };
					const sampled = appendSampledPointsFixedHz(
						prev.points,
						world,
						e.nativeEvent.timeStamp,
						lastPenSampleRef.current,
					);
					lastPenSampleRef.current = sampled.lastSample;
					return { ...prev, points: sampled.points };
				});
				lastPointRef.current = world;
				if (currentStroke.tool === "pen") scheduleHoldStraighten();
			}
		},
		[currentStroke, screenToWorld, scheduleHoldStraighten, readOnly, tool, lassoPath, applyTransformFromSession, eraserMode]
	);

	const handlePointerUp = useCallback(
		(e: React.PointerEvent) => {
			e.preventDefault();
			const canvas = canvasRef.current;
			if (canvas) canvas.releasePointerCapture(e.pointerId);
			pointerIdsRef.current.delete(e.pointerId);

			if (pointerIdsRef.current.size === 0) {
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
				if (tool === "lasso" && isDrawingRef.current && lassoPath) {
					if (lassoPath.length >= LASSO_MIN_POINTS) {
						const selected = strokesRef.current
							.map((stroke, index) => ({ stroke, index }))
							.filter(({ stroke }) => stroke.tool === "pen")
							.filter(({ stroke }) => strokeIntersectsPolygon(stroke, lassoPath))
							.map(({ index }) => index);
						setSelectedStrokeIndexes(selected);
					}
					setLassoPath(null);
				}
				if (isDrawingRef.current && currentStroke && currentStroke.points.length > 0) {
					const world = screenToWorld(e.clientX, e.clientY);
					world.pressure = getPressure(e.nativeEvent);
					let finalizedStroke = currentStroke;
					if (currentStroke.tool === "pen") {
						const lastPoint = currentStroke.points[currentStroke.points.length - 1];
						if (!lastPoint || lastPoint.x !== world.x || lastPoint.y !== world.y) {
							finalizedStroke = { ...currentStroke, points: [...currentStroke.points, world] };
						}
					}
					if (currentStroke.tool === "eraser") {
						if (eraserMode === "stroke") {
							commitStrokeChange((previous) => {
								const next = previous.filter(
									(stroke) => stroke.tool !== "pen" || !strokeIntersectsEraser(stroke, currentStroke, STROKE_ERASER_HIT_RADIUS)
								);
								return next.length === previous.length ? previous : next;
							});
						} else {
							commitStrokeChange((previous) => [...previous, currentStroke]);
						}
					} else {
						commitStrokeChange((previous) => [...previous, finalizedStroke]);
					}
					setCurrentStroke(null);
					lastPenSampleRef.current = null;
				}
				isDrawingRef.current = false;
			}
		},
		[currentStroke, cancelHoldStraighten, commitStrokeChange, tool, lassoPath, commitTransformSession, eraserMode]
	);

	const handleWheel = useCallback(
		(e: React.WheelEvent) => {
			e.preventDefault();
			if (readOnly) return;
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
		[pan, scale, readOnly]
	);

	const clearCanvas = useCallback(() => {
		commitStrokeChange((previous) => (previous.length > 0 ? [] : previous));
		setCurrentStroke(null);
		setLassoPath(null);
		setSelectedStrokeIndexes([]);
		lastPenSampleRef.current = null;
		setTransformSession(null);
		// Immediately notify parent of clear (bypass debounce)
		onStrokesChangeRef.current?.([]);
	}, [commitStrokeChange]);

	const undo = useCallback(() => {
		if (undoStackRef.current.length === 0) return;
		onEditInteraction?.();
		cancelHoldStraighten();
		setCurrentStroke(null);
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
		setCurrentStroke(null);
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
	const canUndo = undoStack.length > 0;
	const canRedo = redoStack.length > 0;
	const penButtonRect = penButtonRef.current?.getBoundingClientRect() ?? null;
	const eraserButtonRect = eraserButtonRef.current?.getBoundingClientRect() ?? null;
	const gridButtonRect = gridButtonRef.current?.getBoundingClientRect() ?? null;
	const overlayBubbles = badgeLayoutsRef.current.map((badge) => {
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
	});



	return (
		<div
			ref={containerRef}
			className={`drawing-canvas-wrapper flex flex-col select-none ${wrapperClassName ?? "color-bg"} ${isEmbedded ? "absolute inset-0" : "fixed inset-0 z-50"}`}
			style={{
				touchAction: "none",
				WebkitUserSelect: "none",
				userSelect: "none",
				WebkitTouchCallout: "none",
				WebkitTapHighlightColor: "transparent",
			}}
		>
			{/* Hidden elements to sample theme colors (pen: color-txt-main, grid: color-bg-grey-5) */}
			<div ref={colorSampleRef} className="color-txt-main absolute opacity-0 w-0 h-0 pointer-events-none" aria-hidden />
			<div ref={secondaryColorSampleRef} className="color-txt-sub absolute opacity-0 w-0 h-0 pointer-events-none" aria-hidden />
			<div ref={popupBgSampleRef} className="color-bg absolute opacity-0 w-0 h-0 pointer-events-none" aria-hidden />
			<div ref={gridColorSampleRef} className="color-bg-grey-10 absolute opacity-0 w-0 h-0 pointer-events-none" aria-hidden />
			<div ref={accentColorSampleRef} className="color-txt-accent absolute opacity-0 w-0 h-0 pointer-events-none" aria-hidden />
			<div ref={accentBgSampleRef} className="color-bg-accent absolute opacity-0 w-0 h-0 pointer-events-none" aria-hidden />
			<div ref={mutedBgSampleRef} className="color-bg-grey-5 absolute opacity-0 w-0 h-0 pointer-events-none" aria-hidden />
			{/* Canvas area */}
			<div
				className="flex-1 min-h-0 relative z-0 overflow-hidden select-none"
				style={{ WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none" }}
			>
				<canvas
					ref={canvasRef}
					tabIndex={-1}
					className="absolute inset-0 w-full h-full block"
					onPointerDown={handlePointerDown}
					onPointerDownCapture={(e) => e.preventDefault()}
					onPointerMove={handlePointerMove}
					onPointerUp={handlePointerUp}
					onPointerCancel={handlePointerUp}
					onPointerLeave={handlePointerUp}
					onWheel={handleWheel}
					onContextMenu={(e) => e.preventDefault()}
					style={{
						touchAction: "none",
						cursor: tool === "eraser" ? "cell" : tool === "lasso" ? "default" : "crosshair",
						WebkitUserSelect: "none",
						userSelect: "none",
						WebkitTouchCallout: "none",
						WebkitTapHighlightColor: "transparent",
					}}
				/>
				{/* Floating bar - mostly transparent with blur (hidden in readOnly) */}
				{!readOnly && (
				<div
					className="drawing-canvas-toolbar absolute bottom-4 left-1/2 -translate-x-1/2 z-[2000] flex items-center justify-center gap-1 py-1.5 px-2 rounded-[var(--radius-out)] color-shadow"
					style={{
						background: "rgba(128, 128, 128, 0.05)",
						backdropFilter: "blur(6px)",
						WebkitBackdropFilter: "blur(6px)",
					}}
				>
				<button
					type="button"
					onClick={undo}
					disabled={!canUndo}
					className={`p-1.5 rounded-[var(--radius-in)] transition-all color-txt-main ${canUndo ? "hover:opacity-90 hover:color-bg-grey-10" : "opacity-40 cursor-not-allowed"}`}
					title="Undo"
				>
					<Undo2 size={18} strokeWidth={2} />
				</button>
				<button
					type="button"
					onClick={redo}
					disabled={!canRedo}
					className={`p-1.5 rounded-[var(--radius-in)] transition-all color-txt-main ${canRedo ? "hover:opacity-90 hover:color-bg-grey-10" : "opacity-40 cursor-not-allowed"}`}
					title="Redo"
				>
					<Redo2 size={18} strokeWidth={2} />
				</button>
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
							if (tool === "pen") {
								setIsPenPopoverOpen((open) => !open);
							} else {
								setTool("pen");
								setIsPenPopoverOpen(false);
							}
							setIsEraserPopoverOpen(false);
							setIsGridPopoverOpen(false);
						}}
						className={`p-1.5 rounded-[var(--radius-in)] transition-all color-txt-main hover:opacity-90 ${tool === "pen" ? "color-bg-accent color-txt-accent" : "hover:color-bg-grey-10"}`}
						title="Pen"
					>
						<Pencil size={18} strokeWidth={2} />
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
						className={`p-1.5 rounded-[var(--radius-in)] transition-all color-txt-main hover:opacity-90 ${tool === "eraser" ? "color-bg-accent color-txt-accent" : "hover:color-bg-grey-10"}`}
						title="Eraser"
					>
						<Eraser size={18} strokeWidth={2} />
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
					className={`p-1.5 rounded-[var(--radius-in)] transition-all color-txt-main hover:opacity-90 ${tool === "lasso" ? "color-bg-accent color-txt-accent" : "hover:color-bg-grey-10"}`}
					title="Lasso select"
				>
					<MousePointer2 size={18} strokeWidth={2} />
				</button>
				<button
					ref={gridButtonRef}
					type="button"
					onPointerDown={() => startToolLongPress("grid")}
					onPointerUp={clearToolLongPressTimer}
					onPointerLeave={clearToolLongPressTimer}
					onPointerCancel={clearToolLongPressTimer}
					onClick={() => setGridMode((m) => {
						if (longPressHandledRef.current) {
							longPressHandledRef.current = false;
							return m;
						}
						setIsGridPopoverOpen(false);
						setIsPenPopoverOpen(false);
						setIsEraserPopoverOpen(false);
						const modes: GridMode[] = ["off", "lines", "dots", "music"];
						return modes[(modes.indexOf(m) + 1) % modes.length];
					})}
					className={`p-1.5 rounded-[var(--radius-in)] transition-all color-txt-main hover:opacity-90 ${gridMode !== "off" ? "color-bg-accent color-txt-accent" : "hover:color-bg-grey-10"}`}
					title={gridMode === "off" ? "Grid (off)" : gridMode === "lines" ? "Grid: square" : gridMode === "dots" ? "Grid: dots" : "Grid: music staves"}
				>
					{gridMode === "dots" ? <CircleDot size={18} strokeWidth={2} /> : gridMode === "music" ? <Music size={18} strokeWidth={2} /> : <Grid3X3 size={18} strokeWidth={2} />}
				</button>
				<button
					type="button"
					onClick={clearCanvas}
					className="p-1.5 rounded-[var(--radius-in)] transition-all color-txt-main hover:opacity-90 hover:color-bg-grey-10"
					title="Clear canvas"
				>
					<Trash2 size={18} strokeWidth={2} />
				</button>
				{onClose && (
					<button
						type="button"
						onClick={onClose}
						className="p-1.5 rounded-[var(--radius-in)] transition-all color-txt-main hover:opacity-90 hover:color-bg-grey-10 ml-1"
						title="Close whiteboard"
					>
						<X size={18} strokeWidth={2} />
					</button>
				)}
				</div>
				)}
				{penButtonRect && createPortal(
					<div
						ref={penPopoverRef}
						className={`fixed flex flex-col items-stretch gap-2 px-3 py-2 rounded-[var(--radius-in)] color-bg transition-all duration-180 ease-out ${isPenPopoverOpen ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"}`}
						style={{
							left: penButtonRect.left + penButtonRect.width / 2,
							top: penButtonRect.top - 10,
							transform: "translate(-50%, -100%)",
							backgroundColor: popupBgColor || undefined,
							color: strokeColor || undefined,
							zIndex: 2147483646,
						}}
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
										setActivePenColorIndex(index);
									}}
									className={`w-4 h-4 p-0 border-none rounded-full appearance-none shrink-0 transition-all ${activePenColorIndex === index ? "scale-110" : ""}`}
									style={{ backgroundColor: color }}
									aria-label="Set pen color"
									title="Set pen color"
								/>
							))}
						</div>
					</div>,
					document.body
				)}
				{eraserButtonRect && createPortal(
					<div
						ref={eraserPopoverRef}
						className={`fixed flex items-center gap-1 px-2 py-1 rounded-[var(--radius-in)] color-bg transition-all duration-180 ease-out ${isEraserPopoverOpen ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"}`}
						style={{
							left: eraserButtonRect.left + eraserButtonRect.width / 2,
							top: eraserButtonRect.top - 10,
							transform: "translate(-50%, -100%)",
							backgroundColor: popupBgColor || undefined,
							color: strokeColor || undefined,
							zIndex: 2147483646,
						}}
					>
						<button
							type="button"
							onClick={() => {
								setEraserMode("point");
							}}
							className="px-3 py-1 rounded-md text-sm"
							style={{
								backgroundColor: eraserMode === "point" ? accentBgColor || undefined : mutedBgColor || undefined,
								color: eraserMode === "point" ? accentColor || strokeColor || undefined : strokeColor || undefined,
							}}
						>
							Point
						</button>
						<button
							type="button"
							onClick={() => {
								setEraserMode("stroke");
							}}
							className="px-3 py-1 rounded-md text-sm"
							style={{
								backgroundColor: eraserMode === "stroke" ? accentBgColor || undefined : mutedBgColor || undefined,
								color: eraserMode === "stroke" ? accentColor || strokeColor || undefined : strokeColor || undefined,
							}}
						>
							Stroke
						</button>
					</div>,
					document.body
				)}
				{gridButtonRect && createPortal(
					<div
						ref={gridPopoverRef}
						className={`fixed flex flex-col items-stretch gap-1.5 px-3 py-2 rounded-[var(--radius-in)] color-bg transition-all duration-180 ease-out ${isGridPopoverOpen ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"}`}
						style={{
							left: gridButtonRect.left + gridButtonRect.width / 2,
							top: gridButtonRect.top - 10,
							transform: "translate(-50%, -100%)",
							backgroundColor: popupBgColor || undefined,
							color: strokeColor || undefined,
							zIndex: 2147483646,
						}}
					>
						<div className="w-[58px] flex justify-center">
							<input
								type="range"
								min={5}
								max={100}
								step={1}
								value={Math.round(gridOpacity * 100)}
								onChange={(e) => setGridOpacity(Math.max(0.05, Math.min(1, Number(e.target.value) / 100)))}
								className="pen-thickness-slider w-full"
								style={{
									["--slider-track-color" as string]: mutedBgColor || "rgba(128, 128, 128, 0.3)",
									["--slider-thumb-color" as string]: accentColor || strokeColor || "#2563EB",
									["--slider-thumb-size" as string]: "12px",
								}}
								aria-label="Grid opacity"
							/>
						</div>
					</div>,
					document.body
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
