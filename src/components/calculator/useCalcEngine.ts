import { useCallback, useRef, useState } from "react";
import { evaluate } from "mathjs";
import nerdamer from "nerdamer";
import "nerdamer/Algebra";
import "nerdamer/Calculus";
import "nerdamer/Solve";
import "nerdamer/Extra";

/* ═══════════════════════════════════════════════════════════
   Node-based structured input model for Casio fx-83GT CW
   ═══════════════════════════════════════════════════════════ */

/* ─── Node types ─────────────────────────────────────────── */

/** A leaf node: single character (digit, decimal, operator, bracket, etc.) */
export interface LeafNode {
  type: "leaf";
  value: string;           // "1", ".", "+", "-", "*", "/", "(", ")"
  display: string;         // LaTeX fragment for display: same as value for digits, "\\times " for *, etc.
}

/** Ans token */
export interface AnsNode {
  type: "ans";
}

/** Fraction: two slots (numerator and denominator) */
export interface FractionNode {
  type: "fraction";
  num: CalcNode[];         // numerator slot
  den: CalcNode[];         // denominator slot
}

/** Root: two slots (index and radicand) */
export interface SqrtNode {
  type: "sqrt";
  index: CalcNode[];
  radicand: CalcNode[];
  hideDefaultIndex: boolean;
}

/** Power/superscript: two slots (base and exponent) */
export interface PowerNode {
  type: "power";
  base: CalcNode[];
  exponent: CalcNode[];
}

/** ×10^x scientific notation: one slot (exponent) */
export interface SciNode {
  type: "sci";
  exponent: CalcNode[];
}

/** Logarithm with arbitrary base: log_base(argument) */
export interface LogNode {
  type: "log";
  base: CalcNode[];
  arg: CalcNode[];
}

/** Function call: sin, cos, tan, asin, acos, atan, log10, ln, 10^, e^ */
export interface FnNode {
  type: "fn";
  fn: string;              // "sin" | "cos" | "tan" | "asin" | "acos" | "atan" | "log10" | "ln" | "10^" | "e^"
  arg: CalcNode[];
}

export type CalcNode = LeafNode | AnsNode | FractionNode | SqrtNode | PowerNode | SciNode | LogNode | FnNode;

/* ─── Cursor ─────────────────────────────────────────────── */

/**
 * The cursor is a path into the node tree.
 * - `list` is a reference identity to the array we're editing (root or a slot)
 * - `index` is the insertion index within that list (0 = before first node)
 *
 * We also keep a "stack" so we can pop out of nested slots.
 */
export interface CursorPos {
  list: CalcNode[];
  index: number;
}



/* ─── Public interfaces ──────────────────────────────────── */

export interface CalcState {
  /** The LaTeX string for the input line (includes cursor) */
  displayExpr: string;
  /** The result line text */
  result: string;
  resultIsError: boolean;
  justExecuted: boolean;
  ansValue: string;
  shiftActive: boolean;
  isRadians: boolean;
}

export interface CalcActions {
  pressDigit: (d: string) => void;
  pressDecimal: () => void;
  pressOperator: (op: string, display: string) => void;
  pressBracket: () => void;
  pressCloseBracket: () => void;
  pressBackspace: () => void;
  pressAC: () => void;
  pressEXE: () => void;
  pressAns: () => void;
  pressSquare: () => void;
  pressPower: () => void;
  pressSqrt: () => void;
  pressTrig: (fn: "sin" | "cos" | "tan") => void;
  pressLog: () => void;
  pressLn: () => void;
  pressFraction: () => void;
  pressShift: () => void;
  pressAngleToggle: () => void;
  pressSci: () => void;
  pressNeg: () => void;
  pressSD: () => void;
  pressArrow: (dir: "up" | "down" | "left" | "right") => void;
}

type ResultMode = "symbolic" | "decimal";

interface SymbolicEvaluation {
  text: string;
  latex: string;
}

interface RationalApproximation {
  numerator: number;
  denominator: number;
}

interface IntegerRootSimplification {
  outside: number;
  inside: number;
  index: number;
}

interface DecimalEvaluation {
  text: string;
  isComplex: boolean;
}

const DECIMAL_SIG_FIGS = 10;

/* ═══════════════════════════════════════════════════════════
   Pure helpers (no React)
   ═══════════════════════════════════════════════════════════ */

const PLACEHOLDER = "\\square ";
const CURSOR_MARK = "\\textcolor{#ff00ff}{\\smash{\\rule{0.045em}{1.05em}}}";

function cursorMark(showCursor: boolean): string {
  return showCursor ? CURSOR_MARK : "";
}

function isCursorOnly(inner: string): boolean {
  const trimmed = inner.trim();
  return trimmed === CURSOR_MARK.trim();
}

/** All slot-like child arrays for a node */
function getSlots(node: CalcNode): CalcNode[][] {
  switch (node.type) {
    case "fraction": return [node.num, node.den];
    case "sqrt": return [node.index, node.radicand];
    case "power": return [node.base, node.exponent];
    case "sci": return [node.exponent];
    case "log": return [node.base, node.arg];
    case "fn": return [node.arg];
    default: return [];
  }
}

/* ── nodesToLatex ─────────────────────────────────────────── */

function nodesToLatex(
  nodes: CalcNode[],
  cursorList: CalcNode[],
  cursorIndex: number,
  showCursor: boolean,
): string {
  let out = "";

  // If cursor is at position 0 in THIS list
  if (cursorList === nodes && cursorIndex === 0) {
    out += cursorMark(showCursor);
  }

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    out += nodeToLatex(n, cursorList, cursorIndex, showCursor);

    // Cursor after this node
    if (cursorList === nodes && cursorIndex === i + 1) {
      out += cursorMark(showCursor);
    }
  }

  return out;
}

function slotToLatex(
  slot: CalcNode[],
  cursorList: CalcNode[],
  cursorIndex: number,
  showCursor: boolean,
): string {
  const inner = nodesToLatex(slot, cursorList, cursorIndex, showCursor);
  if (inner.trim() === "" || isCursorOnly(inner)) {
    // Empty slot: show placeholder (unless cursor is there, in which case show cursor only)
    const hasCursor = cursorList === slot;
    return hasCursor ? cursorMark(showCursor) : PLACEHOLDER;
  }
  return inner;
}

function nodeToLatex(
  node: CalcNode,
  cursorList: CalcNode[],
  cursorIndex: number,
  showCursor: boolean,
): string {
  switch (node.type) {
    case "leaf":
      return node.display;

    case "ans":
      return "\\mathrm{Ans}";

    case "fraction": {
      const num = slotToLatex(node.num, cursorList, cursorIndex, showCursor);
      const den = slotToLatex(node.den, cursorList, cursorIndex, showCursor);
      return `\\frac{${num}}{${den}}`;
    }

    case "sqrt": {
      const index = slotToLatex(node.index, cursorList, cursorIndex, showCursor);
      const inner = slotToLatex(node.radicand, cursorList, cursorIndex, showCursor);
      const hideIndex = node.hideDefaultIndex
        && node.index.length === 1
        && node.index[0].type === "leaf"
        && node.index[0].value === "2"
        && cursorList !== node.index;
      return hideIndex ? `\\sqrt{${inner}}` : `\\sqrt[${index}]{${inner}}`;
    }

    case "power": {
      const base = slotToLatex(node.base, cursorList, cursorIndex, showCursor);
      const inner = slotToLatex(node.exponent, cursorList, cursorIndex, showCursor);
      return `{${base}}^{${inner}}`;
    }

    case "sci": {
      const inner = slotToLatex(node.exponent, cursorList, cursorIndex, showCursor);
      return `\\times 10^{${inner}}`;
    }

    case "log": {
      const base = slotToLatex(node.base, cursorList, cursorIndex, showCursor);
      const arg = slotToLatex(node.arg, cursorList, cursorIndex, showCursor);
      return `\\log_{${base}}\\left(${arg}\\right)`;
    }

    case "fn": {
      const inner = slotToLatex(node.arg, cursorList, cursorIndex, showCursor);
      const fnLatex = fnDisplayName(node.fn);
      return `${fnLatex}\\left(${inner}\\right)`;
    }
  }
}

function fnDisplayName(fn: string): string {
  switch (fn) {
    case "sin": return "\\sin";
    case "cos": return "\\cos";
    case "tan": return "\\tan";
    case "asin": return "\\sin^{-1}";
    case "acos": return "\\cos^{-1}";
    case "atan": return "\\tan^{-1}";
    case "log10": return "\\log_{10}";
    case "ln": return "\\ln";
    case "10^": return "10^";
    case "e^": return "e^";
    default: return fn;
  }
}

/* ── nodesToExpr (math.js string) ────────────────────────── */

function nodesToExpr(nodes: CalcNode[], ansValue: string): string {
  let out = "";
  for (let i = 0; i < nodes.length; i++) {
    out += nodeToExpr(nodes[i], ansValue);
  }
  return out;
}

function nodeToExpr(node: CalcNode, ansValue: string): string {
  switch (node.type) {
    case "leaf":
      return node.value;

    case "ans":
      return `(${ansValue})`;

    case "fraction": {
      const num = nodesToExpr(node.num, ansValue) || "0";
      const den = nodesToExpr(node.den, ansValue) || "1";
      return `((${num})/(${den}))`;
    }

    case "sqrt": {
      const index = nodesToExpr(node.index, ansValue) || "2";
      const inner = nodesToExpr(node.radicand, ansValue) || "0";
      return index === "2" ? `sqrt(${inner})` : `nthroot((${inner}),(${index}))`;
    }

    case "power": {
      const base = nodesToExpr(node.base, ansValue) || "0";
      const inner = nodesToExpr(node.exponent, ansValue) || "1";
      return `((${base})^(${inner}))`;
    }

    case "sci": {
      const inner = nodesToExpr(node.exponent, ansValue) || "0";
      return `*10^(${inner})`;
    }

    case "log": {
      const base = nodesToExpr(node.base, ansValue) || "10";
      const arg = nodesToExpr(node.arg, ansValue) || "0";
      return `log((${arg}),(${base}))`;
    }

    case "fn": {
      const inner = nodesToExpr(node.arg, ansValue) || "0";
      switch (node.fn) {
        case "10^": return `10^(${inner})`;
        case "e^": return `e^(${inner})`;
        default: return `${node.fn === "log10" ? "log10" : node.fn === "ln" ? "log" : node.fn}(${inner})`;
      }
    }
  }
}

/** Apply degree-mode trig wrappers + implicit multiplication */
function prepareExpr(raw: string, isRadians: boolean): string {
  let expr = raw;

  // Normalize calculator constants for math.js parsing.
  expr = expr.replace(/π/g, "pi");

  // Implicit multiplication: "2(" → "2*("
  expr = expr.replace(/(\d)\(/g, "$1*(");
  expr = expr.replace(/\)(\d)/g, ")*$1");
  expr = expr.replace(/\)\(/g, ")*(");
  expr = expr.replace(/(\d)(pi|e)\b/g, "$1*$2");
  expr = expr.replace(/\b(pi|e)(\d)/g, "$1*$2");
  expr = expr.replace(/\)(pi|e)\b/g, ")*$1");
  expr = expr.replace(/\b(pi|e)\(/g, "$1*(");

  if (!isRadians) {
    // Inverse trig FIRST
    expr = expr.replace(/\batan\(/g, "§ATAN(");
    expr = expr.replace(/\basin\(/g, "§ASIN(");
    expr = expr.replace(/\bacos\(/g, "§ACOS(");

    expr = expr.replace(/\bsin\(/g, "sin(pi/180*(");
    expr = expr.replace(/\bcos\(/g, "cos(pi/180*(");
    expr = expr.replace(/\btan\(/g, "tan(pi/180*(");

    expr = expr.replace(/§ASIN\(/g, "(180/pi)*asin(");
    expr = expr.replace(/§ACOS\(/g, "(180/pi)*acos(");
    expr = expr.replace(/§ATAN\(/g, "(180/pi)*atan(");

    // Count forward trig calls for extra closing parens
    const fwdTrig = (raw.match(/(?<![a])(sin|cos|tan)\(/g) || []).length;
    for (let i = 0; i < fwdTrig; i++) expr += ")";
  }

  return expr;
}

function prepareDecimalExpr(raw: string, isRadians: boolean): string {
  return prepareExpr(raw, isRadians).replace(/\bnthroot\(/g, "nthRoot(");
}

function formatDecimal(value: number): string {
  if (Number.isNaN(value)) return "undefined";
  if (!Number.isFinite(value)) return value > 0 ? "∞" : "-∞";
  return parseFloat(value.toPrecision(DECIMAL_SIG_FIGS)).toString();
}

function normalizeComplex(re: number, im: number): string {
  const r = Math.abs(re) < 1e-12 ? 0 : re;
  const i = Math.abs(im) < 1e-12 ? 0 : im;

  if (i === 0) return formatDecimal(r);
  if (r === 0) {
    if (i === 1) return "i";
    if (i === -1) return "-i";
    return `${formatDecimal(i)}i`;
  }

  const sign = i >= 0 ? "+" : "-";
  const absI = Math.abs(i);
  const imagPart = absI === 1 ? "i" : `${formatDecimal(absI)}i`;
  return `${formatDecimal(r)}${sign}${imagPart}`;
}

function evaluateDecimal(preparedExpr: string): DecimalEvaluation {
  const out = evaluate(preparedExpr) as unknown;

  if (typeof out === "number") {
    return { text: formatDecimal(out), isComplex: false };
  }

  if (out && typeof out === "object" && "re" in out && "im" in out) {
    const c = out as { re: number; im: number };
    return { text: normalizeComplex(c.re, c.im), isComplex: Math.abs(c.im) > 1e-12 };
  }

  const text = String(out);
  if (/NaN/i.test(text)) return { text: "undefined", isComplex: false };
  if (/Infinity/i.test(text)) return { text: text.startsWith("-") ? "-∞" : "∞", isComplex: false };
  return { text, isComplex: false };
}

function containsInverseTrig(expr: string): boolean {
  return /\b(?:asin|acos|atan)\(/.test(expr);
}

function evaluateSymbolic(preparedExpr: string): SymbolicEvaluation | null {
  try {
    const expr = nerdamer(preparedExpr);
    return {
      text: expr.toString(),
      latex: expr.toTeX(),
    };
  } catch {
    return null;
  }
}

function shouldUseDecimalFallback(symbolic: string): boolean {
  if (!symbolic.trim()) return true;
  if (/^undefined$/i.test(symbolic.trim())) return true;
  if (/(sin|cos|tan|asin|acos|atan|log10|log|ln)\(/.test(symbolic)) return true;
  if (/\be\b/.test(symbolic) && symbolic.trim() !== "e") return true;
  return false;
}

function approximateSimpleFraction(value: number, maxDenominator = 64, tolerance = 1e-10): RationalApproximation | null {
  if (!Number.isFinite(value)) return null;

  const rounded = Math.round(value);
  if (Math.abs(value - rounded) < tolerance) {
    return { numerator: rounded, denominator: 1 };
  }

  for (let denominator = 1; denominator <= maxDenominator; denominator++) {
    const numerator = Math.round(value * denominator);
    if (Math.abs(value - numerator / denominator) < tolerance) {
      const divisor = gcd(Math.abs(numerator), denominator);
      return {
        numerator: numerator / divisor,
        denominator: denominator / divisor,
      };
    }
  }

  return null;
}

function gcd(a: number, b: number): number {
  let x = a;
  let y = b;
  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
}

function rationalToLatex({ numerator, denominator }: RationalApproximation): string {
  if (denominator === 1) return String(numerator);
  return `\\frac{${numerator}}{${denominator}}`;
}

function rationalToText({ numerator, denominator }: RationalApproximation): string {
  if (denominator === 1) return String(numerator);
  return `${numerator}/${denominator}`;
}

function simplifyIntegerNthRoot(radicand: number, index: number): IntegerRootSimplification | null {
  if (!Number.isInteger(radicand) || !Number.isInteger(index) || index <= 1 || radicand === 0) {
    return null;
  }

  const isNegative = radicand < 0;
  if (isNegative && index % 2 === 0) return null;

  let remaining = Math.abs(radicand);
  const factorCounts = new Map<number, number>();

  for (let factor = 2; factor * factor <= remaining; factor++) {
    while (remaining % factor === 0) {
      factorCounts.set(factor, (factorCounts.get(factor) ?? 0) + 1);
      remaining /= factor;
    }
  }

  if (remaining > 1) {
    factorCounts.set(remaining, (factorCounts.get(remaining) ?? 0) + 1);
  }

  let outside = 1;
  let inside = 1;

  for (const [factor, powerCount] of factorCounts) {
    const extractedPower = Math.floor(powerCount / index);
    const leftoverPower = powerCount % index;
    if (extractedPower > 0) {
      outside *= factor ** extractedPower;
    }
    if (leftoverPower > 0) {
      inside *= factor ** leftoverPower;
    }
  }

  if (isNegative) outside *= -1;
  return { outside, inside, index };
}

function nthRootToText({ outside, inside, index }: IntegerRootSimplification): string {
  if (inside === 1) return String(outside);
  const rootText = index === 2 ? `sqrt(${inside})` : `nthroot(${inside},${index})`;
  if (outside === 1) return rootText;
  if (outside === -1) return `-${rootText}`;
  return `${outside}*${rootText}`;
}

function nthRootToLatex({ outside, inside, index }: IntegerRootSimplification): string {
  if (inside === 1) return String(outside);
  const radical = index === 2 ? `\\sqrt{${inside}}` : `\\sqrt[${index}]{${inside}}`;
  if (outside === 1) return radical;
  if (outside === -1) return `-${radical}`;
  return `${outside} \\cdot ${radical}`;
}

function simplifyDirectNthRootExpression(expr: string): SymbolicEvaluation | null {
  const match = expr.match(/^nthroot\(\((-?\d+)\),\((\d+)\)\)$/);
  if (!match) return null;

  const radicand = Number(match[1]);
  const index = Number(match[2]);
  const simplified = simplifyIntegerNthRoot(radicand, index);
  if (!simplified) return null;

  return {
    text: nthRootToText(simplified),
    latex: nthRootToLatex(simplified),
  };
}

function normalizeSymbolicEvaluation(
  rawExpr: string,
  symbolic: SymbolicEvaluation | null,
  decimalText: string,
): SymbolicEvaluation | null {
  const directNthRoot = simplifyDirectNthRootExpression(rawExpr);
  if (directNthRoot) return directNthRoot;

  if (!symbolic) return null;

  const decimalValue = Number(decimalText);
  const looksLikeHugeRational = /^-?\d{7,}\/\d{7,}$/.test(symbolic.text.trim());
  if (!looksLikeHugeRational) return symbolic;

  const rational = approximateSimpleFraction(decimalValue);
  if (!rational) return symbolic;

  return {
    text: rationalToText(rational),
    latex: rationalToLatex(rational),
  };
}

/* ── Cursor navigation helpers ───────────────────────────── */

/**
 * Given a (list, index) cursor position, find the parent frame
 * by walking the root tree. Returns null if list === root.
 */
function findParent(
  root: CalcNode[],
  targetList: CalcNode[],
): { parentList: CalcNode[]; nodeIndex: number; slotIndex: number } | null {
  if (targetList === root) return null;

  for (let i = 0; i < root.length; i++) {
    const node = root[i];
    const slots = getSlots(node);
    for (let s = 0; s < slots.length; s++) {
      if (slots[s] === targetList) {
        return { parentList: root, nodeIndex: i, slotIndex: s };
      }
      const deeper = findParent(slots[s], targetList);
      if (deeper) return deeper;
    }
  }
  return null;
}

/** Find the first slot of a node (for moving cursor into a structure) */
function firstSlot(node: CalcNode): CalcNode[] | null {
  const slots = getSlots(node);
  return slots.length > 0 ? slots[0] : null;
}

/** Find the last slot of a node */
function lastSlot(node: CalcNode): CalcNode[] | null {
  const slots = getSlots(node);
  return slots.length > 0 ? slots[slots.length - 1] : null;
}

function isNumericLeaf(node: CalcNode): node is LeafNode {
  return node.type === "leaf" && /[0-9.]/.test(node.value);
}

function isOperatorLeaf(node: CalcNode): boolean {
  return node.type === "leaf" && ["+", "-", "*", "/", "("].includes(node.value);
}

function isLeafWithValue(node: CalcNode, value: string): node is LeafNode {
  return node.type === "leaf" && node.value === value;
}

function findBalancedParenStart(list: CalcNode[], endIndex: number): number | null {
  let depth = 0;
  for (let i = endIndex; i >= 0; i--) {
    const n = list[i];
    if (n.type !== "leaf") continue;
    if (n.value === ")") {
      depth++;
    } else if (n.value === "(") {
      depth--;
      if (depth === 0) return i;
      if (depth < 0) return null;
    }
  }
  return null;
}

function extractPromotableToken(list: CalcNode[], cursorIndex: number): { start: number; nodes: CalcNode[] } | null {
  if (cursorIndex <= 0) return null;

  const left = list[cursorIndex - 1];

  // Trailing numeric literal: consume contiguous number token.
  if (isNumericLeaf(left)) {
    let start = cursorIndex - 1;
    while (start - 1 >= 0 && isNumericLeaf(list[start - 1])) start--;
    return { start, nodes: list.slice(start, cursorIndex) };
  }

  // Trailing bracketed expression: consume the balanced (...) block.
  if (isLeafWithValue(left, ")")) {
    const start = findBalancedParenStart(list, cursorIndex - 1);
    if (start !== null) {
      return { start, nodes: list.slice(start, cursorIndex) };
    }
    return null;
  }

  // Operator or open bracket means insert an empty fraction shell.
  if (isOperatorLeaf(left)) {
    return null;
  }

  // Any other nearest token (Ans, function, surd, fraction, constants, etc.).
  return { start: cursorIndex - 1, nodes: [left] };
}

function insertStructuredPowerAtCursor(
  cursor: CursorPos,
  fixedBase: CalcNode[] | null = null,
): PowerNode {
  if (fixedBase) {
    const node: PowerNode = { type: "power", base: fixedBase, exponent: [] };
    cursor.list.splice(cursor.index, 0, node);
    return node;
  }

  const token = extractPromotableToken(cursor.list, cursor.index);
  if (token) {
    const node: PowerNode = { type: "power", base: token.nodes, exponent: [] };
    cursor.list.splice(token.start, cursor.index - token.start, node);
    return node;
  }

  const node: PowerNode = { type: "power", base: [], exponent: [] };
  cursor.list.splice(cursor.index, 0, node);
  return node;
}

function insertStructuredRootAtCursor(
  cursor: CursorPos,
  fixedIndex: CalcNode[] | null,
  promoteRadicand: boolean,
  hideDefaultIndex: boolean,
): SqrtNode {
  const token = promoteRadicand ? extractPromotableToken(cursor.list, cursor.index) : null;
  const radicand = token ? token.nodes : [];
  const index = fixedIndex ?? [];
  const node: SqrtNode = { type: "sqrt", index, radicand, hideDefaultIndex };

  if (token) {
    cursor.list.splice(token.start, cursor.index - token.start, node);
  } else {
    cursor.list.splice(cursor.index, 0, node);
  }

  return node;
}

/* ═══════════════════════════════════════════════════════════
   React hook
   ═══════════════════════════════════════════════════════════ */

export default function useCalcEngine(): [CalcState, CalcActions] {
  // The root node list — mutated in place, then spread to trigger render
  const rootRef = useRef<CalcNode[]>([]);
  const cursorRef = useRef<CursorPos>({ list: rootRef.current, index: 0 });
  const [, forceRender] = useState(0);

  const [result, setResult] = useState("");
  const [symbolicResult, setSymbolicResult] = useState("");
  const [symbolicAns, setSymbolicAns] = useState("");
  const [decimalResult, setDecimalResult] = useState("");
  const [resultMode, setResultMode] = useState<ResultMode>("symbolic");
  const [resultIsError, setResultIsError] = useState(false);
  const [justExecuted, setJustExecuted] = useState(false);
  const [ansValue, setAnsValue] = useState("0");
  const [shiftActive, setShiftActive] = useState(false);
  const [isRadians, setIsRadians] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);

  const ansRef = useRef(ansValue);
  ansRef.current = ansValue;

  // Cursor blink is handled with CSS animation on the cursor glyph itself.
  const cursorTimerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const resetCursorBlink = useCallback(() => {
    setCursorVisible(true);
    if (cursorTimerRef.current) clearInterval(cursorTimerRef.current);
    cursorTimerRef.current = undefined;
  }, []);

  // Convenience to update after mutations
  const commit = useCallback(() => {
    resetCursorBlink();
    forceRender(n => n + 1);
  }, [resetCursorBlink]);

  const clearShift = useCallback(() => setShiftActive(false), []);

  /** If we just executed and user types, handle reset. Returns true if should start fresh. */
  const maybeResetAfterExe = useCallback((isOperator: boolean): boolean => {
    if (!justExecuted) return false;
    setJustExecuted(false);
    setResult("");
    setSymbolicResult("");
    setSymbolicAns("");
    setDecimalResult("");
    setResultMode("symbolic");
    setResultIsError(false);
    if (isOperator) {
      // Continue from Ans
      rootRef.current.length = 0;
      const ansNode: AnsNode = { type: "ans" };
      rootRef.current.push(ansNode);
      cursorRef.current = { list: rootRef.current, index: 1 };
    } else {
      rootRef.current.length = 0;
      cursorRef.current = { list: rootRef.current, index: 0 };
    }
    return true;
  }, [justExecuted]);

  const maybeResetAfterError = useCallback((): boolean => {
    if (!resultIsError) return false;
    rootRef.current.length = 0;
    cursorRef.current = { list: rootRef.current, index: 0 };
    setResult("");
    setSymbolicResult("");
    setSymbolicAns("");
    setDecimalResult("");
    setResultMode("symbolic");
    setResultIsError(false);
    setJustExecuted(false);
    return true;
  }, [resultIsError]);

  /** Insert a node at cursor position */
  const insertNode = useCallback((node: CalcNode) => {
    const cur = cursorRef.current;
    cur.list.splice(cur.index, 0, node);
    cur.index++;
  }, []);

  /** Insert a node with slots, placing cursor in the first slot */
  const insertStructured = useCallback((node: CalcNode) => {
    const cur = cursorRef.current;
    cur.list.splice(cur.index, 0, node);
    const slot = firstSlot(node);
    if (slot) {
      cursorRef.current = { list: slot, index: 0 };
    } else {
      cur.index++;
    }
  }, []);

  /* ── Actions ───────────────────────────────────────────── */

  const pressDigit = useCallback((d: string) => {
    if (maybeResetAfterError()) { /* cleared */ }
    else { maybeResetAfterExe(false); }
    const leaf: LeafNode = { type: "leaf", value: d, display: d };
    insertNode(leaf);
    commit();
  }, [maybeResetAfterError, maybeResetAfterExe, insertNode, commit]);

  const pressDecimal = useCallback(() => {
    if (maybeResetAfterError()) { /* cleared */ }
    else { maybeResetAfterExe(false); }
    const leaf: LeafNode = { type: "leaf", value: ".", display: "." };
    insertNode(leaf);
    commit();
  }, [maybeResetAfterError, maybeResetAfterExe, insertNode, commit]);

  const pressOperator = useCallback((op: string, display: string) => {
    if (maybeResetAfterError()) return;
    maybeResetAfterExe(true);

    // If cursor is in fraction denominator, auto-exit before applying next operator.
    const parent = findParent(rootRef.current, cursorRef.current.list);
    if (parent) {
      const parentNode = parent.parentList[parent.nodeIndex];
      if (parentNode.type === "fraction" && parent.slotIndex === 1) {
        cursorRef.current = { list: parent.parentList, index: parent.nodeIndex + 1 };
      }
    }

    // Replace trailing operator
    const cur = cursorRef.current;
    if (cur.index > 0) {
      const prev = cur.list[cur.index - 1];
      if (prev.type === "leaf" && ["+", "-", "*", "/"].includes(prev.value)) {
        prev.value = op;
        prev.display = display;
        commit();
        return;
      }
    }
    const leaf: LeafNode = { type: "leaf", value: op, display };
    insertNode(leaf);
    commit();
  }, [maybeResetAfterError, maybeResetAfterExe, insertNode, commit]);

  const pressBracket = useCallback(() => {
    if (maybeResetAfterError()) return;
    maybeResetAfterExe(false);
    if (shiftActive) {
      const leaf: LeafNode = { type: "leaf", value: "\u03c0", display: "\\pi " };
      insertNode(leaf);
      clearShift();
    } else {
      const leaf: LeafNode = { type: "leaf", value: "(", display: "(" };
      insertNode(leaf);
    }
    commit();
  }, [shiftActive, clearShift, maybeResetAfterError, maybeResetAfterExe, insertNode, commit]);

  const pressCloseBracket = useCallback(() => {
    if (maybeResetAfterError()) return;
    maybeResetAfterExe(false);
    if (shiftActive) {
      const leaf: LeafNode = { type: "leaf", value: "e", display: "e" };
      insertNode(leaf);
      clearShift();
    } else {
      const leaf: LeafNode = { type: "leaf", value: ")", display: ")" };
      insertNode(leaf);
    }
    commit();
  }, [shiftActive, clearShift, maybeResetAfterError, maybeResetAfterExe, insertNode, commit]);

  const pressBackspace = useCallback(() => {
    if (maybeResetAfterError()) { commit(); return; }
    if (justExecuted) {
      rootRef.current.length = 0;
      cursorRef.current = { list: rootRef.current, index: 0 };
      setResult("");
      setSymbolicResult("");
      setSymbolicAns("");
      setDecimalResult("");
      setResultMode("symbolic");
      setJustExecuted(false);
      commit();
      return;
    }
    const cur = cursorRef.current;
    if (cur.index > 0) {
      // Remove the node before cursor
      cur.list.splice(cur.index - 1, 1);
      cur.index--;
      commit();
    } else {
      // At start of a slot — try to unwrap/delete the parent structure
      const parent = findParent(rootRef.current, cur.list);
      if (parent) {
        // Remove the entire structure node and dump its first slot's content into parent
        const structNode = parent.parentList[parent.nodeIndex];
        const slots = getSlots(structNode);
        // Collect all content from all slots
        const allContent: CalcNode[] = [];
        for (const slot of slots) {
          allContent.push(...slot);
        }
        // Replace structure node with collected content
        parent.parentList.splice(parent.nodeIndex, 1, ...allContent);
        cursorRef.current = { list: parent.parentList, index: parent.nodeIndex };
        commit();
      }
    }
  }, [justExecuted, maybeResetAfterError, commit]);

  const pressAC = useCallback(() => {
    rootRef.current.length = 0;
    cursorRef.current = { list: rootRef.current, index: 0 };
    setResult("");
    setSymbolicResult("");
    setSymbolicAns("");
    setDecimalResult("");
    setResultMode("symbolic");
    setResultIsError(false);
    setJustExecuted(false);
    commit();
  }, [commit]);

  const pressEXE = useCallback(() => {
    if (rootRef.current.length === 0) return;
    try {
      const rawExpr = nodesToExpr(rootRef.current, ansRef.current);
      if (!rawExpr.trim()) return;
      const decimalPrepared = prepareDecimalExpr(rawExpr, isRadians);
      const symbolicPrepared = prepareExpr(rawExpr, isRadians);
      const decimalEval = evaluateDecimal(decimalPrepared);
      if (decimalEval.isComplex && containsInverseTrig(rawExpr)) {
        throw new Error("Math ERROR");
      }
      const decimal = decimalEval.text;
      const symbolic = normalizeSymbolicEvaluation(symbolicPrepared, evaluateSymbolic(symbolicPrepared), decimal);
      const symbolicText = symbolic?.text ?? "";
      const symbolicLatex = symbolic?.latex ?? "";
      const useDecimal = shouldUseDecimalFallback(symbolicText);

      let displayValue = decimal;
      let ansStored = decimal;

      if (!useDecimal && symbolicLatex) {
        displayValue = symbolicLatex;
        ansStored = symbolicText;
      } else if (decimal !== "∞" && decimal !== "-∞" && decimal !== "undefined") {
        displayValue = `\\approx ${decimal}`;
      }

      setSymbolicResult(symbolicLatex);
      setSymbolicAns(symbolicText);
      setDecimalResult(decimal);
      setResultMode("symbolic");
      setResult(displayValue);
      setResultIsError(false);
      setAnsValue(ansStored);
      ansRef.current = ansStored;
      setJustExecuted(true);
    } catch {
      setResult("Math ERROR");
      setSymbolicResult("");
      setSymbolicAns("");
      setDecimalResult("");
      setResultMode("symbolic");
      setResultIsError(true);
      setJustExecuted(true);
    }
    commit();
  }, [isRadians, commit]);

  const pressSD = useCallback(() => {
    if (!symbolicResult && !decimalResult) return;

    if (resultMode === "symbolic") {
      setResultMode("decimal");
      setResult(decimalResult || result);
    } else {
      setResultMode("symbolic");
      if (!symbolicResult || shouldUseDecimalFallback(symbolicAns)) {
        if (decimalResult && decimalResult !== "∞" && decimalResult !== "-∞" && decimalResult !== "undefined") {
          setResult(`\\approx ${decimalResult}`);
        } else {
          setResult(decimalResult || result);
        }
      } else {
        setResult(symbolicResult);
      }
    }

    commit();
  }, [symbolicResult, symbolicAns, decimalResult, resultMode, result, commit]);

  const pressAns = useCallback(() => {
    if (maybeResetAfterError()) { /* cleared */ }
    else { maybeResetAfterExe(false); }
    const node: AnsNode = { type: "ans" };
    insertNode(node);
    commit();
  }, [maybeResetAfterError, maybeResetAfterExe, insertNode, commit]);

  const pressSquare = useCallback(() => {
    if (maybeResetAfterError()) return;
    maybeResetAfterExe(true);
    if (shiftActive) {
      const node = insertStructuredPowerAtCursor(cursorRef.current);
      cursorRef.current = { list: node.exponent, index: 0 };
      clearShift();
    } else {
      const digit: LeafNode = { type: "leaf", value: "2", display: "2" };
      const node = insertStructuredPowerAtCursor(cursorRef.current);
      node.exponent.push(digit);
      cursorRef.current = { list: node.exponent, index: node.exponent.length };
    }
    commit();
  }, [shiftActive, clearShift, maybeResetAfterError, maybeResetAfterExe, commit]);

  const pressPower = useCallback(() => {
    if (maybeResetAfterError()) return;
    maybeResetAfterExe(true);
    if (shiftActive) {
      const minus: LeafNode = { type: "leaf", value: "-", display: "-" };
      const one: LeafNode = { type: "leaf", value: "1", display: "1" };
      const node = insertStructuredPowerAtCursor(cursorRef.current);
      node.exponent.push(minus, one);
      cursorRef.current = { list: node.exponent, index: node.exponent.length };
      clearShift();
    } else {
      const node = insertStructuredPowerAtCursor(cursorRef.current);
      if (node.base.length > 0) {
        cursorRef.current = { list: node.exponent, index: 0 };
      } else {
        cursorRef.current = { list: node.base, index: 0 };
      }
    }
    commit();
  }, [shiftActive, clearShift, maybeResetAfterError, maybeResetAfterExe, commit]);

  const pressSqrt = useCallback(() => {
    if (maybeResetAfterError()) return;
    maybeResetAfterExe(false);
    if (shiftActive) {
      const node = insertStructuredRootAtCursor(cursorRef.current, null, true, false);
      cursorRef.current = { list: node.index, index: 0 };
      clearShift();
    } else {
      const two: LeafNode = { type: "leaf", value: "2", display: "2" };
      const node = insertStructuredRootAtCursor(cursorRef.current, [two], false, true);
      cursorRef.current = { list: node.radicand, index: 0 };
    }
    commit();
  }, [shiftActive, clearShift, maybeResetAfterError, maybeResetAfterExe, commit]);

  const pressTrig = useCallback((fn: "sin" | "cos" | "tan") => {
    if (maybeResetAfterError()) return;
    maybeResetAfterExe(false);
    const fnName = shiftActive ? ("a" + fn) : fn;
    const node: FnNode = { type: "fn", fn: fnName, arg: [] };
    insertStructured(node);
    if (shiftActive) clearShift();
    commit();
  }, [shiftActive, clearShift, maybeResetAfterError, maybeResetAfterExe, insertStructured, commit]);

  const pressLog = useCallback(() => {
    if (maybeResetAfterError()) return;
    maybeResetAfterExe(false);
    if (shiftActive) {
      const one: LeafNode = { type: "leaf", value: "1", display: "1" };
      const zero: LeafNode = { type: "leaf", value: "0", display: "0" };
      const node = insertStructuredPowerAtCursor(cursorRef.current, [one, zero]);
      cursorRef.current = { list: node.exponent, index: 0 };
      clearShift();
    } else {
      const node: LogNode = { type: "log", base: [], arg: [] };
      insertStructured(node);
    }
    commit();
  }, [shiftActive, clearShift, maybeResetAfterError, maybeResetAfterExe, insertStructured, commit]);

  const pressLn = useCallback(() => {
    if (maybeResetAfterError()) return;
    maybeResetAfterExe(false);
    if (shiftActive) {
      const base: LeafNode = { type: "leaf", value: "e", display: "e" };
      const node = insertStructuredPowerAtCursor(cursorRef.current, [base]);
      cursorRef.current = { list: node.exponent, index: 0 };
      clearShift();
    } else {
      const node: FnNode = { type: "fn", fn: "ln", arg: [] };
      insertStructured(node);
    }
    commit();
  }, [shiftActive, clearShift, maybeResetAfterError, maybeResetAfterExe, insertStructured, commit]);

  const pressFraction = useCallback(() => {
    if (maybeResetAfterError()) return;
    maybeResetAfterExe(false);

    const cur = cursorRef.current;
    const token = extractPromotableToken(cur.list, cur.index);

    if (token) {
      const node: FractionNode = { type: "fraction", num: token.nodes, den: [] };
      cur.list.splice(token.start, cur.index - token.start, node);
      cursorRef.current = { list: node.den, index: 0 };
    } else {
      const node: FractionNode = { type: "fraction", num: [], den: [] };
      insertStructured(node); // cursor goes into numerator for empty/operator trailing cases
    }

    commit();
  }, [maybeResetAfterError, maybeResetAfterExe, insertStructured, commit]);

  const pressShift = useCallback(() => {
    setShiftActive(v => !v);
  }, []);

  const pressAngleToggle = useCallback(() => {
    setIsRadians(v => !v);
    commit();
  }, [commit]);

  const pressSci = useCallback(() => {
    if (maybeResetAfterError()) return;
    maybeResetAfterExe(true);
    const node: SciNode = { type: "sci", exponent: [] };
    insertStructured(node);
    commit();
  }, [maybeResetAfterError, maybeResetAfterExe, insertStructured, commit]);

  const pressNeg = useCallback(() => {
    if (maybeResetAfterError()) return;
    maybeResetAfterExe(false);
    const open: LeafNode = { type: "leaf", value: "(", display: "(" };
    const minus: LeafNode = { type: "leaf", value: "-", display: "-" };
    insertNode(open);
    insertNode(minus);
    commit();
  }, [maybeResetAfterError, maybeResetAfterExe, insertNode, commit]);

  /* ── Arrow navigation ──────────────────────────────────── */

  const pressArrow = useCallback((dir: "up" | "down" | "left" | "right") => {
    const cur = cursorRef.current;
    const root = rootRef.current;

    if (dir === "left") {
      if (cur.index > 0) {
        // Check if node to the left has slots — enter its last slot at end
        const prevNode = cur.list[cur.index - 1];
        const ls = lastSlot(prevNode);
        if (ls) {
          cursorRef.current = { list: ls, index: ls.length };
        } else {
          cur.index--;
        }
      } else {
        // At start of a slot — move to previous sibling slot if present, else before the parent node
        const parent = findParent(root, cur.list);
        if (parent) {
          const parentNode = parent.parentList[parent.nodeIndex];
          const slots = getSlots(parentNode);
          if (parent.slotIndex > 0) {
            const targetSlot = slots[parent.slotIndex - 1];
            cursorRef.current = { list: targetSlot, index: targetSlot.length };
          } else {
            cursorRef.current = { list: parent.parentList, index: parent.nodeIndex };
          }
        }
      }
      commit();
    } else if (dir === "right") {
      if (cur.index < cur.list.length) {
        // Check if node to the right has slots — enter its first slot at 0
        const nextNode = cur.list[cur.index];
        const fs = firstSlot(nextNode);
        if (fs) {
          cursorRef.current = { list: fs, index: 0 };
        } else {
          cur.index++;
        }
      } else {
        // At end of a slot — move to next sibling slot if present, else after the parent node
        const parent = findParent(root, cur.list);
        if (parent) {
          const parentNode = parent.parentList[parent.nodeIndex];
          const slots = getSlots(parentNode);
          if (parent.slotIndex < slots.length - 1) {
            const targetSlot = slots[parent.slotIndex + 1];
            cursorRef.current = { list: targetSlot, index: 0 };
          } else {
            cursorRef.current = { list: parent.parentList, index: parent.nodeIndex + 1 };
          }
        }
      }
      commit();
    } else if (dir === "up" || dir === "down") {
      // Navigate between sibling slots (e.g., fraction numerator ↔ denominator)
      const parent = findParent(root, cur.list);
      if (parent) {
        const structNode = parent.parentList[parent.nodeIndex];
        const slots = getSlots(structNode);
        const currentSlotIdx = slots.indexOf(cur.list);
        if (currentSlotIdx >= 0) {
          let targetIdx: number;
          if (dir === "up") {
            targetIdx = currentSlotIdx > 0 ? currentSlotIdx - 1 : currentSlotIdx;
          } else {
            targetIdx = currentSlotIdx < slots.length - 1 ? currentSlotIdx + 1 : currentSlotIdx;
          }
          if (targetIdx !== currentSlotIdx) {
            const targetSlot = slots[targetIdx];
            cursorRef.current = {
              list: targetSlot,
              index: Math.min(cur.index, targetSlot.length),
            };
            commit();
          }
        }
      }
    }
  }, [commit]);

  /* ── Build display ─────────────────────────────────────── */

  const root = rootRef.current;
  const cur = cursorRef.current;
  const displayExpr = nodesToLatex(root, cur.list, cur.index, cursorVisible);

  const state: CalcState = {
    displayExpr,
    result,
    resultIsError,
    justExecuted,
    ansValue,
    shiftActive,
    isRadians,
  };

  const actions: CalcActions = {
    pressDigit, pressDecimal, pressOperator, pressBracket, pressCloseBracket,
    pressBackspace, pressAC, pressEXE, pressAns, pressSquare,
    pressPower, pressSqrt, pressTrig, pressLog, pressLn,
    pressFraction, pressShift, pressAngleToggle, pressSci, pressNeg, pressSD, pressArrow,
  };

  return [state, actions];
}
