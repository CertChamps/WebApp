import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { getThemedPortalTarget } from "../../utils/themedPortal";

const textEase = [0.25, 0.4, 0.25, 1] as const;

type Props = {
  onNext: () => void;
};

export default function PracticeSessionTutorialIntro({ onNext }: Props) {
  const portalTarget = getThemedPortalTarget();
  if (!portalTarget) return null;

  return createPortal(
    <>
      <div
        className="practice-hub__backdrop practice-hub__backdrop--tutorial practice-hub__backdrop--card-tutorial"
        aria-hidden
      />
      <div className="practice-session-tutorial-intro" role="dialog" aria-modal="true">
        <motion.div
          className="practice-session-tutorial-intro__panel color-bg color-shadow border-2 rounded-out shadow-none"
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.35, ease: textEase }}
        >
          <p className="practice-session-tutorial-intro__title txt-heading-colour font-bold">
            <span aria-hidden>📝</span> This is the practice page
          </p>
          <p className="practice-session-tutorial-intro__body txt-sub color-txt-sub">
            Here you&apos;ll work through questions, draw on the whiteboard, and track your progress.
          </p>
          <button type="button" className="blue-btn practice-session-tutorial-intro__next" onClick={onNext}>
            Next
          </button>
        </motion.div>
      </div>
    </>,
    portalTarget
  );
}
