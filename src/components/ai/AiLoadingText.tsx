import { useEffect, useState } from "react";

type Phase = "in" | "out" | "enter";

type AiLoadingTextProps = {
  /** Rotating status messages. Pass a stable (module-level) array to avoid resets. */
  messages: string[];
  className?: string;
  /** How long each message is held before sliding out. */
  holdMs?: number;
  /** Slide/fade transition duration. */
  transitionMs?: number;
};

/**
 * Cycles through status messages with a vertical slide (up-and-out / in-from-below),
 * mirroring the in-app AI search animation. Pure CSS transitions + a small state
 * machine driven by timeouts — no framer-motion or keyframes required.
 */
export function AiLoadingText({
  messages,
  className = "",
  holdMs = 1500,
  transitionMs = 320,
}: AiLoadingTextProps) {
  const [overlay, setOverlay] = useState<{ text: string; phase: Phase }>(() => ({
    text: messages[0] ?? "",
    phase: "in",
  }));

  useEffect(() => {
    if (messages.length === 0) return;
    let cancelled = false;
    let index = 0;
    const timeouts: number[] = [];
    setOverlay({ text: messages[0], phase: "in" });

    const later = (fn: () => void, ms: number) => {
      timeouts.push(window.setTimeout(fn, ms));
    };

    const cycle = () => {
      later(() => {
        if (cancelled) return;
        setOverlay((current) => ({ ...current, phase: "out" }));
        later(() => {
          if (cancelled) return;
          index = (index + 1) % messages.length;
          const nextText = messages[index];
          setOverlay({ text: nextText, phase: "enter" });
          requestAnimationFrame(() => {
            if (cancelled) return;
            requestAnimationFrame(() => {
              if (cancelled) return;
              setOverlay({ text: nextText, phase: "in" });
              cycle();
            });
          });
        }, transitionMs);
      }, holdMs);
    };

    cycle();
    return () => {
      cancelled = true;
      timeouts.forEach(clearTimeout);
    };
  }, [messages, holdMs, transitionMs]);

  return (
    <span className={`relative block overflow-hidden ${className}`} aria-live="polite">
      <span
        className="block whitespace-nowrap"
        style={{
          transform:
            overlay.phase === "out"
              ? "translateY(-110%)"
              : overlay.phase === "enter"
                ? "translateY(110%)"
                : "translateY(0)",
          opacity: overlay.phase === "in" ? 1 : 0,
          transition:
            overlay.phase === "enter"
              ? "none"
              : `transform ${transitionMs}ms ease, opacity ${transitionMs}ms ease`,
        }}
      >
        {overlay.text}
      </span>
    </span>
  );
}
