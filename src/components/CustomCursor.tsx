import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const ICON_PATH_D =
  "M8.68602 16.288L8.10556 9.37387C7.96399 7.68752 9.85032 6.59846 11.24 7.56424L16.9375 11.524C18.6256 12.6972 17.6579 15.348 15.611 15.1577L14.8273 15.0849C13.9821 15.0063 13.1795 15.4697 12.825 16.2409L12.4962 16.9561C11.6376 18.8238 8.858 18.3365 8.68602 16.288Z";

function CursorSvg({ pressed }: { pressed: boolean }) {
  const cursorRef = useRef<SVGSVGElement>(null);

  // this element persists; we’ll only move it via style.transform
  useEffect(() => {
    const el = cursorRef.current!;
    let x = 0,
      y = 0;

    const move = (e: MouseEvent) => {
      x = e.clientX;
      y = e.clientY;
    };

    const update = () => {
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%,-50%) scale(${
        pressed ? 0.85 : 1
      })`;
      requestAnimationFrame(update);
    };

    window.addEventListener("mousemove", move);
    requestAnimationFrame(update);
    return () => window.removeEventListener("mousemove", move);
  }, [pressed]);

  return (
    <svg
      ref={cursorRef}
      className="fixed top-0 left-0 pointer-events-none cursor-icon"
      width={36}
      height={36}
      viewBox="0 0 24 24"
      style={{
        transform: `translate(-9999px, -9999px)`, // starts offscreen
        zIndex: 9999,
      }}
    >
      <path d={ICON_PATH_D} fill="currentColor" />
    </svg>
  );
}

export default function CustomCursor() {
  const [isDown, setIsDown] = useState(false);

  useEffect(() => {
    const down = () => setIsDown(true);
    const up = () => setIsDown(false);
    window.addEventListener("mousedown", down);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousedown", down);
      window.removeEventListener("mouseup", up);
    };
  }, []);

  const root = document.body;
  return createPortal(<CursorSvg pressed={isDown} />, root);
}