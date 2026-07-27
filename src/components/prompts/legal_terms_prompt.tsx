import { useContext, useEffect, useState } from "react";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { LuFileCheck2 } from "react-icons/lu";
import { db } from "../../../firebase";
import { UserContext } from "../../context/UserContext";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  PRIVACY_URL,
  TERMS_URL,
  hasAcceptedCurrentLegalTerms,
} from "../../lib/legal";

export default function LegalTermsPrompt() {
  const { user, setUser } = useContext(UserContext);
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const needsAcceptance = Boolean(user?.uid) && !hasAcceptedCurrentLegalTerms(user);

  useEffect(() => {
    setAccepted(false);
    setError("");
  }, [user?.uid, user?.termsVersion, user?.privacyVersion]);

  if (!needsAcceptance) return null;

  const handleAccept = async () => {
    if (!accepted || saving || !user?.uid) return;
    setSaving(true);
    setError("");
    try {
      await setDoc(doc(db, "user-data", user.uid), {
        termsVersion: CURRENT_TERMS_VERSION,
        termsAcceptedAt: serverTimestamp(),
        privacyVersion: CURRENT_PRIVACY_VERSION,
        privacyAcknowledgedAt: serverTimestamp(),
      }, { merge: true });
      setUser((current: any) => ({
        ...current,
        termsVersion: CURRENT_TERMS_VERSION,
        privacyVersion: CURRENT_PRIVACY_VERSION,
      }));
    } catch (err) {
      console.error("Could not record legal acceptance:", err);
      setError("Couldn’t save your acceptance. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/45 px-5 py-8 backdrop-blur-sm">
      <section
        className="w-full max-w-md rounded-out border-2 color-shadow color-bg p-7 shadow-xl sm:p-8"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-terms-title"
        aria-describedby="legal-terms-description"
      >
        <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl color-bg-accent color-txt-accent">
          <LuFileCheck2 size={21} aria-hidden />
        </span>
        <h2 id="legal-terms-title" className="text-2xl font-bold color-txt-main">
          Before you continue
        </h2>
        <p id="legal-terms-description" className="mt-2 text-sm leading-relaxed color-txt-sub">
          Please review and accept the current CertChamps Terms of Service. We’ve also linked our
          Privacy Policy so you can see how your information is handled.
        </p>

        <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl color-bg-grey-5 p-4 text-sm leading-relaxed color-txt-main">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--theme-txt-accent)]"
          />
          <span>
            I agree to the{" "}
            <a
              href={TERMS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold color-txt-accent underline underline-offset-2"
              onClick={(event) => event.stopPropagation()}
            >
              Terms of Service
            </a>{" "}
            and acknowledge the{" "}
            <a
              href={PRIVACY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold color-txt-accent underline underline-offset-2"
              onClick={(event) => event.stopPropagation()}
            >
              Privacy Policy
            </a>
            .
          </span>
        </label>

        {error && (
          <p className="mt-3 text-sm text-red" role="alert">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleAccept}
          disabled={!accepted || saving}
          className="mt-5 w-full rounded-xl px-5 py-3 text-sm font-bold color-bg-accent color-txt-accent transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {saving ? "Saving…" : "Agree and continue"}
        </button>
      </section>
    </div>
  );
}
