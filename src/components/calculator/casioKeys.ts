/**
 * Casio fx-83GT CW / fx-85GT CW – key layout (1:1 from manual).
 * Each key: primary (main), shift (alternate, above key left).
 */

export type KeyId =
  | "shift"
  | "menu"
  | "up"
  | "left"
  | "right"
  | "down"
  | "optn"
  | "parens"
  | "7"
  | "8"
  | "9"
  | "del"
  | "ac"
  | "pi"
  | "4"
  | "5"
  | "6"
  | "mul"
  | "div"
  | "sqrt"
  | "1"
  | "2"
  | "3"
  | "plus"
  | "minus"
  | "xsq"
  | "0"
  | "dot"
  | "neg"
  | "exp"
  | "eq"
  | "log"
  | "ln"
  | "sin"
  | "cos"
  | "tan"
  | "ans"
  | "format"
  | "home"
  | "off";

export interface KeyDef {
  id: KeyId;
  main: string;   // keycap label (primary)
  /** Alternate function label (above key, left) – display on key cap */
  shift?: string;
  /** For display/input: what to append on primary press */
  primaryInput?: string;
  /** What to append when shift is active */
  shiftInput?: string;
  /** Short label for shift (corner) when different from shiftInput, e.g. "10ˣ" */
  shiftLabel?: string;
  /** Special action instead of input (e.g. "AC", "DEL", "=") */
  action?: "AC" | "DEL" | "=" | "SHIFT" | "OFF" | "HOME" | "FORMAT" | "OPTN" | "cursor";
}

/** Grid: 6 columns × 6 rows. Row 0 = nav; rows 1–5 = main keypad. */
export const KEY_GRID: (KeyDef | null)[][] = [
  // Row 0: SHIFT  ▲  ◀  ▶  ▼  OPTN
  [
    { id: "shift", main: "SHIFT", action: "SHIFT" },
    { id: "up", main: "▲", action: "cursor" },
    { id: "left", main: "◀", action: "cursor" },
    { id: "right", main: "▶", action: "cursor" },
    { id: "down", main: "▼", action: "cursor" },
    { id: "optn", main: "OPTN", action: "OPTN" },
  ],
  // Row 1: ( )  7  8  9  DEL  AC
  [
    { id: "parens", main: "( )", shift: ",", primaryInput: "(", shiftInput: "," },
    { id: "7", main: "7", primaryInput: "7" },
    { id: "8", main: "8", primaryInput: "8" },
    { id: "9", main: "9", primaryInput: "9" },
    { id: "del", main: "DEL", action: "DEL" },
    { id: "ac", main: "AC", action: "AC" },
  ],
  // Row 2: π  4  5  6  ×  ÷
  [
    { id: "pi", main: "π", primaryInput: "π" },
    { id: "4", main: "4", primaryInput: "4" },
    { id: "5", main: "5", primaryInput: "5" },
    { id: "6", main: "6", primaryInput: "6" },
    { id: "mul", main: "×", primaryInput: "×" },
    { id: "div", main: "÷", primaryInput: "÷" },
  ],
  // Row 3: √  1  2  3  +  -
  [
    { id: "sqrt", main: "√", shift: "ⁿ√", primaryInput: "√(", shiftInput: "ⁿ√(" },
    { id: "1", main: "1", primaryInput: "1" },
    { id: "2", main: "2", primaryInput: "2" },
    { id: "3", main: "3", primaryInput: "3" },
    { id: "plus", main: "+", primaryInput: "+" },
    { id: "minus", main: "-", primaryInput: "-" },
  ],
  // Row 4: x²  0  .  (-)  EXP  =
  [
    { id: "xsq", main: "x²", shift: "ˣ", primaryInput: "²", shiftInput: "^(" },
    { id: "0", main: "0", primaryInput: "0" },
    { id: "dot", main: ".", primaryInput: "." },
    { id: "neg", main: "(-)", primaryInput: "(-)" },
    { id: "exp", main: "×10ˣ", primaryInput: "×10^(" },
    { id: "eq", main: "=", action: "=" },
  ],
  // Row 5: log  ln  sin  cos  tan  Ans
  [
    { id: "log", main: "log", shift: "10ˣ", primaryInput: "log(", shiftInput: "10^(" },
    { id: "ln", main: "ln", shift: "eˣ", primaryInput: "ln(", shiftInput: "e^(" },
    { id: "sin", main: "sin", shift: "sin⁻¹", primaryInput: "sin(", shiftInput: "sin⁻¹(" },
    { id: "cos", main: "cos", shift: "cos⁻¹", primaryInput: "cos(", shiftInput: "cos⁻¹(" },
    { id: "tan", main: "tan", shift: "tan⁻¹", primaryInput: "tan(", shiftInput: "tan⁻¹(" },
    { id: "ans", main: "Ans", primaryInput: "Ans" },
  ],
];

export const ROWS = KEY_GRID.length;
export const COLS = 6;
