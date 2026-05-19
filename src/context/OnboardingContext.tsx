import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { UserContext } from "./UserContext";
import { auth, db } from "../../firebase";
import { getFavouriteSubjectIds } from "../data/practiceHubSubjects";

type OnboardingContextType = {
  showOnboarding: boolean;
  setShowOnboarding: (show: boolean) => void;
  hasCompletedOnboarding: boolean;
  completeOnboarding: () => Promise<void>;
  resetOnboarding: () => Promise<void>;
  isLoading: boolean;
};

const OnboardingContext = createContext<OnboardingContextType | null>(null);

function getLocalOnboardingKey(uid: string) {
  return `onboarding_completed_${uid}`;
}

function isUserReadyForSetup(user: { uid?: string; username?: string } | null) {
  if (!user?.uid) return false;

  const firebaseUser = auth.currentUser;
  if (!firebaseUser) return false;

  const isEmailPasswordUser = firebaseUser.providerData.some(
    (provider) => provider.providerId === "password"
  );
  if (isEmailPasswordUser && !firebaseUser.emailVerified) return false;

  return !!(user.username && user.username.trim().length >= 1);
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { user, setUser } = useContext(UserContext);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkOnboardingStatus = async () => {
      if (!isUserReadyForSetup(user)) {
        setIsLoading(false);
        return;
      }

      try {
        const localCompleted = localStorage.getItem(getLocalOnboardingKey(user!.uid!));
        if (localCompleted === "true") {
          setHasCompletedOnboarding(true);
          setIsLoading(false);
          return;
        }

        const userDoc = await getDoc(doc(db, "user-data", user!.uid!));
        const userData = userDoc.exists() ? userDoc.data() : {};
        const explicitCompleted = userData.hasCompletedOnboarding;

        if (explicitCompleted === true) {
          setHasCompletedOnboarding(true);
          localStorage.setItem(getLocalOnboardingKey(user!.uid!), "true");
          setIsLoading(false);
          return;
        }

        // Legacy accounts: don't re-onboard users who already set up the app.
        const legacyCompleted =
          explicitCompleted === undefined &&
          (userData.hasCompletedTutorial === true ||
            getFavouriteSubjectIds().length > 0);

        if (legacyCompleted) {
          await setDoc(
            doc(db, "user-data", user!.uid!),
            { hasCompletedOnboarding: true },
            { merge: true }
          );
          setHasCompletedOnboarding(true);
          localStorage.setItem(getLocalOnboardingKey(user!.uid!), "true");
          setIsLoading(false);
          return;
        }

        setHasCompletedOnboarding(false);
        setTimeout(() => setShowOnboarding(true), 400);
      } catch (error) {
        console.error("[onboarding] status check failed", error);
        setHasCompletedOnboarding(true);
      } finally {
        setIsLoading(false);
      }
    };

    checkOnboardingStatus();
  }, [user?.uid, user?.username, user?.emailVerified]);

  const completeOnboarding = useCallback(async () => {
    if (!user?.uid) return;

    try {
      await setDoc(
        doc(db, "user-data", user.uid),
        { hasCompletedOnboarding: true },
        { merge: true }
      );

      setHasCompletedOnboarding(true);
      setShowOnboarding(false);
      localStorage.setItem(getLocalOnboardingKey(user.uid), "true");

      setUser((prev: Record<string, unknown>) => ({
        ...prev,
        hasCompletedOnboarding: true,
      }));
    } catch (error) {
      console.error("[onboarding] complete failed", error);
    }
  }, [user?.uid, setUser]);

  const resetOnboarding = useCallback(async () => {
    if (!user?.uid) return;

    try {
      await setDoc(
        doc(db, "user-data", user.uid),
        { hasCompletedOnboarding: false },
        { merge: true }
      );

      setHasCompletedOnboarding(false);
      setShowOnboarding(true);
      localStorage.removeItem(getLocalOnboardingKey(user.uid));

      setUser((prev: Record<string, unknown>) => ({
        ...prev,
        hasCompletedOnboarding: false,
      }));
    } catch (error) {
      console.error("[onboarding] reset failed", error);
    }
  }, [user?.uid, setUser]);

  return (
    <OnboardingContext.Provider
      value={{
        showOnboarding,
        setShowOnboarding,
        hasCompletedOnboarding,
        completeOnboarding,
        resetOnboarding,
        isLoading,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboardingContext() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error("useOnboardingContext must be used within an OnboardingProvider");
  }
  return context;
}
