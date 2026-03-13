import { useCallback, useRef, useState, useEffect } from "react";

type Props = {
  children: React.ReactNode;
  className?: string;
};

export default function ScaleToFit({ children, className }: Props) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const recalc = useCallback(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    inner.style.transform = "none";
    const ow = outer.clientWidth;
    const oh = outer.clientHeight;
    const iw = inner.scrollWidth;
    const ih = inner.scrollHeight;

    if (iw === 0 || ih === 0) return;
    const s = Math.min(ow / iw, oh / ih, 1);
    setScale(s);
  }, []);

  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;
    const ro = new ResizeObserver(recalc);
    ro.observe(outer);
    recalc();
    return () => ro.disconnect();
  }, [recalc]);

  useEffect(() => {
    recalc();
  }, [children, recalc]);

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
