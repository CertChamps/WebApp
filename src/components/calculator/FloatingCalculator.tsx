import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LuGripVertical, LuX } from "react-icons/lu";
import katex from "katex";
import "katex/dist/katex.min.css";
import useCalcEngine from "./useCalcEngine";
import type { CalcState, CalcActions } from "./useCalcEngine";
import "./FloatingCalculator.css";


/* ── size constraints ────────────────────────────────────── */
const MIN_W = 320;
const MAX_W = 420;
const MIN_H = 700;
const MAX_H = 920;
const ASPECT = 1 / 2.2; // w:h

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

  /* ── drag ──────────────────────────────────────────────── */
  const onDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
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
    >
      {/* Drag handle */}
      <div
        role="button"
        tabIndex={0}
        onMouseDown={onDragStart}
        onTouchStart={onDragStart}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") e.currentTarget.click(); }}
        className="flex shrink-0 items-center justify-between gap-2 px-3 py-1 cursor-grab active:cursor-grabbing select-none touch-none"
        style={{ background: "rgba(30,30,30,0.85)", borderRadius: "12px 12px 0 0" }}
      >
        <div className="flex items-center gap-2">
          <LuGripVertical size={16} className="text-gray-400 shrink-0" aria-hidden />
          <span className="text-xs font-semibold text-gray-300">Calculator</span>
        </div>
        {onClose && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onClose(); }} aria-label="Close calculator" className="p-1 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
            <LuX size={16} />
          </button>
        )}
      </div>

      {/* Calculator body — scales from the base width */}
      <div style={{ flex: 1, overflow: "hidden", transformOrigin: "top left", width: baseW, height: baseW / ASPECT, transform: `scale(${scale})` }}>
        <CalculatorBody state={calcState} actions={calcActions} />
      </div>

      {/* Resize handle */}
      <div
        role="presentation"
        onMouseDown={onResizeStart}
        onTouchStart={onResizeStart}
        className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize flex items-end justify-end p-1 text-gray-500 touch-none"
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
  return createPortal(panel, document.body);
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

function CalculatorBody({ state, actions }: { state: CalcState; actions: CalcActions }) {
  const {
    displayExpr, result, resultIsError,
    shiftActive, isRadians,
  } = state;
  const {
    pressDigit, pressDecimal, pressOperator, pressBracket,
    pressBackspace, pressAC, pressEXE, pressAns, pressSquare,
    pressPower, pressSqrt, pressTrig, pressLog, pressLn,
    pressFraction, pressShift, pressSci, pressNeg, pressArrow,
    pressCloseBracket,
  } = actions;

  const inputHtml = renderKatex(displayExpr || "\\;");
  const resultHtml = result ? renderKatex(result) : "";
  const angleLabel = isRadians ? "R" : "D";

  return (
    <div className="casio-emu" style={{ width: 320, height: 704 }}>
      {/* ── Branding ──────────────────────────────────── */}
      <div className="casio-emu__brand">
        <span className="casio-emu__brand-casio">CASIO</span>
        <span className="casio-emu__brand-model">fx-83GT CW</span>
      </div>

      {/* ── LCD ───────────────────────────────────────── */}
      <div className="casio-emu__screen-wrap">
        <div className="casio-emu__screen" style={{ justifyContent: "space-between", padding: "6px 8px", aspectRatio: "2.6" }}>
          {/* Angle mode indicator */}
          <div style={{ display: "flex", justifyContent: "flex-end", fontSize: 9, fontWeight: 700, color: "#2a3a2a", opacity: 0.7 }}>
            {angleLabel}
          </div>
          {/* Input line */}
          <div
            style={{ fontSize: 14, color: "#2a3a2a", minHeight: "1.4em", overflowX: "auto", overflowY: "hidden", whiteSpace: "nowrap", opacity: state.justExecuted ? 0.55 : 1 }}
            dangerouslySetInnerHTML={{ __html: inputHtml || "&nbsp;" }}
          />
          {/* Result line */}
          <div
            style={{ fontSize: 18, fontWeight: 700, color: resultIsError ? "#b03030" : "#1a3a1a", textAlign: "right", minHeight: "1.5em" }}
            dangerouslySetInnerHTML={{ __html: resultHtml || "&nbsp;" }}
          />
        </div>
      </div>

      {/* ── CLASSWIZ ──────────────────────────────────── */}
      <div className="casio-emu__classwiz">CLASSWIZ</div>

      {/* ── Keys ──────────────────────────────────────── */}
      <div className="casio-emu__keys">
        {/* Row 0 — System: ON / HOME / D-pad */}
        <div className="casio-emu__row-system">
          <div className="casio-emu__sys-left">
            <div className="casio-emu__sys-pills" />
          </div>
          <div className="casio-emu__dpad-area">
            <div className="casio-emu__dpad">
              <div className="casio-emu__dpad-bg" />
              <div className="casio-emu__dpad-center" />
              <span className="casio-emu__dpad-btn casio-emu__dpad-btn--up" onClick={() => pressArrow("up")}>▲</span>
              <span className="casio-emu__dpad-btn casio-emu__dpad-btn--down" onClick={() => pressArrow("down")}>▼</span>
              <span className="casio-emu__dpad-btn casio-emu__dpad-btn--left" onClick={() => pressArrow("left")}>◀</span>
              <span className="casio-emu__dpad-btn casio-emu__dpad-btn--right" onClick={() => pressArrow("right")}>▶</span>
            </div>
            <div className="casio-emu__dpad-chevrons" />
          </div>
        </div>

        {/* Row 1 — SHIFT, VARIABLE, FUNCTION, CATALOG, TOOLS */}
        <KeyRow className="casio-emu__row--mode">
          <K v="shift" label="SHIFT" onClick={pressShift} active={shiftActive} />
          <div className="casio-emu__kcell" />
          <div className="casio-emu__kcell" />
          <div className="casio-emu__kcell" />
          <div className="casio-emu__kcell" />
        </KeyRow>

        {/* Row 2 — x², fraction, √, ^, log, ln */}
        <KeyRow className="casio-emu__row--func">
          <K v="dark" label={<>x<sup>2</sup></>} secB={<>x<sup>3</sup></>} onClick={pressSquare} />
          <K v="dark" label={<FracIcon />} secB={<span style={{fontSize:"0.85em"}}>⬜⬜</span>} onClick={pressFraction} />
          <K v="dark" label="√" secB="∛" onClick={pressSqrt} />
          <K v="dark" label={<>x<sup>□</sup></>} secB={<>x<sup>−1</sup></>} onClick={pressPower} />
          <K v="dark" label={<>log<sub style={{fontSize:"0.6em"}}>₁₀</sub></>} secB={<>10<sup>x</sup></>} onClick={pressLog} />
          <K v="dark" label="ln" secB={<>e<sup>x</sup></>} onClick={pressLn} />
        </KeyRow>

        {/* Row 3 — Ans, sin, cos, tan, (, ) */}
        <KeyRow className="casio-emu__row--func">
          <K v="dark" label="Ans" secB="PreAns" onClick={pressAns} />
          <K v="dark" label="sin" secB={<>sin<sup>−1</sup></>} onClick={() => pressTrig("sin")} />
          <K v="dark" label="cos" secB={<>cos<sup>−1</sup></>} onClick={() => pressTrig("cos")} />
          <K v="dark" label="tan" secB={<>tan<sup>−1</sup></>} onClick={() => pressTrig("tan")} />
          <K v="dark" label="(" onClick={pressBracket} />
          <K v="dark" label=")" onClick={pressCloseBracket} />
        </KeyRow>

        {/* Row 4 — 7 8 9 DEL AC */}
        <KeyRow className="casio-emu__row--num5">
          <K v="num" label="7" secB="" secO="A" onClick={() => pressDigit("7")} />
          <K v="num" label="8" secB="" secO="B" onClick={() => pressDigit("8")} />
          <K v="num" label="9" secB="" secO="C" onClick={() => pressDigit("9")} />
          <K v="dark" label="DEL" onClick={pressBackspace} />
          <K v="dark" label="AC" onClick={pressAC} />
        </KeyRow>

        {/* Row 5 — 4 5 6 × ÷ */}
        <KeyRow className="casio-emu__row--num5">
          <K v="num" label="4" secB="" secO="D" onClick={() => pressDigit("4")} />
          <K v="num" label="5" secB="" secO="E" onClick={() => pressDigit("5")} />
          <K v="num" label="6" secB="" secO="F" onClick={() => pressDigit("6")} />
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

        {/* Row 7 — 0 . ×10ˣ (−) FORMAT EXE */}
        <KeyRow className="casio-emu__row--bot">
          <K v="num" label="0" secO="" onClick={() => pressDigit("0")} />
          <K v="num" label="·" secB="Ran#" onClick={pressDecimal} />
          <K v="dark" label={<>×10<sup>x</sup></>} secB="π" secO="e" onClick={pressSci} />
          <K v="dark" label="(−)" secB="Ans" onClick={pressNeg} />
          <div className="casio-emu__kcell" />
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
