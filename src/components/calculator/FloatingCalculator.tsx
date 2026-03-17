import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LuX } from "react-icons/lu";
import katex from "katex";
import "katex/dist/katex.min.css";
import useCalcEngine from "./useCalcEngine";
import type { CalcState, CalcActions } from "./useCalcEngine";
import "./FloatingCalculator.css";


/* ── size constraints ────────────────────────────────────── */
const MIN_W = 320;
const MAX_W = 420;
const MIN_H = 560;
const MAX_H = 760;
const ASPECT = 1 / 1.75; // w:h

const BOTTOM_BAR_CLEARANCE = 72;

function getDefaultPosition() {
  if (typeof window === "undefined") return { left: 80, top: 30 };
  const h = getDefaultHeight();
  const maxTop = window.innerHeight - h - BOTTOM_BAR_CLEARANCE;
  return {
    left: Math.max(20, window.innerWidth - MIN_W - 40),
    top: Math.max(10, Math.min(maxTop, (window.innerHeight - h) / 2)),
  };
}
function getDefaultHeight() {
  if (typeof window === "undefined") return MIN_H;
  return Math.min(MIN_H, window.innerHeight - BOTTOM_BAR_CLEARANCE - 20);
}

type Props = { onClose?: () => void };

export default function FloatingCalculator({ onClose }: Props) {
  const [pos, setPos] = useState(getDefaultPosition);
  const [size, setSize] = useState({ width: MIN_W, height: getDefaultHeight() });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, left: 0, top: 0 });
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const [calcState, calcActions] = useCalcEngine();

  const coords = (e: MouseEvent | TouchEvent) => {
    if ("touches" in e && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if ("changedTouches" in e && e.changedTouches.length) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    return { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY };
  };

  const isInteractiveTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest(".casio-emu__btn, .casio-emu__dpad-btn, .casio-emu__close-btn, .casio-emu__resize-handle, button"));
  };

  /* ── drag ──────────────────────────────────────────────── */
  const onDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (isInteractiveTarget(e.target)) return;
    e.preventDefault();
    const { x, y } = "touches" in e ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY };
    setIsDragging(true);
    dragStart.current = { x, y, left: pos.left, top: pos.top };
  }, [pos]);

  useEffect(() => {
    if (!isDragging) return;
    const move = (e: MouseEvent | TouchEvent) => { e.preventDefault(); const { x, y } = coords(e); setPos({ left: Math.max(0, dragStart.current.left + x - dragStart.current.x), top: Math.max(0, dragStart.current.top + y - dragStart.current.y) }); };
    const up = () => setIsDragging(false);
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", move, { passive: false }); window.addEventListener("touchend", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); window.removeEventListener("touchmove", move); window.removeEventListener("touchend", up); };
  }, [isDragging]);

  /* ── resize (aspect-locked) ────────────────────────────── */
  const onResizeStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault(); e.stopPropagation();
    const { x, y } = "touches" in e ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY };
    setIsResizing(true);
    resizeStart.current = { x, y, w: size.width, h: size.height };
  }, [size]);

  useEffect(() => {
    if (!isResizing) return;
    const move = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      const { x } = coords(e);
      const dx = x - resizeStart.current.x;
      let w = Math.max(MIN_W, Math.min(MAX_W, resizeStart.current.w + dx));
      let h = w / ASPECT;
      if (h > MAX_H) { h = MAX_H; w = h * ASPECT; }
      if (h < MIN_H) { h = MIN_H; w = h * ASPECT; }
      setSize({ width: w, height: h });
    };
    const up = () => setIsResizing(false);
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", move, { passive: false }); window.addEventListener("touchend", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); window.removeEventListener("touchmove", move); window.removeEventListener("touchend", up); };
  }, [isResizing]);

  /* ── scale factor: fit the inner calculator to the window ── */
  const baseW = MIN_W;
  const scale = size.width / baseW;

  const panel = (
    <div
      className="fixed flex flex-col"
      style={{ left: pos.left, top: pos.top, width: size.width, height: size.height, zIndex: 99999 }}
      onMouseDown={onDragStart}
      onTouchStart={onDragStart}
    >
      {/* Calculator body — scales from the base width */}
      <div style={{ flex: 1, overflow: "hidden", transformOrigin: "top left", width: baseW, height: baseW / ASPECT, transform: `scale(${scale})` }}>
        <CalculatorBody state={calcState} actions={calcActions} onClose={onClose} />
      </div>

      {/* Resize handle */}
      <div
        role="presentation"
        onMouseDown={onResizeStart}
        onTouchStart={onResizeStart}
        className="casio-emu__resize-handle absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize flex items-end justify-end p-1 text-gray-500 touch-none"
        style={{ margin: "-2px -2px 0 0" }}
        aria-hidden
      >
        <svg width={14} height={14} viewBox="0 0 16 16" className="opacity-60">
          <path fill="currentColor" d="M14 14H10v-2h2v-2h2v6zM8 14H4v-4h2v2h2v2zM14 8V4h-2v2h-2v2h4z" />
        </svg>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  const portalTarget = document.getElementById("themed-root") ?? document.body;
  return createPortal(panel, portalTarget);
}

/* ═══════════════════════════════════════════════════════════
   Inner calculator — fixed 320 × 704 design, scaled by parent
   ═══════════════════════════════════════════════════════════ */

/** Render a KaTeX string to HTML safely. Returns empty on error. */
function renderKatex(tex: string): string {
  if (!tex) return "";
  try {
    // Sanitise common raw chars that aren't valid LaTeX
    let safe = tex
      .replace(/×/g, "\\times ")
      .replace(/÷/g, "\\div ")
      .replace(/−/g, "-")
      .replace(/·/g, ".");
    return katex.renderToString(safe, { throwOnError: false, displayMode: false });
  } catch {
    return tex;
  }
}

function CalculatorBody({ state, actions, onClose }: { state: CalcState; actions: CalcActions; onClose?: () => void }) {
  const {
    displayExpr, result,
    shiftActive, isRadians,
  } = state;
  const {
    pressDigit, pressDecimal, pressOperator, pressBracket,
    pressBackspace, pressAC, pressEXE, pressAns, pressSquare,
    pressPower, pressSqrt, pressTrig, pressLog, pressLn,
    pressFraction, pressShift, pressAngleToggle, pressSci, pressSD, pressArrow,
    pressCloseBracket,
  } = actions;

  const inputHtml = renderKatex(displayExpr || "\\;");
  const resultHtml = result ? renderKatex(result) : "";
  const angleLabel = isRadians ? "RAD" : "DEG";

  return (
    <div className="casio-emu color-shadow" style={{ width: 320, height: 560 }}>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close calculator"
          className="casio-emu__close-btn absolute top-2 right-2 z-20 p-1 rounded-md hover:opacity-80 transition-opacity"
        >
          <LuX size={14} />
        </button>
      )}

      {/* ── Branding ──────────────────────────────────── */}
      <div className="casio-emu__brand">
        <span className="casio-emu__brand-casio">CASIO</span>
        <span className="casio-emu__brand-model">fx-83GT CW</span>
      </div>

      {/* ── LCD ───────────────────────────────────────── */}
      <div className="casio-emu__screen-wrap color-shadow border-1 mx-2 rounded-in">
        <div className="casio-emu__screen" style={{ justifyContent: "flex-start",  padding: "6px 6px", aspectRatio: "2.6" }}>
          {/* Angle mode indicator */}
          <div style={{ display: "flex", justifyContent: "flex-end", fontSize: 9, fontWeight: 700, color: "var(--theme-txt-main)", opacity: 0.72 }}>
            {angleLabel}
          </div>
          {/* Input line */}
          <div
            style={{ fontSize: 14, color: "var(--theme-txt-main)", minHeight: "1.4em", overflowX: "auto", overflowY: "hidden", whiteSpace: "nowrap", opacity: state.justExecuted ? 0.55 : 1 }}
            dangerouslySetInnerHTML={{ __html: inputHtml || "&nbsp;" }}
          />
          {/* Result line */}
          <div
            style={{ fontSize: 18, fontWeight: 700, color: "var(--theme-txt-main)", textAlign: "right", minHeight: "1.5em" }}
            dangerouslySetInnerHTML={{ __html: resultHtml || "&nbsp;" }}
          />
        </div>
      </div>

      {/* ── CLASSWIZ ──────────────────────────────────── */}
      <div className="casio-emu__classwiz">CLASSWIZ</div>

      {/* ── Keys ──────────────────────────────────────── */}
      <div className="casio-emu__keys">
        {/* Top cluster — SHIFT + brackets + d-pad + flanking func buttons */}
        <div className="casio-emu__top-cluster">
          <div className="casio-emu__top-grid">
            <div className="casio-emu__top-cell casio-emu__top-cell--shift">
              <K v="shift" label="SHIFT" onClick={pressShift} active={shiftActive} />
            </div>
            <div className="casio-emu__top-cell casio-emu__top-cell--angle">
              <K v="dark" label={isRadians ? "RAD" : "DEG"} onClick={pressAngleToggle} />
            </div>
            <div className="casio-emu__top-cell casio-emu__top-cell--bracket-left">
              <K v="dark" label="(" secB="π" onClick={pressBracket} />
            </div>
            <div className="casio-emu__top-cell casio-emu__top-cell--bracket-right">
              <K v="dark" label=")" secB="e" onClick={pressCloseBracket} />
            </div>
            <div className="casio-emu__top-cell casio-emu__top-cell--left-a">
              <K v="dark" label={<>x<sup>2</sup></>} secB={<>x<sup>n</sup></>} onClick={pressSquare} />
            </div>
            <div className="casio-emu__top-cell casio-emu__top-cell--left-b">
              <K v="dark" label={<FracIcon />} cls="casio-emu__btn--symbol" onClick={pressFraction} />
            </div>
            <div className="casio-emu__top-cell casio-emu__top-cell--right-a">
              <K v="dark" label="log" secB={<>10<sup>x</sup></>} onClick={pressLog} />
            </div>
            <div className="casio-emu__top-cell casio-emu__top-cell--right-b">
              <K v="dark" label="ln" secB={<>e<sup>x</sup></>} onClick={pressLn} />
            </div>
            <div className="casio-emu__top-dpad-wrap">
              <div className="casio-emu__dpad">
                <div className="casio-emu__dpad-bg" />
                <div className="casio-emu__dpad-center" />
                <span className="casio-emu__dpad-btn casio-emu__dpad-btn--up" onClick={() => pressArrow("up")}>⌃</span>
                <span className="casio-emu__dpad-btn casio-emu__dpad-btn--down" onClick={() => pressArrow("down")}>⌄</span>
                <span className="casio-emu__dpad-btn casio-emu__dpad-btn--left" onClick={() => pressArrow("left")}>❮</span>
                <span className="casio-emu__dpad-btn casio-emu__dpad-btn--right" onClick={() => pressArrow("right")}>❯</span>
              </div>
            </div>
          </div>
        </div>

        {/* Row 1 — √, x^□, Ans, sin, cos, tan */}
        <KeyRow className="casio-emu__row--func">
          <K v="dark" label="√" secB="ⁿ√" cls="casio-emu__btn--symbol" onClick={pressSqrt} />
          <K v="dark" label={<>x<sup>□</sup></>} secB={<>x<sup>−1</sup></>} cls="casio-emu__btn--symbol" onClick={pressPower} />
          <K v="dark" label="Ans" onClick={pressAns} />
          <K v="dark" label="sin" secB={<>sin<sup>−1</sup></>} onClick={() => pressTrig("sin")} />
          <K v="dark" label="cos" secB={<>cos<sup>−1</sup></>} onClick={() => pressTrig("cos")} />
          <K v="dark" label="tan" secB={<>tan<sup>−1</sup></>} onClick={() => pressTrig("tan")} />
        </KeyRow>

        {/* Row 4 — 7 8 9 DEL AC */}
        <KeyRow className="casio-emu__row--num5">
          <K v="num" label="7" onClick={() => pressDigit("7")} />
          <K v="num" label="8" onClick={() => pressDigit("8")} />
          <K v="num" label="9" onClick={() => pressDigit("9")} />
          <K v="dark" label="DEL" onClick={pressBackspace} />
          <K v="dark" label="AC" onClick={pressAC} />
        </KeyRow>

        {/* Row 5 — 4 5 6 × ÷ */}
        <KeyRow className="casio-emu__row--num5">
          <K v="num" label="4" onClick={() => pressDigit("4")} />
          <K v="num" label="5" onClick={() => pressDigit("5")} />
          <K v="num" label="6" onClick={() => pressDigit("6")} />
          <K v="dark" label="×" secB="" onClick={() => pressOperator("*", "\\times ")} />
          <K v="dark" label="÷" secB="" onClick={() => pressOperator("/", "\\div ")} />
        </KeyRow>

        {/* Row 6 — 1 2 3 + − */}
        <KeyRow className="casio-emu__row--num5">
          <K v="num" label="1" secO="" onClick={() => pressDigit("1")} />
          <K v="num" label="2" secO="" onClick={() => pressDigit("2")} />
          <K v="num" label="3" secO="" onClick={() => pressDigit("3")} />
          <K v="dark" label="+" secB="" onClick={() => pressOperator("+", "+")} />
          <K v="dark" label="−" secB="" onClick={() => pressOperator("-", "-")} />
        </KeyRow>

        {/* Row 7 — 0 . ×10ˣ S/D EXE */}
        <KeyRow className="casio-emu__row--bot">
          <K v="num" label="0" secO="" onClick={() => pressDigit("0")} />
          <K v="num" label="·" onClick={pressDecimal} />
          <K v="dark" label={<>×10<sup>x</sup></>} onClick={pressSci} />
          <K v="dark" label="S/D" onClick={pressSD} />
          <K v="dark" label="EXE" cls="casio-emu__btn--exe" onClick={pressEXE} />
        </KeyRow>
      </div>
    </div>
  );
}

/* ── tiny helpers ────────────────────────────────────────── */

function KeyRow({ className, children }: { className: string; children: React.ReactNode }) {
  return <div className={`casio-emu__row ${className}`}>{children}</div>;
}

function K({ v, label, secB, secO, cls, onClick, active }: { v: "dark" | "num" | "shift"; label: React.ReactNode; secB?: React.ReactNode; secO?: React.ReactNode; cls?: string; sec?: string; onClick?: () => void; active?: boolean }) {
  const variant = v === "num" ? "casio-emu__btn--num" : v === "shift" ? "casio-emu__btn--shift" : "casio-emu__btn--dark";
  const shiftActiveStyle = (v === "shift" && active) ? { filter: "brightness(1.4)" } : undefined;
  return (
    <div className="casio-emu__kcell">
      {(secB || secO) ? (
        <div className="casio-emu__sec">
          {secB && <span className="casio-emu__sec-shift">{secB}</span>}
          {secO && <span className="casio-emu__sec-alpha">{secO}</span>}
        </div>
      ) : <div className="casio-emu__sec" />}
      <div className={`casio-emu__btn ${variant} ${cls ?? ""}`} style={{ ...shiftActiveStyle, cursor: onClick ? "pointer" : "default" }} onClick={onClick}>{label}</div>
    </div>
  );
}

function FracIcon() {
  return (
    <span className="casio-emu__frac-icon">
      <span>□</span>
      <span className="frac-bar" />
      <span>□</span>
    </span>
  );
}
