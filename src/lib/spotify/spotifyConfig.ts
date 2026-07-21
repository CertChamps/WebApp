// Spotify integration configuration.
//
// The client ID and (optionally) the redirect URI come from Vite env vars so
// no secrets are hard-coded and different environments can register their own
// Spotify application. This uses the Authorization Code with PKCE flow, which
// never exposes a client secret in the browser.

export const SPOTIFY_CLIENT_ID = (import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined) ?? "";

/**
 * Redirect URI registered in the Spotify developer dashboard.
 *
 * Spotify does NOT allow `#` fragments in redirect URIs, and rejects
 * `localhost` — use `127.0.0.1` for local loopback. Vite's SPA fallback
 * serves index.html for the callback path; RootLayout then rewrites into
 * the hash route `/#/spotify/callback?...` for token exchange.
 *
 * Priority:
 * 1. VITE_SPOTIFY_REDIRECT_URI (explicit override)
 * 2. Dev: http://127.0.0.1:5173/callback (never localhost)
 * 3. Prod: ${origin}/spotify/callback
 */
function resolveSpotifyRedirectUri(): string {
  const fromEnv = (import.meta.env.VITE_SPOTIFY_REDIRECT_URI as string | undefined)?.trim();
  if (fromEnv) return fromEnv;

  if (import.meta.env.DEV) {
    return "http://127.0.0.1:5173/callback";
  }

  if (typeof window !== "undefined") {
    return `${window.location.origin}/spotify/callback`;
  }

  return "";
}

export const SPOTIFY_REDIRECT_URI = resolveSpotifyRedirectUri();

// Scopes required for playback + browsing the user's own library.
export const SPOTIFY_SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
  "playlist-read-private",
] as const;

export const SPOTIFY_AUTH_ENDPOINT = "https://accounts.spotify.com/authorize";
export const SPOTIFY_TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
export const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

// Name shown in the Spotify Connect device picker for the in-app player.
export const SPOTIFY_DEVICE_NAME = "CertChamps Web Player";

// localStorage keys — namespaced like the app's existing "USER" / "OPTIONS".
export const SPOTIFY_TOKEN_STORAGE_KEY = "SPOTIFY_AUTH";
export const SPOTIFY_PKCE_VERIFIER_KEY = "SPOTIFY_PKCE_VERIFIER";
export const SPOTIFY_PKCE_STATE_KEY = "SPOTIFY_PKCE_STATE";

export function isSpotifyConfigured(): boolean {
  return SPOTIFY_CLIENT_ID.trim().length > 0;
}
