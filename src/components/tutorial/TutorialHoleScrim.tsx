import { createPortal } from "react-dom";
import { getThemedPortalTarget } from "../../utils/themedPortal";
import { expandTutorialRect, TUTORIAL_HOLE_PADDING } from "./expandTutorialRect";
import type { TutorialAnchorRect } from "./types";

type Props = {
  anchorRect: TutorialAnchorRect;
  /** Expands the clear hole so backdrop blur stays outside the highlight outline. */
  holePadding?: number;
};

/** Blurs/dims everything except a rectangular hole over the target element. */
export default function TutorialHoleScrim({ anchorRect, holePadding = TUTORIAL_HOLE_PADDING }: Props) {
  const portalTarget = getThemedPortalTarget();
  if (!portalTarget) return null;

  const { top, left, width, height } = expandTutorialRect(anchorRect, holePadding);
  const bottom = top + height;
  const right = left + width;
  const panelClass =
    "tutorial-hole-scrim-panel practice-hub__backdrop practice-hub__backdrop--tutorial practice-hub__backdrop--card-tutorial";

  return createPortal(
    <>
      <div className={panelClass} style={{ top: 0, left: 0, right: 0, height: top }} aria-hidden />
      <div
        className={panelClass}
        style={{ top: bottom, left: 0, right: 0, bottom: 0 }}
        aria-hidden
      />
      <div className={panelClass} style={{ top, left: 0, width: left, height }} aria-hidden />
      <div className={panelClass} style={{ top, left: right, right: 0, height }} aria-hidden />
    </>,
    portalTarget
  );
}
