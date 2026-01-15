import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Stage, Layer, Line, Group } from 'react-konva';
import Konva from 'konva';
import { LuEraser, LuTrash2, LuPencil, LuGrid3X3, LuZoomIn, LuZoomOut, LuMove } from 'react-icons/lu';

type DrawingMode = 'draw' | 'erase' | 'none';

interface LineData {
  id: string;
  points: number[];
  stroke: string;
  strokeWidth: number;
  tool: 'draw' | 'erase';
  tension: number;
  lineCap: 'round';
  lineJoin: 'round';
  globalCompositeOperation: 'source-over' | 'destination-out';
}

interface DrawingCanvasProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  enabled?: boolean;
}

export default function DrawingCanvas({ containerRef, enabled = true }: DrawingCanvasProps) {
  const stageRef = useRef<Konva.Stage>(null);
  const colorProbeRef = useRef<HTMLSpanElement>(null);
  
  const [mode, setMode] = useState<DrawingMode>('none');
  const [penColor, setPenColor] = useState('#27548a');
  const [lines, setLines] = useState<LineData[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  
  // Stage dimensions and transform
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  
  // Refs for smooth animations (avoid React re-renders during gestures)
  const scaleRef = useRef(1);
  const positionRef = useRef({ x: 0, y: 0 });
  
  // Keep refs in sync with state
  useEffect(() => {
    scaleRef.current = scale;
    positionRef.current = position;
  }, [scale, position]);
  
  // Track current line for pressure sensitivity
  const currentLineRef = useRef<LineData | null>(null);
  const lastPressureRef = useRef(0.5);
  
  // Track touch count for pinch zoom detection
  const touchCountRef = useRef(0);
  const isPinchingRef = useRef(false);
  
  // Panning state
  const [isPanning, setIsPanning] = useState(false);
  const isPanningRef = useRef(false);
  const lastPointerPosRef = useRef({ x: 0, y: 0 });

  // Grid settings
  const gridSize = 30;
  const gridColor = 'rgba(128, 128, 128, 0.15)';

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

  // Resize canvas to match container with ResizeObserver for better reliability
  const resizeCanvas = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const width = Math.max(rect.width, 100);
    const height = Math.max(rect.height, 100);
    
    setStageSize({ width, height });
    
    // Force stage to update immediately
    if (stageRef.current) {
      stageRef.current.width(width);
      stageRef.current.height(height);
      stageRef.current.batchDraw();
    }
  }, [containerRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Initial resize
    resizeCanvas();

    // Use ResizeObserver for more reliable container size tracking
    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas();
    });
    
    resizeObserver.observe(container);

    // Fallback to window resize
    window.addEventListener('resize', resizeCanvas);
    
    // Also resize on orientation change (important for tablets)
    window.addEventListener('orientationchange', resizeCanvas);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('orientationchange', resizeCanvas);
    };
  }, [resizeCanvas]);

  // Generate grid lines - memoized for performance
  const gridLines = useMemo(() => {
    const lines: JSX.Element[] = [];
    
    // Fixed grid that covers a large area (simpler, more performant)
    const gridExtent = 5000; // Large enough for most zoom levels
    const startX = -gridExtent;
    const startY = -gridExtent;
    const endX = gridExtent;
    const endY = gridExtent;

    // Vertical lines
    for (let x = startX; x <= endX; x += gridSize) {
      lines.push(
        <Line
          key={`v-${x}`}
          points={[x, startY, x, endY]}
          stroke={gridColor}
          strokeWidth={1}
          listening={false}
          perfectDrawEnabled={false}
        />
      );
    }

    // Horizontal lines
    for (let y = startY; y <= endY; y += gridSize) {
      lines.push(
        <Line
          key={`h-${y}`}
          points={[startX, y, endX, y]}
          stroke={gridColor}
          strokeWidth={1}
          listening={false}
          perfectDrawEnabled={false}
        />
      );
    }

    return lines;
  }, [gridSize]);

  // Get pointer position relative to stage
  const getPointerPosition = () => {
    const stage = stageRef.current;
    if (!stage) return null;

    const pointerPos = stage.getPointerPosition();
    if (!pointerPos) return null;

    // Transform to account for scale and position
    return {
      x: (pointerPos.x - position.x) / scale,
      y: (pointerPos.y - position.y) / scale,
    };
  };

  // Handle pointer down
  const handlePointerDown = (e: Konva.KonvaEventObject<PointerEvent>) => {
    const stage = stageRef.current;
    
    // Track touch count
    if (e.evt.pointerType === 'touch') {
      touchCountRef.current++;
      
      // If we have 2+ touches, cancel any current drawing and enter pinch mode
      if (touchCountRef.current >= 2) {
        isPinchingRef.current = true;
        if (isDrawing) {
          // Remove the last line that was started
          setLines(prev => prev.slice(0, -1));
          setIsDrawing(false);
          currentLineRef.current = null;
        }
        return;
      }
    }
    
    // Middle mouse button or none mode = panning
    if (e.evt.button === 1 || (mode === 'none' && e.evt.pointerType !== 'touch')) {
      e.evt.preventDefault();
      isPanningRef.current = true;
      setIsPanning(true);
      const pointer = stage?.getPointerPosition();
      if (pointer) {
        lastPointerPosRef.current = pointer;
      }
      return;
    }
    
    if (mode === 'none' || isPinchingRef.current) return;

    const pos = getPointerPosition();
    if (!pos) return;

    setIsDrawing(true);
    
    // Get pressure with better stylus/Apple Pencil support
    // Apple Pencil typically reports pressure values, but some browsers need fallback
    let pressure = 0.5;
    if (e.evt.pressure > 0 && e.evt.pressure <= 1) {
      pressure = e.evt.pressure;
    } else if (e.evt.pointerType === 'pen') {
      // If it's a pen but pressure is 0, assume medium pressure
      pressure = 0.7;
    }
    lastPressureRef.current = pressure;

    const baseWidth = mode === 'erase' ? 30 : 3;
    const strokeWidth = baseWidth * (0.5 + pressure);

    const newLine: LineData = {
      id: Date.now().toString(),
      points: [pos.x, pos.y],
      stroke: mode === 'erase' ? '#000000' : penColor,
      strokeWidth: strokeWidth,
      tool: mode,
      tension: 0.5,
      lineCap: 'round',
      lineJoin: 'round',
      globalCompositeOperation: mode === 'erase' ? 'destination-out' : 'source-over',
    };

    currentLineRef.current = newLine;
    setLines(prev => [...prev, newLine]);
  };

  // Handle pointer move
  const handlePointerMove = (e: Konva.KonvaEventObject<PointerEvent>) => {
    const stage = stageRef.current;
    
    // Handle panning
    if (isPanningRef.current && stage) {
      const pointer = stage.getPointerPosition();
      if (pointer) {
        const dx = pointer.x - lastPointerPosRef.current.x;
        const dy = pointer.y - lastPointerPosRef.current.y;
        
        const newPosition = {
          x: positionRef.current.x + dx,
          y: positionRef.current.y + dy,
        };
        
        positionRef.current = newPosition;
        stage.x(newPosition.x);
        stage.y(newPosition.y);
        stage.batchDraw();
        
        lastPointerPosRef.current = pointer;
      }
      return;
    }
    
    // Don't draw during pinch zoom
    if (!isDrawing || mode === 'none' || isPinchingRef.current) return;

    const pos = getPointerPosition();
    if (!pos) return;

    // Get pressure for pressure-sensitive stroke width with better pen/stylus support
    let pressure = lastPressureRef.current;
    if (e.evt.pressure > 0 && e.evt.pressure <= 1) {
      pressure = e.evt.pressure;
    } else if (e.evt.pointerType === 'pen') {
      // Stylus detected but no pressure - use last known or default
      pressure = lastPressureRef.current > 0 ? lastPressureRef.current : 0.7;
    }
    lastPressureRef.current = pressure;

    setLines(prev => {
      const lastLine = prev[prev.length - 1];
      if (!lastLine) return prev;

      // Add new points
      const newPoints = [...lastLine.points, pos.x, pos.y];
      
      // Update stroke width based on pressure
      const baseWidth = mode === 'erase' ? 30 : 3;
      const strokeWidth = baseWidth * (0.5 + pressure);

      const updatedLine = {
        ...lastLine,
        points: newPoints,
        strokeWidth: (lastLine.strokeWidth + strokeWidth) / 2, // Smooth transition
      };

      return [...prev.slice(0, -1), updatedLine];
    });
  };

  // Handle pointer up
  const handlePointerUp = (e: Konva.KonvaEventObject<PointerEvent>) => {
    // End panning
    if (isPanningRef.current) {
      isPanningRef.current = false;
      setIsPanning(false);
      setPosition(positionRef.current);
    }
    
    // Track touch count
    if (e.evt.pointerType === 'touch') {
      touchCountRef.current = Math.max(0, touchCountRef.current - 1);
      
      // Reset pinch mode when all fingers are lifted
      if (touchCountRef.current === 0) {
        isPinchingRef.current = false;
      }
    }
    
    setIsDrawing(false);
    currentLineRef.current = null;
  };

  // Handle wheel for zoom
  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();

    const stage = stageRef.current;
    if (!stage) return;

    const oldScale = scaleRef.current;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const mousePointTo = {
      x: (pointer.x - positionRef.current.x) / oldScale,
      y: (pointer.y - positionRef.current.y) / oldScale,
    };

    // Zoom in/out
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const scaleBy = 1.1;
    const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;

    // Clamp scale
    const clampedScale = Math.max(0.1, Math.min(5, newScale));
    
    const newPosition = {
      x: pointer.x - mousePointTo.x * clampedScale,
      y: pointer.y - mousePointTo.y * clampedScale,
    };

    // Update refs
    scaleRef.current = clampedScale;
    positionRef.current = newPosition;

    // Apply directly to stage for smooth animation
    stage.scaleX(clampedScale);
    stage.scaleY(clampedScale);
    stage.x(newPosition.x);
    stage.y(newPosition.y);
    stage.batchDraw();

    // Debounce state update
    setScale(clampedScale);
    setPosition(newPosition);
  };

  // Handle touch for pinch zoom
  const lastDistRef = useRef(0);
  const lastCenterRef = useRef({ x: 0, y: 0 });

  const handleTouchStart = (e: Konva.KonvaEventObject<TouchEvent>) => {
    // Immediately detect multi-touch and cancel drawing
    if (e.evt.touches.length >= 2) {
      isPinchingRef.current = true;
      touchCountRef.current = e.evt.touches.length;
      
      // Initialize pinch tracking
      const touch1 = e.evt.touches[0];
      const touch2 = e.evt.touches[1];
      lastDistRef.current = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) +
        Math.pow(touch2.clientY - touch1.clientY, 2)
      );
      lastCenterRef.current = {
        x: (touch1.clientX + touch2.clientX) / 2,
        y: (touch1.clientY + touch2.clientY) / 2,
      };
      
      // Cancel any active drawing
      if (isDrawing) {
        setLines(prev => prev.slice(0, -1));
        setIsDrawing(false);
        currentLineRef.current = null;
      }
    }
  };

  const handleTouchMove = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const touch1 = e.evt.touches[0];
    const touch2 = e.evt.touches[1];

    if (touch1 && touch2 && isPinchingRef.current) {
      e.evt.preventDefault();

      const stage = stageRef.current;
      if (!stage) return;

      // Calculate distance between two fingers
      const dist = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) +
        Math.pow(touch2.clientY - touch1.clientY, 2)
      );

      // Calculate center point
      const center = {
        x: (touch1.clientX + touch2.clientX) / 2,
        y: (touch1.clientY + touch2.clientY) / 2,
      };

      if (lastDistRef.current === 0) {
        lastDistRef.current = dist;
        lastCenterRef.current = center;
        return;
      }

      const stageRect = stage.container().getBoundingClientRect();
      const stageCenter = {
        x: center.x - stageRect.left,
        y: center.y - stageRect.top,
      };

      // Calculate new scale
      const scaleChange = dist / lastDistRef.current;
      const oldScale = scaleRef.current;
      const newScale = Math.max(0.1, Math.min(5, oldScale * scaleChange));

      // Calculate new position
      const mousePointTo = {
        x: (stageCenter.x - positionRef.current.x) / oldScale,
        y: (stageCenter.y - positionRef.current.y) / oldScale,
      };

      // Calculate position change for panning
      const centerDelta = {
        x: center.x - lastCenterRef.current.x,
        y: center.y - lastCenterRef.current.y,
      };

      const newPosition = {
        x: stageCenter.x - mousePointTo.x * newScale + centerDelta.x,
        y: stageCenter.y - mousePointTo.y * newScale + centerDelta.y,
      };

      // Update refs immediately
      scaleRef.current = newScale;
      positionRef.current = newPosition;

      // Apply directly to stage for smooth animation (bypass React)
      stage.scaleX(newScale);
      stage.scaleY(newScale);
      stage.x(newPosition.x);
      stage.y(newPosition.y);
      stage.batchDraw();

      lastDistRef.current = dist;
      lastCenterRef.current = center;
    }
  };

  const handleTouchEnd = (e: Konva.KonvaEventObject<TouchEvent>) => {
    // Sync React state with final values when gesture ends
    if (isPinchingRef.current && e.evt.touches.length < 2) {
      setScale(scaleRef.current);
      setPosition(positionRef.current);
    }
    
    lastDistRef.current = 0;
    lastCenterRef.current = { x: 0, y: 0 };
    
    // Reset touch tracking
    touchCountRef.current = e.evt.touches.length;
    
    // Small delay before allowing drawing again to prevent accidental strokes
    if (e.evt.touches.length === 0) {
      setTimeout(() => {
        isPinchingRef.current = false;
        touchCountRef.current = 0;
      }, 50);
    }
  };

  // Clear canvas
  const clearCanvas = () => {
    setLines([]);
  };

  // Zoom controls
  const zoomIn = () => {
    const newScale = Math.min(5, scale * 1.2);
    const centerX = stageSize.width / 2;
    const centerY = stageSize.height / 2;
    
    setScale(newScale);
    setPosition({
      x: centerX - (centerX - position.x) * (newScale / scale),
      y: centerY - (centerY - position.y) * (newScale / scale),
    });
  };

  const zoomOut = () => {
    const newScale = Math.max(0.1, scale / 1.2);
    const centerX = stageSize.width / 2;
    const centerY = stageSize.height / 2;
    
    setScale(newScale);
    setPosition({
      x: centerX - (centerX - position.x) * (newScale / scale),
      y: centerY - (centerY - position.y) * (newScale / scale),
    });
  };

  const resetZoom = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  // Toggle mode
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
      
      {/* Konva Stage */}
      <div 
        className={`absolute inset-0 z-[50] rounded-out overflow-hidden ${
          mode === 'none' ? 'pointer-events-none' : ''
        }`}
        style={{
          touchAction: mode === 'none' ? 'auto' : 'none',
          width: '100%',
          height: '100%',
        }}
      >
        <Stage
          ref={stageRef}
          width={stageSize.width}
          height={stageSize.height}
          scaleX={scale}
          scaleY={scale}
          x={position.x}
          y={position.y}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{
            cursor: isPanning ? 'grabbing' : mode === 'draw' ? 'crosshair' : mode === 'erase' ? 'cell' : 'grab',
            display: 'block',
            width: '100%',
            height: '100%',
          }}
        >
          {/* Grid Layer */}
          {showGrid && (
            <Layer listening={false}>
              <Group>
                {gridLines}
              </Group>
            </Layer>
          )}

          {/* Drawing Layer */}
          <Layer>
            {lines.map((line) => (
              <Line
                key={line.id}
                points={line.points}
                stroke={line.stroke}
                strokeWidth={line.strokeWidth}
                tension={line.tension}
                lineCap={line.lineCap}
                lineJoin={line.lineJoin}
                globalCompositeOperation={line.globalCompositeOperation}
                perfectDrawEnabled={false}
                shadowForStrokeEnabled={false}
              />
            ))}
          </Layer>
        </Stage>
      </div>

      {/* Drawing Controls - Fixed to bottom left of viewport */}
      <div className="fixed bottom-[3.5%] left-[5%] z-[101] flex gap-2">
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

        {/* Pan Mode Toggle */}
        <button
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 ${
            mode === 'none' 
              ? 'color-bg-accent color-txt-accent shadow-md scale-110' 
              : 'color-bg-grey-5 color-txt-sub hover:scale-105'
          }`}
          onClick={() => setMode('none')}
          onTouchEnd={(e) => { e.preventDefault(); setMode('none'); }}
          title="Pan (drag to move canvas)"
        >
          <LuMove size={18} strokeWidth={2} />
        </button>

        {/* Grid Toggle */}
        <button
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 ${
            showGrid 
              ? 'color-bg-accent color-txt-accent shadow-md scale-110' 
              : 'color-bg-grey-5 color-txt-sub hover:scale-105'
          }`}
          onClick={() => setShowGrid(!showGrid)}
          onTouchEnd={(e) => { e.preventDefault(); setShowGrid(!showGrid); }}
          title="Toggle Grid"
        >
          <LuGrid3X3 size={18} strokeWidth={2} />
        </button>

        {/* Zoom In */}
        <button
          className="w-9 h-9 rounded-full flex items-center justify-center color-bg-grey-5 color-txt-sub hover:scale-105 transition-all duration-200"
          onClick={zoomIn}
          onTouchEnd={(e) => { e.preventDefault(); zoomIn(); }}
          title="Zoom In"
        >
          <LuZoomIn size={18} strokeWidth={2} />
        </button>

        {/* Zoom Out */}
        <button
          className="w-9 h-9 rounded-full flex items-center justify-center color-bg-grey-5 color-txt-sub hover:scale-105 transition-all duration-200"
          onClick={zoomOut}
          onTouchEnd={(e) => { e.preventDefault(); zoomOut(); }}
          title="Zoom Out"
        >
          <LuZoomOut size={18} strokeWidth={2} />
        </button>

        {/* Reset Zoom */}
        <button
          className="w-9 h-9 rounded-full flex items-center justify-center color-bg-grey-5 color-txt-sub hover:scale-105 transition-all duration-200 text-xs font-bold"
          onClick={resetZoom}
          onTouchEnd={(e) => { e.preventDefault(); resetZoom(); }}
          title="Reset Zoom (100%)"
        >
          {Math.round(scale * 100)}%
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
