import { useContext, useEffect, useMemo, useState } from "react";
import { arrayUnion, doc, getDoc, setDoc } from "firebase/firestore";
import { db, auth } from "../../../firebase";
import { UserContext } from "../../context/UserContext";
import { useTutorialContext } from "../../context/TutorialContext";

export const OPEN_RELEASE_NOTES_EVENT = "open-release-notes";

const RELEASE_VERSION = "0.10.0";
const RELEASE_TITLE = "Beta Release Version: 0.10.0";

const RELEASE_CONTENT = {
  intro: "We've brought some cool new features to CertChamps for you try:",
  newBetaFeatures: [
    "AI corrections: use CertChamps' AI to get personalized corrections on your workings",
    "Progress Page: Customisable progress page that you can show your friends",
    "Mark as Complete: you can now mark your questions as complete and track you progress",
    "Calculator: Casio style calculator integrated into the practice workflow",
  ],
  smallUpdates: [
    "Added undo/redo button to whiteboard",
    "Change point erase to stroke eraser",
    "Changed Laptop/Tablet Mode button to be a Whiteboard toggle button",
  ],
  bugFixes: [
    "UI bugs fixed throughout",
    "Randomize, Topics, and Search now stay within subject and level for focus.",
  ],
  outro: "Enjoy! If you have feedback, make sure to leave a message in the feedback. New Beta features may behave unpredictably, so if you see any bugs please report them in the feedback as well!",
};

function getLocalSeenKey(uid: string) {
  return `release_notes_seen_${uid}_${RELEASE_VERSION}`;
}

export default function ReleaseNotesPrompt() {
  const { user, setUser } = useContext(UserContext);
  const { hasCompletedTutorial, triggerTutorial, showTutorial, setShowTutorial } = useTutorialContext();
  const [showPrompt, setShowPrompt] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const canCheck = useMemo(() => {
    if (!user?.uid) return false;
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) return false;

    const isEmailPasswordUser = firebaseUser.providerData.some(
      (provider) => provider.providerId === "password"
    );

    return !isEmailPasswordUser || firebaseUser.emailVerified;
  }, [user?.uid]);

  useEffect(() => {
    const checkReleaseNotesStatus = async () => {
      if (!canCheck) {
        setShowPrompt(false);
        setCheckingStatus(false);
        return;
      }

      if (!user?.username || user.username.trim().length < 1) {
        setShowPrompt(false);
        setCheckingStatus(false);
        return;
      }

      try {
        const localSeen = localStorage.getItem(getLocalSeenKey(user.uid));
        if (localSeen === "true") {
          setShowPrompt(false);
          setCheckingStatus(false);
          return;
        }

        const fromContext = Array.isArray(user.releaseNotesSeenVersions)
          ? user.releaseNotesSeenVersions
          : [];

        if (fromContext.includes(RELEASE_VERSION)) {
          localStorage.setItem(getLocalSeenKey(user.uid), "true");
          setShowPrompt(false);
          setCheckingStatus(false);
          return;
        }

        const userDoc = await getDoc(doc(db, "user-data", user.uid));
        const userData = userDoc.exists() ? userDoc.data() : {};
        const seenVersions = Array.isArray(userData.releaseNotesSeenVersions)
          ? userData.releaseNotesSeenVersions
          : [];

        if (seenVersions.includes(RELEASE_VERSION)) {
          localStorage.setItem(getLocalSeenKey(user.uid), "true");
          setUser((prev: any) => ({
            ...prev,
            releaseNotesSeenVersions: seenVersions,
          }));
          setShowPrompt(false);
        } else {
          if (showTutorial) {
            setShowTutorial(false);
          }
          setShowPrompt(true);
        }
      } catch (error) {
        console.error("Error checking release notes status:", error);
        setShowPrompt(false);
      } finally {
        setCheckingStatus(false);
      }
    };

    checkReleaseNotesStatus();
  }, [canCheck, user?.uid, user?.username, user?.releaseNotesSeenVersions, setShowTutorial, showTutorial, setUser]);

  useEffect(() => {
    const handleOpenReleaseNotes = () => {
      setCheckingStatus(false);
      if (showTutorial) {
        setShowTutorial(false);
      }
      setShowPrompt(true);
    };

    window.addEventListener(OPEN_RELEASE_NOTES_EVENT, handleOpenReleaseNotes);
    return () => {
      window.removeEventListener(OPEN_RELEASE_NOTES_EVENT, handleOpenReleaseNotes);
    };
  }, [setShowTutorial, showTutorial]);

  const dismissReleaseNotes = async () => {
    if (!user?.uid || isSaving) return;

    setIsSaving(true);
    try {
      await setDoc(
        doc(db, "user-data", user.uid),
        {
          releaseNotesSeenVersions: arrayUnion(RELEASE_VERSION),
          latestReleaseNotesSeen: RELEASE_VERSION,
        },
        { merge: true }
      );

      localStorage.setItem(getLocalSeenKey(user.uid), "true");
      setUser((prev: any) => {
        const existing = Array.isArray(prev?.releaseNotesSeenVersions)
          ? prev.releaseNotesSeenVersions
          : [];

        if (existing.includes(RELEASE_VERSION)) return prev;

        return {
          ...prev,
          releaseNotesSeenVersions: [...existing, RELEASE_VERSION],
        };
      });

      setShowPrompt(false);

      const localTutorialCompleted = localStorage.getItem(`tutorial_completed_${user.uid}`) === "true";
      const userMarkedComplete = user?.hasCompletedTutorial === true;

      if (!hasCompletedTutorial && !userMarkedComplete && !localTutorialCompleted) {
        setTimeout(() => {
          triggerTutorial();
        }, 250);
      }
    } catch (error) {
      console.error("Error saving release notes state:", error);
    } finally {
      setIsSaving(false);
    }
  };

  if (checkingStatus || !showPrompt) return null;

  return (
    <div className="absolute inset-0 z-[120] flex items-center justify-center bg-black/55 p-4">
      <div className="color-bg color-shadow w-full max-w-3xl rounded-out border-2 p-6 max-h-[85vh] overflow-y-auto">
        <h2 className="txt-heading-colour text-xl">{RELEASE_TITLE}</h2>
        <p className="txt color-txt-sub mt-3">{RELEASE_CONTENT.intro}</p>

        <div className="mt-5">
          <h3 className="txt-heading-colour text-lg">New Beta Features:</h3>
          <ul className="list-disc pl-5 mt-2 space-y-2 color-txt-main">
            {RELEASE_CONTENT.newBetaFeatures.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </div>

        <div className="mt-5">
          <h3 className="txt-heading-colour text-lg">Small Updates:</h3>
          <ul className="list-disc pl-5 mt-2 space-y-2 color-txt-main">
            {RELEASE_CONTENT.smallUpdates.map((update) => (
              <li key={update}>{update}</li>
            ))}
          </ul>
        </div>

        <div className="mt-5">
          <h3 className="txt-heading-colour text-lg">Bug Fixes:</h3>
          <ul className="list-disc pl-5 mt-2 space-y-2 color-txt-main">
            {RELEASE_CONTENT.bugFixes.map((fix) => (
              <li key={fix}>{fix}</li>
            ))}
          </ul>
        </div>

        <p className="txt color-txt-sub mt-5">{RELEASE_CONTENT.outro}</p>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            className="blue-btn text-center"
            onClick={dismissReleaseNotes}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Looks good!"}
          </button>
        </div>
      </div>
    </div>
  );
}
