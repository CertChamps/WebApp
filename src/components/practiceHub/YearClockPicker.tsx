import { useCallback, useEffect, useRef, useState } from "react";
import { LuChevronDown } from "react-icons/lu";
import "../../styles/practiceHub.css";

const YEAR_MIN = 2014;
const YEAR_MAX = 2025; /* 2014–2025 inclusive; 26 not included */

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

type Props = {
  value: number | "all";
  onChange: (year: number | "all") => void;
  id?: string;
  "aria-label"?: string;
};

function parseYearInput(s: string): number | null {
  const n = parseInt(s.trim(), 10);
  if (Number.isNaN(n) || n < YEAR_MIN || n > YEAR_MAX) return null;
  return n;
}

export default function YearClockPicker({
  value,
  onChange,
  id,
  "aria-label": ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const dialRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedYear = value === "all" ? null : value;
  const selectedIndex =
    selectedYear != null ? YEARS.indexOf(selectedYear) : -1;
  const handAngleRad =
    selectedIndex >= 0 ? yearIndexToAngle(selectedIndex) : 0;
  const handAngleDeg = (handAngleRad * 180) / Math.PI;

  const displayLabel =
    selectedYear != null ? yearToFull(selectedYear) : "year";

  /* Sync input from selected year when popover opens or value changes from outside; focus the input when open */
  useEffect(() => {
    if (open) {
      setInputValue(selectedYear != null ? yearToFull(selectedYear) : "");
      inputRef.current?.focus();
    }
  }, [open, selectedYear]);

  const handleDialPointer = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      const dial = dialRef.current;
      if (!dial) return;
      const rect = dial.getBoundingClientRect();
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
      const angle = getAngleFromEvent({ clientX, clientY }, rect);
      const index = angleToYearIndex(angle);
      const y = YEARS[Math.min(index, YEARS.length - 1)];
      onChange(y);
    },
    [onChange]
  );

  const onDialDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setDragging(true);
      handleDialPointer(e);
    },
    [handleDialPointer]
  );

  const commitInput = useCallback(() => {
    const y = parseYearInput(inputValue);
    if (y != null) {
      onChange(y);
      setInputValue(yearToFull(y));
    } else {
      setInputValue(selectedYear != null ? yearToFull(selectedYear) : "");
    }
  }, [inputValue, selectedYear, onChange]);

  const onDisplayKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitInput();
      }
    },
    [commitInput]
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
    const onMove = (e: MouseEvent) => handleDialPointer(e as unknown as React.MouseEvent);
    const onUp = () => setDragging(false);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [dragging, handleDialPointer]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="year-clock-picker" data-state={open ? "open" : "closed"}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        aria-label={ariaLabel ?? "Select year"}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex color-txt-sub font-bold py-0.5 px-2 items-center justify-center rounded-out color-bg-grey-5 gap-1 mx-2 cursor-pointer border-0 "
        onClick={() => setOpen((o) => !o)}
      >
        <p className="m-0">{displayLabel}</p>
        <span className="year-clock-picker__chevron" aria-hidden>
          <LuChevronDown size={16} className="color-txt-sub" />
        </span>
      </button>

      {open && (
        <div ref={popoverRef} className="year-clock-picker__popover" role="dialog" aria-modal="true" aria-label="Pick year">
          <div className="year-clock-picker__display color-bg-grey-10 color-txt-main">
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              className="year-clock-picker__input"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onBlur={commitInput}
              onKeyDown={onDisplayKeyDown}
              placeholder="—"
              aria-label="Type year (2014–2025)"
            />
          </div>

          <div
            ref={dialRef}
            className="year-clock-picker__dial color-bg"
            onMouseDown={onDialDown}
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
