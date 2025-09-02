import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const TRAIL_LENGTH = 5; // number of trailing shapes
const ANGLE = -35; // pointer angle

export default function CustomCursor() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [trail, setTrail] = useState<{ x: number; y: number }[]>(
    Array.from({ length: TRAIL_LENGTH }, () => ({ x: 0, y: 0 }))
  );
  const [isDown, setIsDown] = useState(false);
  const [ripples, setRipples] = useState<
    { id: number; x: number; y: number }[]
  >([]);

  // Track mouse position
  useEffect(() => {
    const move = (e: MouseEvent) => {
      setPos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, []);

  // Animate trail
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

  // Click animation (press + ripple)
  useEffect(() => {
    const down = (e: MouseEvent) => {
      setIsDown(true);
      setPos({ x: e.clientX, y: e.clientY });
      const id = Date.now() + Math.random();
      setRipples((r) => [...r, { id, x: e.clientX, y: e.clientY }]);
      setTimeout(() => {
        setRipples((r) => r.filter((it) => it.id !== id));
      }, 420);
    };
    const up = () => setIsDown(false);

    window.addEventListener("mousedown", down);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousedown", down);
      window.removeEventListener("mouseup", up);
    };
  }, []);

  // Main triangle cursor (SVG; scales slightly on press)
  const cursor = (
    <div
      className="fixed top-0 left-0 z-[9999] pointer-events-none cursor-tri"
      style={{
        transform: `translate(${pos.x}px, ${pos.y}px) translate(-50%, -50%) rotate(${ANGLE}deg)`,
      }}
    >
      <svg
        width={20}
        height={20}
        viewBox="0 0 100 100"
        style={{
          transform: `scale(${isDown ? 0.9 : 1})`,
          transition: "transform 90ms ease-out",
        }}
      >
        {/* Fill */}
        <polygon points="50,2 2,98 98,98" fill="currentColor" />
        {/* Soft outline */}
        <polygon
          points="50,2 2,98 98,98"
          fill="none"
          stroke="rgba(0,0,0,0.35)"
          strokeWidth="6"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );

  // Triangle trail
  const trailShapes = trail.map((t, i) => (
    <svg
      key={i}
      className="fixed top-0 left-0 pointer-events-none cursor-tri"
      width={16 - i}
      height={16 - i}
      viewBox="0 0 100 100"
      style={{
        transform: `translate(${t.x}px, ${t.y}px) translate(-50%, -50%) rotate(${ANGLE}deg)`,
        zIndex: 9998,
        opacity: Math.max(0, 0.45 - i * 0.07),
        filter: i === 0 ? "none" : `blur(${0.25 * i}px)`,
      }}
    >
      <polygon points="50,2 2,98 98,98" fill="currentColor" />
    </svg>
  ));

  // Ripple burst (triangle outline scaling out)
  const ripplesSvg = ripples.map((r) => (
    <div
      key={r.id}
      className="fixed top-0 left-0 pointer-events-none"
      style={{
        transform: `translate(${r.x}px, ${r.y}px) translate(-50%, -50%) rotate(${ANGLE}deg)`,
        zIndex: 9997,
      }}
    >
      <svg width={28} height={28} viewBox="0 0 100 100" className="cursor-tri">
        <polygon
          points="50,2 2,98 98,98"
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          style={{
            opacity: 0.6,
            transformOrigin: "50% 60%",
            animation: "cc-tri-ripple 420ms ease-out forwards",
          }}
        />
      </svg>
    </div>
  ));

  // Portal + keyframes + theme color
  const root = document.getElementById("themed-root") || document.body;
  return createPortal(
    <>
      <style>
        {`
          @keyframes cc-tri-ripple {
            0%   { transform: scale(0.6); opacity: 0.6; }
            80%  { opacity: 0.15; }
            100% { transform: scale(1.7); opacity: 0; }
          }
          /* Theme-following color for the cursor (uses your CSS vars) */
          .cursor-tri { color: var(--color-blue); }
          [data-theme="dark"] .cursor-tri { color: var(--color-blue-light); }
          [data-theme="markoblank"] .cursor-tri { color: var(--color-markored); }
          [data-theme="discord"] .cursor-tri { color: var(--color-discordblue); }
          [data-theme="ishtar"] .cursor-tri { color: var(--color-ishtarred); }
          [data-theme="tangerine"] .cursor-tri { color: var(--color-tangerineAccent); }
          [data-theme="icebergLight"] .cursor-tri { color: var(--color-icebergLightAccent); }
          [data-theme="icebergDark"] .cursor-tri { color: var(--color-icebergDarkAccent); }
        `}
      </style>
      {trailShapes}
      {ripplesSvg}
      {cursor}
    </>,
    root
  );
}