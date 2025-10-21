import { useEffect, useRef } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

type RenderMathProps = {
  text: string; // full text containing single-dollar inline math $...$
  className?: string;
  katexOptions?: katex.KatexOptions;
};

const ESCAPED_DOLLAR = "__ESCAPED_DOLLAR__";
const ESCAPED_EURO = "__ESCAPED_EURO__";

/** Escape HTML special chars for safe text insertion (no external lib) */
function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Tokenize input into plain text and single-dollar inline math segments.
 * Supports escaped dollars (\$) and euros (\€), which are preserved as literal characters.
 */
function tokenizeSingleDollar(input: any) {
  if (typeof input !== "string") input = String(input ?? "");

  // Temporarily replace escaped $ and €
  const pre = input
    .replace(/\\\$/g, ESCAPED_DOLLAR)
    .replace(/\\€/g, ESCAPED_EURO);

  const tokens: { type: "text" | "math"; content: string }[] = [];
  const re = /\$([\s\S]+?)\$/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(pre)) !== null) {
    if (m.index > last) {
      tokens.push({ type: "text", content: pre.slice(last, m.index) });
    }
    tokens.push({ type: "math", content: m[1] });
    last = re.lastIndex;
  }

  if (last < pre.length) {
    tokens.push({ type: "text", content: pre.slice(last) });
  }

  return tokens.map((t) => ({
    ...t,
    content: t.content
      .replace(new RegExp(ESCAPED_DOLLAR, "g"), "$")
      .replace(new RegExp(ESCAPED_EURO, "g"), "€"),
  }));
}

export default function RenderMath({
  text,
  className,
  katexOptions,
}: RenderMathProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;

    const options: katex.KatexOptions = {
      throwOnError: false,
      displayMode: false,
      ...katexOptions,
    };

    const safeText = typeof text === "string" ? text : String(text ?? "");
    const tokens = tokenizeSingleDollar(safeText);

    const parts = tokens.map((t) => {
      if (t.type === "text") {
        return escapeHtml(t.content)
          .replace(/\n/g, '<br style="line-height:50px; margin:0; padding:0;" />')
          .replace(/\\n/g, '<br style="line-height:50px; margin:0; padding:0;" />')
          .replace(/\t/g, '<span style="display:inline-block; width:2em;"></span>')
          .replace(/\\t/g, '<span style="display:inline-block; width:2em;"></span>');
      }

      try {
        // katex.renderToString returns an HTML string for the math fragment
        return katex.renderToString(t.content, options);
      } catch {
        // fallback: show escaped latex source inside a code-like span
        return `<code class="katex-error">${escapeHtml(t.content)}</code>`;
      }
    });

    ref.current.innerHTML = parts.join("");
  }, [text, katexOptions]);

  return <div ref={ref} className={className} />;
}
