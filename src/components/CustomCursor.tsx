import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export default function CustomCursor() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [hovering, setHovering] = useState(false);
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null);
  const [hoverRadius, setHoverRadius] = useState("50%");

  // Track mouse position
  useEffect(() => {
    const move = (e: MouseEvent) => {
      setPos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, []);

  // Attach hover listeners (and re-attach when DOM changes)
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

    // Initial bind
    bindListeners();

    // 👇 Watch for new elements being added (e.g. after Router loads)
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
        backgroundColor: "rgba(59,130,246,0.15)",
        border: "2px solid rgba(59,130,246,0.6)",
      }
    : {
        width: "12px",
        height: "12px",
        transform: `translate(${pos.x}px, ${pos.y}px) translate(-50%, -50%)`,
        borderRadius: "50%",
        backgroundColor: "rgba(59,130,246,0.8)",
      };

  const cursor = (
    <div
      className="fixed top-0 left-0 z-[9999] pointer-events-none transition-all duration-200 ease-out"
      style={style}
    />
  );

  return createPortal(cursor, document.body);
}