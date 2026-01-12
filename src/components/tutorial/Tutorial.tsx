import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LuPencil, 
  LuUsers, 
  LuChartSpline, 
  LuChevronRight, 
  LuSparkles,
  LuTarget,
  LuTrophy,
  LuMessageCircle,
  LuRocket,
  LuMousePointerClick,
  LuX,
  LuBookMarked,
  LuFilter,
  LuTimer
} from 'react-icons/lu';
import { TbCards } from 'react-icons/tb';
import '../../styles/tutorial.css';

// Tutorial step definitions
export type TutorialStep = {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  targetSelector?: string;
  targetId?: string;
  requiredAction?: 'click' | 'navigate' | 'any';
  requiredPath?: string;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  showSkip?: boolean;
  tip?: string;
  waitForClick?: boolean; // New: wait for user to click the target
};

const tutorialSteps: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to CertChamps! 🎉',
    description: 'Let\'s take a quick tour to help you get the most out of our platform. We\'ll guide you through the key features.',
    icon: LuRocket,
    position: 'center',
    showSkip: true,
  },
  {
    id: 'navbar-intro',
    title: 'Navigation Bar',
    description: 'This is your navigation bar. It\'s how you\'ll move between different sections of the app.',
    icon: LuTarget,
    targetSelector: '.container.group',
    position: 'right',
  },
  {
    id: 'practice-intro',
    title: 'Practice Mode ✏️',
    description: 'You\'re currently in Practice mode. This is where you\'ll answer questions from real exam papers.',
    icon: LuPencil,
    targetId: 'nav-practice',
    position: 'right',
  },
  {
    id: 'question-sidebar',
    title: 'Question Tools',
    description: 'These buttons give you access to helpful tools. Let\'s explore each one!',
    icon: LuTarget,
    targetId: 'question-sidebar',
    position: 'left',
  },
  {
    id: 'click-threads',
    title: 'Discussion Threads 💬',
    description: 'Click this button to see discussions about the current question!',
    icon: LuMessageCircle,
    targetId: 'sidebar-threads',
    position: 'left',
    waitForClick: true,
    tip: 'Stuck on a question? Check if others have discussed it!',
  },
  {
    id: 'threads-opened',
    title: 'Discussion Panel 💬',
    description: 'This panel shows discussions about the current question. Ask questions or help others here!',
    icon: LuMessageCircle,
    targetId: 'sideview-threads',
    position: 'left',
  },
  {
    id: 'click-logtables',
    title: 'Log Tables 📚',
    description: 'Click this button to access log tables and reference materials!',
    icon: LuBookMarked,
    targetId: 'sidebar-logtables',
    position: 'left',
    waitForClick: true,
  },
  {
    id: 'logtables-opened',
    title: 'Reference Materials 📚',
    description: 'Access log tables, formulas, and other reference materials you need during exams.',
    icon: LuBookMarked,
    targetId: 'sideview-logtables',
    position: 'left',
  },
  {
    id: 'click-filter',
    title: 'Filter Questions 🎯',
    description: 'Click the filter button to customize which questions appear!',
    icon: LuFilter,
    targetId: 'sidebar-filter',
    position: 'left',
    waitForClick: true,
  },
  {
    id: 'filter-opened',
    title: 'Customise Your Practice 🎯',
    description: 'Filter by topic, year, paper, or difficulty to focus on what you need most.',
    icon: LuFilter,
    targetId: 'sideview-filter',
    position: 'left',
  },
  {
    id: 'click-decks-sidebar',
    title: 'Save to Decks 📦',
    description: 'Click this button to save questions to your study decks!',
    icon: TbCards,
    targetId: 'sidebar-decks',
    position: 'left',
    waitForClick: true,
  },
  {
    id: 'decks-sidebar-opened',
    title: 'Your Study Decks 📦',
    description: 'Save tricky questions to decks for later revision. Create themed collections!',
    icon: TbCards,
    targetId: 'sideview-decks',
    position: 'left',
    tip: 'Pro tip: Create separate decks for different topics!',
  },
  {
    id: 'click-timer',
    title: 'Practice Timer ⏱️',
    description: 'Click the timer button to practice under exam conditions!',
    icon: LuTimer,
    targetId: 'sidebar-timer',
    position: 'left',
    waitForClick: true,
  },
  {
    id: 'timer-opened',
    title: 'Exam Timer ⏱️',
    description: 'Use the timer to simulate real exam conditions and improve your speed.',
    icon: LuTimer,
    targetId: 'sideview-timer',
    position: 'left',
  },
  {
    id: 'click-social',
    title: 'Let\'s Explore Social',
    description: 'Click on the Social tab to see how you can connect with other learners!',
    icon: LuUsers,
    targetId: 'nav-social',
    requiredAction: 'navigate',
    requiredPath: '/social',
    position: 'right',
  },
  {
    id: 'social-intro',
    title: 'Social Hub 👥',
    description: 'See posts from the community, share achievements, and connect with friends!',
    icon: LuMessageCircle,
    position: 'center',
  },
  {
    id: 'click-progress',
    title: 'Check Your Progress',
    description: 'Click on Progress to see your stats and track your improvement!',
    icon: LuChartSpline,
    targetId: 'nav-progress',
    requiredAction: 'navigate',
    requiredPath: '/progress',
    position: 'right',
  },
  {
    id: 'progress-intro',
    title: 'Track Your Journey 📊',
    description: 'View your daily activity, track subjects, and monitor your improvement over time.',
    icon: LuChartSpline,
    position: 'center',
  },
  {
    id: 'click-decks',
    title: 'Explore Study Decks',
    description: 'Click on Decks to discover and create custom study collections!',
    icon: TbCards,
    targetId: 'nav-decks',
    requiredAction: 'navigate',
    requiredPath: '/decks',
    position: 'right',
  },
  {
    id: 'decks-intro',
    title: 'Study Decks 📚',
    description: 'Browse community decks or create your own. Perfect for focused revision!',
    icon: TbCards,
    position: 'center',
    tip: 'Pro tip: Save tricky questions to a deck for focused revision!',
  },
  {
    id: 'gamification',
    title: 'Level Up System 🎮',
    description: 'Earn XP for correct answers, build streaks, climb ranks, and compete with friends!',
    icon: LuTrophy,
    position: 'center',
  },
  {
    id: 'complete',
    title: 'You\'re All Set! 🚀',
    description: 'You\'ve completed the tour! Start practicing to earn XP and climb the ranks. Good luck!',
    icon: LuSparkles,
    position: 'center',
  },
];

type TutorialProps = {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
};

export default function Tutorial({ isOpen, onClose, onComplete }: TutorialProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [isWaitingForAction, setIsWaitingForAction] = useState(false);
  const observerRef = useRef<MutationObserver | null>(null);
  const clickListenerRef = useRef<(() => void) | null>(null);

  const step = tutorialSteps[currentStep];
  const isLastStep = currentStep === tutorialSteps.length - 1;
  const progress = ((currentStep + 1) / tutorialSteps.length) * 100;

  // Check if current step requires waiting for user action
  const needsUserAction = step?.waitForClick || step?.requiredAction === 'navigate';

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

  // Update target rectangle
  const updateTargetRect = useCallback(() => {
    const element = findTargetElement();
    if (element) {
      const rect = element.getBoundingClientRect();
      setTargetRect(rect);
    } else {
      setTargetRect(null);
    }
  }, [findTargetElement]);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
      setIsWaitingForAction(false);
      // Navigate to practice page when tutorial starts
      if (!location.pathname.includes('practice')) {
        navigate('/practice');
      }
    }
  }, [isOpen]);

  // Set waiting state when step changes
  useEffect(() => {
    if (step?.waitForClick || step?.requiredAction === 'navigate') {
      setIsWaitingForAction(true);
    } else {
      setIsWaitingForAction(false);
    }
  }, [currentStep, step]);

  // Handle click on target elements for waitForClick steps
  useEffect(() => {
    if (!isOpen || !step?.waitForClick) return;

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

  const IconComponent = step?.icon || LuSparkles;

  // Calculate tooltip position - ensures it never overlaps with the target
  const getTooltipStyle = (): React.CSSProperties => {
    if (!targetRect || step?.position === 'center') {
      return {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      };
    }

    const padding = 32; // Increased padding
    const tooltipWidth = 320;
    const tooltipHeight = 280;

    let top = targetRect.top;
    let left = targetRect.right + padding;

    switch (step?.position) {
      case 'right':
        top = Math.max(padding, Math.min(targetRect.top + targetRect.height / 2 - tooltipHeight / 2, window.innerHeight - tooltipHeight - padding));
        left = targetRect.right + padding;
        // If not enough space on right, try left
        if (left + tooltipWidth > window.innerWidth - padding) {
          left = Math.max(padding, targetRect.left - tooltipWidth - padding);
        }
        break;
      case 'left':
        top = Math.max(padding, Math.min(targetRect.top + targetRect.height / 2 - tooltipHeight / 2, window.innerHeight - tooltipHeight - padding));
        left = Math.max(padding, targetRect.left - tooltipWidth - padding);
        // If not enough space on left, try right
        if (left < padding) {
          left = targetRect.right + padding;
        }
        break;
      case 'bottom':
        top = targetRect.bottom + padding;
        left = Math.max(padding, Math.min(targetRect.left + targetRect.width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - padding));
        // If not enough space below, position to the side
        if (top + tooltipHeight > window.innerHeight - padding) {
          top = Math.max(padding, targetRect.top - tooltipHeight / 2);
          left = targetRect.right + padding;
          if (left + tooltipWidth > window.innerWidth - padding) {
            left = Math.max(padding, targetRect.left - tooltipWidth - padding);
          }
        }
        break;
      case 'top':
        top = Math.max(padding, targetRect.top - tooltipHeight - padding);
        left = Math.max(padding, Math.min(targetRect.left + targetRect.width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - padding));
        // If not enough space above, position to the side instead
        if (top < padding || targetRect.top - tooltipHeight - padding < padding) {
          // Try positioning to the left of the target
          left = Math.max(padding, targetRect.left - tooltipWidth - padding);
          top = Math.max(padding, Math.min(targetRect.top, window.innerHeight - tooltipHeight - padding));
          // If not enough space on left, try right
          if (left < padding || targetRect.left - tooltipWidth - padding < padding) {
            left = targetRect.right + padding;
          }
        }
        break;
    }

    return {
      position: 'fixed',
      top,
      left,
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
                      x={targetRect.left - 10}
                      y={targetRect.top - 10}
                      width={targetRect.width + 20}
                      height={targetRect.height + 20}
                      rx="12"
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
                  left: targetRect.left - 10,
                  top: targetRect.top - 10,
                  width: targetRect.width + 20,
                  height: targetRect.height + 20,
                  pointerEvents: 'none',
                }}
              />
            )}
          </motion.div>

          {/* Clickable area blocker - blocks clicks everywhere except the target */}
          {needsUserAction && targetRect && (
            <>
              {/* Top blocker */}
              <div 
                className="tutorial-click-blocker" 
                style={{ 
                  top: 0, 
                  left: 0, 
                  right: 0, 
                  height: targetRect.top - 10,
                }} 
              />
              {/* Bottom blocker */}
              <div 
                className="tutorial-click-blocker" 
                style={{ 
                  top: targetRect.bottom + 10, 
                  left: 0, 
                  right: 0, 
                  bottom: 0,
                }} 
              />
              {/* Left blocker */}
              <div 
                className="tutorial-click-blocker" 
                style={{ 
                  top: targetRect.top - 10, 
                  left: 0, 
                  width: targetRect.left - 10,
                  height: targetRect.height + 20,
                }} 
              />
              {/* Right blocker */}
              <div 
                className="tutorial-click-blocker" 
                style={{ 
                  top: targetRect.top - 10, 
                  left: targetRect.right + 10, 
                  right: 0,
                  height: targetRect.height + 20,
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
              {currentStep + 1} / {tutorialSteps.length}
            </div>

            {/* Icon */}
            <motion.div 
              className="tutorial-icon-wrapper color-bg-accent"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', damping: 15, delay: 0.1 }}
            >
              <IconComponent size={28} className="color-txt-accent" />
            </motion.div>

            {/* Content */}
            <motion.h3 
              className="tutorial-title txt-heading color-txt-main"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              {step?.title}
            </motion.h3>
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
            {isWaitingForAction && (
              <motion.div 
                className="tutorial-action-indicator color-bg-accent"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: [1, 1.02, 1] }}
                transition={{ scale: { repeat: Infinity, duration: 1.5 } }}
              >
                <LuMousePointerClick size={16} className="color-txt-accent" />
                <span className="txt-sub color-txt-accent">Click the highlighted element</span>
              </motion.div>
            )}

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
              {tutorialSteps.map((_, idx) => (
                <div
                  key={idx}
                  className={`tutorial-dot ${idx === currentStep ? 'active' : ''} ${idx < currentStep ? 'completed' : ''}`}
                />
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// Export trigger button that navigates to practice first
export function TutorialTriggerButton({ onClick }: { onClick: () => void }) {
  const navigate = useNavigate();
  
  const handleClick = () => {
    navigate('/practice');
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
