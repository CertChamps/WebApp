import { useEffect, useRef, useState } from "react";
import RenderMath from "./mathdisplay";
import 'mathlive';
// Try one of these CSS imports depending on your MathLive version:
import 'mathlive/static.css';            // v0.92+
import { LuCalculator } from "react-icons/lu";
///

type inputProps = {
  index: number;
  prefix: any; 
  setInputs: React.Dispatch<React.SetStateAction<string[]>>;
  onEnter?: () => void; // NEW: parent-supplied handler
  attempts?: number; // Current attempt count (0-based)
  maxAttempts?: number; // Maximum attempts allowed (default 3)
};

// Math symbols/functions that can be inserted
const mathSymbols = [
  { label: "sin", latex: "\\sin(", display: "sin" },
  { label: "cos", latex: "\\cos(", display: "cos" },
  { label: "tan", latex: "\\tan(", display: "tan" },
  { label: "ln", latex: "\\ln(", display: "ln" },
  { label: "power", latex: "^{}", display: "xⁿ" },
  { label: "fraction", latex: "\\frac{}{}", display: "⁄" },
  { label: "sqrt", latex: "\\sqrt{}", display: "√" },
  { label: "pi", latex: "\\pi", display: "π" },
  { label: "lparen", latex: "(", display: "(" },
  { label: "rparen", latex: ")", display: ")" },
];

export default function MathInput(props: inputProps) {
  const mfRef = useRef<any>(null);
  const [isEmpty, setIsEmpty] = useState(true);
  const [isFocused, setIsFocused] = useState(false);
  const [showSymbols, setShowSymbols] = useState(false);
  
  useEffect(() => {
    if (!mfRef.current) return;
    const mf = mfRef.current;

    mf.autocomplete = "off";
    mf.menuItems = [];
    mf.suggestions = "none";
    mf.inlineShortcuts = {
      pi: "\\pi",
      sqrt: "\\sqrt{#?}",
      frac: "\\frac{#?}{#?}",
      "/": "\\frac{#@}{#?}",
      sin: "\\sin({#?})",
      cos: "\\cos({#?})",
      tan: "\\tan({#?})",
      ln: "\\ln({#?})",
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
    
    const onFocus = () => setIsFocused(true);
    const onBlur = () => setIsFocused(false);
    
    mf.addEventListener("keydown", onKeyDown);
    mf.addEventListener("focus", onFocus);
    mf.addEventListener("blur", onBlur);
    
    return () => {
      mf.removeEventListener("keydown", onKeyDown);
      mf.removeEventListener("focus", onFocus);
      mf.removeEventListener("blur", onBlur);
    };
  }, [props]);

  const placeholderText = "Type your answer here...";

  const handleInput = (evt: any) => {
    const mf = evt.target as any;
    const rawLatex: string = mf.value;
    
    // Update isEmpty state for placeholder visibility
    setIsEmpty(!rawLatex || rawLatex.trim() === "");

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

  // Insert a math symbol/function into the mathfield
  const insertSymbol = (latex: string) => {
    if (!mfRef.current) return;
    const mf = mfRef.current;
    mf.executeCommand(["insert", latex]);
    mf.focus();
    setShowSymbols(false);
    setIsEmpty(false);
  };


  // Support string or [before, after]
  const toArray = (v?: string | string[]) => Array.isArray(v) ? v : (v ? [v] : []);
  const prefixArr = toArray(props.prefix);
  const before = prefixArr[0];
  const after = prefixArr[1];

  return (
    <div className="mr-1.5">
      <div className="flex items-center justify-center">
        <div>
          <RenderMath text={before ? `$${before}$` : ''} className="txt text-lg"/>
        </div>
        <div className="relative">
          {isEmpty && !isFocused && (
            <div 
              className="absolute inset-0 left-0 flex items-center justify-center pointer-events-none color-txt-sub text-base pr-8"
              style={{ zIndex: 0  }}
            >
              {placeholderText}
            </div>
          )}
          <math-field
            ref={mfRef}
            default-mode="inline-math"
            onInput={handleInput}
            className="txtbox outline-none bg-none color-txt-main inline-block 
              focus:border-3 color-shadow-accent w-50 mx-2 rounded-2xl
              h-auto min-h-10 pr-10"
            style={{
              background: "none",
              outline: "none",
              fontSize: 24,
            }}
          />
          
          {/* Math Symbols Button - inside the input box */}
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <button
              type="button"
              onClick={() => setShowSymbols(prev => !prev)}
              className="p-1.5 rounded-lg color-txt-sub hover:color-txt-accent hover:color-bg-grey-5 transition-all duration-200 cursor-pointer"
              title="Insert math symbols"
            >
              <LuCalculator size={18} />
            </button>
            
            {/* Symbols Popup */}
            <div 
            style={{ zIndex: 1000}}
              className={`absolute bottom-[100%] right-0 mb-4 w-48 rounded-out border-2 color-shadow shadow-small2 color-bg
                p-2 z-50 transform origin-bottom-right transition-all duration-250
                ${showSymbols ? 'scale-100 opacity-100 pointer-events-auto' : 'scale-0 opacity-0 pointer-events-none'}`}
            >
              <div className="text-xs font-bold color-txt-accent mb-2 px-1">Insert Symbol</div>
              <div className="flex flex-wrap gap-1">
                {mathSymbols.map((sym) => (
                  <button
                    key={sym.label}
                    type="button"
                    onClick={() => insertSymbol(sym.latex)}
                    className="px-2 py-1 rounded-out color-bg-grey-5 color-txt-main hover:color-bg-accent 
                      hover:color-txt-accent transition-all duration-150 text-sm font-medium cursor-pointer"
                    title={sym.label}
                  >
                    {sym.display}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        {after ? (
          <div>
            <RenderMath text={`$${after}$`} className="txt text-lg"/>
          </div>
        ) : null}
      </div>
    </div>
  );
} 
