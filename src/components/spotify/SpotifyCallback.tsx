import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { LuLoaderCircle, LuTriangleAlert } from "react-icons/lu";
import { useSpotify } from "../../context/SpotifyContext";
import { SpotifyLogo } from "./SpotifyLogo";

/**
 * OAuth redirect target for the Spotify PKCE flow. Exchanges the returned
 * authorization code for tokens, then sends the user back where they came from.
 */
export default function SpotifyCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { completeLogin } = useSpotify();
  const [error, setError] = useState<string | null>(null);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    // Prefer react-router search params (hash query); fall back to
    // window.location.search in case the OAuth bridge hasn't rewritten yet.
    const fromHash = searchParams;
    const fromSearch = new URLSearchParams(window.location.search);
    const code = fromHash.get("code") ?? fromSearch.get("code");
    const state = fromHash.get("state") ?? fromSearch.get("state");
    const authError = fromHash.get("error") ?? fromSearch.get("error");

    const returnPath = (() => {
      try {
        return localStorage.getItem("SPOTIFY_RETURN_PATH") || "#/whiteboards";
      } catch {
        return "#/whiteboards";
      }
    })();
    const returnTo = returnPath.replace(/^#/, "") || "/whiteboards";

    if (authError) {
      setError("Spotify authorization was cancelled or denied.");
      return;
    }
    if (!code || !state) {
      setError("Missing authorization details from Spotify.");
      return;
    }

    completeLogin(code, state)
      .then(() => {
        navigate(returnTo, { replace: true });
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Spotify login failed.");
      });
  }, [completeLogin, navigate, searchParams]);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-8 color-bg">
      <SpotifyLogo className="h-10 w-10 color-txt-main" />
      {error ? (
        <>
          <div className="flex items-center gap-2 color-txt-main">
            <LuTriangleAlert size={20} strokeWidth={2} />
            <span className="text-sm font-semibold">Couldn't connect Spotify</span>
          </div>
          <p className="max-w-xs text-center text-sm color-txt-sub">{error}</p>
          <button
            type="button"
            onClick={() => navigate("/whiteboards", { replace: true })}
            className="mt-2 rounded-out color-bg-accent color-txt-accent px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-80"
          >
            Go back
          </button>
        </>
      ) : (
        <>
          <LuLoaderCircle size={22} strokeWidth={2} className="animate-spin color-txt-accent" />
          <p className="text-sm color-txt-sub">Connecting your Spotify account…</p>
        </>
      )}
    </div>
  );
}
