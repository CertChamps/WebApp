import { useCallback, useRef, useState } from "react";
import { evaluate } from "mathjs";

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

/** Square root: one slot (radicand) */
export interface SqrtNode {
  type: "sqrt";
  cube: boolean;           // false = √, true = ∛
  radicand: CalcNode[];
}

/** Power/superscript: one slot (exponent) */
export interface PowerNode {
  type: "power";
  exponent: CalcNode[];
}

/** ×10^x scientific notation: one slot (exponent) */
export interface SciNode {
  type: "sci";
  exponent: CalcNode[];
}

/** Function call: sin, cos, tan, asin, acos, atan, log10, ln, 10^, e^ */
export interface FnNode {
  type: "fn";
  fn: string;              // "sin" | "cos" | "tan" | "asin" | "acos" | "atan" | "log10" | "ln" | "10^" | "e^"
  arg: CalcNode[];
}

export type CalcNode = LeafNode | AnsNode | FractionNode | SqrtNode | PowerNode | SciNode | FnNode;

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
  pressSci: () => void;
  pressNeg: () => void;
  pressArrow: (dir: "up" | "down" | "left" | "right") => void;
}

/* ═══════════════════════════════════════════════════════════
   Pure helpers (no React)
   ═══════════════════════════════════════════════════════════ */

const PLACEHOLDER = "\\square ";
const CURSOR_MARK = "\\mid ";

/** All slot-like child arrays for a node */
function getSlots(node: CalcNode): CalcNode[][] {
  switch (node.type) {
    case "fraction": return [node.num, node.den];
    case "sqrt": return [node.radicand];
    case "power": return [node.exponent];
    case "sci": return [node.exponent];
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
  if (showCursor && cursorList === nodes && cursorIndex === 0) {
    out += CURSOR_MARK;
  }

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    out += nodeToLatex(n, cursorList, cursorIndex, showCursor);

    // Cursor after this node
    if (showCursor && cursorList === nodes && cursorIndex === i + 1) {
      out += CURSOR_MARK;
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
  if (inner.trim() === "" || inner.trim() === CURSOR_MARK.trim()) {
    // Empty slot: show placeholder (unless cursor is there, in which case show cursor only)
    const hasCursor = showCursor && cursorList === slot;
    return hasCursor ? CURSOR_MARK : PLACEHOLDER;
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
      const inner = slotToLatex(node.radicand, cursorList, cursorIndex, showCursor);
      return node.cube ? `\\sqrt[3]{${inner}}` : `\\sqrt{${inner}}`;
    }

    case "power": {
      const inner = slotToLatex(node.exponent, cursorList, cursorIndex, showCursor);
      return `{}^{${inner}}`;
    }

    case "sci": {
      const inner = slotToLatex(node.exponent, cursorList, cursorIndex, showCursor);
      return `\\times 10^{${inner}}`;
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
      const inner = nodesToExpr(node.radicand, ansValue) || "0";
      return node.cube ? `cbrt(${inner})` : `sqrt(${inner})`;
    }

    case "power": {
      const inner = nodesToExpr(node.exponent, ansValue) || "1";
      return `^(${inner})`;
    }

    case "sci": {
      const inner = nodesToExpr(node.exponent, ansValue) || "0";
      return `*10^(${inner})`;
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

  // Implicit multiplication: "2(" → "2*("
  expr = expr.replace(/(\d)\(/g, "$1*(");
  expr = expr.replace(/\)(\d)/g, ")*$1");
  expr = expr.replace(/\)\(/g, ")*(");

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

/* ═══════════════════════════════════════════════════════════
   React hook
   ═══════════════════════════════════════════════════════════ */

export default function useCalcEngine(): [CalcState, CalcActions] {
  // The root node list — mutated in place, then spread to trigger render
  const rootRef = useRef<CalcNode[]>([]);
  const cursorRef = useRef<CursorPos>({ list: rootRef.current, index: 0 });
  const [, forceRender] = useState(0);

  const [result, setResult] = useState("");
  const [resultIsError, setResultIsError] = useState(false);
  const [justExecuted, setJustExecuted] = useState(false);
  const [ansValue, setAnsValue] = useState("0");
  const [shiftActive, setShiftActive] = useState(false);
  const [isRadians] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);

  const ansRef = useRef(ansValue);
  ansRef.current = ansValue;

  // blink cursor timer
  const cursorTimerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const resetCursorBlink = useCallback(() => {
    setCursorVisible(true);
    if (cursorTimerRef.current) clearInterval(cursorTimerRef.current);
    cursorTimerRef.current = setInterval(() => setCursorVisible(v => !v), 530);
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
    setResultIsError(false);
    setJustExecuted(false);
    commit();
  }, [commit]);

  const pressEXE = useCallback(() => {
    if (rootRef.current.length === 0) return;
    try {
      const rawExpr = nodesToExpr(rootRef.current, ansRef.current);
      if (!rawExpr.trim()) return;
      const prepared = prepareExpr(rawExpr, isRadians);
      const res = evaluate(prepared);

      let formatted: string;
      if (typeof res === "number") {
        if (!isFinite(res)) throw new Error("Math ERROR");
        formatted = parseFloat(res.toPrecision(10)).toString();
      } else {
        formatted = String(res);
      }

      setResult(formatted);
      setResultIsError(false);
      setAnsValue(formatted);
      ansRef.current = formatted;
      setJustExecuted(true);
    } catch {
      setResult("Math ERROR");
      setResultIsError(true);
      setJustExecuted(true);
    }
    commit();
  }, [isRadians, commit]);

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
      // x³: insert power node with "3" already in exponent
      const digit: LeafNode = { type: "leaf", value: "3", display: "3" };
      const node: PowerNode = { type: "power", exponent: [digit] };
      const cur = cursorRef.current;
      cur.list.splice(cur.index, 0, node);
      cur.index++;
      clearShift();
    } else {
      // x²: insert power node with "2" already in exponent
      const digit: LeafNode = { type: "leaf", value: "2", display: "2" };
      const node: PowerNode = { type: "power", exponent: [digit] };
      const cur = cursorRef.current;
      cur.list.splice(cur.index, 0, node);
      cur.index++;
    }
    commit();
  }, [shiftActive, clearShift, maybeResetAfterError, maybeResetAfterExe, commit]);

  const pressPower = useCallback(() => {
    if (maybeResetAfterError()) return;
    maybeResetAfterExe(true);
    if (shiftActive) {
      // x⁻¹: pre-fill exponent
      const minus: LeafNode = { type: "leaf", value: "-", display: "-" };
      const one: LeafNode = { type: "leaf", value: "1", display: "1" };
      const node: PowerNode = { type: "power", exponent: [minus, one] };
      const cur = cursorRef.current;
      cur.list.splice(cur.index, 0, node);
      cur.index++;
      clearShift();
    } else {
      const node: PowerNode = { type: "power", exponent: [] };
      insertStructured(node);
    }
    commit();
  }, [shiftActive, clearShift, maybeResetAfterError, maybeResetAfterExe, insertStructured, commit]);

  const pressSqrt = useCallback(() => {
    if (maybeResetAfterError()) return;
    maybeResetAfterExe(false);
    const node: SqrtNode = { type: "sqrt", cube: shiftActive, radicand: [] };
    insertStructured(node);
    if (shiftActive) clearShift();
    commit();
  }, [shiftActive, clearShift, maybeResetAfterError, maybeResetAfterExe, insertStructured, commit]);

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
      const node: FnNode = { type: "fn", fn: "10^", arg: [] };
      insertStructured(node);
      clearShift();
    } else {
      const node: FnNode = { type: "fn", fn: "log10", arg: [] };
      insertStructured(node);
    }
    commit();
  }, [shiftActive, clearShift, maybeResetAfterError, maybeResetAfterExe, insertStructured, commit]);

  const pressLn = useCallback(() => {
    if (maybeResetAfterError()) return;
    maybeResetAfterExe(false);
    if (shiftActive) {
      const node: FnNode = { type: "fn", fn: "e^", arg: [] };
      insertStructured(node);
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
    const node: FractionNode = { type: "fraction", num: [], den: [] };
    insertStructured(node); // cursor goes into num (first slot)
    commit();
  }, [maybeResetAfterError, maybeResetAfterExe, insertStructured, commit]);

  const pressShift = useCallback(() => {
    setShiftActive(v => !v);
  }, []);

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
        // At start of a slot — move to parent, before the structure node
        const parent = findParent(root, cur.list);
        if (parent) {
          cursorRef.current = { list: parent.parentList, index: parent.nodeIndex };
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
        // At end of a slot — move to parent, after the structure node
        const parent = findParent(root, cur.list);
        if (parent) {
          cursorRef.current = { list: parent.parentList, index: parent.nodeIndex + 1 };
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
    pressFraction, pressShift, pressSci, pressNeg, pressArrow,
  };

  return [state, actions];
}
