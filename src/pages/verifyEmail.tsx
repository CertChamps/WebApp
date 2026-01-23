import { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../../firebase";
import { sendEmailVerification, signOut } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { UserContext } from "../context/UserContext";
import crown from "../assets/logo.png";
import { MdEmail, MdRefresh, MdLogout, MdCheckCircle } from "react-icons/md";

export default function VerifyEmail() {
  const navigate = useNavigate();
  const { user, setUser } = useContext(UserContext);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isChecking, setIsChecking] = useState(false);

  // Auto-check verification status every 3 seconds
  useEffect(() => {
    const checkVerificationStatus = async () => {
      if (!auth.currentUser) return;

      try {
        setIsChecking(true);
        // Reload the user to get the latest emailVerified status from Firebase Auth
        await auth.currentUser.reload();

        if (auth.currentUser.emailVerified) {
          // Update Firestore with verified status
          await updateDoc(doc(db, "user-data", auth.currentUser.uid), {
            emailVerified: true,
          });

          // Update local user context
          setUser((prev: any) => ({
            ...prev,
            emailVerified: true,
          }));

          setMessage("Email verified! Redirecting...");

          // Redirect to main app after a short delay
          setTimeout(() => {
            navigate("/practice");
          }, 1500);
        }
      } catch (err) {
        console.error("Error checking verification status:", err);
      } finally {
        setIsChecking(false);
      }
    };

    // Initial check
    checkVerificationStatus();

    // Set up interval to check every 3 seconds
    const interval = setInterval(checkVerificationStatus, 3000);

    return () => clearInterval(interval);
  }, [navigate, setUser]);

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
    try {
      await signOut(auth);
      setUser(null);
      navigate("/");
    } catch (err) {
      console.error("Error signing out:", err);
      setError("Failed to sign out. Please try again.");
    }
  };

  const userEmail = auth.currentUser?.email || user?.email || "your email";

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

        {/* Checking indicator */}
        {isChecking && (
          <div className="flex items-center justify-center gap-2 txt-sub mb-4">
            <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full"></div>
            <p className="text-sm">Checking verification status...</p>
          </div>
        )}

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
