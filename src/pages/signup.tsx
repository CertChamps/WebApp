import { useState, useEffect } from "react";
import { FaGoogle } from "react-icons/fa";
import crown from "../assets/logo.png";
import useAuthentication from "../hooks/useAuthentication";
import { useNavigate, useLocation } from "react-router-dom";

export default function SignUp() {
  const navigate = useNavigate();
  const location = useLocation();
  const prevRoute = location.state?.prevRoute;

  const { signUpWithEmail,loginWithGoogle, error, setError } = useAuthentication({ prevRoute });

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

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

    await signUpWithEmail(username, email, password, token);
    (window as any).grecaptcha.reset(captchaId);
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

        <div className="red-btn mx-auto my-2 w-9/12 text-center bg-[#4C8BF5] flex justify-center items-center cursor-pointer">
          <FaGoogle className="mr-2 text-white" size={17} />
          <p onClick={loginWithGoogle}>Sign Up With Google</p>
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
