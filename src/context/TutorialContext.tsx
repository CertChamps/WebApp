import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { UserContext } from './UserContext';
import { useOnboardingContext } from './OnboardingContext';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, auth } from '../../firebase';

type TutorialFlow = 'default' | 'from-onboarding';
export type HubTourPhase = 'pick-subject' | 'pick-paper' | null;
export type HubContentType = 'paper' | 'topic' | null;

type TutorialContextType = {
  showTutorial: boolean;
  setShowTutorial: (show: boolean) => void;
  hasCompletedTutorial: boolean;
  completeTutorial: () => Promise<void>;
  resetTutorial: () => Promise<void>;
  triggerTutorial: () => void;
  triggerTutorialFromOnboarding: (subjectId: string) => void;
  tutorialFlow: TutorialFlow;
  hubSubjectId: string | null;
  hubTourPhase: HubTourPhase;
  setHubTourPhase: (phase: HubTourPhase) => void;
  hubTourAdvanceSignal: number;
  signalHubTourAdvance: () => void;
  hubContentType: HubContentType;
  setHubContentType: (type: HubContentType) => void;
  isLoading: boolean;
};

const TutorialContext = createContext<TutorialContextType | null>(null);

export function TutorialProvider({ children }: { children: ReactNode }) {
  const { user, setUser } = useContext(UserContext);
  const { hasCompletedOnboarding, isLoading: onboardingLoading } = useOnboardingContext();
  const [showTutorial, setShowTutorial] = useState(false);
  const [hasCompletedTutorial, setHasCompletedTutorial] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [tutorialFlow, setTutorialFlow] = useState<TutorialFlow>('default');
  const [hubSubjectId, setHubSubjectId] = useState<string | null>(null);
  const [hubTourPhase, setHubTourPhase] = useState<HubTourPhase>(null);
  const [hubTourAdvanceSignal, setHubTourAdvanceSignal] = useState(0);
  const [hubContentType, setHubContentType] = useState<HubContentType>(null);

  const resetTutorialFlow = useCallback(() => {
    setTutorialFlow('default');
    setHubSubjectId(null);
    setHubTourPhase(null);
    setHubTourAdvanceSignal(0);
    setHubContentType(null);
  }, []);

  const signalHubTourAdvance = useCallback(() => {
    setHubTourAdvanceSignal((n) => n + 1);
  }, []);

  // Check if user has completed the tutorial on mount
  useEffect(() => {
    const checkTutorialStatus = async () => {
      if (!user?.uid) {
        setIsLoading(false);
        return;
      }

      // Don't show tutorial if email is not verified (for email/password users)
      const firebaseUser = auth.currentUser;
      const isEmailPasswordUser = firebaseUser?.providerData.some(
        (provider) => provider.providerId === "password"
      );
      if (isEmailPasswordUser && !firebaseUser?.emailVerified) {
        setIsLoading(false);
        return;
      }

      // Keep setup order deterministic: profile → onboarding → tutorial.
      if (!user?.username || user.username.trim().length < 1) {
        setIsLoading(false);
        return;
      }

      if (onboardingLoading || !hasCompletedOnboarding) {
        setIsLoading(false);
        return;
      }

      try {
        const localTutorialStatus = localStorage.getItem(`tutorial_completed_${user.uid}`);
        
        if (localTutorialStatus === 'true') {
          setHasCompletedTutorial(true);
          setIsLoading(false);
          return;
        }

        const userDoc = await getDoc(doc(db, 'user-data', user.uid));
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const completed = userData.hasCompletedTutorial ?? false;
          const declinedOffer = userData.tutorialOfferDeclined ?? false;
          
          setHasCompletedTutorial(completed);
          
          if (completed) {
            localStorage.setItem(`tutorial_completed_${user.uid}`, 'true');
          }
          
          if (!completed && !declinedOffer) {
            setTimeout(() => {
              setShowTutorial(true);
            }, 500);
          }
        } else {
          setHasCompletedTutorial(false);
          setTimeout(() => {
            setShowTutorial(true);
          }, 500);
        }
      } catch (error) {
        console.error('Error checking tutorial status:', error);
        setHasCompletedTutorial(true);
      } finally {
        setIsLoading(false);
      }
    };

    checkTutorialStatus();
  }, [user?.uid, user?.emailVerified, user?.username, hasCompletedOnboarding, onboardingLoading]);

  const completeTutorial = useCallback(async () => {
    if (!user?.uid) return;

    try {
      await setDoc(
        doc(db, 'user-data', user.uid),
        { hasCompletedTutorial: true },
        { merge: true }
      );

      setHasCompletedTutorial(true);
      setShowTutorial(false);
      resetTutorialFlow();
      localStorage.setItem(`tutorial_completed_${user.uid}`, 'true');

      setUser((prev: any) => ({
        ...prev,
        hasCompletedTutorial: true,
      }));

      console.log('Tutorial completed successfully');
    } catch (error) {
      console.error('Error completing tutorial:', error);
    }
  }, [user?.uid, setUser, resetTutorialFlow]);

  const resetTutorial = useCallback(async () => {
    if (!user?.uid) return;

    try {
      await setDoc(
        doc(db, 'user-data', user.uid),
        { hasCompletedTutorial: false, tutorialOfferDeclined: false },
        { merge: true }
      );

      setHasCompletedTutorial(false);
      setShowTutorial(false);
      resetTutorialFlow();
      localStorage.removeItem(`tutorial_completed_${user.uid}`);

      setUser((prev: any) => ({
        ...prev,
        hasCompletedTutorial: false,
      }));

      console.log('Tutorial reset successfully');
    } catch (error) {
      console.error('Error resetting tutorial:', error);
    }
  }, [user?.uid, setUser, resetTutorialFlow]);

  const triggerTutorial = useCallback(() => {
    resetTutorialFlow();
    setShowTutorial(true);
  }, [resetTutorialFlow]);

  const triggerTutorialFromOnboarding = useCallback((subjectId: string) => {
    setTutorialFlow('from-onboarding');
    setHubSubjectId(subjectId);
    setHubTourPhase('pick-subject');
    setShowTutorial(true);
  }, []);

  return (
    <TutorialContext.Provider
      value={{
        showTutorial,
        setShowTutorial: (show) => {
          if (!show) resetTutorialFlow();
          setShowTutorial(show);
        },
        hasCompletedTutorial,
        completeTutorial,
        resetTutorial,
        triggerTutorial,
        triggerTutorialFromOnboarding,
        tutorialFlow,
        hubSubjectId,
        hubTourPhase,
        setHubTourPhase,
        hubTourAdvanceSignal,
        signalHubTourAdvance,
        hubContentType,
        setHubContentType,
        isLoading,
      }}
    >
      {children}
    </TutorialContext.Provider>
  );
}

export function useTutorialContext() {
  const context = useContext(TutorialContext);
  if (!context) {
    throw new Error('useTutorialContext must be used within a TutorialProvider');
  }
  return context;
}
