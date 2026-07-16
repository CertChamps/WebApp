import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
  type TransitionEvent,
} from "react";
import { createPortal } from "react-dom";
import { LuX } from "react-icons/lu";
import { getThemedPortalTarget } from "../../utils/themedPortal";

type Transform = { scale: number; panX: number; panY: number };

export type ZoomablePageImage = {
  src: string;
  alt: string;
  key?: string;
};

type Props = {
  images: ZoomablePageImage[];
  className?: string;
};

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const RESET_SCALE_THRESHOLD = 1.05;
const RESET_ANIMATION_MS = 350;
const FULLSCREEN_ENTER_MS = 380;
const FULLSCREEN_EXIT_MS = 90;
const TAP_MOVE_THRESHOLD_PX = 8;
const TAP_MAX_DURATION_MS = 350;

type Rect = { top: number; left: number; width: number; height: number };
type FullscreenPhase = "closed" | "opening" | "open" | "closing";
type Point = { x: number; y: number };

function getDistance(a: Point, b: Point) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function getCenter(a: Point, b: Point) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function clampScale(scale: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

function touchPoint(t: Touch): Point {
  return { x: t.clientX, y: t.clientY };
}

function rectFromDOMRect(r: DOMRect): Rect {
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function flipTransform(from: Rect, to: Rect) {
  const fromCx = from.left + from.width / 2;
  const fromCy = from.top + from.height / 2;
  const toCx = to.left + to.width / 2;
  const toCy = to.top + to.height / 2;
  const scale = Math.min(
    to.width / Math.max(1, from.width),
    to.height / Math.max(1, from.height)
  );
  return {
    x: toCx - fromCx,
    y: toCy - fromCy,
    scale,
  };
}

function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = el;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    const oy = style.overflowY;
    if (
      (oy === "auto" || oy === "scroll" || oy === "overlay") &&
      node.scrollHeight > node.clientHeight + 1
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

type PinchPanZoomOptions = {
  snapBackOnRelease?: boolean;
  surfaceRef: RefObject<HTMLElement | null>;
  scrollRef?: RefObject<HTMLElement | null>;
  enabled?: boolean;
  onTapRef: RefObject<(() => void) | null>;
};

/**
 * Strict gesture model (touch):
 * - 1 finger → scroll + tap
 * - 2 fingers → pan + pinch zoom
 *
 * Uses non-passive touch listeners so preventDefault works on iOS.
 * Gesture surface must stay mounted (do not swap event targets mid-pinch).
 */
function usePinchPanZoom({
  surfaceRef,
  scrollRef,
  enabled = true,
  snapBackOnRelease = false,
  onTapRef,
}: PinchPanZoomOptions) {
  const [transform, setTransform] = useState<Transform>({ scale: 1, panX: 0, panY: 0 });
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isPinching, setIsPinching] = useState(false);
  const transformRef = useRef(transform);
  const isTransitioningRef = useRef(false);
  transformRef.current = transform;
  isTransitioningRef.current = isTransitioning;

  const wheelResetTimerRef = useRef<number | null>(null);
  const pinchStartRef = useRef<{
    distance: number;
    center: Point;
    transform: Transform;
  } | null>(null);
  const scrollStartRef = useRef<{ y: number; scrollTop: number } | null>(null);
  const tapStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const movedRef = useRef(false);
  const pinchingRef = useRef(false);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const snapBackRef = useRef(snapBackOnRelease);
  snapBackRef.current = snapBackOnRelease;
  const resetResolveRef = useRef<(() => void) | null>(null);

  const clearGestureState = useCallback(() => {
    pinchStartRef.current = null;
    scrollStartRef.current = null;
    tapStartRef.current = null;
    movedRef.current = false;
    pinchingRef.current = false;
    setIsPinching(false);
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

  const onTransitionEnd = useCallback((e: TransitionEvent) => {
    if (e.propertyName !== "transform" || !isTransitioningRef.current) return;
    setIsTransitioning(false);
    resetResolveRef.current?.();
    resetResolveRef.current = null;
  }, []);

  const scheduleSnapBack = useCallback(() => {
    const current = transformRef.current;
    if (current.scale === 1 && current.panX === 0 && current.panY === 0) return;
    if (!snapBackRef.current && current.scale > RESET_SCALE_THRESHOLD) return;
    void resetAnimated();
  }, [resetAnimated]);

  const scheduleWheelSnapBack = useCallback(() => {
    if (!snapBackRef.current) return;
    if (wheelResetTimerRef.current != null) {
      window.clearTimeout(wheelResetTimerRef.current);
    }
    wheelResetTimerRef.current = window.setTimeout(() => {
      wheelResetTimerRef.current = null;
      scheduleSnapBack();
    }, 400);
  }, [scheduleSnapBack]);

  useEffect(() => {
    if (!enabled) reset();
  }, [enabled, reset]);

  useEffect(() => {
    return () => {
      if (wheelResetTimerRef.current != null) {
        window.clearTimeout(wheelResetTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || !enabled) return;

    const getScroller = () =>
      scrollRef?.current ?? findScrollParent(surface) ?? findScrollParent(surface.parentElement);

    const onTouchStart = (e: TouchEvent) => {
      if (!enabledRef.current) return;
      if (wheelResetTimerRef.current != null) {
        window.clearTimeout(wheelResetTimerRef.current);
        wheelResetTimerRef.current = null;
      }
      resetResolveRef.current?.();
      resetResolveRef.current = null;
      setIsTransitioning(false);

      if (e.touches.length === 1) {
        const t = touchPoint(e.touches[0]);
        const scroller = getScroller();
        scrollStartRef.current = {
          y: t.y,
          scrollTop: scroller?.scrollTop ?? 0,
        };
        tapStartRef.current = { x: t.x, y: t.y, time: Date.now() };
        movedRef.current = false;
        pinchStartRef.current = null;
        pinchingRef.current = false;
        setIsPinching(false);
        return;
      }

      if (e.touches.length >= 2) {
        e.preventDefault();
        const a = touchPoint(e.touches[0]);
        const b = touchPoint(e.touches[1]);
        pinchStartRef.current = {
          distance: getDistance(a, b),
          center: getCenter(a, b),
          transform: { ...transformRef.current },
        };
        scrollStartRef.current = null;
        tapStartRef.current = null;
        movedRef.current = true;
        pinchingRef.current = true;
        setIsPinching(true);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!enabledRef.current) return;

      if (e.touches.length >= 2) {
        e.preventDefault();
        const a = touchPoint(e.touches[0]);
        const b = touchPoint(e.touches[1]);

        if (!pinchStartRef.current) {
          pinchStartRef.current = {
            distance: getDistance(a, b),
            center: getCenter(a, b),
            transform: { ...transformRef.current },
          };
          scrollStartRef.current = null;
          tapStartRef.current = null;
          pinchingRef.current = true;
          setIsPinching(true);
        }

        const start = pinchStartRef.current;
        const distance = getDistance(a, b);
        const center = getCenter(a, b);
        const scaleRatio = distance / Math.max(1, start.distance);
        const newScale = clampScale(start.transform.scale * scaleRatio);
        setTransform({
          scale: newScale,
          panX: start.transform.panX + (center.x - start.center.x),
          panY: start.transform.panY + (center.y - start.center.y),
        });
        movedRef.current = true;
        return;
      }

      if (e.touches.length === 1 && scrollStartRef.current && !pinchingRef.current) {
        const t = touchPoint(e.touches[0]);
        const start = scrollStartRef.current;
        const dy = t.y - start.y;
        if (
          Math.abs(dy) > TAP_MOVE_THRESHOLD_PX ||
          Math.abs(t.x - (tapStartRef.current?.x ?? t.x)) > TAP_MOVE_THRESHOLD_PX
        ) {
          movedRef.current = true;
        }
        const scroller = getScroller();
        if (scroller) {
          scroller.scrollTop = start.scrollTop - dy;
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!enabledRef.current) return;

      if (e.touches.length >= 2) {
        const a = touchPoint(e.touches[0]);
        const b = touchPoint(e.touches[1]);
        pinchStartRef.current = {
          distance: getDistance(a, b),
          center: getCenter(a, b),
          transform: { ...transformRef.current },
        };
        return;
      }

      if (e.touches.length === 1) {
        pinchStartRef.current = null;
        pinchingRef.current = false;
        setIsPinching(false);
        const t = touchPoint(e.touches[0]);
        const scroller = getScroller();
        scrollStartRef.current = {
          y: t.y,
          scrollTop: scroller?.scrollTop ?? 0,
        };
        tapStartRef.current = null;
        movedRef.current = true;
        return;
      }

      const tap = tapStartRef.current;
      const wasTap =
        !!tap && !movedRef.current && Date.now() - tap.time < TAP_MAX_DURATION_MS;
      const current = transformRef.current;
      const needsSnap =
        current.scale !== 1 || current.panX !== 0 || current.panY !== 0;

      tapStartRef.current = null;
      scrollStartRef.current = null;
      pinchStartRef.current = null;
      pinchingRef.current = false;
      setIsPinching(false);

      if (wasTap) {
        onTapRef.current?.();
      } else if (needsSnap) {
        scheduleSnapBack();
      }
      movedRef.current = false;
    };

    const onWheel = (e: WheelEvent) => {
      if (!enabledRef.current || isTransitioningRef.current) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();

      const current = transformRef.current;
      const factor = Math.exp(-e.deltaY * 0.01);
      const newScale = clampScale(current.scale * factor);
      if (newScale === current.scale) return;

      const rect = surface.getBoundingClientRect();
      const focalX = e.clientX - (rect.left + rect.width / 2);
      const focalY = e.clientY - (rect.top + rect.height / 2);
      const ratio = newScale / current.scale;
      setTransform({
        scale: newScale,
        panX: focalX - ratio * (focalX - current.panX),
        panY: focalY - ratio * (focalY - current.panY),
      });
      scheduleWheelSnapBack();
    };

    surface.addEventListener("touchstart", onTouchStart, { passive: false });
    surface.addEventListener("touchmove", onTouchMove, { passive: false });
    surface.addEventListener("touchend", onTouchEnd, { passive: false });
    surface.addEventListener("touchcancel", onTouchEnd, { passive: false });
    surface.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      surface.removeEventListener("touchstart", onTouchStart);
      surface.removeEventListener("touchmove", onTouchMove);
      surface.removeEventListener("touchend", onTouchEnd);
      surface.removeEventListener("touchcancel", onTouchEnd);
      surface.removeEventListener("wheel", onWheel);
    };
  }, [enabled, onTapRef, scheduleSnapBack, scheduleWheelSnapBack, scrollRef, surfaceRef]);

  return {
    transform,
    isTransitioning,
    isPinching,
    reset,
    resetAnimated,
    onTransitionEnd,
  };
}

function PageImages({
  images,
  className = "",
}: {
  images: ZoomablePageImage[];
  className?: string;
}) {
  return (
    <>
      {images.map((img, idx) => (
        <img
          key={img.key ?? `${img.src}-${idx}`}
          src={img.src}
          alt={img.alt}
          className={`zoomable-question-page__img ${className}`.trim()}
          draggable={false}
        />
      ))}
    </>
  );
}

export default function ZoomableQuestionImage({ images, className = "" }: Props) {
  const [phase, setPhase] = useState<FullscreenPhase>("closed");
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [flightStyle, setFlightStyle] = useState<CSSProperties | undefined>(undefined);
  const [flightAnimating, setFlightAnimating] = useState(false);

  const pageRef = useRef<HTMLDivElement>(null);
  const overlayStageRef = useRef<HTMLDivElement>(null);
  const overlayContentRef = useRef<HTMLDivElement>(null);
  const inlineRectRef = useRef<Rect | null>(null);
  const pageRectRef = useRef<DOMRect | null>(null);
  const [pageRect, setPageRect] = useState<DOMRect | null>(null);
  const closingRef = useRef(false);

  const openFullscreenRef = useRef<(() => void) | null>(null);
  const closeFullscreenRef = useRef<(() => void) | null>(null);
  const ignoreMouseClickRef = useRef(false);

  const fullscreenActive = phase !== "closed";

  const inline = usePinchPanZoom({
    surfaceRef: pageRef,
    enabled: !fullscreenActive,
    snapBackOnRelease: true,
    onTapRef: openFullscreenRef,
  });

  const overlay = usePinchPanZoom({
    surfaceRef: overlayStageRef,
    scrollRef: overlayStageRef,
    enabled: phase === "open",
    snapBackOnRelease: false,
    onTapRef: closeFullscreenRef,
  });

  const inlineZoomActive =
    inline.isPinching || inline.transform.scale > 1 || inline.isTransitioning;

  const syncPageRect = useCallback(() => {
    const rect = pageRef.current?.getBoundingClientRect();
    if (!rect) return;
    pageRectRef.current = rect;
    setPageRect(rect);
  }, []);

  const finishClose = useCallback(() => {
    closingRef.current = false;
    setPhase("closed");
    setFlightStyle(undefined);
    setFlightAnimating(false);
    setOverlayVisible(false);
    overlay.reset();
  }, [overlay]);

  openFullscreenRef.current = () => {
    if (phase !== "closed") return;
    ignoreMouseClickRef.current = true;
    window.setTimeout(() => {
      ignoreMouseClickRef.current = false;
    }, 500);
    syncPageRect();
    const rect = pageRef.current?.getBoundingClientRect();
    inline.reset();
    if (!rect) {
      setPhase("open");
      setOverlayVisible(true);
      return;
    }
    inlineRectRef.current = rectFromDOMRect(rect);
    setFlightStyle(undefined);
    setFlightAnimating(false);
    setOverlayVisible(false);
    setPhase("opening");
  };

  closeFullscreenRef.current = () => {
    if (phase !== "open" || closingRef.current) return;
    closingRef.current = true;
    overlay.reset();
    setOverlayVisible(false);
    setFlightStyle({ transform: "translate(0px, 0px) scale(1)", opacity: 1 });
    setFlightAnimating(false);
    setPhase("closing");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setFlightAnimating(true);
        setFlightStyle({ transform: "translate(0px, 0px) scale(1)", opacity: 0 });
      });
    });
  };

  useLayoutEffect(() => {
    syncPageRect();
    const page = pageRef.current;
    const resizeObserver =
      page && typeof ResizeObserver !== "undefined" ? new ResizeObserver(syncPageRect) : null;
    if (page) resizeObserver?.observe(page);
    window.addEventListener("resize", syncPageRect);
    window.addEventListener("scroll", syncPageRect, true);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", syncPageRect);
      window.removeEventListener("scroll", syncPageRect, true);
    };
  }, [syncPageRect, images]);

  useLayoutEffect(() => {
    if (phase !== "opening") return;
    const content = overlayContentRef.current;
    const from = inlineRectRef.current;
    if (!content || !from) {
      setPhase("open");
      setOverlayVisible(true);
      return;
    }

    const to = rectFromDOMRect(content.getBoundingClientRect());
    const flip = flipTransform(to, from);
    setFlightStyle({
      transform: `translate(${flip.x}px, ${flip.y}px) scale(${flip.scale})`,
      opacity: 1,
    });
    setFlightAnimating(false);
    setOverlayVisible(false);

    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setOverlayVisible(true);
        setFlightAnimating(true);
        setFlightStyle({ transform: "translate(0px, 0px) scale(1)", opacity: 1 });
      });
    });

    const fallback = window.setTimeout(() => {
      setPhase("open");
      setFlightStyle(undefined);
      setFlightAnimating(false);
    }, FULLSCREEN_ENTER_MS + 80);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(fallback);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "closing") return;
    const fallback = window.setTimeout(finishClose, FULLSCREEN_EXIT_MS + 40);
    return () => window.clearTimeout(fallback);
  }, [finishClose, phase]);

  const onFlightTransitionEnd = useCallback(
    (e: TransitionEvent) => {
      if (phase === "opening" && e.propertyName === "transform") {
        setPhase("open");
        setFlightStyle(undefined);
        setFlightAnimating(false);
      } else if (phase === "closing" && (e.propertyName === "opacity" || e.propertyName === "transform")) {
        finishClose();
      }
    },
    [finishClose, phase]
  );

  const portalTarget = getThemedPortalTarget();
  const activePageRect = pageRect ?? pageRectRef.current;
  const transformStyle = {
    transform: `translate(${inline.transform.panX}px, ${inline.transform.panY}px) scale(${inline.transform.scale})`,
  };
  const overlayGestureStyle = {
    transform: `translate(${overlay.transform.panX}px, ${overlay.transform.panY}px) scale(${overlay.transform.scale})`,
  };

  const overlayContentStyle: CSSProperties =
    phase === "open"
      ? overlayGestureStyle
      : flightStyle ?? { transform: "translate(0px, 0px) scale(1)" };

  if (images.length === 0) return null;

  const hideInline = phase === "opening" || phase === "open" || inlineZoomActive;

  return (
    <>
      <div
        ref={pageRef}
        className={`zoomable-question-page${inlineZoomActive ? " zoomable-question-page--zooming" : ""}`}
        onClick={() => {
          if (ignoreMouseClickRef.current || fullscreenActive) return;
          openFullscreenRef.current?.();
        }}
      >
        <div
          className={`zoomable-question-page__content${hideInline ? " zoomable-question-page__content--placeholder" : ""}${inline.isTransitioning && !inlineZoomActive ? " zoomable-question-page__content--transition" : ""}`}
          style={inlineZoomActive ? undefined : transformStyle}
          onTransitionEnd={inline.onTransitionEnd}
          aria-hidden={hideInline || undefined}
        >
          <PageImages images={images} className={className} />
        </div>
      </div>

      {/* Visual-only clone — never capture touches; gestures stay on pageRef. */}
      {inlineZoomActive && activePageRect && portalTarget && !fullscreenActive
        ? createPortal(
            <div
              className="zoomable-question-page__inline-portal"
              style={{
                top: activePageRect.top,
                left: activePageRect.left,
                width: activePageRect.width,
                height: activePageRect.height,
              }}
              aria-hidden
            >
              <div
                className={`zoomable-question-page__content${inline.isTransitioning ? " zoomable-question-page__content--transition" : ""}`}
                style={transformStyle}
                onTransitionEnd={inline.onTransitionEnd}
              >
                <PageImages images={images} className={className} />
              </div>
            </div>,
            portalTarget
          )
        : null}

      {fullscreenActive && portalTarget
        ? createPortal(
            <div
              className={[
                "zoomable-question-page__overlay",
                overlayVisible ? "zoomable-question-page__overlay--visible" : "",
                phase === "closing" ? "zoomable-question-page__overlay--closing" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              role="dialog"
              aria-modal="true"
              aria-label={images[0]?.alt || "Question images"}
              onClick={phase === "open" ? () => closeFullscreenRef.current?.() : undefined}
            >
              <button
                type="button"
                className={`zoomable-question-page__close${phase === "open" ? " zoomable-question-page__close--visible" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  closeFullscreenRef.current?.();
                }}
                aria-label="Close image"
              >
                <LuX size={22} />
              </button>

              <div
                ref={overlayStageRef}
                className={`zoomable-question-page__overlay-stage${phase === "open" ? " zoomable-question-page__overlay-stage--interactive" : ""}`}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  ref={overlayContentRef}
                  className={[
                    "zoomable-question-page__overlay-content",
                    phase === "closing"
                      ? "zoomable-question-page__overlay-content--exiting"
                      : flightAnimating || overlay.isTransitioning
                        ? "zoomable-question-page__content--transition"
                        : "",
                    phase === "opening" || phase === "closing"
                      ? "zoomable-question-page__overlay-content--flight"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={overlayContentStyle}
                  onTransitionEnd={(e) => {
                    onFlightTransitionEnd(e);
                    overlay.onTransitionEnd(e);
                  }}
                >
                  <PageImages images={images} className={className} />
                </div>
              </div>
            </div>,
            portalTarget
          )
        : null}
    </>
  );
}
