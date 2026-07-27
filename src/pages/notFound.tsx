import { useContext, useEffect } from "react";
import { LuArrowLeft, LuBookOpen, LuLogIn } from "react-icons/lu";
import { useLocation, useNavigate } from "react-router-dom";
import { auth } from "../../firebase";
import crown from "../assets/logo.png";
import { UserContext } from "../context/UserContext";

export default function NotFound() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(UserContext);
  const isSignedIn = Boolean(auth.currentUser || user?.uid);
  const destination = isSignedIn ? "/practice" : "/login";

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Page not found | CertChamps";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <main className="relative flex min-h-full w-full items-center justify-center overflow-hidden color-bg-grey-5 px-5 py-10">
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-40 blur-3xl color-bg-accent"
        aria-hidden
      />

      <section className="relative w-full max-w-lg rounded-out border-2 color-shadow color-bg px-7 py-9 text-center shadow-sm sm:px-10 sm:py-11">
        <img src={crown} alt="" className="mx-auto mb-5 h-16 w-20 object-contain" />

        <p className="mb-1 text-sm font-bold uppercase tracking-[0.22em] color-txt-accent">
          Error 404
        </p>
        <h1 className="text-3xl font-bold color-txt-main sm:text-4xl">This page wandered off</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed color-txt-sub sm:text-base">
          The link may be old, mistyped, or the page may have moved. Your account and study progress
          are safe.
        </p>

        <div className="mt-7 flex flex-col-reverse justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border color-shadow px-5 py-2.5 text-sm font-semibold color-txt-main transition-colors hover:color-bg-grey-10"
          >
            <LuArrowLeft size={17} aria-hidden />
            Go back
          </button>
          <button
            type="button"
            onClick={() => navigate(destination, { replace: true })}
            className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold color-bg-accent color-txt-accent transition-opacity hover:opacity-85"
          >
            {isSignedIn ? <LuBookOpen size={17} aria-hidden /> : <LuLogIn size={17} aria-hidden />}
            {isSignedIn ? "Return to Practice" : "Go to login"}
          </button>
        </div>

        <p className="mt-7 truncate text-xs color-txt-sub opacity-70" title={location.pathname}>
          {location.pathname}
        </p>
      </section>
    </main>
  );
}
