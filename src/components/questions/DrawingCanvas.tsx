import React, { useRef, useEffect, useState } from "react";

type Props = {
  containerRef: React.RefObject<HTMLElement>;
};

export default function DrawingCanvas({ containerRef }: Props) {
  const gridRef = useRef<HTMLCanvasElement | null>(null);
  const drawRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const lastPointRef = useRef<{x: number; y: number; pressure: number} | null>(null);

  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [drawing, setDrawing] = useState(false);
  
  // Pinch zoom/pan state
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  const pinchRef = useRef<{
    initialDistance: number;
    initialScale: number;
    initialCenterX: number;
    initialCenterY: number;
    initialX: number;
    initialY: number;
  } | null>(null);

  const gridSize = 32;
  const penColor = "#ffffff";
  const penWidth = 5;
  const eraserWidth = 24;

  // Sync ref with state for use in event handlers
  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  // Procreate-style pressure curve
  const getPressureWidth = (pressure: number) => {
    const curved = Math.pow(Math.min(1, Math.max(0, pressure)), 3);
    return Math.max(0.5, penWidth * 0.2 + penWidth * 0.8 * curved);
  };

  const addBlockingListeners = () => {
    document.body.style.userSelect = "none";
    document.body.style.webkitUserSelect = "none";
    document.body.style.msUserSelect = "none";
    document.addEventListener("selectstart", preventDefaultCapture, true);
    document.addEventListener("contextmenu", preventDefaultCapture, true);
    document.addEventListener("gesturestart", preventDefaultCapture as any, true);
    document.addEventListener("touchstart", touchPreventDefault, { passive: false, capture: true });
    document.addEventListener("touchmove", touchPreventDefault, { passive: false, capture: true });
  };

  const removeBlockingListeners = () => {
    document.body.style.userSelect = "";
    document.body.style.webkitUserSelect = "";
    document.body.style.msUserSelect = "";
    document.removeEventListener("selectstart", preventDefaultCapture, true);
    document.removeEventListener("contextmenu", preventDefaultCapture, true);
    document.removeEventListener("gesturestart", preventDefaultCapture as any, true);
    document.removeEventListener("touchstart", touchPreventDefault, { passive: false, capture: true } as any);
    document.removeEventListener("touchmove", touchPreventDefault, { passive: false, capture: true } as any);
  };

  function preventDefaultCapture(e: Event) {
    e.preventDefault();
  }
  function touchPreventDefault(e: Event) {
    if (drawing) {
      e.preventDefault();
    }
  }

  const resizeCanvas = () => {
    const grid = gridRef.current;
    const draw = drawRef.current;
    const cont = containerRef.current;
    if (!grid || !draw || !cont) return;

    const rect = cont.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    const tmp = document.createElement("canvas");
    tmp.width = draw.width;
    tmp.height = draw.height;
    const tctx = tmp.getContext("2d");
    if (tctx) tctx.drawImage(draw, 0, 0);

    grid.style.width = `${rect.width}px`;
    grid.style.height = `${rect.height}px`;
    draw.style.width = `${rect.width}px`;
    draw.style.height = `${rect.height}px`;

    grid.width = Math.max(1, Math.floor(rect.width * dpr));
    grid.height = Math.max(1, Math.floor(rect.height * dpr));
    draw.width = Math.max(1, Math.floor(rect.width * dpr));
    draw.height = Math.max(1, Math.floor(rect.height * dpr));

    const gctx = grid.getContext("2d");
    const dctx = draw.getContext("2d");
    if (!gctx || !dctx) return;
    gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    drawGrid(gctx, rect.width, rect.height);

    if (tmp.width && tmp.height) {
      dctx.clearRect(0, 0, rect.width, rect.height);
      dctx.drawImage(tmp, 0, 0, tmp.width / (dpr || 1), tmp.height / (dpr || 1));
    }

    ctxRef.current = dctx;
  };

  const drawGrid = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(w, y + 0.5);
      ctx.stroke();
    }
    ctx.restore();
  };

  useEffect(() => {
    resizeCanvas();
    const ro = new ResizeObserver(resizeCanvas);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Pinch zoom helpers
  const getTouchDistance = (t1: Touch, t2: Touch) => {
    return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
  };

  const getTouchCenter = (t1: Touch, t2: Touch) => ({
    x: (t1.clientX + t2.clientX) / 2,
    y: (t1.clientY + t2.clientY) / 2,
  });

  const handleTouchStart = (e: TouchEvent) => {
    if (drawing) return; // Don't pinch while drawing
    if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = getTouchDistance(t1, t2);
      const center = getTouchCenter(t1, t2);
      const t = transformRef.current;
      
      pinchRef.current = {
        initialDistance: dist,
        initialScale: t.scale,
        initialCenterX: center.x,
        initialCenterY: center.y,
        initialX: t.x,
        initialY: t.y,
      };
    }
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = getTouchDistance(t1, t2);
      const center = getTouchCenter(t1, t2);
      const p = pinchRef.current;
      
      const newScale = Math.max(0.1, Math.min(5, p.initialScale * (dist / p.initialDistance)));
      const scaleRatio = newScale / p.initialScale;
      
      // Maintain focus point under fingers during zoom
      const newX = center.x - (p.initialCenterX - p.initialX) * scaleRatio;
      const newY = center.y - (p.initialCenterY - p.initialY) * scaleRatio;
      
      const newTransform = { x: newX, y: newY, scale: newScale };
      setTransform(newTransform);
    }
  };

  const handleTouchEnd = (e: TouchEvent) => {
    if (e.touches.length < 2) {
      pinchRef.current = null;
    }
  };

  // Update getPointerInfo to account for zoom/pan transform
  const getPointerInfo = (e: PointerEvent) => {
    const draw = drawRef.current!;
    const rect = draw.getBoundingClientRect();
    const t = transformRef.current;
    
    // Convert screen coordinates to canvas coordinates accounting for zoom/pan
    const x = (e.clientX - rect.left) / t.scale;
    const y = (e.clientY - rect.top) / t.scale;
    
    const pressure = e.pressure === 0 ? 0.5 : e.pressure ?? 1;
    return { x, y, pressure, isPen: e.pointerType === "pen" };
  };

  const handlePointerDown = (e: PointerEvent) => {
    // Don't start drawing if currently pinching
    if (pinchRef.current) return;
    
    const draw = drawRef.current;
    if (!draw) return;
    e.preventDefault();
    try { draw.setPointerCapture(e.pointerId); } catch (_) {}

    const info = getPointerInfo(e);
    const ctx = ctxRef.current;
    if (!ctx) return;

    lastPointRef.current = { x: info.x, y: info.y, pressure: info.pressure };

    if (tool === "pen") {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = penColor;
      ctx.lineWidth = getPressureWidth(info.pressure);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    } else {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = eraserWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    }

    ctx.beginPath();
    ctx.moveTo(info.x, info.y);

    setDrawing(true);
    addBlockingListeners();
  };

  let rafId = 0;
  const queued: { x: number; y: number; pressure?: number; tool?: string }[] = [];

  const handlePointerMove = (e: PointerEvent) => {
    if (!drawing) return;
    e.preventDefault();
    const info = getPointerInfo(e);
    queued.push({ x: info.x, y: info.y, pressure: info.pressure, tool });

    if (!rafId) {
      rafId = requestAnimationFrame(() => {
        const ctx = ctxRef.current;
        if (!ctx) { rafId = 0; queued.length = 0; return; }

        while (queued.length) {
          const p = queued.shift()!;
          const prev = lastPointRef.current;
          
          if (!prev) continue;
          
          const avgPressure = (prev.pressure + (p.pressure ?? 1)) / 2;
          
          if (p.tool === "pen") {
            ctx.globalCompositeOperation = "source-over";
            ctx.strokeStyle = penColor;
            ctx.lineWidth = getPressureWidth(avgPressure);
          } else {
            ctx.globalCompositeOperation = "destination-out";
            ctx.lineWidth = eraserWidth;
          }
          
          ctx.beginPath();
          ctx.moveTo(prev.x, prev.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          
          lastPointRef.current = { x: p.x, y: p.y, pressure: p.pressure ?? 1 };
        }
        rafId = 0;
      });
    }
  };

  const stopPointer = (e?: PointerEvent) => {
    try {
      if (e && drawRef.current) drawRef.current.releasePointerCapture(e.pointerId);
    } catch (_) {}
    setDrawing(false);
    lastPointRef.current = null;
    removeBlockingListeners();
    const ctx = ctxRef.current;
    if (ctx) {
      ctx.closePath();
    }
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    queued.length = 0;
  };

  useEffect(() => {
    const canvas = drawRef.current;
    if (!canvas) return;

    canvas.style.position = "absolute";
    canvas.style.inset = "0";
    canvas.style.zIndex = "1100";
    canvas.style.touchAction = "none";
    canvas.style.webkitTouchCallout = "none";
    canvas.style.webkitUserSelect = "none";

    canvas.addEventListener("pointerdown", handlePointerDown, { passive: false });
    canvas.addEventListener("pointermove", handlePointerMove, { passive: false });
    canvas.addEventListener("pointerup", stopPointer, { passive: false });
    canvas.addEventListener("pointercancel", stopPointer, { passive: false });
    canvas.addEventListener("pointerleave", stopPointer, { passive: false });
    canvas.addEventListener("contextmenu", (ev) => ev.preventDefault());

    // Pinch zoom listeners
    canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
    canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
    canvas.addEventListener("touchend", handleTouchEnd);
    canvas.addEventListener("touchcancel", handleTouchEnd);

    const touchStart = (ev: TouchEvent) => { if (drawing) ev.preventDefault(); };
    document.addEventListener("touchstart", touchStart, { passive: false, capture: true });

    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", stopPointer);
      canvas.removeEventListener("pointercancel", stopPointer);
      canvas.removeEventListener("pointerleave", stopPointer);
      canvas.removeEventListener("contextmenu", (ev) => ev.preventDefault());
      
      canvas.removeEventListener("touchstart", handleTouchStart);
      canvas.removeEventListener("touchmove", handleTouchMove);
      canvas.removeEventListener("touchend", handleTouchEnd);
      canvas.removeEventListener("touchcancel", handleTouchEnd);
      
      document.removeEventListener("touchstart", touchStart, { passive: false, capture: true } as any);
    };
  }, [drawing, tool]);

  const toolbarStyle: React.CSSProperties = {
    position: "absolute",
    top: 10,
    right: 10,
    zIndex: 1200,
    display: "flex",
    gap: 8,
    background: "rgba(0,0,0,0.25)",
    padding: 6,
    borderRadius: 8,
    alignItems: "center",
  };

  return (
    <>
      {/* Toolbar */}
      <div style={toolbarStyle}>
        <button
          onClick={() => setTool("pen")}
          style={{
            padding: "6px 10px",
            background: tool === "pen" ? "#4ade80" : "transparent",
            border: "none",
            borderRadius: 6,
            color: "white",
            cursor: "pointer",
          }}
          aria-pressed={tool === "pen"}
        >
          ✏️
        </button>
        <button
          onClick={() => setTool("eraser")}
          style={{
            padding: "6px 10px",
            background: tool === "eraser" ? "#4ade80" : "transparent",
            border: "none",
            borderRadius: 6,
            color: "white",
            cursor: "pointer",
          }}
          aria-pressed={tool === "eraser"}
        >
          🧽
        </button>
        <button
          onClick={() => {
            const ctx = ctxRef.current;
            const draw = drawRef.current;
            if (!ctx || !draw || !containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            ctx.clearRect(0, 0, rect.width, rect.height);
          }}
          style={{
            padding: "6px 10px",
            background: "transparent",
            border: "none",
            borderRadius: 6,
            color: "white",
            cursor: "pointer",
          }}
        >
          🗑️
        </button>
        <button
          onClick={() => setTransform({ x: 0, y: 0, scale: 1 })}
          style={{
            padding: "6px 10px",
            background: "transparent",
            border: "none",
            borderRadius: 6,
            color: "white",
            cursor: "pointer",
            fontSize: 12,
          }}
          title="Reset Zoom"
        >
          ⌖
        </button>
      </div>

      {/* Transform wrapper for zoom/pan */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transformOrigin: "0 0",
          zIndex: 1000,
          touchAction: "none",
        }}
      >
        {/* Grid canvas */}
        <canvas
          ref={gridRef}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1000,
            pointerEvents: "none",
          }}
        />

        {/* Draw canvas */}
        <canvas
          ref={drawRef}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1100,
            touchAction: "none",
            userSelect: "none",
          }}
        />
      </div>
    </>
  );
}