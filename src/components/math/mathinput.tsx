import { useEffect, useRef } from "react";
import "mathlive";
import "@cortex-js/compute-engine";
import React from "react";

type inputProps = {
  index: number;
  setInputs: React.Dispatch<React.SetStateAction<string[]>>;
};

export default function MathInput(props: inputProps) {
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
    console.log("key", props.index)
    const mf = evt.target as any;
    const rawLatex: string = mf.value;

    const ce = (window as any).MathfieldElement?.computeEngine;
    if (ce) {
      const expr = ce.parse(rawLatex, { canonical: false });
      const normalized = expr.toLatex({
        fractionStyle: () => "quotient", // ensures \frac{...}{...}
      });
      props.setInputs((prev: string[]) => {
        const newInputs = [...prev];
        newInputs[props.index] = normalized;
        return newInputs;
      });
    } else {
      props.setInputs((prev: string[]) => {
        const newInputs = [...prev];
        newInputs[props.index] = rawLatex;
        return newInputs;
      });
    }
  };

  return (
    <div>
      <math-field
        ref={mfRef}
        default-mode="inline-math"
        onInput={handleInput}
        className="txtbox outline-none bg-none color-txt-main inline-block 
          focus:border-3 color-shadow-accent w-50 mx-4
          h-auto overflow-scroll"
        style={{
          background: "none",
          outline: "none",
          fontSize: 24,
        }}
      />
      {/* <p>{latex}</p> */}
    </div>
  );
}
