import { useState, useEffect, useContext, useRef } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { auth, db } from "../../firebase";
import { sendEmailVerification } from "firebase/auth";
import { doc, updateDoc, getDoc } from "firebase/firestore";
import { UserContext } from "../context/UserContext";
import { getPostAuthPath } from "../lib/onboarding";
import { safeAppPath } from "../lib/signIn";
import { signOutSession } from "../lib/authSession";
import { useUserProfileReady } from "../hooks/useUserProfileReady";
import ProfileLoadingScreen from "../components/onboarding/ProfileLoadingScreen";
import crown from "../assets/logo.png";
import { MdEmail, MdRefresh, MdLogout, MdCheckCircle } from "react-icons/md";

export default function VerifyEmail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = safeAppPath(searchParams.get("returnTo"));
  const { user, setUser } = useContext(UserContext);
  const profile = useUserProfileReady();
  const signingOut = useRef(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Auto-check verification status every 3 seconds
  useEffect(() => {
    let cancelled = false;
    let checking = false;
    let redirectTimer: ReturnType<typeof setTimeout> | undefined;
    const checkVerificationStatus = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser || checking || redirectTimer || signingOut.current) return;
      checking = true;
      const isCurrent = () => !cancelled && !signingOut.current && auth.currentUser === currentUser;

      try {
        // Reload the user to get the latest emailVerified status from Firebase Auth
        await currentUser.reload();
        if (!isCurrent()) return;

        if (currentUser.emailVerified) {
          const userDoc = await getDoc(doc(db, "user-data", currentUser.uid));
          if (!isCurrent()) return;
          const hasCompletedOnboarding =
            userDoc.data()?.hasCompletedOnboarding === true
              ? true
              : userDoc.data()?.hasCompletedOnboarding === false
                ? false
                : undefined;

          // Update Firestore with verified status
          await updateDoc(doc(db, "user-data", currentUser.uid), {
            emailVerified: true,
          });
          if (!isCurrent()) return;

          // Update local user context
          setUser((prev: any) => ({
            ...prev,
            emailVerified: true,
            hasCompletedOnboarding,
          }));

          setMessage("Email verified! Redirecting...");

          redirectTimer = setTimeout(() => {
            if (isCurrent()) navigate(getPostAuthPath({ hasCompletedOnboarding }, returnTo), { replace: true });
          }, 1500);
        }
      } catch (err) {
        console.error("Error checking verification status:", err);
      } finally {
        checking = false;
      }
    };

    // Initial check
    checkVerificationStatus();

    // Set up interval to check every 3 seconds
    const interval = setInterval(checkVerificationStatus, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(redirectTimer);
    };
  }, [navigate, setUser, returnTo]);

  // Handle resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleResendEmail = async () => {
    if (resendCooldown > 0) return;

    setError("");
    setMessage("");

    try {
      if (auth.currentUser) {
        await sendEmailVerification(auth.currentUser);
        setMessage("Verification email sent! Check your inbox.");
        setResendCooldown(60); // 60 second cooldown
      } else {
        setError("No user found. Please sign in again.");
      }
    } catch (err: any) {
      if (err.code === "auth/too-many-requests") {
        setError("Too many requests. Please wait before trying again.");
        setResendCooldown(120); // Longer cooldown if rate limited
      } else {
        setError("Failed to send verification email. Please try again.");
      }
      console.error("Error sending verification email:", err);
    }
  };

  const handleSignOut = async () => {
    signingOut.current = true;
    try {
      await signOutSession();
      setUser(null);
      navigate("/login", { replace: true, state: null });
    } catch (err) {
      signingOut.current = false;
      console.error("Error signing out:", err);
      setError("Failed to sign out. Please try again.");
    }
  };

  const userEmail = auth.currentUser?.email || user?.email || "your email";

  if (!profile.ready) return <ProfileLoadingScreen />;
  if (!profile.isAuthenticated) return <Navigate to="/login" replace state={null} />;

  return (
    <div className="h-full flex justify-center items-center w-full color-bg-grey-5 overflow-hidden">
      <div className="w-96 py-8 px-6 color-shadow border-2 rounded-out color-bg">
        {/* Logo */}
        <img src={crown} className="w-32 m-auto object-cover h-24 mb-4" alt="Logo" />

        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 rounded-full color-bg-grey-5 flex items-center justify-center">
            <MdEmail className="text-4xl color-txt-accent" />
          </div>
        </div>

        {/* Title */}
        <h1 className="txt-heading-colour text-center text-2xl mb-2">Verify Your Email</h1>

        {/* Description */}
        <p className="txt-sub text-center text-sm mb-2">
          We've sent a verification email to:
        </p>
        <p className="color-txt-accent text-center font-semibold mb-4 break-all">
          {userEmail}
        </p>
        <p className="txt-sub text-center text-sm mb-6">
          Click the link in the email to verify your account. Check your spam folder if you don't
          see it.
        </p>

        {/* Status Messages */}
        {message && (
          <div className="flex items-center justify-center gap-2 text-green-500 mb-4">
            <MdCheckCircle />
            <p className="text-sm">{message}</p>
          </div>
        )}
        {error && <p className="text-red text-center text-sm mb-4">{error}</p>}

        {/* Resend Button */}
        <button
          onClick={handleResendEmail}
          disabled={resendCooldown > 0}
          className={`w-full py-3 rounded-lg flex items-center justify-center gap-2 mb-3 transition-all duration-200 ${
            resendCooldown > 0
              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
              : "blue-btn cursor-pointer hover:opacity-90"
          }`}
        >
          <MdRefresh className={resendCooldown > 0 ? "" : "animate-none"} />
          {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend Verification Email"}
        </button>

        {/* Sign Out Button */}
        <button
          onClick={handleSignOut}
          className="w-full py-3 rounded-lg flex items-center justify-center gap-2 border-2 border-gray-300 txt-sub hover:bg-gray-100 transition-all duration-200 cursor-pointer"
        >
          <MdLogout />
          Sign Out & Use Different Account
        </button>

        {/* Help Text */}
        <p className="txt-sub text-center text-xs mt-6">
          Having trouble? Contact support at{" "}
          <a href="mailto:support@certchamps.com" className="color-txt-accent underline">
            support@certchamps.com
          </a>
        </p>
      </div>
    </div>
  );
}
