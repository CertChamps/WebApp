/// <reference types="vite/client" />
/// <reference types="spotify-web-playback-sdk" />

interface ImportMetaEnv {
  /** Spotify application client ID (public — PKCE flow, no secret). */
  readonly VITE_SPOTIFY_CLIENT_ID?: string;
  /** Optional override for the registered OAuth redirect URI. */
  readonly VITE_SPOTIFY_REDIRECT_URI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
