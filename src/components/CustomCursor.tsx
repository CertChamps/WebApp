import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const TRAIL_LENGTH = 5;

// Cursor Alt 2 SVG path + viewBox
const ICON_VIEWBOX = "0 0 24 24";
const ICON_PATH_D =
  "M8.68602 16.288L8.10556 9.37387C7.96399 7.68752 9.85032 6.59846 11.24 7.56424L16.9375 11.524C18.6256 12.6972 17.6579 15.348 15.611 15.1577L14.8273 15.0849C13.9821 15.0063 13.1795 15.4697 12.825 16.2409L12.4962 16.9561C11.6376 18.8238 8.858 18.3365 8.68602 16.288Z";

function CursorSvg({
  x,
  y,
  size = 22,
  pressed = false,
}: {
  x: number;
  y: number;
  size?: number;
  pressed?: boolean;
}) {
  return (
    <svg
      className="fixed top-0 left-0 pointer-events-none cursor-icon"
      width={size}
      height={size}
      viewBox={ICON_VIEWBOX}
      style={{
        transform: `translate(${x}px, ${y}px) translate(-50%, -50%)`,
        zIndex: 9999,
      }}
    >
      <path
        d={ICON_PATH_D}
        fill="currentColor"
        style={{
          transformOrigin: "50% 50%",
          transform: `scale(${pressed ? 0.9 : 1})`,
          transition: "transform 90ms ease-out",
        }}
      />
    </svg>
  );
}

export default function CustomCursor() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [trail, setTrail] = useState<{ x: number; y: number }[]>(
    Array.from({ length: TRAIL_LENGTH }, () => ({ x: 0, y: 0 }))
  );
  const [isDown, setIsDown] = useState(false);
  const [ripples, setRipples] = useState<
    { id: number; x: number; y: number }[]
  >([]);

  // Track mouse
  useEffect(() => {
    const move = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, []);

  // Trail follow
  useEffect(() => {
    let frame: number;
    const animate = () => {
      setTrail((prev) => {
        const next = [...prev];
        next[0] = { ...pos };
        for (let i = 1; i < TRAIL_LENGTH; i++) {
          next[i] = {
            x: prev[i].x + (next[i - 1].x - prev[i].x) * 0.25,
            y: prev[i].y + (next[i - 1].y - prev[i].y) * 0.25,
          };
        }
        return next;
      });
      frame = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(frame);
  }, [pos]);

  // Click press + ripple
  useEffect(() => {
    const down = (e: MouseEvent) => {
      setIsDown(true);
      setPos({ x: e.clientX, y: e.clientY });
      const id = Date.now() + Math.random();
      setRipples((r) => [...r, { id, x: e.clientX, y: e.clientY }]);
      setTimeout(
        () => setRipples((r) => r.filter((it) => it.id !== id)),
        420
      );
    };
    const up = () => setIsDown(false);
    window.addEventListener("mousedown", down);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousedown", down);
      window.removeEventListener("mouseup", up);
    };
  }, []);

  // Main cursor
  const cursor = <CursorSvg x={pos.x} y={pos.y} pressed={isDown} size={22} />;

  // Trail: reuse the same SVG shape, smaller + fading
  const trailShapes = trail.map((t, i) => (
    <svg
      key={i}
      className="fixed top-0 left-0 pointer-events-none cursor-icon"
      width={16 - i}
      height={16 - i}
      viewBox={ICON_VIEWBOX}
      style={{
        transform: `translate(${t.x}px, ${t.y}px) translate(-50%, -50%)`,
        zIndex: 9998,
        opacity: Math.max(0, 0.4 - i * 0.07),
        filter: i === 0 ? "none" : `blur(${0.25 * i}px)`,
      }}
    >
      <path d={ICON_PATH_D} fill="currentColor" />
    </svg>
  ));

  // Ripple burst on click
  const ripplesSvg = ripples.map((r) => (
    <svg
      key={r.id}
      className="fixed top-0 left-0 pointer-events-none cursor-icon"
      width={30}
      height={30}
      viewBox={ICON_VIEWBOX}
      style={{
        transform: `translate(${r.x}px, ${r.y}px) translate(-50%, -50%)`,
        zIndex: 9997,
      }}
    >
      <path
        d={ICON_PATH_D}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        style={{
          opacity: 0.6,
          transformOrigin: "50% 50%",
          animation: "cc-ripple 420ms ease-out forwards",
        }}
      />
    </svg>
  ));

  const root = document.getElementById("themed-root") || document.body;
  return createPortal(
    <>
      <style>
        {`
          @keyframes cc-ripple {
            0%   { transform: scale(0.7); opacity: 0.6; }
            80%  { opacity: 0.18; }
            100% { transform: scale(1.8); opacity: 0; }
          }
          .cursor-icon { color: var(--color-blue); }
          [data-theme="dark"] .cursor-icon { color: var(--color-blue-light); }
          [data-theme="markoblank"] .cursor-icon { color: var(--color-markored); }
          [data-theme="discord"] .cursor-icon { color: var(--color-discordblue); }
          [data-theme="ishtar"] .cursor-icon { color: var(--color-ishtarred); }
          [data-theme="tangerine"] .cursor-icon { color: var(--color-tangerineAccent); }
          [data-theme="icebergLight"] .cursor-icon { color: var(--color-icebergLightAccent); }
          [data-theme="icebergDark"] .cursor-icon { color: var(--color-icebergDarkAccent); }
        `}
      </style>
      {trailShapes}
      {ripplesSvg}
      {cursor}
    </>,
    root
  );
}