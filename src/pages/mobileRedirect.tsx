import crown from "../assets/logo.png";
import { useNavigate } from "react-router-dom";
import { FaApple } from "react-icons/fa";

const CERTCHAMPS_APP_STORE_URL = "https://apps.apple.com/app/id6810359289";

export default function MobileRedirect() {
  const navigate = useNavigate();
  return (
    <div className="min-h-[100dvh] w-full overflow-hidden color-bg-grey-5 flex items-center justify-center px-5 py-8">
      <div className="w-full max-w-sm color-shadow border-2 rounded-out color-bg flex flex-col items-center px-6 py-8">
        <img src={crown} alt="" className="w-24 h-20 object-contain mb-4" />
        <h1 className="txt-heading-colour text-center text-2xl mb-3">Open this page on a larger screen</h1>
        <p className="text-center color-txt-sub leading-relaxed">
          Whiteboards and documents aren&apos;t available in phone browsers yet. Everything else in CertChamps works normally on your phone.
        </p>
        <button
          type="button"
          onClick={() => navigate("/practice", { replace: true })}
          className="mt-6 w-full rounded-xl color-bg-accent color-txt-accent px-4 py-3 text-sm font-semibold active:scale-[0.97] transition-transform"
        >
          Back to CertChamps
        </button>
        <a
          href={CERTCHAMPS_APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 w-full rounded-xl color-bg-grey-5 color-txt-main px-4 py-3 text-sm font-semibold inline-flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
        >
          <FaApple size={17} aria-hidden />
          Get CertChamps Mobile
        </a>
      </div>
    </div>
  );
}
