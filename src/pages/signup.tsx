import { useState, useEffect } from "react";
import { FaGoogle, FaApple } from "react-icons/fa";
import crown from "../assets/logo.png";
import useAuthentication from "../hooks/useAuthentication";
import { useNavigate, useLocation } from "react-router-dom";
import { PRIVACY_URL, TERMS_URL } from "../lib/legal";

export default function SignUp() {
  const navigate = useNavigate();
  const location = useLocation();
  const prevRoute = location.state?.prevRoute;

  const { signUpWithEmail, loginWithGoogle, loginWithApple, error, setError } = useAuthentication({ prevRoute });

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [legalAccepted, setLegalAccepted] = useState(false);

  const heading_style = "txt-sub text-xs font-bold w-9/12 mx-auto mb-1";


  const [captchaReady, setCaptchaReady] = useState(false);
  const [captchaId, setCaptchaId] = useState<number | null>(null);
  /** ==================== LOAD RECAPTCHA ==================== */
  useEffect(() => {
    const loadRecaptcha = () => {
      if (!(window as any).grecaptcha) return;
      if (captchaId !== null) return;

      const id = (window as any).grecaptcha.render("recaptcha-container", {
        sitekey: "6Lfe4lIsAAAAAD3d-pD7p5Skou3Dg1kJhzCC6kTF",
        theme: "light",
        size: "normal",
      });
      setCaptchaId(id);
      setCaptchaReady(true);
    };

    const interval = setInterval(() => {
      if ((window as any).grecaptcha) {
        loadRecaptcha();
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [captchaId]);

  /** ==================== HANDLE SUBMIT ==================== */
  const handleSubmit = async (username: string, email: string, password: string) => {
    if (!captchaReady || captchaId === null) {
      setError((prev: any) => ({ ...prev, general: "reCAPTCHA still loading." }));
      return;
    }

    const token = (window as any).grecaptcha.getResponse(captchaId);
    if (!token) {
      setError((prev: any) => ({ ...prev, general: "Please complete the CAPTCHA." }));
      return;
    }

    if (!legalAccepted) {
      setError((prev: any) => ({ ...prev, legal: "Agree to the Terms before creating your account." }));
      return;
    }

    await signUpWithEmail(username, email, password, token, legalAccepted);
    (window as any).grecaptcha.reset(captchaId);
  };

  const handleProviderSignup = (provider: "google" | "apple") => {
    if (!legalAccepted) {
      setError((prev: any) => ({ ...prev, legal: "Agree to the Terms before creating your account." }));
      return;
    }
    if (provider === "google") void loginWithGoogle(true);
    else void loginWithApple(true);
  };

  return (
    <div className="h-full flex justify-center items-center w-full color-bg-grey-5 overflow-hidden">
      <div className="w-72 py-5 h-min-9/12 color-shadow border-2 rounded-out color-bg">
        <img src={crown} className="w-28 m-auto object-contain h-20 mb-4" />
        <h1 className="txt-heading-colour text-center text-2xl mb-4">Sign Up</h1>

        <p className="font-light text-red ml-0.5 text-center">{error?.general || ""}</p>

        <p className={heading_style}>
          Username
          <span className="font-light text-red ml-1">{error?.username || ""}</span>
        </p>
        <input
          type="text"
          placeholder="username"
          className="txtbox mx-auto mb-2 w-9/12"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />

        <p className={heading_style}>
          Email
          <span className="font-light text-red ml-1">{error?.email || ""}</span>
        </p>
        <input
          type="email"
          placeholder="email"
          className="txtbox mx-auto mb-2 w-9/12"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <p className={heading_style}>
          Password
          <span className="font-light text-red ml-1">{error?.password || ""}</span>
        </p>
        <input
          type="password"
          placeholder="password"
          className="txtbox mx-auto mb-4 w-9/12"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <label className="mx-auto mb-2 flex w-9/12 cursor-pointer items-start gap-2.5 text-xs leading-relaxed color-txt-sub">
          <input
            type="checkbox"
            checked={legalAccepted}
            onChange={(event) => {
              setLegalAccepted(event.target.checked);
              if (event.target.checked) {
                setError((prev: any) => ({ ...prev, legal: undefined }));
              }
            }}
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
        {error?.legal && (
          <p className="mx-auto mb-2 w-9/12 text-xs text-red" role="alert">
            {error.legal}
          </p>
        )}

        {/* CAPTCHA container */}
        <div
          id="recaptcha-container"
          className="mx-auto flex justify-center items-center my-3"
        ></div>

        <p
          className="blue-btn mx-auto my-2 w-9/12 text-center cursor-pointer"
          onClick={() => handleSubmit(username, email, password)}
        >
          Sign Up
        </p>

        <div
          role="button"
          tabIndex={0}
          aria-label="Sign up with Apple"
          onClick={() => handleProviderSignup("apple")}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleProviderSignup("apple"); } }}
          className="red-btn mx-auto my-2 w-9/12 text-center bg-black text-white flex justify-center items-center cursor-pointer select-none"
        >
          <FaApple className="mr-2 text-white" size={19} />
          <p>Sign Up With Apple</p>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => handleProviderSignup("google")}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleProviderSignup("google"); } }}
          className="red-btn mx-auto my-2 w-9/12 text-center bg-[#4C8BF5] flex justify-center items-center cursor-pointer select-none"
        >
          <FaGoogle className="mr-2 text-white" size={17} />
          <p>Sign Up With Google</p>
        </div>

        <p
          className="txt-sub text-center hover:color-txt-accent duration-250 transition-all cursor-pointer"
          onClick={() => navigate("./login")}
        >
          Already have an account? <span className="underline">Login here.</span>
        </p>
      </div>
    </div>
  );
}
