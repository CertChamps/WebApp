import { AnimatePresence, motion } from "framer-motion";
import type { PredictionModalTutorialStep } from "../../lib/predictionTutorial";

const STEP_CONTENT: Record<
  PredictionModalTutorialStep,
  { emoji: string; title: string; body: string }
> = {
  1: {
    emoji: "🎯",
    title: "Get your prediction",
    body: "Select a Subject and Level, then hit Generate.",
  },
  2: {
    emoji: "✅",
    title: "Almost done!",
    body: "Scroll down and click Save to keep your prediction.",
  },
};

const textEase = [0.25, 0.4, 0.25, 1] as const;

type Props = {
  step: PredictionModalTutorialStep;
};

export default function PredictionTutorialCallout({ step }: Props) {
  const content = STEP_CONTENT[step];

  return (
    <motion.aside
      className="prediction-tutorial-callout"
      aria-live="polite"
      aria-label="Prediction tutorial"
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.35, ease: textEase }}
    >
      <div className="prediction-tutorial-callout__panel color-bg color-shadow border-2 rounded-out shadow-none">
        <span className="prediction-tutorial-callout__arrow" aria-hidden />
        <div className="prediction-tutorial-callout__content">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              className="prediction-tutorial-callout__step"
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={{
                hidden: {},
                visible: {
                  transition: { staggerChildren: 0.07, delayChildren: 0.04 },
                },
                exit: {
                  transition: { staggerChildren: 0.04, staggerDirection: -1 },
                },
              }}
            >
              <motion.p
                className="prediction-tutorial-callout__title txt-heading-colour font-bold"
                variants={{
                  hidden: { opacity: 0, y: 10, filter: "blur(4px)" },
                  visible: {
                    opacity: 1,
                    y: 0,
                    filter: "blur(0px)",
                    transition: { duration: 0.28, ease: textEase },
                  },
                  exit: {
                    opacity: 0,
                    y: -8,
                    filter: "blur(3px)",
                    transition: { duration: 0.18, ease: textEase },
                  },
                }}
              >
                <span aria-hidden>{content.emoji}</span> {content.title}
              </motion.p>
              <motion.p
                className="prediction-tutorial-callout__body txt-sub color-txt-sub"
                variants={{
                  hidden: { opacity: 0, y: 12, filter: "blur(4px)" },
                  visible: {
                    opacity: 1,
                    y: 0,
                    filter: "blur(0px)",
                    transition: { duration: 0.32, ease: textEase },
                  },
                  exit: {
                    opacity: 0,
                    y: -6,
                    filter: "blur(3px)",
                    transition: { duration: 0.16, ease: textEase },
                  },
                }}
              >
                {content.body}
              </motion.p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </motion.aside>
  );
}
