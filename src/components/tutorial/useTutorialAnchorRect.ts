import { useCallback, useLayoutEffect, useState, type DependencyList, type RefObject } from "react";
import type { TutorialAnchorRect } from "./types";

export function useTutorialAnchorRect(
  active: boolean,
  ref: RefObject<HTMLElement | null>,
  deps: DependencyList = []
): TutorialAnchorRect | null {
  const [rect, setRect] = useState<TutorialAnchorRect | null>(null);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const bounds = el.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    setRect({
      top: bounds.top,
      left: bounds.left,
      width: bounds.width,
      height: bounds.height,
    });
  }, [ref]);

  useLayoutEffect(() => {
    if (!active) {
      setRect(null);
      return;
    }

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, update, ...deps]);

  return rect;
}
