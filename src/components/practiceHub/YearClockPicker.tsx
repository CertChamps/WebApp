import { useCallback, useEffect, useRef, useState } from "react";
import { LuChevronUp, LuChevronDown } from "react-icons/lu";
import "../../styles/practiceHub.css";

const YEAR_MIN = 2014;
const YEAR_MAX = 2025; /* 2014–2025 inclusive; 26 not included */

/** Pixels to move before treating trigger press as drag (not click) */
const TRIGGER_DRAG_THRESHOLD_PX = 8;
/** Pixels of vertical drag per year step when dragging on trigger */
const TRIGGER_DRAG_STEP_PX = 20;

/** Years from 25 at top, decreasing clockwise (25, 24, …, 14) */
const YEARS = Array.from(
  { length: YEAR_MAX - YEAR_MIN + 1 },
  (_, i) => YEAR_MAX - i
);

/** Two digits for clock face only (14, 15, …, 25) */
function yearToShort(y: number): string {
  return String(y).slice(-2);
}

/** Full year for trigger, popover display, etc. (2014, 2015, …, 2025) */
function yearToFull(y: number): string {
  return "20" + yearToShort(y);
}

const DIAL_RADIUS = 100;
const CENTER = 120;
const HAND_LENGTH = 88;

/** Angle from 12 o'clock, clockwise, in radians */
function angleToPosition(angleRad: number) {
  return {
    x: CENTER + DIAL_RADIUS * Math.cos(angleRad),
    y: CENTER + DIAL_RADIUS * Math.sin(angleRad),
  };
}

/** Get angle (radians, 0 = 12 o'clock, clockwise) from dial center and event */
function getAngleFromEvent(
  e: { clientX: number; clientY: number },
  rect: DOMRect
): number {
  const x = e.clientX - rect.left - rect.width / 2;
  const y = e.clientY - rect.top - rect.height / 2;
  let a = Math.atan2(x, -y);
  if (a < 0) a += 2 * Math.PI;
  return a;
}

/** Angle (0..2π) to year index 0..YEARS.length-1 */
function angleToYearIndex(angleRad: number): number {
  const n = YEARS.length;
  const index = Math.round((angleRad / (2 * Math.PI)) * n) % n;
  return index < 0 ? index + n : index;
}

function yearIndexToAngle(index: number): number {
  const n = YEARS.length;
  return (index / n) * 2 * Math.PI - Math.PI / 2;
}

export type YearFilterValue = number | "all";

type Props = {
  value: YearFilterValue;
  onChange: (year: YearFilterValue) => void;
  id?: string;
  "aria-label"?: string;
};

export default function YearClockPicker({
  value,
  onChange,
  id,
  "aria-label": ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [triggerDragging, setTriggerDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dialRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const valueRef = useRef(value);
  const triggerDragRef = useRef<{
    startY: number;
    isDrag: boolean;
    lastY: number;
    accum: number;
  } | null>(null);

  valueRef.current = value;

  const selectedYear = value === "all" ? null : value;
  const selectedIndex =
    selectedYear != null ? YEARS.indexOf(selectedYear) : -1;
  const handAngleRad =
    selectedIndex >= 0 ? yearIndexToAngle(selectedIndex) : 0;
  const handAngleDeg = (handAngleRad * 180) / Math.PI;

  const displayLabel =
    selectedYear != null ? yearToFull(selectedYear) : "All years";

  const displayText =
    selectedYear != null ? yearToFull(selectedYear) : "All years";

  const updateYearFromCoords = useCallback(
    (clientX: number, clientY: number) => {
      const dial = dialRef.current;
      if (!dial) return;
      const rect = dial.getBoundingClientRect();
      const angle = getAngleFromEvent({ clientX, clientY }, rect);
      const index = angleToYearIndex(angle);
      onChange(YEARS[Math.min(index, YEARS.length - 1)]);
    },
    [onChange]
  );

  const handleDialPointer = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
      updateYearFromCoords(clientX, clientY);
    },
    [updateYearFromCoords]
  );

  const onDialDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setDragging(true);
      handleDialPointer(e);
    },
    [handleDialPointer]
  );

  const onDialTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      setDragging(true);
      handleDialPointer(e);
    },
    [handleDialPointer]
  );

  const handleWheelYear = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const current = value === "all" ? YEAR_MAX : value;
      if (e.deltaY < 0) {
        onChange(Math.min(current + 1, YEAR_MAX));
      } else {
        onChange(Math.max(current - 1, YEAR_MIN));
      }
    },
    [value, onChange]
  );

  /* Wheel on trigger button: scroll to change year without opening dropdown */
  useEffect(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    trigger.addEventListener("wheel", handleWheelYear, { passive: false, capture: true });
    return () => trigger.removeEventListener("wheel", handleWheelYear, { capture: true });
  }, [handleWheelYear]);

  /* Wheel on the whole dropdown: scroll up = increase year, scroll down = decrease when open */
  useEffect(() => {
    if (!open) return;
    const popover = popoverRef.current;
    if (!popover) return;
    popover.addEventListener("wheel", handleWheelYear, { passive: false, capture: true });
    return () => popover.removeEventListener("wheel", handleWheelYear, { capture: true });
  }, [open, handleWheelYear]);

  useEffect(() => {
    if (!dragging) return;
    const onMouseMove = (e: MouseEvent) =>
      updateYearFromCoords(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches[0])
        updateYearFromCoords(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onUp = () => setDragging(false);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onUp);
    document.addEventListener("touchcancel", onUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onUp);
      document.removeEventListener("touchcancel", onUp);
    };
  }, [dragging, updateYearFromCoords]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      const target = (e as MouseEvent).target ?? (e as TouchEvent).target;
      if (containerRef.current && !containerRef.current.contains(target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, []);

  const triggerPointerDown = useCallback(
    (clientY: number) => {
      triggerDragRef.current = {
        startY: clientY,
        isDrag: false,
        lastY: clientY,
        accum: 0,
      };

      const applyStep = (delta: number) => {
        const current =
          valueRef.current === "all" ? YEAR_MAX : (valueRef.current as number);
        const next = Math.min(
          YEAR_MAX,
          Math.max(YEAR_MIN, current + delta)
        );
        onChange(next);
      };

      const onMove = (e: MouseEvent | TouchEvent) => {
        const state = triggerDragRef.current;
        if (!state) return;
        const clientY =
          "touches" in e && e.touches[0]
            ? e.touches[0].clientY
            : (e as MouseEvent).clientY;
        const dy = clientY - state.lastY;

        if (!state.isDrag && Math.abs(clientY - state.startY) >= TRIGGER_DRAG_THRESHOLD_PX) {
          state.isDrag = true;
          setTriggerDragging(true);
        }
        if (state.isDrag) {
          state.accum += dy;
          while (state.accum >= TRIGGER_DRAG_STEP_PX) {
            applyStep(-1);
            state.accum -= TRIGGER_DRAG_STEP_PX;
          }
          while (state.accum <= -TRIGGER_DRAG_STEP_PX) {
            applyStep(1);
            state.accum += TRIGGER_DRAG_STEP_PX;
          }
          state.lastY = clientY;
        }
      };

      const onUp = () => {
        const wasDrag = triggerDragRef.current?.isDrag ?? false;
        triggerDragRef.current = null;
        setTriggerDragging(false);
        document.removeEventListener("mousemove", onMove as (e: MouseEvent) => void);
        document.removeEventListener("mouseup", onUp);
        document.removeEventListener("touchmove", onMove as (e: TouchEvent) => void, { capture: true });
        document.removeEventListener("touchend", onUp);
        document.removeEventListener("touchcancel", onUp);
        if (!wasDrag) setOpen((o) => !o);
      };

      document.addEventListener("mousemove", onMove as (e: MouseEvent) => void);
      document.addEventListener("mouseup", onUp);
      document.addEventListener("touchmove", onMove as (e: TouchEvent) => void, { passive: false, capture: true });
      document.addEventListener("touchend", onUp);
      document.addEventListener("touchcancel", onUp);
    },
    [onChange]
  );

  const onTriggerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      triggerPointerDown(e.clientY);
    },
    [triggerPointerDown]
  );

  const onTriggerTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      if (e.touches[0]) triggerPointerDown(e.touches[0].clientY);
    },
    [triggerPointerDown]
  );

  return (
    <div ref={containerRef} className="year-clock-picker" data-state={open ? "open" : "closed"}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        aria-label={ariaLabel ?? "Select year"}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`year-clock-picker__trigger flex color-txt-sub font-bold py-0.5 px-2 items-center justify-center rounded-out color-bg-grey-5 gap-1 mx-2 cursor-pointer border-0 ${triggerDragging ? "year-clock-picker__trigger--dragging" : ""}`}
        onMouseDown={onTriggerMouseDown}
        onTouchStart={onTriggerTouchStart}
      >
        <p className="m-0">{displayLabel}</p>
        <span className="year-clock-picker__chevrons" aria-hidden>
          <LuChevronUp size={14} className="color-txt-sub" />
          <LuChevronDown size={14} className="color-txt-sub" />
        </span>
      </button>

      {open && (
        <div ref={popoverRef} className="year-clock-picker__popover" role="dialog" aria-modal="true" aria-label="Pick year">
          <div className="year-clock-picker__display color-bg-grey-10 color-txt-main" aria-live="polite">
            <span className="year-clock-picker__display-year">{displayText}</span>
          </div>

          <div
            ref={dialRef}
            className="year-clock-picker__dial color-bg"
            onMouseDown={onDialDown}
            onTouchStart={onDialTouchStart}
            role="slider"
            aria-valuemin={YEAR_MIN}
            aria-valuemax={YEAR_MAX}
            aria-valuenow={selectedYear ?? undefined}
            aria-valuetext={selectedYear != null ? String(selectedYear) : "All"}
            tabIndex={0}
          >
            <svg
              className="year-clock-picker__dial-svg"
              viewBox="0 0 240 240"
              aria-hidden
            >
              {selectedIndex >= 0 && (
                <g
                  className="year-clock-picker__hand"
                  style={{
                    transform: `rotate(${handAngleDeg}deg)`,
                    transformOrigin: `${CENTER}px ${CENTER}px`,
                  }}
                >
                  <line
                    x1={CENTER}
                    y1={CENTER}
                    x2={CENTER + HAND_LENGTH}
                    y2={CENTER}
                    className="year-clock-picker__hand-line"
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                </g>
              )}
              <circle
                cx={CENTER}
                cy={CENTER}
                r={4}
                className="year-clock-picker__center-dot"
              />
            </svg>

            <div className="year-clock-picker__labels">
              {YEARS.map((y, i) => {
                const angle = yearIndexToAngle(i);
                const { x, y: yPos } = angleToPosition(angle);
                const isSelected = y === selectedYear;
                return (
                  <span
                    key={y}
                    className={`year-clock-picker__label ${isSelected ? "year-clock-picker__label--selected" : ""}`}
                    style={{
                      left: `${x}px`,
                      top: `${yPos}px`,
                      transform: "translate(-50%, -50%)",
                    }}
                  >
                    {yearToShort(y)}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="year-clock-picker__footer">
            <button
              type="button"
              className={`year-clock-picker__all ${value === "all" ? "year-clock-picker__all--selected" : ""}`}
              onClick={() => {
                onChange("all");
                setOpen(false);
              }}
            >
              All years
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
