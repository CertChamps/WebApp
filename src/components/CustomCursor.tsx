import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Cursor Alt 2 SVG path + viewBox
const ICON_VIEWBOX = "0 0 24 24";
const ICON_PATH_D =
  "M8.68602 16.288L8.10556 9.37387C7.96399 7.68752 9.85032 6.59846 11.24 7.56424L16.9375 11.524C18.6256 12.6972 17.6579 15.348 15.611 15.1577L14.8273 15.0849C13.9821 15.0063 13.1795 15.4697 12.825 16.2409L12.4962 16.9561C11.6376 18.8238 8.858 18.3365 8.68602 16.288Z";

function CursorSvg({
  x,
  y,
  size = 36, // (1) Increased default size
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
          transform: `scale(${pressed ? 0.85 : 1})`,
          transition: "transform 25ms ease-out",
        }}
      />
    </svg>
  );
}

export default function CustomCursor() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [isDown, setIsDown] = useState(false);

  // Track mouse (4: exact match, no acceleration/delay)
  useEffect(() => {
    const move = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, []);

  // Click press (without ripple now)
  useEffect(() => {
    const down = (e: MouseEvent) => {
      setIsDown(true);
      setPos({ x: e.clientX, y: e.clientY });
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
  const cursor = <CursorSvg x={pos.x} y={pos.y} pressed={isDown} size={36} />;

  // (2) Commented out trail effect
  /*
  const trailShapes = trail.map((t, i) => (
    <svg ...> ... </svg>
  ));
  */

  // (3) Commented out ripple effect
  /*
  const ripplesSvg = ripples.map((r) => (
    <svg ...> ... </svg>
  ));
  */

  const root = document.getElementById("themed-root") || document.body;
  return createPortal(
    <>
      <style>
        {`
          .cursor-icon { color: var(--color-blue); }
          [data-theme="dark"] .cursor-icon { color: var(--color-blue-light); }
          [data-theme="markoblank"] .cursor-icon { color: var(--color-markored); }
          [data-theme="discord"] .cursor-icon { color: var(--color-discordblue); }
          [data-theme="ishtar"] .cursor-icon { color: var(--color-ishtarred); }
          [data-theme="tangerine"] .cursor-icon { color: var(--color-tangerineAccent); }
          [data-theme="icebergLight"] .cursor-icon { color: var(--color-icebergLightAccent); }
          [data-theme="icebergDark"] .cursor-icon { color: var(--color-icebergDarkAccent); }
          [data-theme="shadow"] .cursor-icon { color: var(--color-shadowAccent); }
          [data-theme="matchaMoccha"] .cursor-icon { color: var(--color-matchaMocchaAccent); }
          [data-theme="redDragon"] .cursor-icon { color: var(--color-redDragonAccent); }
          [data-theme="modernInk"] .cursor-icon { color: var(--color-modernInkAccent); }
          [data-theme="gruvbox"] .cursor-icon { color: var(--color-gruvboxAccent); }
          [data-theme="magicGirl"] .cursor-icon { color: var(--color-magicGirlAccent); }
          [data-theme="tronOrange"] .cursor-icon { color: var(--color-tronOrangeAccent); }
          [data-theme="menthol"] .cursor-icon { color: var(--color-mentholAccent); }
          [data-theme="lavendar"] .cursor-icon { color: var(--color-lavendarAccent); }
          [data-theme="diner"] .cursor-icon { color: var(--color-dinerAccent); }
          [data-theme="airplane"] .cursor-icon { color: var(--color-airplaneAccent); }
          [data-theme="nordLight"] .cursor-icon { color: var(--color-nordLightAccent); }
          [data-theme="sewingTinLight"] .cursor-icon { color: var(--color-sewingTinLightAccent); }
          [data-theme="camping"] .cursor-icon { color: var(--color-campingAccent); }
          [data-theme="paper"] .cursor-icon { color: var(--color-paperAccent); }
        `}
      </style>
      {/* {trailShapes} */}
      {/* {ripplesSvg} */}
      {cursor}
    </>,
    root
  );
}
