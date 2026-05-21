import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LuChevronRight,
  LuSparkles,
  LuRocket,
  LuMousePointerClick,
  LuX,
} from 'react-icons/lu';
import crownLogo from '../../assets/logo.png';
import '../../styles/tutorial.css';
import { normalizePaperLevel, useExamPapers } from '../../hooks/useExamPapers';
import { useTutorialContext } from '../../context/TutorialContext';

// Tutorial step definitions
export type TutorialStep = {
  id: string;
  title: string;
  description: string;
  targetSelector?: string;
  targetId?: string;
  requiredAction?: 'click' | 'navigate' | 'any';
  requiredPath?: string;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  showSkip?: boolean;
  tip?: string;
  waitForClick?: boolean;
  waitForHubAction?: boolean;
  /** Tighter spotlight around small controls (default 10px). */
  spotlightPadding?: number;
  /** Shown while waiting for user action instead of generic copy. */
  actionHint?: string;
  /** Allow clicks inside the spotlight (subject selects, scroll, etc.). */
  interactiveSpotlight?: boolean;
};

const PREDICTIONS_ONBOARDING_STEPS: TutorialStep[] = [
  {
    id: 'hub-intro-predictions',
    title: 'Set up your prediction',
    description:
      'Choose your subject, level, and paper in the highlighted area. When you are ready, click Generate prediction to build your paper.',
    targetId: 'hub-prediction-setup',
    position: 'left',
    waitForHubAction: true,
    interactiveSpotlight: true,
    spotlightPadding: 6,
    actionHint:
      'Use the highlighted controls to pick subject, level, and paper — then click Generate prediction.',
    showSkip: true,
  },
  {
    id: 'hub-generate-prediction',
    title: 'Save your prediction',
    description:
      'Review your predicted paper in the highlighted section. Scroll if you need to, then save it to add it to your Predictions list.',
    targetId: 'hub-prediction-review',
    position: 'left',
    waitForHubAction: true,
    interactiveSpotlight: true,
    spotlightPadding: 6,
    actionHint:
      'Scroll through your prediction if needed, then click Save Prediction at the bottom of the highlighted area.',
    showSkip: true,
  },
  {
    id: 'hub-predictions-list',
    title: 'Your predictions',
    description:
      "This is where all your generated predictions will live. Let's give one a go.",
    targetId: 'hub-predictions-section',
    position: 'top',
    showSkip: true,
  },
  {
    id: 'hub-click-prediction',
    title: 'Open a prediction',
    description: 'Tap your prediction to open it and start practicing.',
    targetId: 'hub-first-prediction',
    position: 'bottom',
    waitForHubAction: true,
    showSkip: true,
  },
];

const ONBOARDING_SESSION_PREFIX_STEPS: TutorialStep[] = [
  {
    id: 'session-change-question',
    title: 'Change question',
    description:
      'Use the arrows beside the question title to move between questions in this paper.',
    targetId: 'session-question-nav',
    position: 'bottom',
    showSkip: true,
  },
  {
    id: 'session-open-question-list',
    title: 'Question list',
    description: 'Click the question title to open the list and jump to any question in this paper.',
    targetId: 'session-question-list-btn',
    position: 'bottom',
    waitForClick: true,
    showSkip: true,
  },
];

/** @deprecated Legacy hub tour — predictions onboarding uses PREDICTIONS_ONBOARDING_STEPS */
export const PRACTICE_HUB_TUTORIAL_STEPS: TutorialStep[] = PREDICTIONS_ONBOARDING_STEPS;

const sessionTutorialSteps: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to CertChamps!',
    description: 'Let\'s take a quick tour to help you get the most out of our platform. We\'ll guide you through the key features.',
    position: 'center',
    showSkip: true,
  },
  {
    id: 'ai-intro',
    title: 'Your AI Assistant',
    description: 'This is your AI assistant. It can see your working and the exam paper. Ask it anything about the question and it will help you work through it!',
    targetId: 'sidebar',
    position: 'left',
  },
  {
    id: 'laptop-tablet',
    title: 'Laptop or Tablet Mode',
    description: 'Switch between laptop layout (PDF beside question) and tablet layout (full screen). Use whichever works best for you!',
    targetId: 'laptop-tablet-toggle',
    position: 'bottom',
  },
  {
    id: 'drawing-toolbar',
    title: 'Your Working Canvas',
    description: 'Use the pen, eraser, and grid tools here to write out solutions. Undo, redo, and clear your work anytime while you practice.',
    targetId: 'drawing-toolbar',
    position: 'top',
  },
  {
    id: 'click-logtables',
    title: 'Log Tables',
    description: 'Click this icon to open the log tables and formula booklet. You\'ll need these for exam questions!',
    targetId: 'sidebar-logtables',
    position: 'right',
    waitForClick: true,
  },
  {
    id: 'logtables-opened',
    title: 'Log Tables',
    description: 'Reference materials at your fingertips. The log tables opens to the exact page you need for the current question.',
    targetId: 'sideview-logtables',
    position: 'left',
  },
  {
    id: 'feedback-tab',
    title: 'Feedback',
    description: 'Found a bug or have a suggestion? Use the Feedback tab in the navbar to let us know. We read every submission!',
    targetId: 'nav-feedback',
    position: 'right',
  },
  {
    id: 'complete',
    title: 'You\'re All Set!',
    description: 'You\'ve completed the tour! Start practicing and good luck!',
    position: 'center',
  },
];

const LOG_TABLES_STEP_IDS = new Set(['click-logtables', 'logtables-opened']);

function getSessionTutorialSteps(options: { skipWelcome?: boolean }): TutorialStep[] {
  let steps = sessionTutorialSteps.filter((s) => !LOG_TABLES_STEP_IDS.has(s.id));
  if (options.skipWelcome) {
    steps = steps.filter((s) => s.id !== 'welcome');
  }
  return steps;
}

function getActiveTutorialSteps(flow: 'default' | 'from-onboarding'): TutorialStep[] {
  if (flow === 'from-onboarding') {
    return [
      ...PREDICTIONS_ONBOARDING_STEPS,
      ...ONBOARDING_SESSION_PREFIX_STEPS,
      ...getSessionTutorialSteps({ skipWelcome: true }),
    ];
  }
  return getSessionTutorialSteps({ skipWelcome: false });
}

type TutorialProps = {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
};

function getSpotlightPadding(step: TutorialStep | undefined): number {
  return step?.spotlightPadding ?? 10;
}

function TutorialActionHint({ step }: { step: TutorialStep | undefined }) {
  if (!step) return null;
  const text =
    step.actionHint ??
    (step.waitForHubAction
      ? 'Complete the step above to continue.'
      : step.waitForClick
        ? 'Interact with the highlighted control to continue.'
        : null);
  if (!text) return null;
  return (
    <motion.div
      className="tutorial-action-indicator color-bg-accent"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: [1, 1.02, 1] }}
      transition={{ scale: { repeat: Infinity, duration: 1.5 } }}
    >
      <LuMousePointerClick size={16} className="color-txt-accent" />
      <span className="txt-sub color-txt-accent">{text}</span>
    </motion.div>
  );
}

function TutorialTitleRow({ title }: { title?: string }) {
  return (
    <motion.div
      className="tutorial-title-row"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
    >
      <img src={crownLogo} alt="" className="tutorial-title-crown" aria-hidden />
      <h3 className="tutorial-title txt-heading color-txt-main">{title}</h3>
    </motion.div>
  );
}

export default function Tutorial({ isOpen, onClose, onComplete }: TutorialProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { papers } = useExamPapers(null, { loadAllWhenNull: true });
  const { tutorialFlow, setHubTourPhase, hubTourAdvanceSignal } = useTutorialContext();
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [isWaitingForAction, setIsWaitingForAction] = useState(false);
  const observerRef = useRef<MutationObserver | null>(null);
  const clickListenerRef = useRef<(() => void) | null>(null);
  const lastHubAdvanceSignal = useRef(0);
  const wasOpenRef = useRef(false);

  const activeSteps = useMemo(
    () => getActiveTutorialSteps(tutorialFlow),
    [tutorialFlow]
  );
  const hubStepCount =
    tutorialFlow === 'from-onboarding' ? PREDICTIONS_ONBOARDING_STEPS.length : 0;
  const inHubPhase = currentStep < hubStepCount;

  const tutorialPaper = useMemo(() => {
    const getPaperNumber = (id: string, label?: string): number | null => {
      const raw = `${label ?? ''} ${id ?? ''}`.toLowerCase();
      if (/\bpaper\s*1\b|paper-1|1-paper/.test(raw)) return 1;
      if (/\bpaper\s*2\b|paper-2|2-paper/.test(raw)) return 2;
      return null;
    };

    return (
      papers.find(
        (paper) =>
          paper.year === 2024 &&
          getPaperNumber(paper.id, paper.label) === 1 &&
          (paper.subject ?? '').trim().toLowerCase() === 'maths' &&
          normalizePaperLevel(paper.level) === 'higher'
      ) ?? null
    );
  }, [papers]);

  const step = activeSteps[currentStep];
  const isLastStep = currentStep === activeSteps.length - 1;
  const progress = ((currentStep + 1) / activeSteps.length) * 100;

  // Check if current step requires waiting for user action
  const needsUserAction =
    step?.waitForClick || step?.requiredAction === 'navigate' || step?.waitForHubAction === true;

  // Find and highlight target element
  const findTargetElement = useCallback(() => {
    if (!step) return null;
    
    if (step.targetId) {
      return document.querySelector(`[data-tutorial-id="${step.targetId}"]`);
    }
    if (step.targetSelector) {
      return document.querySelector(step.targetSelector);
    }
    return null;
  }, [step]);

  // Update target rectangle, clipped to any scrollable ancestor's visible bounds
  // so the spotlight cutout never bleeds past a `overflow: auto/scroll/hidden`
  // container (e.g. the prediction modal that scrolls internally).
  const updateTargetRect = useCallback(() => {
    const element = findTargetElement();
    if (!element) {
      setTargetRect(null);
      return;
    }
    const rect = element.getBoundingClientRect();
    let top = rect.top;
    let left = rect.left;
    let right = rect.right;
    let bottom = rect.bottom;
    let parent = (element as HTMLElement).parentElement;
    while (parent) {
      const cs = window.getComputedStyle(parent);
      const clipsY = cs.overflowY === 'auto' || cs.overflowY === 'scroll' || cs.overflowY === 'hidden';
      const clipsX = cs.overflowX === 'auto' || cs.overflowX === 'scroll' || cs.overflowX === 'hidden';
      if (clipsY || clipsX) {
        const ar = parent.getBoundingClientRect();
        if (clipsY) {
          top = Math.max(top, ar.top);
          bottom = Math.min(bottom, ar.bottom);
        }
        if (clipsX) {
          left = Math.max(left, ar.left);
          right = Math.min(right, ar.right);
        }
      }
      parent = parent.parentElement;
    }
    setTargetRect(
      new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top))
    );
  }, [findTargetElement]);

  // Reset only when tutorial opens (not on every re-render while open)
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setCurrentStep(0);
      setIsWaitingForAction(false);
      lastHubAdvanceSignal.current = 0;
      wasOpenRef.current = true;
    }
    if (!isOpen) {
      wasOpenRef.current = false;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const hubStep = activeSteps[currentStep];
    if (tutorialFlow === 'from-onboarding') {
      if (hubStep?.id === 'hub-intro-predictions') {
        setHubTourPhase('intro');
      } else if (hubStep?.id === 'hub-generate-prediction') {
        setHubTourPhase('generate');
      } else if (hubStep?.id === 'hub-predictions-list') {
        setHubTourPhase('view-list');
      } else if (hubStep?.id === 'hub-click-prediction') {
        setHubTourPhase('click-prediction');
      } else {
        setHubTourPhase(null);
      }
    } else {
      setHubTourPhase(null);
    }
  }, [isOpen, currentStep, tutorialFlow, activeSteps, setHubTourPhase]);

  // Hub tour: advance when Practice Hub reports subject/paper selection
  useEffect(() => {
    if (!isOpen || tutorialFlow !== 'from-onboarding') return;
    if (hubTourAdvanceSignal === 0 || hubTourAdvanceSignal === lastHubAdvanceSignal.current) return;

    const hubStep = activeSteps[currentStep];
    if (!hubStep?.id.startsWith('hub-')) return;

    lastHubAdvanceSignal.current = hubTourAdvanceSignal;
    setIsWaitingForAction(false);
    setTimeout(() => {
      setCurrentStep((prev) => Math.min(prev + 1, activeSteps.length - 1));
    }, 300);
  }, [hubTourAdvanceSignal, isOpen, tutorialFlow, activeSteps, currentStep]);

  useEffect(() => {
    if (!isOpen) return;

    if (inHubPhase) {
      if (location.pathname.includes("/practice/session")) {
        return;
      }
      if (location.pathname !== "/practice") {
        navigate("/practice", { replace: true });
      }
      return;
    }

    if (tutorialFlow === 'from-onboarding' && location.pathname.includes('/practice/session')) {
      return;
    }

    if (tutorialFlow !== 'from-onboarding') {
      const targetPath = tutorialPaper
        ? `/practice/session?mode=pastpaper&subject=maths&level=higher&paperId=${encodeURIComponent(tutorialPaper.id)}`
        : '/practice/session?mode=pastpaper&subject=maths&level=higher';
      const currentPath = `${location.pathname}${location.search}`;

      if (currentPath !== targetPath) {
        navigate(targetPath, { replace: true });
      }
    }
  }, [isOpen, inHubPhase, tutorialFlow, tutorialPaper, location.pathname, location.search, navigate]);

  // Set waiting state when step changes
  useEffect(() => {
    if (step?.waitForClick || step?.requiredAction === 'navigate' || step?.waitForHubAction) {
      setIsWaitingForAction(true);
    } else {
      setIsWaitingForAction(false);
    }
  }, [currentStep, step]);

  // Scroll the review panel into view once when the save step becomes active.
  // No interval — the user must be free to scroll within the review section
  // without the tutorial fighting them.
  useEffect(() => {
    if (!isOpen || step?.id !== 'hub-generate-prediction') return;
    const el = document.querySelector('[data-tutorial-id="hub-prediction-review"]');
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [isOpen, currentStep, step?.id]);

  // Handle click on target elements for waitForClick steps
  useEffect(() => {
    if (!isOpen || !step?.waitForClick || step.waitForHubAction) return;

    const targetElement = findTargetElement();
    if (!targetElement) return;

    const handleTargetClick = () => {
      setIsWaitingForAction(false);
      setTimeout(() => {
        setCurrentStep(prev => prev + 1);
      }, 300);
    };

    clickListenerRef.current = handleTargetClick;
    targetElement.addEventListener('click', handleTargetClick);

    return () => {
      if (clickListenerRef.current) {
        targetElement.removeEventListener('click', clickListenerRef.current);
      }
    };
  }, [isOpen, currentStep, step, findTargetElement]);

  // Update target rect when step changes or window resizes
  useEffect(() => {
    if (!isOpen) return;

    // Small delay to let page render
    const timeoutId = setTimeout(updateTargetRect, 200);
    
    const handleResize = () => updateTargetRect();
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);

    // Use MutationObserver to detect DOM changes
    observerRef.current = new MutationObserver(() => {
      setTimeout(updateTargetRect, 100);
    });
    
    observerRef.current.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    // Recheck periodically for dynamically loaded content
    const interval = setInterval(updateTargetRect, 500);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize, true);
      observerRef.current?.disconnect();
      clearInterval(interval);
    };
  }, [isOpen, currentStep, updateTargetRect]);

  // Close log tables when advancing to feedback step
  useEffect(() => {
    if (isOpen && step?.id === 'feedback-tab') {
      window.dispatchEvent(new CustomEvent('tutorial-close-logtables'));
    }
  }, [isOpen, currentStep, step?.id]);

  // Check for required navigation
  useEffect(() => {
    if (!isOpen || !step?.requiredAction) return;

    if (step.requiredAction === 'navigate' && step.requiredPath) {
      if (location.pathname.includes(step.requiredPath.replace('/', ''))) {
        // User navigated to the required path
        setIsWaitingForAction(false);
        setTimeout(() => {
          setCurrentStep(prev => prev + 1);
        }, 400);
      }
    }
  }, [location.pathname, isOpen, step]);

  const handleNext = () => {
    if (needsUserAction && isWaitingForAction) {
      return;
    }
    
    if (isLastStep) {
      onComplete();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleSkip = () => {
    onClose();
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') handleSkip();
      if ((e.key === 'Enter' || e.key === 'ArrowRight') && !isWaitingForAction) {
        handleNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentStep, isWaitingForAction]);

  if (!isOpen) return null;

  const spotlightPad = getSpotlightPadding(step);

  const getTooltipStyle = (): React.CSSProperties => {
    const pad = 16;
    const gap = 24;
    const tooltipWidth = 260;
    const tooltipHeight = 300;

    if (!targetRect) {
      if (step?.position === 'center') {
        return {
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        };
      }
      const fallbackLeft = pad + Math.max(0, (window.innerWidth * 0.32 - tooltipWidth) / 2);
      return {
        position: 'fixed',
        top: '50%',
        left: fallbackLeft,
        transform: 'translateY(-50%)',
      };
    }

    if (step?.position === 'center') {
      return {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      };
    }
    const r = targetRect;

    const clamp = (value: number, min: number, max: number) =>
      Math.max(min, Math.min(value, max));

    const centerInGutter = (gutterStart: number, gutterEnd: number) => {
      const width = Math.max(0, gutterEnd - gutterStart);
      return gutterStart + Math.max(0, (width - tooltipWidth) / 2);
    };
    // Side-placed tooltips lock to the viewport's vertical center so they stay
    // put even when the spotlighted content (e.g. a scrollable modal) is scrolled.
    const sideTop = clamp(
      window.innerHeight / 2 - tooltipHeight / 2,
      pad,
      window.innerHeight - tooltipHeight - pad
    );

    const placements: Record<
      NonNullable<TutorialStep['position']>,
      { top: number; left: number }
    > = {
      center: { top: 0, left: 0 },
      right: {
        top: sideTop,
        left: centerInGutter(r.right + gap, window.innerWidth - pad),
      },
      left: {
        top: sideTop,
        left: centerInGutter(pad, r.left - gap),
      },
      bottom: {
        top: r.bottom + gap,
        left: clamp(
          r.left + r.width / 2 - tooltipWidth / 2,
          pad,
          window.innerWidth - tooltipWidth - pad
        ),
      },
      top: {
        top: r.top - tooltipHeight - gap,
        left: clamp(
          r.left + r.width / 2 - tooltipWidth / 2,
          pad,
          window.innerWidth - tooltipWidth - pad
        ),
      },
    };

    const fitsViewport = (top: number, left: number) =>
      left >= pad &&
      left + tooltipWidth <= window.innerWidth - pad &&
      top >= pad &&
      top + tooltipHeight <= window.innerHeight - pad;

    const overlapsTarget = (top: number, left: number) =>
      !(
        left + tooltipWidth <= r.left - gap ||
        left >= r.right + gap ||
        top + tooltipHeight <= r.top - gap ||
        top >= r.bottom + gap
      );

    const preferred = step?.position ?? 'bottom';
    const tryOrder: NonNullable<TutorialStep['position']>[] = [
      preferred,
      'right',
      'left',
      'bottom',
      'top',
    ];
    const seen = new Set<string>();

    for (const side of tryOrder) {
      if (side === 'center' || seen.has(side)) continue;
      seen.add(side);
      const { top, left } = placements[side];
      if (fitsViewport(top, left) && !overlapsTarget(top, left)) {
        return { position: 'fixed', top, left };
      }
    }

    // Fallback: pick the wider side gutter and center the tooltip in it
    const rightGutter = window.innerWidth - pad - (r.right + gap);
    const leftGutter = r.left - gap - pad;
    const useRight = rightGutter >= leftGutter;
    const fallbackLeft = useRight
      ? centerInGutter(r.right + gap, window.innerWidth - pad)
      : centerInGutter(pad, r.left - gap);
    return {
      position: 'fixed',
      top: sideTop,
      left: clamp(fallbackLeft, pad, window.innerWidth - tooltipWidth - pad),
    };
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="tutorial-overlay-wrapper">
          {/* Backdrop with spotlight cutout */}
          <motion.div
            className="tutorial-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ pointerEvents: needsUserAction ? 'none' : 'auto' }}
          >
            {/* SVG mask for spotlight effect */}
            <svg className="tutorial-spotlight-svg" width="100%" height="100%" style={{ pointerEvents: 'none' }}>
              <defs>
                <mask id="spotlight-mask">
                  <rect width="100%" height="100%" fill="white" />
                  {targetRect && (
                    <motion.rect
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      x={targetRect.left - spotlightPad}
                      y={targetRect.top - spotlightPad}
                      width={targetRect.width + spotlightPad * 2}
                      height={targetRect.height + spotlightPad * 2}
                      rx={spotlightPad <= 4 ? 8 : 12}
                      fill="black"
                    />
                  )}
                </mask>
              </defs>
              <rect
                width="100%"
                height="100%"
                className="tutorial-backdrop-fill"
                mask="url(#spotlight-mask)"
              />
            </svg>

            {/* Highlight border around target */}
            {targetRect && (
              <motion.div
                className="tutorial-highlight-border"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                style={{
                  position: 'fixed',
                  left: targetRect.left - spotlightPad,
                  top: targetRect.top - spotlightPad,
                  width: targetRect.width + spotlightPad * 2,
                  height: targetRect.height + spotlightPad * 2,
                  borderRadius: spotlightPad <= 4 ? 8 : 12,
                  pointerEvents: 'none',
                }}
              />
            )}
          </motion.div>

          {/* Clickable area blocker - blocks clicks everywhere except the target */}
          {needsUserAction && targetRect && !step?.interactiveSpotlight && (
            <>
              {/* Top blocker */}
              <div 
                className="tutorial-click-blocker" 
                style={{ 
                  top: 0, 
                  left: 0, 
                  right: 0, 
                  height: targetRect.top - spotlightPad,
                }} 
              />
              {/* Bottom blocker */}
              <div 
                className="tutorial-click-blocker" 
                style={{ 
                  top: targetRect.bottom + spotlightPad, 
                  left: 0, 
                  right: 0, 
                  bottom: 0,
                }} 
              />
              {/* Left blocker */}
              <div 
                className="tutorial-click-blocker" 
                style={{ 
                  top: targetRect.top - spotlightPad, 
                  left: 0, 
                  width: targetRect.left - spotlightPad,
                  height: targetRect.height + spotlightPad * 2,
                }} 
              />
              {/* Right blocker */}
              <div 
                className="tutorial-click-blocker" 
                style={{ 
                  top: targetRect.top - spotlightPad, 
                  left: targetRect.right + spotlightPad, 
                  right: 0,
                  height: targetRect.height + spotlightPad * 2,
                }} 
              />
            </>
          )}

          {/* Progress bar */}
          <div className="tutorial-progress-bar-container">
            <motion.div 
              className="tutorial-progress-bar-fill"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
            />
          </div>

          {/* Tooltip card */}
          {step?.position === 'center' ? (
            <div className="fixed inset-0 z-10 flex items-center justify-center pointer-events-none">
              <div className="pointer-events-auto">
                <motion.div
                  className="tutorial-tooltip color-bg color-shadow"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                  key={currentStep}
                >
            {/* Close button */}
            <button className="tutorial-close color-txt-sub" onClick={handleSkip}>
              <LuX size={18} />
            </button>

            {/* Step counter */}
            <div className="tutorial-step-counter txt-sub color-txt-sub">
              {currentStep + 1} / {activeSteps.length}
            </div>

            <TutorialTitleRow title={step?.title} />
            <motion.p 
              className="tutorial-description color-txt-sub"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              {step?.description}
            </motion.p>

            {/* Tip */}
            {step?.tip && (
              <motion.div 
                className="tutorial-tip-box color-bg-grey-5"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <LuSparkles size={14} className="color-txt-accent" />
                <span className="txt-sub color-txt-sub">{step.tip}</span>
              </motion.div>
            )}

            {/* Action indicator */}
            {isWaitingForAction && <TutorialActionHint step={step} />}

            {/* Navigation */}
            <div className="tutorial-nav">
              {step?.showSkip && (
                <button className="tutorial-skip-link txt-sub color-txt-sub" onClick={handleSkip}>
                  Skip tutorial
                </button>
              )}
              
              {!isWaitingForAction && (
                <motion.button 
                  className="tutorial-next-btn blue-btn"
                  onClick={handleNext}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {isLastStep ? (
                    <>
                      <span>Get Started</span>
                      <LuRocket size={18} />
                    </>
                  ) : (
                    <>
                      <span>Next</span>
                      <LuChevronRight size={18} />
                    </>
                  )}
                </motion.button>
              )}
            </div>

            {/* Step dots */}
            <div className="tutorial-dots">
              {activeSteps.map((_, idx) => (
                <div
                  key={idx}
                  className={`tutorial-dot ${idx === currentStep ? 'active' : ''} ${idx < currentStep ? 'completed' : ''}`}
                />
              ))}
            </div>
          </motion.div>
              </div>
            </div>
          ) : (
            <motion.div
              className="tutorial-tooltip color-bg color-shadow"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              style={getTooltipStyle()}
              key={currentStep}
            >
            {/* Close button */}
            <button className="tutorial-close color-txt-sub" onClick={handleSkip}>
              <LuX size={18} />
            </button>

            {/* Step counter */}
            <div className="tutorial-step-counter txt-sub color-txt-sub">
              {currentStep + 1} / {activeSteps.length}
            </div>

            <TutorialTitleRow title={step?.title} />
            <motion.p 
              className="tutorial-description color-txt-sub"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              {step?.description}
            </motion.p>

            {/* Tip */}
            {step?.tip && (
              <motion.div 
                className="tutorial-tip-box color-bg-grey-5"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <LuSparkles size={14} className="color-txt-accent" />
                <span className="txt-sub color-txt-sub">{step.tip}</span>
              </motion.div>
            )}

            {/* Action indicator */}
            {isWaitingForAction && <TutorialActionHint step={step} />}

            {/* Navigation */}
            <div className="tutorial-nav">
              {step?.showSkip && (
                <button className="tutorial-skip-link txt-sub color-txt-sub" onClick={handleSkip}>
                  Skip tutorial
                </button>
              )}
              
              {!isWaitingForAction && (
                <motion.button 
                  className="tutorial-next-btn blue-btn"
                  onClick={handleNext}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {isLastStep ? (
                    <>
                      <span>Get Started</span>
                      <LuRocket size={18} />
                    </>
                  ) : (
                    <>
                      <span>Next</span>
                      <LuChevronRight size={18} />
                    </>
                  )}
                </motion.button>
              )}
            </div>

            {/* Step dots */}
            <div className="tutorial-dots">
              {activeSteps.map((_, idx) => (
                <div
                  key={idx}
                  className={`tutorial-dot ${idx === currentStep ? 'active' : ''} ${idx < currentStep ? 'completed' : ''}`}
                />
              ))}
            </div>
          </motion.div>
          )}
        </div>
      )}
    </AnimatePresence>
  );
}

// Export trigger button that navigates to practice first
export function TutorialTriggerButton({ onClick }: { onClick: () => void }) {
  const navigate = useNavigate();
  
  const handleClick = () => {
    navigate('/practice/session');
    setTimeout(onClick, 150);
  };
  
  return (
    <button
      className="tutorial-trigger-btn color-bg-accent"
      onClick={handleClick}
    >
      <LuSparkles size={20} className="color-txt-accent" />
      <span className="txt-bold color-txt-accent">View App Tutorial</span>
      <LuChevronRight size={18} className="color-txt-accent" />
    </button>
  );
}
