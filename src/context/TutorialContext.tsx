import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { UserContext } from './UserContext';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';

type TutorialContextType = {
  showTutorial: boolean;
  setShowTutorial: (show: boolean) => void;
  hasCompletedTutorial: boolean;
  completeTutorial: () => Promise<void>;
  resetTutorial: () => Promise<void>;
  triggerTutorial: () => void;
  isLoading: boolean;
};

const TutorialContext = createContext<TutorialContextType | null>(null);

export function TutorialProvider({ children }: { children: ReactNode }) {
  const { user, setUser } = useContext(UserContext);
  const [showTutorial, setShowTutorial] = useState(false);
  const [hasCompletedTutorial, setHasCompletedTutorial] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  // Check if user has completed the tutorial on mount
  useEffect(() => {
    const checkTutorialStatus = async () => {
      if (!user?.uid) {
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
          
          setHasCompletedTutorial(completed);
          
          if (completed) {
            localStorage.setItem(`tutorial_completed_${user.uid}`, 'true');
          }
          
          if (!completed) {
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
  }, [user?.uid]);

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
      localStorage.setItem(`tutorial_completed_${user.uid}`, 'true');

      setUser((prev: any) => ({
        ...prev,
        hasCompletedTutorial: true,
      }));

      console.log('Tutorial completed successfully');
    } catch (error) {
      console.error('Error completing tutorial:', error);
    }
  }, [user?.uid, setUser]);

  const resetTutorial = useCallback(async () => {
    if (!user?.uid) return;

    try {
      await setDoc(
        doc(db, 'user-data', user.uid),
        { hasCompletedTutorial: false },
        { merge: true }
      );

      setHasCompletedTutorial(false);
      localStorage.removeItem(`tutorial_completed_${user.uid}`);

      setUser((prev: any) => ({
        ...prev,
        hasCompletedTutorial: false,
      }));

      console.log('Tutorial reset successfully');
    } catch (error) {
      console.error('Error resetting tutorial:', error);
    }
  }, [user?.uid, setUser]);

  const triggerTutorial = useCallback(() => {
    setShowTutorial(true);
  }, []);

  return (
    <TutorialContext.Provider
      value={{
        showTutorial,
        setShowTutorial,
        hasCompletedTutorial,
        completeTutorial,
        resetTutorial,
        triggerTutorial,
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
