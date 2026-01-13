import { useRef, useState, useEffect, useCallback } from 'react';
import { LuEraser, LuTrash2, LuPencil } from 'react-icons/lu';

type DrawingMode = 'draw' | 'erase' | 'none';

interface Point {
  x: number;
  y: number;
  pressure?: number;
}

interface DrawingCanvasProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  enabled?: boolean;
}

export default function DrawingCanvas({ containerRef, enabled = true }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colorProbeRef = useRef<HTMLSpanElement>(null);
  const [mode, setMode] = useState<DrawingMode>('none');
  const [penColor, setPenColor] = useState('#27548a');
  
  // Use refs instead of state for drawing to avoid React re-render latency
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<Point | null>(null);
  const currentModeRef = useRef<DrawingMode>('none');
  const penColorRef = useRef('#27548a');
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  // Keep refs in sync with state
  useEffect(() => {
    currentModeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    penColorRef.current = penColor;
  }, [penColor]);

  // Get the themed accent color from the hidden probe element
  useEffect(() => {
    const updatePenColor = () => {
      if (colorProbeRef.current) {
        const computedColor = getComputedStyle(colorProbeRef.current).color;
        if (computedColor && computedColor !== 'rgb(0, 0, 0)') {
          setPenColor(computedColor);
        }
      }
    };

    updatePenColor();
    
    const themedRoot = document.getElementById('themed-root');
    if (themedRoot) {
      const observer = new MutationObserver(updatePenColor);
      observer.observe(themedRoot, { 
        attributes: true, 
        attributeFilter: ['data-theme'] 
      });
      return () => observer.disconnect();
    }
  }, []);

  // Resize canvas to match container
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // Store current drawing
    const ctx = canvas.getContext('2d');
    const imageData = ctx?.getImageData(0, 0, canvas.width, canvas.height);

    // Resize canvas
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    if (ctx) {
      ctx.scale(dpr, dpr);
      ctxRef.current = ctx;
      if (imageData) {
        ctx.putImageData(imageData, 0, 0);
      }
    }
  }, [containerRef]);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [resizeCanvas]);

  // Set up pointer event handlers directly on canvas for better responsiveness
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Cache context
    ctxRef.current = canvas.getContext('2d');

    const getPosition = (e: PointerEvent): Point => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        pressure: e.pressure > 0 ? e.pressure : 0.5
      };
    };

    const drawLine = (from: Point, to: Point, isErase: boolean) => {
      const ctx = ctxRef.current;
      if (!ctx) return;

      const baseWidth = isErase ? 30 : 3;
      const lineWidth = baseWidth * (0.5 + (to.pressure || 0.5));

      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      
      if (isErase) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = penColorRef.current;
      }
      
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (currentModeRef.current === 'none') return;
      
      // Aggressively prevent all default behaviors
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      // Capture pointer for better tracking
      canvas.setPointerCapture(e.pointerId);
      
      const pos = getPosition(e);
      isDrawingRef.current = true;
      lastPointRef.current = pos;
      
      // Draw initial dot
      drawLine(pos, pos, currentModeRef.current === 'erase');
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isDrawingRef.current || currentModeRef.current === 'none') return;
      
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      // Use coalesced events for smoother drawing (captures all points between frames)
      const events = e.getCoalescedEvents?.() || [e];
      
      for (const coalescedEvent of events) {
        const pos = getPosition(coalescedEvent);
        const lastPoint = lastPointRef.current;
        
        if (lastPoint) {
          drawLine(lastPoint, pos, currentModeRef.current === 'erase');
        }
        
        lastPointRef.current = pos;
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (isDrawingRef.current && canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
      isDrawingRef.current = false;
      lastPointRef.current = null;
    };

    const handlePointerCancel = (e: PointerEvent) => {
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
      isDrawingRef.current = false;
      lastPointRef.current = null;
    };

    // Prevent touch behaviors that cause selection
    const preventTouchBehavior = (e: TouchEvent) => {
      if (currentModeRef.current !== 'none') {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // Prevent context menu on long press
    const preventContextMenu = (e: Event) => {
      if (currentModeRef.current !== 'none') {
        e.preventDefault();
      }
    };

    // Prevent selection start
    const preventSelection = (e: Event) => {
      if (currentModeRef.current !== 'none') {
        e.preventDefault();
      }
    };

    // Add all event listeners with capture phase for priority
    canvas.addEventListener('pointerdown', handlePointerDown, { capture: true, passive: false });
    canvas.addEventListener('pointermove', handlePointerMove, { capture: true, passive: false });
    canvas.addEventListener('pointerup', handlePointerUp, { capture: true });
    canvas.addEventListener('pointercancel', handlePointerCancel, { capture: true });
    canvas.addEventListener('pointerleave', handlePointerUp, { capture: true });
    
    // Prevent touch behaviors
    canvas.addEventListener('touchstart', preventTouchBehavior, { passive: false });
    canvas.addEventListener('touchmove', preventTouchBehavior, { passive: false });
    canvas.addEventListener('touchend', preventTouchBehavior, { passive: false });
    
    // Prevent context menu and selection
    canvas.addEventListener('contextmenu', preventContextMenu);
    canvas.addEventListener('selectstart', preventSelection);

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerCancel);
      canvas.removeEventListener('pointerleave', handlePointerUp);
      canvas.removeEventListener('touchstart', preventTouchBehavior);
      canvas.removeEventListener('touchmove', preventTouchBehavior);
      canvas.removeEventListener('touchend', preventTouchBehavior);
      canvas.removeEventListener('contextmenu', preventContextMenu);
      canvas.removeEventListener('selectstart', preventSelection);
    };
  }, []);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!ctx || !canvas) return;
    
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const toggleMode = (newMode: DrawingMode) => {
    setMode(prev => prev === newMode ? 'none' : newMode);
  };

  // Don't render anything if disabled
  if (!enabled) return null;

  return (
    <>
      {/* Hidden element to probe the themed accent color */}
      <span 
        ref={colorProbeRef} 
        className="color-txt-accent absolute opacity-0 pointer-events-none" 
        aria-hidden="true"
      />
      
      {/* Drawing Canvas Overlay */}
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 z-[100] rounded-out ${
          mode === 'none' ? 'pointer-events-none' : ''
        }`}
        style={{ 
          cursor: mode === 'draw' ? 'crosshair' : mode === 'erase' ? 'cell' : 'default',
          touchAction: mode === 'none' ? 'auto' : 'none',
          WebkitTouchCallout: 'none',
          WebkitUserSelect: 'none',
          userSelect: 'none',
          msTouchAction: mode === 'none' ? 'auto' : 'none',
          WebkitTapHighlightColor: 'transparent',
        } as React.CSSProperties}
      />

      {/* Drawing Controls */}
      <div className="absolute top-3 right-3 z-[101] flex gap-2">
        {/* Draw Mode Toggle */}
        <button
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 ${
            mode === 'draw' 
              ? 'color-bg-accent color-txt-accent shadow-md scale-110' 
              : 'color-bg-grey-5 color-txt-sub hover:scale-105'
          }`}
          onClick={() => toggleMode('draw')}
          onTouchEnd={(e) => { e.preventDefault(); toggleMode('draw'); }}
          title="Draw"
        >
          <LuPencil size={18} strokeWidth={2} />
        </button>

        {/* Eraser Mode Toggle */}
        <button
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 ${
            mode === 'erase' 
              ? 'color-bg-accent color-txt-accent shadow-md scale-110' 
              : 'color-bg-grey-5 color-txt-sub hover:scale-105'
          }`}
          onClick={() => toggleMode('erase')}
          onTouchEnd={(e) => { e.preventDefault(); toggleMode('erase'); }}
          title="Eraser"
        >
          <LuEraser size={18} strokeWidth={2} />
        </button>

        {/* Clear All */}
        <button
          className="w-9 h-9 rounded-full flex items-center justify-center color-bg-grey-5 color-txt-sub hover:scale-105 transition-all duration-200"
          onClick={clearCanvas}
          onTouchEnd={(e) => { e.preventDefault(); clearCanvas(); }}
          title="Clear All"
        >
          <LuTrash2 size={18} strokeWidth={2} />
        </button>
      </div>
    </>
  );
}
