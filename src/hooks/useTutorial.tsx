import { useState, useEffect, useContext, useCallback } from 'react';
import { UserContext } from '../context/UserContext';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';

type UseTutorialReturn = {
  showTutorial: boolean;
  setShowTutorial: (show: boolean) => void;
  hasCompletedTutorial: boolean;
  completeTutorial: () => Promise<void>;
  resetTutorial: () => Promise<void>;
  triggerTutorial: () => void;
  isLoading: boolean;
};

export default function useTutorial(): UseTutorialReturn {
  const { user, setUser } = useContext(UserContext);
  const [showTutorial, setShowTutorial] = useState(false);
  const [hasCompletedTutorial, setHasCompletedTutorial] = useState(true); // Default true to prevent flash
  const [isLoading, setIsLoading] = useState(true);

  // Check if user has completed the tutorial on mount
  useEffect(() => {
    const checkTutorialStatus = async () => {
      if (!user?.uid) {
        setIsLoading(false);
        return;
      }

      try {
        // First check local storage for quick access
        const localTutorialStatus = localStorage.getItem(`tutorial_completed_${user.uid}`);
        
        if (localTutorialStatus === 'true') {
          setHasCompletedTutorial(true);
          setIsLoading(false);
          return;
        }

        // If not in local storage, check Firestore
        const userDoc = await getDoc(doc(db, 'user-data', user.uid));
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const completed = userData.hasCompletedTutorial ?? false;
          
          setHasCompletedTutorial(completed);
          
          // Cache in local storage
          if (completed) {
            localStorage.setItem(`tutorial_completed_${user.uid}`, 'true');
          }
          
          // Show tutorial if not completed
          if (!completed) {
            // Small delay to let the UI settle
            setTimeout(() => {
              setShowTutorial(true);
            }, 500);
          }
        } else {
          // New user - show tutorial
          setHasCompletedTutorial(false);
          setTimeout(() => {
            setShowTutorial(true);
          }, 500);
        }
      } catch (error) {
        console.error('Error checking tutorial status:', error);
        setHasCompletedTutorial(true); // Default to true on error
      } finally {
        setIsLoading(false);
      }
    };

    checkTutorialStatus();
  }, [user?.uid]);

  // Complete the tutorial
  const completeTutorial = useCallback(async () => {
    if (!user?.uid) return;

    try {
      // Update Firestore
      await setDoc(
        doc(db, 'user-data', user.uid),
        { hasCompletedTutorial: true },
        { merge: true }
      );

      // Update local state
      setHasCompletedTutorial(true);
      setShowTutorial(false);

      // Cache in local storage
      localStorage.setItem(`tutorial_completed_${user.uid}`, 'true');

      // Update user context if needed
      setUser((prev: any) => ({
        ...prev,
        hasCompletedTutorial: true,
      }));

      console.log('Tutorial completed successfully');
    } catch (error) {
      console.error('Error completing tutorial:', error);
    }
  }, [user?.uid, setUser]);

  // Reset the tutorial (for admins or testing)
  const resetTutorial = useCallback(async () => {
    if (!user?.uid) return;

    try {
      // Update Firestore
      await setDoc(
        doc(db, 'user-data', user.uid),
        { hasCompletedTutorial: false },
        { merge: true }
      );

      // Update local state
      setHasCompletedTutorial(false);

      // Remove from local storage
      localStorage.removeItem(`tutorial_completed_${user.uid}`);

      // Update user context
      setUser((prev: any) => ({
        ...prev,
        hasCompletedTutorial: false,
      }));

      console.log('Tutorial reset successfully');
    } catch (error) {
      console.error('Error resetting tutorial:', error);
    }
  }, [user?.uid, setUser]);

  // Manually trigger the tutorial (for settings button)
  const triggerTutorial = useCallback(() => {
    setShowTutorial(true);
  }, []);

  return {
    showTutorial,
    setShowTutorial,
    hasCompletedTutorial,
    completeTutorial,
    resetTutorial,
    triggerTutorial,
    isLoading,
  };
}
