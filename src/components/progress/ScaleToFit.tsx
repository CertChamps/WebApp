import { useCallback, useRef, useState, useEffect } from "react";

type Props = {
  children: React.ReactNode;
  className?: string;
  contentKey?: string | number;
};

const DEBOUNCE_MS = 150;

export default function ScaleToFit({ children, className, contentKey }: Props) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const scaleRef = useRef(1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);

  const recalc = useCallback(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const measure = () => {
      if (!inner || !outer) return;
      inner.style.transform = "none";
      const ow = outer.clientWidth;
      const oh = outer.clientHeight;
      const iw = inner.scrollWidth;
      const ih = inner.scrollHeight;
      inner.style.transform = `scale(${scaleRef.current})`;

      if (iw === 0 || ih === 0) return;
      const s = Math.min(ow / iw, oh / ih, 1);
      if (Math.abs(s - scaleRef.current) > 0.005) {
        scaleRef.current = s;
        setScale(s);
      }
    };

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(measure);
  }, []);

  const debouncedRecalc = useCallback(() => {
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(recalc, DEBOUNCE_MS);
  }, [recalc]);

  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;
    const ro = new ResizeObserver(debouncedRecalc);
    ro.observe(outer);
    debouncedRecalc();
    return () => {
      ro.disconnect();
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [debouncedRecalc]);

  useEffect(() => {
    debouncedRecalc();
  }, [contentKey, debouncedRecalc]);

  return (
    <div ref={outerRef} className={`scale-to-fit ${className ?? ""}`}>
      <div
        ref={innerRef}
        className="scale-to-fit__inner"
        style={{ transform: `scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  );
}
