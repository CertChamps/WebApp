import { useState } from "react";
import type { FormEvent } from "react";
import { FirebaseError } from "firebase/app";
import { sendPasswordResetEmail } from "firebase/auth";
import { LuArrowLeft, LuCheck, LuMail } from "react-icons/lu";
import { useNavigate } from "react-router-dom";
import { auth } from "../../firebase";
import crown from "../assets/logo.png";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [generalError, setGeneralError] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim();
    setEmailError("");
    setGeneralError("");

    if (!normalizedEmail) {
      setEmailError("Enter your email address.");
      return;
    }

    setSending(true);
    try {
      auth.useDeviceLanguage();
      await sendPasswordResetEmail(auth, normalizedEmail);
      setSent(true);
    } catch (error) {
      const code = error instanceof FirebaseError ? error.code : "";

      if (code === "auth/invalid-email") {
        setEmailError("Enter a valid email address.");
      } else if (code === "auth/user-not-found") {
        // Use the same result as a real account so this page cannot be used
        // to discover which email addresses are registered.
        setSent(true);
      } else if (code === "auth/too-many-requests") {
        setGeneralError("Too many attempts. Please wait a little before trying again.");
      } else if (code === "auth/network-request-failed") {
        setGeneralError("Couldn’t connect. Check your internet connection and try again.");
      } else {
        setGeneralError("We couldn’t send the reset email. Please try again.");
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="flex min-h-full w-full items-center justify-center color-bg-grey-5 px-5 py-10">
      <section className="w-full max-w-md rounded-out border-2 color-shadow color-bg px-7 py-8 shadow-sm sm:px-10">
        <img src={crown} alt="" className="mx-auto mb-4 h-16 w-20 object-contain" />

        {sent ? (
          <div className="text-center" aria-live="polite">
            <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl color-bg-accent color-txt-accent">
              <LuCheck size={24} strokeWidth={2.5} aria-hidden />
            </span>
            <h1 className="text-2xl font-bold color-txt-main">Check your inbox</h1>
            <p className="mt-3 text-sm leading-relaxed color-txt-sub">
              If that address has a password-based CertChamps account, we’ve sent a password reset
              link.
            </p>
            <p className="mt-3 text-xs leading-relaxed color-txt-sub">
              Signed up with Google or Apple? Return to login and use the matching sign-in button.
            </p>
            <button
              type="button"
              onClick={() => navigate("/login", { replace: true })}
              className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold color-bg-accent color-txt-accent transition-opacity hover:opacity-85"
            >
              <LuArrowLeft size={17} aria-hidden />
              Return to login
            </button>
          </div>
        ) : (
          <>
            <div className="text-center">
              <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl color-bg-accent color-txt-accent">
                <LuMail size={22} aria-hidden />
              </span>
              <h1 className="text-2xl font-bold color-txt-main">Reset your password</h1>
              <p className="mt-2 text-sm leading-relaxed color-txt-sub">
                Enter the email used for your password-based CertChamps account.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="mt-7" noValidate>
              <label htmlFor="forgot-password-email" className="mb-1.5 block text-xs font-bold color-txt-sub">
                Email address
              </label>
              <input
                id="forgot-password-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                autoFocus
                disabled={sending}
                aria-invalid={Boolean(emailError)}
                aria-describedby={emailError ? "forgot-password-email-error" : undefined}
                className="txtbox w-full"
                placeholder="you@example.com"
              />
              {emailError && (
                <p id="forgot-password-email-error" className="mt-1.5 text-xs text-red" role="alert">
                  {emailError}
                </p>
              )}
              {generalError && (
                <p className="mt-3 text-center text-sm text-red" role="alert">
                  {generalError}
                </p>
              )}

              <button
                type="submit"
                disabled={sending}
                className="mt-5 inline-flex w-full items-center justify-center rounded-xl px-5 py-2.5 text-sm font-bold color-bg-accent color-txt-accent transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? "Sending…" : "Send reset link"}
              </button>
            </form>

            <button
              type="button"
              onClick={() => navigate("/login")}
              className="mx-auto mt-5 flex items-center gap-1.5 text-sm font-semibold color-txt-sub transition-colors hover:color-txt-accent"
            >
              <LuArrowLeft size={15} aria-hidden />
              Back to login
            </button>
          </>
        )}
      </section>
    </main>
  );
}
