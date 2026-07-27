// Spotify OAuth (Authorization Code + PKCE) token handling and storage.
//
// Tokens are persisted in localStorage under a namespaced key, mirroring the
// app's existing convention for "USER" / "OPTIONS". No client secret is used
// or stored — refresh happens with the public client ID + PKCE.

import {
  SPOTIFY_AUTH_ENDPOINT,
  SPOTIFY_CLIENT_ID,
  SPOTIFY_PKCE_STATE_KEY,
  SPOTIFY_PKCE_VERIFIER_KEY,
  SPOTIFY_REDIRECT_URI,
  SPOTIFY_SCOPES,
  SPOTIFY_TOKEN_ENDPOINT,
  SPOTIFY_TOKEN_STORAGE_KEY,
} from "./spotifyConfig";
import { deriveCodeChallenge, generateCodeVerifier, generateState } from "./pkce";
import type { SpotifyTokenBundle } from "./types";

interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
  refresh_token?: string;
}

// Refresh a little before the token actually expires so playback never drops
// mid-song because of an expired token.
const REFRESH_SKEW_MS = 60_000;

export function loadTokens(): SpotifyTokenBundle | null {
  try {
    const raw = localStorage.getItem(SPOTIFY_TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SpotifyTokenBundle;
    if (!parsed?.accessToken || !parsed?.refreshToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveTokens(bundle: SpotifyTokenBundle): void {
  localStorage.setItem(SPOTIFY_TOKEN_STORAGE_KEY, JSON.stringify(bundle));
}

export function clearTokens(): void {
  localStorage.removeItem(SPOTIFY_TOKEN_STORAGE_KEY);
  localStorage.removeItem(SPOTIFY_PKCE_VERIFIER_KEY);
  localStorage.removeItem(SPOTIFY_PKCE_STATE_KEY);
}

function toBundle(res: SpotifyTokenResponse, previousRefreshToken?: string): SpotifyTokenBundle {
  return {
    accessToken: res.access_token,
    // Spotify does not always return a new refresh token on refresh — keep the
    // previous one when omitted.
    refreshToken: res.refresh_token ?? previousRefreshToken ?? "",
    expiresAt: Date.now() + res.expires_in * 1000,
    scope: res.scope,
  };
}

/** Begin the login flow by redirecting the browser to Spotify's consent page. */
export async function beginAuthorization(): Promise<void> {
  const verifier = generateCodeVerifier();
  const challenge = await deriveCodeChallenge(verifier);
  const state = generateState();

  localStorage.setItem(SPOTIFY_PKCE_VERIFIER_KEY, verifier);
  localStorage.setItem(SPOTIFY_PKCE_STATE_KEY, state);

  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: SPOTIFY_REDIRECT_URI,
    scope: SPOTIFY_SCOPES.join(" "),
    code_challenge_method: "S256",
    code_challenge: challenge,
    state,
    // Force the consent screen so newly-added scopes are actually granted
    // (Spotify otherwise reuses the previous grant without prompting).
    show_dialog: "true",
  });

  window.location.assign(`${SPOTIFY_AUTH_ENDPOINT}?${params.toString()}`);
}

/**
 * Exchange the authorization code returned on the callback for tokens.
 * Validates the CSRF state and consumes the stored PKCE verifier.
 */
export async function exchangeCodeForTokens(code: string, returnedState: string): Promise<SpotifyTokenBundle> {
  const verifier = localStorage.getItem(SPOTIFY_PKCE_VERIFIER_KEY);
  const expectedState = localStorage.getItem(SPOTIFY_PKCE_STATE_KEY);

  if (!verifier) throw new Error("Missing PKCE verifier — restart the Spotify login.");
  if (!expectedState || expectedState !== returnedState) {
    throw new Error("Spotify auth state mismatch — possible CSRF, aborting.");
  }

  const body = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: SPOTIFY_REDIRECT_URI,
    code_verifier: verifier,
  });

  const res = await fetch(SPOTIFY_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    throw new Error(`Spotify token exchange failed (${res.status})`);
  }

  const json = (await res.json()) as SpotifyTokenResponse;
  const bundle = toBundle(json);
  saveTokens(bundle);

  // One-time values — remove after use.
  localStorage.removeItem(SPOTIFY_PKCE_VERIFIER_KEY);
  localStorage.removeItem(SPOTIFY_PKCE_STATE_KEY);

  return bundle;
}

/** Refresh the access token using the stored refresh token. */
export async function refreshAccessToken(refreshToken: string): Promise<SpotifyTokenBundle> {
  const body = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const res = await fetch(SPOTIFY_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    throw new Error(`Spotify token refresh failed (${res.status})`);
  }

  const json = (await res.json()) as SpotifyTokenResponse;
  const bundle = toBundle(json, refreshToken);
  saveTokens(bundle);
  return bundle;
}

export function isExpired(bundle: SpotifyTokenBundle): boolean {
  return Date.now() >= bundle.expiresAt - REFRESH_SKEW_MS;
}

export { REFRESH_SKEW_MS };
