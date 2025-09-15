import nerdamer from 'nerdamer';
import 'nerdamer/Algebra';
import 'nerdamer/Calculus';
import 'nerdamer/Solve';
import 'nerdamer/Extra';

export default function useMaths() {
  const sanitizeLatex = (tex: string) =>
    tex.replace(/\\left|\\right/g, '').replace(/\\,/g, '').trim();

  const latexToExpr = (tex: string) => {
    try {
      const asString = nerdamer.convertFromLaTeX(sanitizeLatex(tex));
      return nerdamer(asString); // ensures Expression, not string
    } catch (err) {
      //console.log("Parse error:", err);
      throw err;
    }
  };

  const numericEquality = (A: any, B: any) => {
    try {
      const diff = Math.abs(Number(A.subtract(B).evaluate().text()));
      return diff <= 0.02;
    } catch {
      return false;
    }
  };

  const algebraicEquality = (A: any, B: any) => {
    try { return A.eq(B); } catch { return false; }
  };

  const cartesianEquality = (input: string, answer: string) => {
    const clean = (s: string) => sanitizeLatex(s);
    const extract = (s: string) => {
      const m = clean(s).match(/\(([^)]+)\)/);
      if (!m) throw new Error("Bad coordinate");
      const [x, y] = m[1].split(',').map(v => v.trim());
      return { x: nerdamer(x), y: nerdamer(y) };
    };

    try {
      const a = extract(input);
      const b = extract(answer);
      return a.x.eq(b.x) && a.y.eq(b.y);
    } catch {
      return false;
    }
  };

// Replace your original isCorrect with these functions

const isCorrectSingle = (inputLatex: string, answer: string): boolean => {
  // guard against null/undefined
  inputLatex = (inputLatex ?? "").trim()
  answer = (answer ?? "").trim()

  // coordinates (either input looks like coordinates or answer contains a comma)
  if (/^\s*\\?\(?[^,]+,[^)]+\)?\s*$/.test(inputLatex) || answer.includes(",")) {
    return cartesianEquality(inputLatex, answer)
  }

  // scalar/algebraic
  try {
    const A = latexToExpr(inputLatex)
    const B = latexToExpr(answer)

    return numericEquality(A, B) || algebraicEquality(A, B)
  } catch (err: any) {
    return false
  }
}

/**
 * Check arrays of inputs and answers. Returns true if for every answer
 * there exists a distinct input that matches it. Order does not matter.
 *
 * @param inputs array of input LaTeX strings
 * @param answers array of answer LaTeX strings (same length as inputs)
 */
const isCorrect = (inputs: string[], answers: string[]): boolean => {
  if (!Array.isArray(inputs) || !Array.isArray(answers)) return false
  if (inputs.length !== answers.length) return false

  // track which inputs have been used/matched
  const used = new Array<boolean>(inputs.length).fill(false)

  // For each answer, find an unused input that matches it
  for (let i = 0; i < answers.length; i++) {
    const ans = answers[i]
    let matched = false

    for (let j = 0; j < inputs.length; j++) {
      if (used[j]) continue

      if (isCorrectSingle(inputs[j], ans)) {
        used[j] = true
        matched = true
        break
      }
    }

    if (!matched) {
      // no available input matched this answer
      return false
    }
  }

  // every answer found a unique matching input
  return true
}

  return { isCorrect };
}
