import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { getThemedPortalTarget } from "../../utils/themedPortal";

import type { TutorialAnchorRect } from "./types";

const textEase = [0.25, 0.4, 0.25, 1] as const;

export type { TutorialAnchorRect as CardTutorialAnchorRect };

type Props = {
  anchorRect: TutorialAnchorRect | null;
};

export default function PredictionCardTutorialCallout({ anchorRect }: Props) {
  const portalTarget = getThemedPortalTarget();

  if (!portalTarget || !anchorRect || anchorRect.width <= 0 || anchorRect.height <= 0) {
    return null;
  }

  const cardCenterX = anchorRect.left + anchorRect.width / 2;

  return createPortal(
    <div
      className="prediction-card-tutorial-callout-anchor"
      style={{
        top: anchorRect.top - 16,
        left: cardCenterX,
      }}
    >
      <motion.aside
        className="prediction-card-tutorial-callout"
        aria-live="polite"
        aria-label="Prediction tutorial"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 6 }}
        transition={{ duration: 0.35, ease: textEase }}
      >
        <div className="prediction-card-tutorial-callout__panel color-bg color-shadow border-2 rounded-out shadow-none">
          <span className="prediction-card-tutorial-callout__arrow" aria-hidden />
          <div className="prediction-card-tutorial-callout__content">
            <motion.img
              src="/crown-icon.png"
              alt=""
              aria-hidden
              className="prediction-card-tutorial-callout__icon"
              initial={{ opacity: 0, x: -8, filter: "blur(4px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.28, ease: textEase, delay: 0.02 }}
            />
            <div className="prediction-card-tutorial-callout__text">
              <motion.p
                className="prediction-card-tutorial-callout__title txt-heading-colour font-bold"
                initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.28, ease: textEase, delay: 0.05 }}
              >
                Open your prediction
              </motion.p>
              <motion.p
                className="prediction-card-tutorial-callout__body txt-sub color-txt-sub"
                initial={{ opacity: 0, y: 12, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.32, ease: textEase, delay: 0.12 }}
              >
                Click the prediction card below to load it and start practicing.
              </motion.p>
            </div>
          </div>
        </div>
      </motion.aside>
    </div>,
    portalTarget
  );
}
