import { useEffect, useRef } from "react";
import RenderMath from "./mathdisplay";
import 'mathlive';
// Try one of these CSS imports depending on your MathLive version:
import 'mathlive/static.css';            // v0.92+
///

type inputProps = {
  index: number;
  prefix: any; 
  setInputs: React.Dispatch<React.SetStateAction<string[]>>;
  onEnter?: () => void; // NEW: parent-supplied handler
};

export default function MathInput(props: inputProps) {
  const mfRef = useRef<any>(null);

  useEffect(() => {
    console.log("prefix:", props.prefix)
    if (!mfRef.current) return;
    const mf = mfRef.current;

    mf.autocomplete = "off";
    mf.menuItems = [];
    mf.suggestions = "none";
    mf.inlineShortcuts = {
      sqrt: "\\sqrt{#?}",
      frac: "\\frac{#?}{#?}",
      "/": "\\frac{#@}{#?}",
      sin: "\\sin",
      cos: "\\cos",
      tan: "\\tan",
    };
    mf.keybindings = [
      { key: "[Backspace]", command: "deleteBackward" },
      { key: "[Delete]", command: "deleteForward" },
      { key: "shift+[Backspace]", command: "deleteForward" },
      { key: "left", command: "moveToPreviousChar" },
      { key: "right", command: "moveToNextChar" },
      { key: "up", command: "moveUp" },
      { key: "down", command: "moveDown" },
    ];
    mf.removeExtraneousParentheses = false;

    // Intercept Enter and call onEnter
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        props.onEnter?.();
      }
    };
    mf.addEventListener("keydown", onKeyDown);
    return () => mf.removeEventListener("keydown", onKeyDown);
  }, [props]);

  const handleInput = (evt: any) => {
    const mf = evt.target as any;
    const rawLatex: string = mf.value;

    const ce = (window as any).MathfieldElement?.computeEngine;
    if (ce) {
      const expr = ce.parse(rawLatex, { canonical: false });
      const normalized = expr.toLatex({
        fractionStyle: () => "quotient",
      });
      props.setInputs((prev: string[]) => {
        const next = [...prev];
        next[props.index] = normalized;
        return next;
      });
    } else {
      props.setInputs((prev: string[]) => {
        const next = [...prev];
        next[props.index] = rawLatex;
        return next;
      });
    }
  };

  console.log("Rendering MathInput with prefix:", props.prefix);

  // Support string or [before, after]
  const toArray = (v?: string | string[]) => Array.isArray(v) ? v : (v ? [v] : []);
  const prefixArr = toArray(props.prefix);
  const before = prefixArr[0];
  const after = prefixArr[1];

  return (
    <div>
      <div className="flex items-center">
        <div>
          <RenderMath text={before ? `$${before}$` : ''} className="txt text-lg"/>
        </div>
        <math-field
          ref={mfRef}
          default-mode="inline-math"
          onInput={handleInput}
          className="txtbox outline-none bg-none color-txt-main inline-block 
            focus:border-3 color-shadow-accent w-50 mx-2
            h-auto overflow-scroll"
          style={{
            background: "none",
            outline: "none",
            fontSize: 24,
          }}
        />
        {after ? (
          <div>
            <RenderMath text={`$${after}$`} className="txt text-lg"/>
          </div>
        ) : null}
        {/* <p>{latex}</p> */}
      </div>
    </div>
  );
}