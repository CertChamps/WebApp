// Spotify OAuth (Authorization Code + PKCE) token handling and storage.
//
// Tokens are persisted in localStorage under a namespaced key, mirroring the
// app's existing convention for "USER" / "OPTIONS". No client secret is used
// or stored — refresh happens with the public client ID + PKCE.

import {
  SPOTIFY_AUTH_ENDPOINT,
  SPOTIFY_CLIENT_ID,
  SPOTIFY_NATIVE_REDIRECT_URI,
  SPOTIFY_PKCE_STATE_KEY,
  SPOTIFY_PKCE_VERIFIER_KEY,
  SPOTIFY_REDIRECT_URI_KEY,
  SPOTIFY_SCOPES,
  SPOTIFY_TOKEN_ENDPOINT,
  SPOTIFY_TOKEN_STORAGE_KEY,
  getSpotifyRedirectUri,
} from "./spotifyConfig";
import { deriveCodeChallenge, generateCodeVerifier, generateState } from "./pkce";
import type { SpotifyTokenBundle } from "./types";
import { Capacitor } from "@capacitor/core";

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
  localStorage.removeItem(SPOTIFY_REDIRECT_URI_KEY);
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

/** True when running inside the Capacitor native shell (iPad / Android). */
export function usesNativeSpotifyAuth(): boolean {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}

function isSpotifyCallbackUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "com.certchamps.app:" &&
      parsed.hostname === "spotify" &&
      parsed.pathname === "/callback"
    );
  } catch {
    return false;
  }
}

async function buildAuthorizationUrl(): Promise<string> {
  const verifier = generateCodeVerifier();
  const challenge = await deriveCodeChallenge(verifier);
  const state = generateState();
  const redirectUri = getSpotifyRedirectUri();

  if (!redirectUri) {
    throw new Error("Spotify redirect URI is not configured for this environment.");
  }

  localStorage.setItem(SPOTIFY_PKCE_VERIFIER_KEY, verifier);
  localStorage.setItem(SPOTIFY_PKCE_STATE_KEY, state);
  localStorage.setItem(SPOTIFY_REDIRECT_URI_KEY, redirectUri);

  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SPOTIFY_SCOPES.join(" "),
    code_challenge_method: "S256",
    code_challenge: challenge,
    state,
    show_dialog: "true",
  });

  return `${SPOTIFY_AUTH_ENDPOINT}?${params.toString()}`;
}

/** Open Spotify login in the native in-app browser and wait for the redirect. */
async function openNativeAuthorization(authUrl: string): Promise<{ code: string; state: string }> {
  const { App } = await import("@capacitor/app");
  const { Browser } = await import("@capacitor/browser");

  return new Promise((resolve, reject) => {
    let settled = false;
    const handles: Array<{ remove: () => Promise<void> }> = [];

    const cleanup = async () => {
      await Promise.all(handles.map((h) => h.remove().catch(() => undefined)));
      handles.length = 0;
      try {
        await Browser.close();
      } catch {
        /* already closed */
      }
    };

    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      void cleanup().then(action);
    };

    void (async () => {
      try {
        const urlListener = await App.addListener("appUrlOpen", (event) => {
          if (!isSpotifyCallbackUrl(event.url)) return;

          const parsed = new URL(event.url);
          const error = parsed.searchParams.get("error");
          if (error) {
            finish(() => reject(new Error("Spotify authorization was cancelled or denied.")));
            return;
          }

          const code = parsed.searchParams.get("code");
          const state = parsed.searchParams.get("state");
          if (!code || !state) {
            finish(() => reject(new Error("Missing authorization details from Spotify.")));
            return;
          }

          finish(() => resolve({ code, state }));
        });
        handles.push(urlListener);

        const finishedListener = await Browser.addListener("browserFinished", () => {
          finish(() => reject(new Error("Spotify authorization was cancelled.")));
        });
        handles.push(finishedListener);

        await Browser.open({ url: authUrl });
      } catch (err) {
        finish(() => reject(err instanceof Error ? err : new Error(String(err))));
      }
    })();
  });
}

/** Begin the login flow by redirecting the browser to Spotify's consent page. */
export async function beginAuthorization(): Promise<{ code: string; state: string } | null> {
  const authUrl = await buildAuthorizationUrl();

  if (usesNativeSpotifyAuth()) {
    return openNativeAuthorization(authUrl);
  }

  window.location.assign(authUrl);
  return null;
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

  const redirectUri = localStorage.getItem(SPOTIFY_REDIRECT_URI_KEY) ?? getSpotifyRedirectUri();
  if (!redirectUri) {
    throw new Error("Spotify redirect URI is not configured for this environment.");
  }

  const body = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });

  const res = await fetch(SPOTIFY_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    let message = `Spotify token exchange failed (${res.status})`;
    try {
      const json = JSON.parse(detail) as { error?: string; error_description?: string };
      if (json.error_description) message = json.error_description;
      else if (json.error) message = json.error;
    } catch {
      if (detail) message = detail;
    }
    if (/redirect_uri/i.test(message)) {
      message += ` Add this exact URI in the Spotify Developer Dashboard: ${redirectUri}`;
    }
    throw new Error(message);
  }

  const json = (await res.json()) as SpotifyTokenResponse;
  const bundle = toBundle(json);
  saveTokens(bundle);

  // One-time values — remove after use.
  localStorage.removeItem(SPOTIFY_PKCE_VERIFIER_KEY);
  localStorage.removeItem(SPOTIFY_PKCE_STATE_KEY);
  localStorage.removeItem(SPOTIFY_REDIRECT_URI_KEY);

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

export { REFRESH_SKEW_MS, SPOTIFY_NATIVE_REDIRECT_URI, getSpotifyRedirectUri };
