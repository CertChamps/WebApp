import { useContext } from "react";
import { useNavigate } from "react-router-dom";
import crownLogo from "../../assets/logo.png";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../../../firebase";
import { useOnboardingContext } from "../../context/OnboardingContext";
import { useTutorialContext } from "../../context/TutorialContext";
import { UserContext } from "../../context/UserContext";
import "../../styles/onboarding.css";

export default function OnboardingPrompt() {
  const { user } = useContext(UserContext);
  const { showOnboarding, completeOnboarding } = useOnboardingContext();
  const { triggerTutorialFromOnboarding } = useTutorialContext();
  const navigate = useNavigate();

  const finish = async (startTour: boolean) => {
    if (user?.uid) {
      await setDoc(
        doc(db, "user-data", user.uid),
        { tutorialOfferDeclined: !startTour },
        { merge: true }
      );
    }

    await completeOnboarding();
    if (startTour) {
      triggerTutorialFromOnboarding();
      navigate("/practice");
    }
  };

  if (!showOnboarding || !user?.uid) return null;

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">
        <div className="onboarding-card__header">
          <div className="onboarding-steps" aria-hidden>
            <div className="onboarding-step-dot onboarding-step-dot--active" />
          </div>

          <div className="flex items-center gap-3 mb-2">
            <img
              src={crownLogo}
              alt=""
              className="shrink-0 w-7 h-7 object-contain"
              aria-hidden
            />
            <h1 className="txt-heading-colour text-2xl font-bold">
              Welcome to CertChamps{user.username ? `, ${user.username}` : ""}!
            </h1>
          </div>
          <p className="txt color-txt-sub leading-relaxed">
            CertChamps helps Leaving Cert students practice with AI feedback, exam
            predictions, and an exam-style workspace. We&apos;ll show you how predictions
            work in the Practice Hub.
          </p>
        </div>

        <div className="onboarding-card__footer">
          <div className="txt color-txt-sub text-sm" />
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              className="px-4 py-2 rounded-out color-bg-grey-5 txt"
              onClick={() => void finish(false)}
            >
              Skip tour
            </button>
            <button
              type="button"
              className="blue-btn px-5 py-2 font-semibold whitespace-nowrap min-w-[8.5rem]"
              onClick={() => void finish(true)}
            >
              Get started
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
