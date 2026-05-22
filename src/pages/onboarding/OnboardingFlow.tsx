import { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../../firebase";
import { UserContext } from "../../context/UserContext";
import OnboardingShell from "../../components/onboarding/OnboardingShell";
import OnboardingSubjectPicker from "../../components/onboarding/OnboardingSubjectPicker";
import { setFavouriteSubjectIds } from "../../data/practiceHubSubjects";
import {
  getPracticeHubWithTutorialPath,
  markPendingPredictionTutorial,
} from "../../lib/predictionTutorial";

type Step = 1 | 2 | 3;

type Props = {
  isReplay?: boolean;
  returnTo?: string;
  includePredictionTutorial?: boolean;
};

export default function OnboardingFlow({
  isReplay = false,
  returnTo = "/user/settings",
  includePredictionTutorial = true,
}: Props) {
  const { user, setUser } = useContext(UserContext);
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(user.studyingSubjects ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const exitFlow = () => {
    navigate(isReplay ? returnTo : "/practice", { replace: !isReplay });
  };

  const saveSubjects = async () => {
    if (!user.uid || selectedSubjects.length === 0) return;

    setSaving(true);
    setError("");
    try {
      await updateDoc(doc(db, "user-data", user.uid), {
        studyingSubjects: selectedSubjects,
      });
      setFavouriteSubjectIds(selectedSubjects);
      setUser((prev: typeof user) => ({
        ...prev,
        studyingSubjects: selectedSubjects,
      }));
      setStep(3);
    } catch (err) {
      console.error("Failed to save subjects:", err);
      setError("Could not save your subjects. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const finishWithPredictionTutorial = () => {
    markPendingPredictionTutorial();
    navigate(getPracticeHubWithTutorialPath(), { replace: true });
  };

  const completeOnboarding = async () => {
    if (!user.uid) return;

    if (isReplay && !includePredictionTutorial) {
      exitFlow();
      return;
    }

    if (isReplay && includePredictionTutorial) {
      finishWithPredictionTutorial();
      return;
    }

    setSaving(true);
    setError("");
    try {
      await updateDoc(doc(db, "user-data", user.uid), {
        hasCompletedOnboarding: true,
      });
      setUser((prev: typeof user) => ({
        ...prev,
        hasCompletedOnboarding: true,
      }));
      finishWithPredictionTutorial();
    } catch (err) {
      console.error("Failed to complete onboarding:", err);
      setError("Something went wrong. Please try again.");
      setSaving(false);
    }
  };

  const cancelAction = isReplay ? (
    <button
      type="button"
      className="txt-sub color-txt-sub text-center w-full mt-3 hover:color-txt-accent transition-colors"
      onClick={() => navigate(returnTo)}
    >
      Back to settings
    </button>
  ) : null;

  if (step === 1) {
    return (
      <OnboardingShell
        step={1}
        title="Welcome to CertChamps"
        subtitle="Practice smarter, track your progress, and get help when you're stuck."
        footer={
          <>
            {error ? <p className="text-red text-center text-sm mb-2">{error}</p> : null}
            <button type="button" className="blue-btn w-full text-center" onClick={() => setStep(2)}>
              Continue
            </button>
            {cancelAction}
          </>
        }
      />
    );
  }

  if (step === 2) {
    const canContinue = selectedSubjects.length > 0 && !saving;

    return (
      <OnboardingShell
        step={2}
        title="What are you studying?"
        subtitle="Pick the subjects you're preparing for. You can change these later in Practice Hub."
        footer={
          <>
            {error ? <p className="text-red text-center text-sm mb-2">{error}</p> : null}
            <button
              type="button"
              className={`blue-btn w-full text-center ${canContinue ? "" : "opacity-50 pointer-events-none"}`}
              disabled={!canContinue}
              onClick={() => void saveSubjects()}
            >
              {saving ? "Saving…" : "Continue"}
            </button>
            {cancelAction}
          </>
        }
      >
        <OnboardingSubjectPicker selectedIds={selectedSubjects} onChange={setSelectedSubjects} />
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell
      step={3}
      title="You're ready to go!"
      subtitle={
        isReplay
          ? "That's the onboarding flow. Your subjects stay saved if you updated them above."
          : "Your Practice Hub is set up with your subjects. Start practicing whenever you're ready."
      }
      footer={
        <>
          {error ? <p className="text-red text-center text-sm mb-2">{error}</p> : null}
          <button
            type="button"
            className={`blue-btn w-full text-center ${saving ? "opacity-50 pointer-events-none" : ""}`}
            disabled={saving}
            onClick={() => void completeOnboarding()}
          >
            {isReplay && !includePredictionTutorial
              ? "Done"
              : saving
                ? "Starting…"
                : "Start Practicing"}
          </button>
          {cancelAction}
        </>
      }
    />
  );
}
