import type { TutorialAnchorRect } from "./types";

/** Extra space between the scrim blur edge and the highlighted element outline. */
export const TUTORIAL_HOLE_PADDING = 8;

export function expandTutorialRect(
  rect: TutorialAnchorRect,
  padding = TUTORIAL_HOLE_PADDING
): TutorialAnchorRect {
  return {
    top: rect.top - padding,
    left: rect.left - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}
