import { useContext, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LuSearch } from "react-icons/lu";
import crownLogo from "../../assets/logo.png";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../../../firebase";
import { useOnboardingContext } from "../../context/OnboardingContext";
import { useTutorialContext } from "../../context/TutorialContext";
import { UserContext } from "../../context/UserContext";
import {
  POPULAR_ONBOARDING_SUBJECT_IDS,
  PRACTICE_HUB_SUBJECTS,
  setFavouriteSubjectIds,
} from "../../data/practiceHubSubjects";
import "../../styles/onboarding.css";

const ONBOARDING_STEPS = ["welcome", "subject", "predictions"] as const;
type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export default function OnboardingPrompt() {
  const { user } = useContext(UserContext);
  const { showOnboarding, completeOnboarding, setShowOnboarding } = useOnboardingContext();
  const { triggerTutorialFromOnboarding } = useTutorialContext();
  const navigate = useNavigate();

  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [subjectSearch, setSubjectSearch] = useState("");

  const stepIndex = ONBOARDING_STEPS.indexOf(step);

  const popularSubjects = useMemo(
    () =>
      POPULAR_ONBOARDING_SUBJECT_IDS.map((id) =>
        PRACTICE_HUB_SUBJECTS.find((s) => s.id === id)
      ).filter((s): s is (typeof PRACTICE_HUB_SUBJECTS)[number] => s != null),
    []
  );

  const filteredSubjects = useMemo(() => {
    const q = subjectSearch.trim().toLowerCase();
    if (!q) return PRACTICE_HUB_SUBJECTS;
    return PRACTICE_HUB_SUBJECTS.filter(
      (s) => s.label.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)
    );
  }, [subjectSearch]);

  const selectedSubjectLabel = useMemo(
    () => PRACTICE_HUB_SUBJECTS.find((s) => s.id === selectedSubjectId)?.label,
    [selectedSubjectId]
  );

  const finish = async (startTour: boolean) => {
    if (user?.uid) {
      await setDoc(
        doc(db, "user-data", user.uid),
        { tutorialOfferDeclined: !startTour },
        { merge: true }
      );
    }

    if (startTour && selectedSubjectId) {
      setFavouriteSubjectIds([selectedSubjectId]);
    }

    // Hide onboarding immediately so the predictions tour does not stack on top.
    setShowOnboarding(false);

    await completeOnboarding();

    if (startTour && selectedSubjectId) {
      triggerTutorialFromOnboarding(selectedSubjectId);
      navigate("/practice");
    }
  };

  if (!showOnboarding || !user?.uid) return null;

  const displayName = user.username?.trim() || "there";

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">
        <div className="onboarding-card__header">
          <div className="onboarding-steps" aria-hidden>
            {ONBOARDING_STEPS.map((s, i) => (
              <div
                key={s}
                className={`onboarding-step-dot ${
                  i === stepIndex
                    ? "onboarding-step-dot--active"
                    : i < stepIndex
                      ? "onboarding-step-dot--done"
                      : ""
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-3 mb-2">
            <img
              src={crownLogo}
              alt=""
              className="shrink-0 w-7 h-7 object-contain"
              aria-hidden
            />
            {step === "welcome" && (
              <h1 className="txt-heading-colour text-2xl font-bold">
                Welcome, {displayName}!
              </h1>
            )}
            {step === "subject" && (
              <h1 className="txt-heading-colour text-2xl font-bold">
                Pick your subject
              </h1>
            )}
            {step === "predictions" && (
              <h1 className="txt-heading-colour text-2xl font-bold">
                Let&apos;s create a prediction
              </h1>
            )}
          </div>

          {step === "welcome" && (
            <p className="txt color-txt-sub leading-relaxed">
              CertChamps helps Leaving Cert students practice with AI feedback, exam
              predictions, and an exam-style workspace. We&apos;ll get you set up in just
              a moment.
            </p>
          )}

          {step === "subject" && (
            <p className="txt color-txt-sub leading-relaxed">
              Which subject are you studying? We&apos;ll tailor your Practice Hub to it.
            </p>
          )}

          {step === "predictions" && (
            <p className="txt color-txt-sub leading-relaxed">
              So you must be here for predictions — let&apos;s create your first one
              {selectedSubjectLabel ? ` for ${selectedSubjectLabel}` : ""}. We&apos;ll walk
              you through the Practice Hub, then show you how to practice.
            </p>
          )}
        </div>

        {step === "subject" && (
          <div className="onboarding-card__body">
            <p className="onboarding-popular-label">Popular subjects</p>
            <div className="onboarding-subject-grid mb-4">
              {popularSubjects.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`onboarding-subject-chip ${
                    selectedSubjectId === s.id ? "onboarding-subject-chip--selected" : ""
                  }`}
                  onClick={() => setSelectedSubjectId(s.id)}
                >
                  <span className="onboarding-subject-chip__label">{s.label}</span>
                </button>
              ))}
            </div>

            <label className="sr-only" htmlFor="onboarding-subject-search">
              Search all subjects
            </label>
            <div className="relative mb-3">
              <LuSearch
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 color-txt-sub pointer-events-none"
                aria-hidden
              />
              <input
                id="onboarding-subject-search"
                type="search"
                className="w-full pl-10 pr-3 py-2 rounded-out border color-bg-grey-5 txt"
                placeholder="Search all subjects…"
                value={subjectSearch}
                onChange={(e) => setSubjectSearch(e.target.value)}
              />
            </div>

            <div className="onboarding-subject-grid">
              {filteredSubjects.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`onboarding-subject-chip ${
                    selectedSubjectId === s.id ? "onboarding-subject-chip--selected" : ""
                  }`}
                  onClick={() => setSelectedSubjectId(s.id)}
                >
                  <span className="onboarding-subject-chip__label">{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="onboarding-card__footer">
          <div className="txt color-txt-sub text-sm">
            {step === "subject" && selectedSubjectLabel
              ? `Selected: ${selectedSubjectLabel}`
              : null}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            {step !== "welcome" && (
              <button
                type="button"
                className="px-4 py-2 rounded-out color-bg-grey-5 txt"
                onClick={() =>
                  setStep(step === "predictions" ? "subject" : "welcome")
                }
              >
                Back
              </button>
            )}
            <button
              type="button"
              className="px-4 py-2 rounded-out color-bg-grey-5 txt"
              onClick={() => void finish(false)}
            >
              Skip tour
            </button>
            {step === "welcome" && (
              <button
                type="button"
                className="blue-btn px-5 py-2 font-semibold whitespace-nowrap min-w-[8.5rem]"
                onClick={() => setStep("subject")}
              >
                Continue
              </button>
            )}
            {step === "subject" && (
              <button
                type="button"
                className="blue-btn px-5 py-2 font-semibold whitespace-nowrap min-w-[8.5rem]"
                disabled={!selectedSubjectId}
                onClick={() => setStep("predictions")}
              >
                Continue
              </button>
            )}
            {step === "predictions" && (
              <button
                type="button"
                className="blue-btn px-5 py-2 font-semibold whitespace-nowrap min-w-[8.5rem]"
                disabled={!selectedSubjectId}
                onClick={() => void finish(true)}
              >
                Let&apos;s go
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
