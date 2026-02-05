import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Pencil, Eraser, Grid3X3, Trash2, X, CircleDot } from "lucide-react";

type Point = { x: number; y: number; pressure: number };
type Stroke = { points: Point[]; tool: "pen" | "eraser" };

/** Grid display: off, square (lines), or dots at intersections. */
type GridMode = "off" | "lines" | "dots";

const MIN_SCALE = 0.1;
const MAX_SCALE = 10;
const GRID_STEP = 40;
const GRID_DOT_RADIUS = 1.5;
const ERASER_WIDTH = 24;
const BASE_PEN_WIDTH = 2;

/** Call with a function that returns the current drawing as PNG data URL, or null. Called on mount, cleared on unmount. */
export type RegisterDrawingSnapshot = (getSnapshot: (() => string | null) | null) => void;

type DrawingCanvasProps = {
	onClose?: () => void;
	/** Register a getter for the current canvas image (so e.g. AI can include it). */
	registerDrawingSnapshot?: RegisterDrawingSnapshot;
};

export default function DrawingCanvas({ onClose, registerDrawingSnapshot }: DrawingCanvasProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const colorSampleRef = useRef<HTMLDivElement>(null);
	const gridColorSampleRef = useRef<HTMLDivElement>(null);

	const [strokes, setStrokes] = useState<Stroke[]>([]);
	const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
	const [pan, setPan] = useState({ x: 0, y: 0 });
	const [scale, setScale] = useState(1);
	const [tool, setTool] = useState<"pen" | "eraser">("pen");
	const [gridMode, setGridMode] = useState<GridMode>("lines");
	const [strokeColor, setStrokeColor] = useState("");
	const [gridColor, setGridColor] = useState("");

	const isDrawingRef = useRef(false);
	const lastPointRef = useRef<Point | null>(null);
	const pinchStartRef = useRef<{ distance: number; center: { x: number; y: number }; scale: number; pan: { x: number; y: number } } | null>(null);
	const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
	const pointerIdsRef = useRef<Map<number, { x: number; y: number }>>(new Map());

	// Read theme colors from DOM (follows data-theme) - pen: color-txt-main, grid: color-bg-grey-5
	useLayoutEffect(() => {
		const strokeEl = colorSampleRef.current;
		const gridEl = gridColorSampleRef.current;
		if (!strokeEl || !gridEl) return;
		const updateColors = () => {
			if (strokeEl) setStrokeColor(getComputedStyle(strokeEl).color);
			if (gridEl) setGridColor(getComputedStyle(gridEl).backgroundColor);
		};
		updateColors();
		const observer = new MutationObserver(updateColors);
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
		return () => observer.disconnect();
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

	const draw = useCallback(() => {
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext("2d");
		if (!canvas || !ctx) return;

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

		// Draw strokes first (eraser only affects these; grid is drawn on top so it cannot be erased)
		for (const stroke of strokes) {
			drawStroke(ctx, stroke);
		}
		if (currentStroke) {
			drawStroke(ctx, currentStroke);
		}

		// Grid on top (not erasable) - lines or dots
		if (gridMode !== "off" && gridColor) {
			const left = -pan.x / scale;
			const top = -pan.y / scale;
			const right = left + w / scale;
			const bottom = top + h / scale;
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
		ctx.restore();
	}, [pan, scale, gridMode, strokes, currentStroke, strokeColor, gridColor]);

	useEffect(() => {
		draw();
	}, [draw]);

	// Expose current drawing as PNG for AI/vision (strokes only, no grid)
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
		ctx.save();
		ctx.translate(pan.x, pan.y);
		ctx.scale(scale, scale);
		for (const stroke of strokes) drawStroke(ctx, stroke);
		if (currentStroke) drawStroke(ctx, currentStroke);
		ctx.restore();
		return off.toDataURL("image/png");
	}, [pan, scale, strokes, currentStroke]);
	useEffect(() => {
		if (!registerDrawingSnapshot) return;
		registerDrawingSnapshot(getSnapshot);
		return () => registerDrawingSnapshot(null);
	}, [registerDrawingSnapshot, getSnapshot]);

	function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
		if (stroke.points.length < 2) return;
		if (stroke.tool === "eraser") {
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
		} else if (strokeColor) {
			ctx.globalCompositeOperation = "source-over";
			ctx.strokeStyle = strokeColor;
			ctx.lineCap = "round";
			ctx.lineJoin = "round";
			for (let i = 0; i < stroke.points.length - 1; i++) {
				const p0 = stroke.points[i];
				const p1 = stroke.points[i + 1];
				const width = BASE_PEN_WIDTH * (Math.max(0.3, p0.pressure) + 0.5);
				ctx.lineWidth = width;
				ctx.beginPath();
				ctx.moveTo(p0.x, p0.y);
				ctx.lineTo(p1.x, p1.y);
				ctx.stroke();
			}
		}
	}

	const handlePointerDown = useCallback(
		(e: React.PointerEvent) => {
			e.preventDefault();
			const canvas = canvasRef.current;
			if (!canvas) return;
			canvas.setPointerCapture(e.pointerId);
			const rect = canvas.getBoundingClientRect();
			const world = screenToWorld(e.clientX, e.clientY);
			world.pressure = getPressure(e.nativeEvent);

			const pointers = pointerIdsRef.current;
			pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

			if (pointers.size === 2) {
				// Start pinch
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
				const shouldDraw = (isPen || isMouse || isTouch) && (tool === "pen" || tool === "eraser");
				if (shouldDraw) {
					isDrawingRef.current = true;
					const newStroke: Stroke = { points: [world], tool };
					setCurrentStroke(newStroke);
					lastPointRef.current = world;
				} else {
					panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
				}
			}
		},
		[pan, scale, screenToWorld, tool]
	);

	const handlePointerMove = useCallback(
		(e: React.PointerEvent) => {
			e.preventDefault();
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

			if (isDrawingRef.current && currentStroke) {
				const world = screenToWorld(e.clientX, e.clientY);
				world.pressure = getPressure(e.nativeEvent);
				setCurrentStroke((prev) =>
					prev ? { ...prev, points: [...prev.points, world] } : null
				);
				lastPointRef.current = world;
			}
		},
		[currentStroke, screenToWorld]
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
				if (isDrawingRef.current && currentStroke && currentStroke.points.length > 0) {
					setStrokes((prev) => [...prev, currentStroke]);
					setCurrentStroke(null);
				}
				isDrawingRef.current = false;
			}
		},
		[currentStroke]
	);

	const handleWheel = useCallback(
		(e: React.WheelEvent) => {
			e.preventDefault();
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
		[pan, scale]
	);

	const clearCanvas = useCallback(() => {
		setStrokes([]);
		setCurrentStroke(null);
	}, []);

	const isEmbedded = onClose == null;

	return (
		<div
			ref={containerRef}
			className={`drawing-canvas-wrapper flex flex-col color-bg select-none ${isEmbedded ? "absolute inset-0" : "fixed inset-0 z-50"}`}
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
			<div ref={gridColorSampleRef} className="color-bg-grey-5 absolute opacity-0 w-0 h-0 pointer-events-none" aria-hidden />
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
						cursor: tool === "eraser" ? "cell" : "crosshair",
						WebkitUserSelect: "none",
						userSelect: "none",
						WebkitTouchCallout: "none",
						WebkitTapHighlightColor: "transparent",
					}}
				/>
				{/* Floating bar - mostly transparent with blur */}
				<div
					className="drawing-canvas-toolbar absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center justify-center gap-1 py-1.5 px-2 rounded-[var(--radius-out)] border color-shadow"
					style={{
						background: "rgba(128, 128, 128, 0.05)",
						backdropFilter: "blur(6px)",
						WebkitBackdropFilter: "blur(6px)",
					}}
				>
				<button
					type="button"
					onClick={() => setTool("pen")}
					className={`p-1.5 rounded-[var(--radius-in)] transition-all color-txt-main hover:opacity-90 ${tool === "pen" ? "color-bg-accent color-txt-accent" : "hover:color-bg-grey-10"}`}
					title="Pen"
				>
					<Pencil size={18} strokeWidth={2} />
				</button>
				<button
					type="button"
					onClick={() => setTool("eraser")}
					className={`p-1.5 rounded-[var(--radius-in)] transition-all color-txt-main hover:opacity-90 ${tool === "eraser" ? "color-bg-accent color-txt-accent" : "hover:color-bg-grey-10"}`}
					title="Eraser"
				>
					<Eraser size={18} strokeWidth={2} />
				</button>
				<button
					type="button"
					onClick={() => setGridMode((m) => (m === "off" ? "lines" : m === "lines" ? "dots" : "off"))}
					className={`p-1.5 rounded-[var(--radius-in)] transition-all color-txt-main hover:opacity-90 ${gridMode !== "off" ? "color-bg-accent color-txt-accent" : "hover:color-bg-grey-10"}`}
					title={gridMode === "off" ? "Grid (off)" : gridMode === "lines" ? "Grid: square" : "Grid: dots"}
				>
					{gridMode === "dots" ? <CircleDot size={18} strokeWidth={2} /> : <Grid3X3 size={18} strokeWidth={2} />}
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
			</div>
		</div>
	);
}
