import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { getThemedPortalTarget } from "../../utils/themedPortal";

const textEase = [0.25, 0.4, 0.25, 1] as const;

export type CardTutorialAnchorRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type Props = {
  anchorRect: CardTutorialAnchorRect | null;
};

export default function PredictionCardTutorialCallout({ anchorRect }: Props) {
  const portalTarget = getThemedPortalTarget();

  if (!portalTarget || !anchorRect || anchorRect.width <= 0 || anchorRect.height <= 0) {
    return null;
  }

  const width = Math.min(300, Math.max(anchorRect.width + 32, 240));

  return createPortal(
    <motion.aside
      className="prediction-card-tutorial-callout"
      aria-live="polite"
      aria-label="Prediction tutorial"
      style={{
        top: anchorRect.top - 12,
        left: anchorRect.left + anchorRect.width / 2,
        width,
      }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.35, ease: textEase }}
    >
      <div className="prediction-card-tutorial-callout__panel color-bg color-shadow border-2 rounded-out shadow-none">
        <span className="prediction-card-tutorial-callout__arrow" aria-hidden />
        <div className="prediction-card-tutorial-callout__content">
          <motion.p
            className="prediction-card-tutorial-callout__title txt-heading-colour font-bold"
            initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.28, ease: textEase, delay: 0.05 }}
          >
            <span aria-hidden>👆</span> Open your prediction
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
    </motion.aside>,
    portalTarget
  );
}
