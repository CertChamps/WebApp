// Spotify integration configuration.
//
// The client ID and (optionally) the redirect URI come from Vite env vars so
// no secrets are hard-coded and different environments can register their own
// Spotify application. This uses the Authorization Code with PKCE flow, which
// never exposes a client secret in the browser.

import { Capacitor } from "@capacitor/core";

export const SPOTIFY_CLIENT_ID = (import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined) ?? "";

/** Custom-scheme redirect for Capacitor native OAuth (register in Spotify dashboard). */
export const SPOTIFY_NATIVE_REDIRECT_URI = "com.certchamps.app://spotify/callback";

/**
 * Redirect URI registered in the Spotify developer dashboard.
 *
 * Spotify does NOT allow `#` fragments in redirect URIs, and rejects
 * `localhost` — use `127.0.0.1` for local loopback. Vite's SPA fallback
 * serves index.html for the callback path; RootLayout then rewrites into
 * the hash route `/#/spotify/callback?...` for token exchange.
 *
 * Priority (evaluated at call time, not module import):
 * 1. Native Capacitor shell → com.certchamps.app://spotify/callback
 * 2. VITE_SPOTIFY_REDIRECT_URI (explicit override for web/dev)
 * 3. Dev: http://127.0.0.1:5173/callback
 * 4. Prod web: ${origin}/spotify/callback
 */
export function getSpotifyRedirectUri(): string {
  // Native must win over env overrides — the iPad app needs the custom scheme.
  if (typeof window !== "undefined" && Capacitor.isNativePlatform()) {
    return SPOTIFY_NATIVE_REDIRECT_URI;
  }

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

/** @deprecated Use getSpotifyRedirectUri() — kept for existing imports. */
export const SPOTIFY_REDIRECT_URI = getSpotifyRedirectUri();

// Scopes required for playback + browsing the user's own library.
export const SPOTIFY_SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
  "user-read-recently-played",
  "playlist-read-private",
  "playlist-read-collaborative",
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
/** Remembers which redirect_uri was used to start the current auth attempt. */
export const SPOTIFY_REDIRECT_URI_KEY = "SPOTIFY_REDIRECT_URI";

export function isSpotifyConfigured(): boolean {
  return SPOTIFY_CLIENT_ID.trim().length > 0;
}
