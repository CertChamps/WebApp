import { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, updateDoc } from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";
import { db } from "../../../firebase";
import { UserContext } from "../../context/UserContext";
import OnboardingShell from "../../components/onboarding/OnboardingShell";
import OnboardingSubjectPicker from "../../components/onboarding/OnboardingSubjectPicker";
import OnboardingProfileStep from "../../components/onboarding/OnboardingProfileStep";
import { setFavouriteSubjectIds } from "../../data/practiceHubSubjects";
import { revokeProfileImagePreview } from "../../lib/profileImage";

type Step = 1 | 2 | 3 | 4;

type Props = {
  isReplay?: boolean;
  returnTo?: string;
};

const TOTAL_STEPS = 4;

function validateUsername(value: string): string | null {
  const username = value.trim();
  if (username.length < 2) return "Username must be at least 2 characters.";
  if (username.length > 20) return "Username must be 20 characters or fewer.";
  return null;
}

export default function OnboardingFlow({
  isReplay = false,
  returnTo = "/user/settings",
}: Props) {
  const { user, setUser } = useContext(UserContext);
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(user.studyingSubjects ?? []);
  const [username, setUsername] = useState(user.username ?? "");
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null);
  const [croppedPreviewUrl, setCroppedPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      revokeProfileImagePreview(croppedPreviewUrl);
    };
  }, [croppedPreviewUrl]);

  const exitFlow = () => {
    navigate(isReplay ? returnTo : "/practice", { replace: !isReplay });
  };

  const handleCroppedBlobChange = (blob: Blob | null, previewUrl: string | null) => {
    setCroppedBlob(blob);
    setCroppedPreviewUrl(previewUrl);
    setError("");
  };

  const saveProfile = async () => {
    if (!user.uid) return;

    const usernameError = validateUsername(username);
    if (usernameError) {
      setError(usernameError);
      return;
    }

    // First-time onboarding requires a new profile picture; replay can keep the existing one.
    if (!croppedBlob && !isReplay) {
      setError("Please add a profile picture to continue.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const trimmedUsername = username.trim();
      const updates: { username: string; picture?: string } = {
        username: trimmedUsername,
      };

      let pictureUrl = user.picture;

      if (croppedBlob) {
        const storage = getStorage();
        const path = `profile-photos/${user.uid}.jpg`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, croppedBlob);
        pictureUrl = await getDownloadURL(storageRef);
        updates.picture = path;
      }

      await updateDoc(doc(db, "user-data", user.uid), updates);
      setUser((prev: typeof user) => ({
        ...prev,
        username: trimmedUsername,
        picture: pictureUrl,
      }));
      setStep(3);
    } catch (err) {
      console.error("Failed to save profile:", err);
      setError("Could not save your profile. Please try again.");
    } finally {
      setSaving(false);
    }
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
      setStep(4);
    } catch (err) {
      console.error("Failed to save subjects:", err);
      setError("Could not save your subjects. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const completeOnboarding = async () => {
    if (!user.uid) return;

    if (isReplay) {
      exitFlow();
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
      navigate("/practice", { replace: true });
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
        totalSteps={TOTAL_STEPS}
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
    const usernameError = validateUsername(username);
    const canContinue =
      !saving && !usernameError && (Boolean(croppedBlob) || isReplay);

    return (
      <OnboardingShell
        step={2}
        totalSteps={TOTAL_STEPS}
        title="Set up your profile"
        subtitle="Choose a username and profile picture so friends can recognise you."
        footer={
          <>
            {error && !usernameError ? (
              <p className="text-red text-center text-sm mb-2">{error}</p>
            ) : null}
            <button
              type="button"
              className={`blue-btn w-full text-center ${canContinue ? "" : "opacity-50 pointer-events-none"}`}
              disabled={!canContinue}
              onClick={() => void saveProfile()}
            >
              {saving ? "Saving…" : "Continue"}
            </button>
            {cancelAction}
          </>
        }
      >
        <OnboardingProfileStep
          username={username}
          onUsernameChange={(value) => {
            setUsername(value);
            setError("");
          }}
          currentPictureUrl={user.picture}
          croppedPreviewUrl={croppedPreviewUrl}
          onCroppedBlobChange={handleCroppedBlobChange}
          error={error && usernameError ? error : undefined}
        />
      </OnboardingShell>
    );
  }

  if (step === 3) {
    const canContinue = selectedSubjects.length > 0 && !saving;

    return (
      <OnboardingShell
        step={3}
        totalSteps={TOTAL_STEPS}
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
      step={4}
      totalSteps={TOTAL_STEPS}
      title="You're ready to go!"
      subtitle={
        isReplay
          ? "That's the onboarding flow. Your profile and subjects stay saved if you updated them above."
          : "Your profile and Practice Hub are set up. Start practicing whenever you're ready."
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
            {isReplay ? "Done" : saving ? "Starting…" : "Start Practicing"}
          </button>
          {cancelAction}
        </>
      }
    />
  );
}
