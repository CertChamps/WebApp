import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { getThemedPortalTarget } from "../../utils/themedPortal";
import type { TutorialAnchorRect } from "./types";

const textEase = [0.25, 0.4, 0.25, 1] as const;

type Props = {
  anchorRect: TutorialAnchorRect | null;
  placement: "below" | "above";
  align?: "center" | "end";
  title: string;
  body: string;
  onNext: () => void;
  nextLabel?: string;
};

export default function PracticeSessionTutorialCallout({
  anchorRect,
  placement,
  align = "center",
  title,
  body,
  onNext,
  nextLabel = "Next",
}: Props) {
  const portalTarget = getThemedPortalTarget();

  if (!portalTarget || !anchorRect || anchorRect.width <= 0 || anchorRect.height <= 0) {
    return null;
  }

  const centerX = anchorRect.left + anchorRect.width / 2;
  const anchorStyle =
    placement === "below"
      ? align === "end"
        ? {
            top: anchorRect.top + anchorRect.height + 16,
            left: anchorRect.right,
            transform: "translateX(-100%)",
          }
        : { top: anchorRect.top + anchorRect.height + 16, left: centerX, transform: "translateX(-50%)" }
      : align === "end"
        ? {
            top: anchorRect.top - 16,
            left: anchorRect.right,
            transform: "translate(-100%, -100%)",
          }
        : {
            top: anchorRect.top - 16,
            left: centerX,
            transform: "translate(-50%, -100%)",
          };

  return createPortal(
    <div
      className={`practice-session-tutorial-callout-anchor practice-session-tutorial-callout-anchor--align-${align}`}
      style={anchorStyle}
    >
      <motion.aside
        className={`practice-session-tutorial-callout practice-session-tutorial-callout--${placement}`}
        aria-live="polite"
        aria-label="Practice page tutorial"
        initial={{ opacity: 0, y: placement === "below" ? -8 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: textEase }}
      >
        <div className="practice-session-tutorial-callout__panel color-bg color-shadow border-2 rounded-out shadow-none">
          <span className="practice-session-tutorial-callout__arrow" aria-hidden />
          <div className="practice-session-tutorial-callout__content">
            <motion.p
              className="practice-session-tutorial-callout__title txt-heading-colour font-bold"
              initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.28, ease: textEase, delay: 0.05 }}
            >
              {title}
            </motion.p>
            <motion.p
              className="practice-session-tutorial-callout__body txt-sub color-txt-sub"
              initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.32, ease: textEase, delay: 0.12 }}
            >
              {body}
            </motion.p>
            <button
              type="button"
              className="blue-btn practice-session-tutorial-callout__next"
              onClick={onNext}
            >
              {nextLabel}
            </button>
          </div>
        </div>
      </motion.aside>
    </div>,
    portalTarget
  );
}
