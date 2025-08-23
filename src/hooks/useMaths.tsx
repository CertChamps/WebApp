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
      console.log("Parse error:", err);
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

  const isCorrect = (inputLatex: string, answer: string) => {

    // coordinates
    if (/^\s*\\?\(?[^,]+,[^)]+\)?\s*$/.test(inputLatex) || answer.includes(',')) {
      const ok = cartesianEquality(inputLatex, answer);
      //return `coord in: ${inputLatex}, ans: ${answer}, correct: ${ok}`;
      return ok 
    }

    // scalar/algebraic
    try {
      const A = latexToExpr(inputLatex);
      const B = latexToExpr(answer); // example scalar answer

      const ok = numericEquality(A, B) || algebraicEquality(A, B);
      //return `input: ${A.toString()}, answer: ${B.toString()}, correct: ${ok}`;
      return ok
    } catch (err: any) {
      //return `in: ${inputLatex}, err: ${err.message ?? err}`;
      return false
    }
  };

  return { isCorrect };
}
