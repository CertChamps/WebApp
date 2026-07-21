// Thin typed wrapper around the Spotify Web API for the handful of endpoints
// this companion player needs (profile, search, playlists, transfer/play).
//
// We deliberately keep this as a small fetch wrapper rather than adding the
// full @spotify/web-api-ts-sdk dependency, so token acquisition/refresh stays
// unified with the app's own PKCE flow (see spotifyAuth.ts).

import { SPOTIFY_API_BASE } from "./spotifyConfig";
import type {
  SpotifyPlaylist,
  SpotifySearchResults,
  SpotifyTrack,
  SpotifyUserProfile,
} from "./types";

export class SpotifyApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "SpotifyApiError";
  }
}

async function apiGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${SPOTIFY_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new SpotifyApiError(res.status, `Spotify API GET ${path} failed (${res.status})`);
  }
  return (await res.json()) as T;
}

async function apiSend(token: string, path: string, method: "PUT" | "POST", body?: unknown): Promise<void> {
  const res = await fetch(`${SPOTIFY_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // 204 No Content is the common success response for playback commands.
  if (!res.ok && res.status !== 204) {
    throw new SpotifyApiError(res.status, `Spotify API ${method} ${path} failed (${res.status})`);
  }
}

export function getCurrentUser(token: string): Promise<SpotifyUserProfile> {
  return apiGet<SpotifyUserProfile>(token, "/me");
}

interface RawPlaylistsResponse {
  items: SpotifyPlaylist[];
}

export async function getMyPlaylists(token: string, limit = 50): Promise<SpotifyPlaylist[]> {
  const data = await apiGet<RawPlaylistsResponse>(token, `/me/playlists?limit=${limit}`);
  // Spotify occasionally returns null entries for unavailable playlists.
  return (data.items ?? []).filter(Boolean);
}

interface RawPlaylistTracksResponse {
  items: Array<{ track: SpotifyTrack | null }>;
}

export async function getPlaylistTracks(token: string, playlistId: string, limit = 100): Promise<SpotifyTrack[]> {
  const data = await apiGet<RawPlaylistTracksResponse>(
    token,
    `/playlists/${playlistId}/tracks?limit=${limit}`
  );
  return (data.items ?? []).map((i) => i.track).filter((t): t is SpotifyTrack => !!t);
}

interface RawSearchResponse {
  tracks?: { items: (SpotifyTrack | null)[] };
  playlists?: { items: (SpotifyPlaylist | null)[] };
}

export async function search(token: string, query: string): Promise<SpotifySearchResults> {
  const q = encodeURIComponent(query.trim());
  const data = await apiGet<RawSearchResponse>(
    token,
    `/search?q=${q}&type=track,playlist&limit=12`
  );
  return {
    tracks: (data.tracks?.items ?? []).filter((t): t is SpotifyTrack => !!t),
    playlists: (data.playlists?.items ?? []).filter((p): p is SpotifyPlaylist => !!p),
  };
}

/** Move Spotify Connect playback onto our in-browser device. */
export function transferPlayback(token: string, deviceId: string, play: boolean): Promise<void> {
  return apiSend(token, "/me/player", "PUT", { device_ids: [deviceId], play });
}

/** Start playback of a context (playlist/album) or explicit track URIs on a device. */
export function startPlayback(
  token: string,
  deviceId: string,
  options: { contextUri?: string; uris?: string[]; offsetUri?: string }
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (options.contextUri) body.context_uri = options.contextUri;
  if (options.uris) body.uris = options.uris;
  if (options.offsetUri) body.offset = { uri: options.offsetUri };
  return apiSend(token, `/me/player/play?device_id=${deviceId}`, "PUT", body);
}
