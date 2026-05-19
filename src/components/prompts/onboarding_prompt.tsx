import { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LuBookOpen, LuChevronRight, LuSearch, LuStar } from "react-icons/lu";
import crownLogo from "../../assets/logo.png";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../../../firebase";
import {
  PRACTICE_HUB_SUBJECTS,
  setFavouriteSubjectIds,
} from "../../data/practiceHubSubjects";
import { useOnboardingContext } from "../../context/OnboardingContext";
import { useTutorialContext } from "../../context/TutorialContext";
import { UserContext } from "../../context/UserContext";
import "../../styles/onboarding.css";

const POPULAR_SUBJECT_IDS = [
  "mathematics",
  "english",
  "irish",
  "biology",
  "chemistry",
  "physics",
  "business",
  "accounting",
  "geography",
  "applied-mathematics",
] as const;

const STEPS = ["welcome", "subjects", "ready"] as const;
type Step = (typeof STEPS)[number];

export default function OnboardingPrompt() {
  const { user } = useContext(UserContext);
  const { showOnboarding, completeOnboarding } = useOnboardingContext();
  const { triggerTutorialFromOnboarding } = useTutorialContext();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("welcome");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!showOnboarding) return;
    setStep("welcome");
    setSearch("");
    setSelectedIds([]);
    setError("");
  }, [showOnboarding]);

  const stepIndex = STEPS.indexOf(step);

  const filteredSubjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return PRACTICE_HUB_SUBJECTS;
    return PRACTICE_HUB_SUBJECTS.filter((s) => s.label.toLowerCase().includes(q));
  }, [search]);

  const popularSubjects = useMemo(
    () =>
      POPULAR_SUBJECT_IDS.map((id) => PRACTICE_HUB_SUBJECTS.find((s) => s.id === id)).filter(
        (s): s is (typeof PRACTICE_HUB_SUBJECTS)[number] => !!s
      ),
    []
  );

  const toggleSubject = (id: string) => {
    setError("");
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const finish = async (startTour: boolean) => {
    if (selectedIds.length > 0) {
      setFavouriteSubjectIds(selectedIds);
    }

    if (user?.uid) {
      await setDoc(
        doc(db, "user-data", user.uid),
        { tutorialOfferDeclined: !startTour },
        { merge: true }
      );
    }

    await completeOnboarding();
    if (startTour && selectedIds.length > 0) {
      triggerTutorialFromOnboarding(selectedIds[0]);
      navigate("/practice");
    }
  };

  const handleSubjectsNext = () => {
    if (selectedIds.length < 1) {
      setError("Pick at least one subject to continue.");
      return;
    }
    setError("");
    setStep("ready");
  };

  if (!showOnboarding || !user?.uid) return null;

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">
        <div className="onboarding-card__header">
          <div className="onboarding-steps" aria-hidden>
            {STEPS.map((s, i) => (
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

          {step === "welcome" && (
            <>
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
                CertChamps helps Leaving Cert students practice past papers with AI
                feedback, progress tracking, and an exam-style workspace. Let&apos;s set
                up your subjects so you can jump straight in.
              </p>
            </>
          )}

          {step === "subjects" && (
            <>
              <h1 className="txt-heading-colour text-2xl font-bold mb-1">Your subjects</h1>
              <p className="txt color-txt-sub mb-0">
                Star the subjects you&apos;re studying. They&apos;ll appear on your Practice
                Hub home screen.
              </p>
            </>
          )}

          {step === "ready" && (
            <>
              <div className="flex items-center gap-3 mb-2">
                <LuBookOpen size={28} className="color-txt-accent shrink-0" aria-hidden />
                <h1 className="txt-heading-colour text-2xl font-bold">You&apos;re all set</h1>
              </div>
              <p className="txt color-txt-sub leading-relaxed">
                Head to the Practice Hub to browse past papers for{" "}
                {selectedIds.length === 1 ? "your subject" : "your subjects"}. You can
                favourite more subjects any time from the subject picker.
              </p>
            </>
          )}
        </div>

        {step === "subjects" && (
          <div className="onboarding-card__body">
            <div className="flex items-center txtbox color-bg w-full mb-3">
              <LuSearch size={16} className="color-txt-sub shrink-0 ml-1" aria-hidden />
              <input
                type="search"
                className="w-full p-1 outline-none border-none color-txt-main bg-transparent"
                placeholder="Search subjects…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {!search.trim() && (
              <>
                <p className="onboarding-popular-label">Popular</p>
                <div className="onboarding-subject-grid mb-4">
                  {popularSubjects.map((s) => (
                    <SubjectChip
                      key={s.id}
                      id={s.id}
                      label={s.label}
                      selected={selectedIds.includes(s.id)}
                      onToggle={toggleSubject}
                    />
                  ))}
                </div>
                <p className="onboarding-popular-label">All subjects</p>
              </>
            )}

            <div className="onboarding-subject-grid">
              {filteredSubjects.map((s) => (
                <SubjectChip
                  key={s.id}
                  id={s.id}
                  label={s.label}
                  selected={selectedIds.includes(s.id)}
                  onToggle={toggleSubject}
                />
              ))}
            </div>

            {filteredSubjects.length === 0 && (
              <p className="txt color-txt-sub text-center py-6">No subjects match your search.</p>
            )}

            {error && <p className="txt color-txt-accent mt-3">{error}</p>}
          </div>
        )}

        <div className="onboarding-card__footer">
          <div className="txt color-txt-sub text-sm">
            {step === "subjects" && selectedIds.length > 0 && (
              <span>
                {selectedIds.length} selected
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {step === "welcome" && (
              <>
                <button
                  type="button"
                  className="px-4 py-2 rounded-out color-bg-grey-5 txt"
                  onClick={() => void finish(false)}
                >
                  Skip
                </button>
                <button
                  type="button"
                  className="blue-btn px-5 py-2 font-semibold whitespace-nowrap min-w-[8.5rem]"
                  onClick={() => setStep("subjects")}
                >
                  Get started
                </button>
              </>
            )}

            {step === "subjects" && (
              <>
                <button
                  type="button"
                  className="px-4 py-2 rounded-out color-bg-grey-5 txt"
                  onClick={() => setStep("welcome")}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="blue-btn px-4 py-2 flex items-center gap-1.5"
                  onClick={handleSubjectsNext}
                >
                  Continue
                  <LuChevronRight size={16} aria-hidden />
                </button>
              </>
            )}

            {step === "ready" && (
              <>
                <button
                  type="button"
                  className="px-4 py-2 rounded-out color-bg-grey-5 txt"
                  onClick={() => void finish(false)}
                >
                  Explore on my own
                </button>
                <button
                  type="button"
                  className="blue-btn px-4 py-2"
                  onClick={() => void finish(true)}
                >
                  Take the tour
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SubjectChip({
  id,
  label,
  selected,
  onToggle,
}: {
  id: string;
  label: string;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className={`onboarding-subject-chip ${selected ? "onboarding-subject-chip--selected" : ""}`}
      onClick={() => onToggle(id)}
      aria-pressed={selected}
    >
      <LuStar
        size={14}
        className={selected ? "color-txt-accent shrink-0" : "color-txt-sub shrink-0 opacity-50"}
        aria-hidden
      />
      <span className="onboarding-subject-chip__label">{label}</span>
    </button>
  );
}
