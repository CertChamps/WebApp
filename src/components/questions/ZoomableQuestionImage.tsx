import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LuX } from "react-icons/lu";
import { getThemedPortalTarget } from "../../utils/themedPortal";

type Transform = { scale: number; panX: number; panY: number };

type Props = {
  src: string;
  alt: string;
  className?: string;
};

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const RESET_SCALE_THRESHOLD = 1.05;
const RESET_ANIMATION_MS = 350;
const TAP_MOVE_THRESHOLD_PX = 8;
const TAP_MAX_DURATION_MS = 350;

function getDistance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function getCenter(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function clampScale(scale: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

function usePinchPanZoom(enabled: boolean) {
  const [transform, setTransform] = useState<Transform>({ scale: 1, panX: 0, panY: 0 });
  const [isTransitioning, setIsTransitioning] = useState(false);
  const transformRef = useRef(transform);
  const isTransitioningRef = useRef(false);
  transformRef.current = transform;
  isTransitioningRef.current = isTransitioning;
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartRef = useRef<{
    distance: number;
    center: { x: number; y: number };
    transform: Transform;
  } | null>(null);
  const panStartRef = useRef<{ x: number; y: number; transform: Transform } | null>(null);
  const movedRef = useRef(false);
  const tapStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const isGesturingRef = useRef(false);
  const [isGesturing, setIsGesturing] = useState(false);
  const resetResolveRef = useRef<(() => void) | null>(null);

  const clearGestureState = useCallback(() => {
    pointersRef.current.clear();
    pinchStartRef.current = null;
    panStartRef.current = null;
    movedRef.current = false;
    tapStartRef.current = null;
    isGesturingRef.current = false;
    setIsGesturing(false);
  }, []);

  const reset = useCallback(() => {
    resetResolveRef.current?.();
    resetResolveRef.current = null;
    setIsTransitioning(false);
    setTransform({ scale: 1, panX: 0, panY: 0 });
    clearGestureState();
  }, [clearGestureState]);

  const resetAnimated = useCallback((): Promise<void> => {
    const current = transformRef.current;
    if (current.scale === 1 && current.panX === 0 && current.panY === 0) {
      return Promise.resolve();
    }

    resetResolveRef.current?.();
    return new Promise((resolve) => {
      resetResolveRef.current = resolve;
      setIsTransitioning(true);
      setTransform({ scale: 1, panX: 0, panY: 0 });
      window.setTimeout(() => {
        if (resetResolveRef.current !== resolve) return;
        setIsTransitioning(false);
        resetResolveRef.current = null;
        resolve();
      }, RESET_ANIMATION_MS + 50);
    });
  }, []);

  const onTransitionEnd = useCallback((e: React.TransitionEvent<HTMLImageElement>) => {
    if (e.propertyName !== "transform" || !isTransitioningRef.current) return;
    setIsTransitioning(false);
    resetResolveRef.current?.();
    resetResolveRef.current = null;
  }, []);

  const shouldSnapToIdentity = useCallback((current: Transform) => {
    return current.scale <= RESET_SCALE_THRESHOLD;
  }, []);

  useEffect(() => {
    if (!enabled) reset();
  }, [enabled, reset]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled) return;
      resetResolveRef.current?.();
      resetResolveRef.current = null;
      setIsTransitioning(false);
      e.currentTarget.setPointerCapture(e.pointerId);
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      isGesturingRef.current = true;
      setIsGesturing(true);

      if (pointersRef.current.size === 1) {
        panStartRef.current = { x: e.clientX, y: e.clientY, transform: { ...transform } };
        tapStartRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
        movedRef.current = false;
      } else if (pointersRef.current.size === 2) {
        const pts = [...pointersRef.current.values()];
        pinchStartRef.current = {
          distance: getDistance(pts[0], pts[1]),
          center: getCenter(pts[0], pts[1]),
          transform: { ...transform },
        };
        panStartRef.current = null;
        tapStartRef.current = null;
      }
    },
    [enabled, transform]
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2 && pinchStartRef.current) {
      const pts = [...pointersRef.current.values()];
      const distance = getDistance(pts[0], pts[1]);
      const center = getCenter(pts[0], pts[1]);
      const start = pinchStartRef.current;
      const scaleRatio = distance / start.distance;
      const newScale = clampScale(start.transform.scale * scaleRatio);
      const dx = center.x - start.center.x;
      const dy = center.y - start.center.y;
      setTransform({
        scale: newScale,
        panX: start.transform.panX + dx,
        panY: start.transform.panY + dy,
      });
      movedRef.current = true;
      return;
    }

    if (pointersRef.current.size === 1 && panStartRef.current) {
      const start = panStartRef.current;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.abs(dx) > TAP_MOVE_THRESHOLD_PX || Math.abs(dy) > TAP_MOVE_THRESHOLD_PX) {
        movedRef.current = true;
      }
      if (start.transform.scale > 1 || movedRef.current) {
        setTransform({
          ...start.transform,
          panX: start.transform.panX + dx,
          panY: start.transform.panY + dy,
        });
      }
    }
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent, onTap?: () => void) => {
      pointersRef.current.delete(e.pointerId);
      if (pointersRef.current.size < 2) pinchStartRef.current = null;

      if (pointersRef.current.size === 0) {
        const tap = tapStartRef.current;
        const wasTap =
          tap &&
          !movedRef.current &&
          Date.now() - tap.time < TAP_MAX_DURATION_MS;
        if (wasTap && onTap) onTap();

        panStartRef.current = null;
        tapStartRef.current = null;
        isGesturingRef.current = false;
        setIsGesturing(false);

        if (shouldSnapToIdentity(transformRef.current)) {
          void resetAnimated();
        }
      }
    },
    [resetAnimated, shouldSnapToIdentity]
  );

  return {
    transform,
    isTransitioning,
    reset,
    resetAnimated,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onTransitionEnd,
    isGesturing,
    isGesturingRef,
  };
}

function ZoomableImageSurface({
  src,
  alt,
  transform,
  isTransitioning,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onTransitionEnd,
  className = "",
  fullscreen = false,
}: {
  src: string;
  alt: string;
  transform: Transform;
  isTransitioning: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onTransitionEnd: (e: React.TransitionEvent<HTMLImageElement>) => void;
  className?: string;
  fullscreen?: boolean;
}) {
  return (
    <div
      className={`zoomable-question-image${fullscreen ? " zoomable-question-image--fullscreen" : ""} ${className}`.trim()}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <img
        src={src}
        alt={alt}
        className={`zoomable-question-image__img${isTransitioning ? " zoomable-question-image__img--transition" : ""}`}
        style={{
          transform: `translate(${transform.panX}px, ${transform.panY}px) scale(${transform.scale})`,
        }}
        onTransitionEnd={onTransitionEnd}
        draggable={false}
      />
    </div>
  );
}

export default function ZoomableQuestionImage({ src, alt, className = "" }: Props) {
  const [fullscreen, setFullscreen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const inlinePortalRectRef = useRef<DOMRect | null>(null);
  const [inlinePortalRect, setInlinePortalRect] = useState<DOMRect | null>(null);
  const inline = usePinchPanZoom(true);
  const overlay = usePinchPanZoom(fullscreen);

  const inlineZoomActive =
    inline.isGesturing || inline.transform.scale > 1 || inline.isTransitioning;

  const syncInlinePortalRect = useCallback(() => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    inlinePortalRectRef.current = rect;
    setInlinePortalRect(rect);
  }, []);

  const handleInlinePointerDown = useCallback(
    (e: React.PointerEvent) => {
      syncInlinePortalRect();
      inline.onPointerDown(e);
    },
    [inline, syncInlinePortalRect]
  );

  useLayoutEffect(() => {
    syncInlinePortalRect();
    const anchor = anchorRef.current;
    const resizeObserver =
      anchor && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(syncInlinePortalRect)
        : null;
    resizeObserver?.observe(anchor!);
    window.addEventListener("resize", syncInlinePortalRect);
    window.addEventListener("scroll", syncInlinePortalRect, true);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", syncInlinePortalRect);
      window.removeEventListener("scroll", syncInlinePortalRect, true);
    };
  }, [syncInlinePortalRect]);

  const openFullscreen = useCallback(() => {
    inline.reset();
    setFullscreen(true);
  }, [inline]);

  const closeFullscreen = useCallback(() => {
    void overlay.resetAnimated().then(() => {
      setFullscreen(false);
      overlay.reset();
    });
  }, [overlay]);

  const portalTarget = getThemedPortalTarget();
  const activePortalRect = inlinePortalRect ?? inlinePortalRectRef.current;

  const inlineSurface = (
    <ZoomableImageSurface
      src={src}
      alt={alt}
      transform={inline.transform}
      isTransitioning={inline.isTransitioning}
      className={className}
      onPointerDown={handleInlinePointerDown}
      onPointerMove={inline.onPointerMove}
      onPointerUp={(e) => inline.onPointerUp(e, openFullscreen)}
      onTransitionEnd={inline.onTransitionEnd}
    />
  );

  return (
    <>
      <div ref={anchorRef} className="zoomable-question-image-anchor">
        <img
          src={src}
          alt=""
          aria-hidden
          className={`zoomable-question-image__placeholder ${className}`.trim()}
          draggable={false}
          onLoad={syncInlinePortalRect}
        />
      </div>
      {!fullscreen && activePortalRect && portalTarget
        ? createPortal(
            <div
              className={`zoomable-question-image__inline-portal${inlineZoomActive ? " zoomable-question-image__inline-portal--elevated" : ""}`}
              style={{
                top: activePortalRect.top,
                left: activePortalRect.left,
                width: activePortalRect.width,
                height: activePortalRect.height,
              }}
            >
              {inlineSurface}
            </div>,
            portalTarget
          )
        : null}
      {fullscreen && portalTarget
        ? createPortal(
            <div
              className="zoomable-question-image__overlay"
              role="dialog"
              aria-modal="true"
              aria-label={alt}
              onClick={closeFullscreen}
            >
              <button
                type="button"
                className="zoomable-question-image__close"
                onClick={(e) => {
                  e.stopPropagation();
                  closeFullscreen();
                }}
                aria-label="Close image"
              >
                <LuX size={22} />
              </button>
              <div
                className="zoomable-question-image__overlay-stage"
                onClick={(e) => e.stopPropagation()}
              >
                <ZoomableImageSurface
                  src={src}
                  alt={alt}
                  transform={overlay.transform}
                  isTransitioning={overlay.isTransitioning}
                  fullscreen
                  onPointerDown={overlay.onPointerDown}
                  onPointerMove={overlay.onPointerMove}
                  onPointerUp={(e) => overlay.onPointerUp(e)}
                  onTransitionEnd={overlay.onTransitionEnd}
                />
              </div>
            </div>,
            portalTarget
          )
        : null}
    </>
  );
}
