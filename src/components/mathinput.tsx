import { useEffect, useRef, useState } from "react";
import "mathlive";
import "@cortex-js/compute-engine";
import useMaths from "../hooks/useMaths";

export default function MathInput({ answer }: any) {
  const [latex, setLatex] = useState("");
  const { isCorrect } = useMaths();
  const mfRef = useRef<any>(null);

  useEffect(() => {
    if (!mfRef.current) return;
      const mf = mfRef.current
      mf.autocomplete = "off";   // no suggestions popup
      mf.menuItems = [];
      mf.suggestions = "none";
      mf.inlineShortcuts = {
        'sqrt': '\\sqrt{#?}',
        'frac': '\\frac{#?}{#?}',  
        "/": "\\frac{#@}{#?}",
        'sin': '\\sin',
        'cos': '\\cos',
        'tan': '\\tan',

      };   
      mf.keybindings = [
        // Delete operations
        { key: '[Backspace]', command: 'deleteBackward' },
        { key: '[Delete]', command: 'deleteForward' },
        { key: 'shift+[Backspace]', command: 'deleteForward' },

        // Navigation operations
        { key: 'left', command: 'moveToPreviousChar' },
        { key: 'right', command: 'moveToNextChar' },
        { key: 'up', command: 'moveUp' },
        { key: 'down', command: 'moveDown' },
      ];  
      mfRef.current.removeExtraneousParentheses = false;
  }, []);

  const handleInput = (evt: any) => {
    const mf = evt.target as any;
    const rawLatex: string = mf.value;

    const ce = (window as any).MathfieldElement?.computeEngine;
    if (ce) {
      const expr = ce.parse(rawLatex, { canonical: false });
      const normalized = expr.toLatex({
        fractionStyle: () => "quotient", // ensures \frac{...}{...}
      });
      setLatex(normalized);
    } else {
      setLatex(rawLatex);
    }
  };

  return (
    <div>
      <math-field
        ref={mfRef}
        default-mode="inline-math"
        onInput={handleInput}
        className="txtbox outline-none bg-none text-grey inline-block dark:text-light-grey
          focus:border-3 border-blue dark:border-blue-light w-50 mx-4 shadow-blue dark:shadow-blue-light 
          h-auto overflow-scroll"
        style={{
          background: "none",
          outline: "none",
          fontSize: 24,
        }}
      />
      {/* <p>{latex}</p> */}
      {isCorrect(latex, answer) ? (
        <span className="text-green-500">Correct!</span>
      ) : (
        <span className="text-red-500">Wrong!</span>
      )}
    </div>
  );
}
