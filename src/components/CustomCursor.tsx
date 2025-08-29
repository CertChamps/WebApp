import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const TRAIL_LENGTH = 5; // number of trailing dots

export default function CustomCursor() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [hovering, setHovering] = useState(false);
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null);
  const [hoverRadius, setHoverRadius] = useState("50%");
  const [trail, setTrail] = useState<{ x: number; y: number }[]>(
    Array.from({ length: TRAIL_LENGTH }, () => ({ x: 0, y: 0 }))
  );

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
        const newTrail = [...prev];
        newTrail[0] = { ...pos };
        for (let i = 1; i < TRAIL_LENGTH; i++) {
          newTrail[i] = {
            x: prev[i].x + (newTrail[i - 1].x - prev[i].x) * 0.25,
            y: prev[i].y + (newTrail[i - 1].y - prev[i].y) * 0.25,
          };
        }
        return newTrail;
      });
      frame = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(frame);
  }, [pos]);

  // Attach hover listeners
  useEffect(() => {
    const handleEnter = (e: Event) => {
      const target = e.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      const styles = window.getComputedStyle(target);

      setHoverRect(rect);
      setHoverRadius(styles.borderRadius || "12px");
      setHovering(true);
    };

    const handleLeave = () => {
      setHovering(false);
      setHoverRect(null);
      setHoverRadius("50%");
    };

    const bindListeners = () => {
      const interactiveEls = document.querySelectorAll(".cursor-target");
      interactiveEls.forEach((el) => {
        el.removeEventListener("mouseenter", handleEnter);
        el.removeEventListener("mouseleave", handleLeave);
        el.addEventListener("mouseenter", handleEnter);
        el.addEventListener("mouseleave", handleLeave);
      });
    };

    bindListeners();
    const observer = new MutationObserver(() => bindListeners());
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  // Cursor style
  const style = hovering && hoverRect
    ? {
        width: `${hoverRect.width + 12}px`,
        height: `${hoverRect.height + 12}px`,
        transform: `translate(${hoverRect.left + hoverRect.width / 2}px, ${
          hoverRect.top + hoverRect.height / 2
        }px) translate(-50%, -50%)`,
        borderRadius: hoverRadius,
      }
    : {
        width: "14px",
        height: "14px",
        transform: `translate(${pos.x}px, ${pos.y}px) translate(-50%, -50%)`,
        borderRadius: "50%",
      };

  // Main cursor
  const cursor = hovering ? (
    // Hovering: iPadOS-style box
    <div
      className="fixed top-0 left-0 z-[9999] pointer-events-none 
                 transition-all duration-200 ease-out 
                 color-bg-accent border-2 color-shadow-accent"
      style={style}
    />
  ) : (
    // Idle: solid circle
    <div
      className="fixed top-0 left-0 z-[9999] pointer-events-none 
                 color-cursor"
      style={style}
    />
  );

  // Trail dots (only render when NOT hovering)
  const trailDots = !hovering
    ? trail.map((t, i) => (
        <div
          key={i}
          className="fixed top-0 left-0 z-[9998] pointer-events-none 
                     rounded-full color-cursor"
          style={{
            width: `${14 - i}px`,
            height: `${14 - i}px`,
            transform: `translate(${t.x}px, ${t.y}px) translate(-50%, -50%)`,
            opacity: 0.5 - i * 0.05,
          }}
        />
      ))
    : null;

  // Portal into the themed wrapper
  const root = document.getElementById("themed-root") || document.body;
  return createPortal(
    <>
      {trailDots}
      {cursor}
    </>,
    root
  );
}