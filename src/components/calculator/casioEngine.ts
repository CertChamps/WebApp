/**
 * Casio fx-83GT CW / fx-85GT CW – calculation engine.
 * Matches manual: priority, functions, Ans, angle unit (Deg/Rad/Grad).
 */

import nerdamer from "nerdamer";
import "nerdamer/Algebra";
import "nerdamer/Calculus";
import "nerdamer/Solve";
import "nerdamer/Extra";

export type AngleUnit = "Deg" | "Rad" | "Grad";

/**
 * Convert expression string to nerdamer-compatible form:
 * - Trig arguments in radians when angle unit is Deg or Grad.
 * - Map log10, asin, acos, atan from our names.
 */
function prepareForNerdamer(expr: string, angleUnit: AngleUnit): string {
  let s = expr
    .replace(/\s+/g, "")
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/π/g, "pi")
    .replace(/√\s*\(/g, "sqrt(")
    .replace(/√([^(])/g, "sqrt($1)")
    .replace(/²/g, "^2")
    .replace(/Ans/g, "__ANS__");
  // Inverse trig before generic ⁻¹: sin⁻¹( → asin( (nerdamer)
  s = s.replace(/sin⁻¹\(/g, "asin(");
  s = s.replace(/cos⁻¹\(/g, "acos(");
  s = s.replace(/tan⁻¹\(/g, "atan(");
  s = s.replace(/⁻¹/g, "-1");
  // Unary minus: (-) in Casio means "negative"
  s = s.replace(/\(-\)/g, "(-");

  // nth root: ⁿ√(n,x) → root(x,n) in nerdamer
  const nthRootRe = /ⁿ√\s*\(([^,]+),([^)]+)\)/g;
  s = s.replace(nthRootRe, (_, n, x) => `root(${x.trim()},${n.trim()})`);

  // Power: x^y
  s = s.replace(/\^/g, "^");

  // Trig: sin, cos, tan – convert argument to radians for Deg/Grad (match balanced parens)
  const wrapAngle = (arg: string) => {
    if (angleUnit === "Rad") return arg;
    const mult = angleUnit === "Deg" ? "pi/180" : "pi/200";
    return `((${arg})*${mult})`;
  };

  const funcs = ["sin", "cos", "tan"];
  for (const f of funcs) {
    let idx = 0;
    while (true) {
      const start = s.indexOf(f + "(", idx);
      if (start === -1) break;
      const open = start + f.length;
      let depth = 1;
      let i = open;
      while (i < s.length && depth > 0) {
        if (s[i] === "(") depth++;
        else if (s[i] === ")") depth--;
        i++;
      }
      if (depth !== 0) break;
      const arg = s.slice(open + 1, i - 1);
      s = s.slice(0, open + 1) + wrapAngle(arg) + s.slice(i - 1);
      idx = open + 1 + wrapAngle(arg).length;
    }
  }

  // log = log10, ln = log (natural)
  s = s.replace(/\blog\(/g, "log10(");
  s = s.replace(/\bln\(/g, "log(");

  // 10^x, e^x – nerdamer: 10^x = 10^x, e^x = e^x
  s = s.replace(/10\^/g, "10^");
  s = s.replace(/e\^/g, "e^");

  return s;
}

function restoreAns(s: string, ansValue: string): string {
  return s.replace(/__ANS__/g, `(${ansValue})`);
}

export interface EvalResult {
  success: boolean;
  value: string;
  error?: string;
}

let lastAns = "0";

export function getAns(): string {
  return lastAns;
}

export function setAns(value: string): void {
  lastAns = value;
}

export function evaluate(
  expression: string,
  angleUnit: AngleUnit
): EvalResult {
  if (!expression.trim()) return { success: false, value: "", error: "Empty" };
  try {
    let s = prepareForNerdamer(expression, angleUnit);
    s = restoreAns(s, lastAns);

    const expr = nerdamer(s);
    const evaluated = expr.evaluate();
    const text = evaluated.text();

    if (text === "undefined" || /NaN|Infinity|Error/i.test(text)) {
      return { success: false, value: text, error: "Math ERROR" };
    }

    lastAns = text;
    return { success: true, value: text };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/syntax|parse|invalid/i.test(msg)) return { success: false, value: "", error: "Syntax ERROR" };
    return { success: false, value: "", error: "Math ERROR" };
  }
}

export function formatResult(value: string, maxDecimals = 10): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  if (Math.abs(n) >= 1e10 || (Math.abs(n) < 1e-2 && n !== 0)) {
    return n.toExponential(maxDecimals - 1);
  }
  const fixed = n.toFixed(maxDecimals).replace(/\.?0+$/, "");
  return fixed;
}
