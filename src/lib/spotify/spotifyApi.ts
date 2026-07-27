// Thin typed wrapper around the Spotify Web API for the handful of endpoints
// this companion player needs (profile, search, playlists, transfer/play).
//
// Updated for Spotify's February 2026 Development Mode Web API changes:
// - Search `limit` max is 10 (was 50)
// - Playlist contents use GET /playlists/{id}/items ( /tracks removed )
// - Playlist paging field renamed tracks → items; entry field track → item

import { SPOTIFY_API_BASE } from "./spotifyConfig";
import type {
  RecentlyPlayed,
  SpotifyAlbum,
  SpotifyPlaylist,
  SpotifySearchResults,
  SpotifyTrack,
  SpotifyUserProfile,
} from "./types";

export class SpotifyApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, message: string, body = "") {
    super(message);
    this.status = status;
    this.body = body;
    this.name = "SpotifyApiError";
  }
}

async function apiGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${SPOTIFY_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let detail = body;
    try {
      const json = JSON.parse(body) as { error?: { message?: string } };
      if (json?.error?.message) detail = json.error.message;
    } catch {
      /* keep raw body */
    }
    throw new SpotifyApiError(
      res.status,
      `Spotify API GET ${path} failed (${res.status})${detail ? `: ${detail}` : ""}`,
      body
    );
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
    const text = await res.text().catch(() => "");
    throw new SpotifyApiError(res.status, `Spotify API ${method} ${path} failed (${res.status})`, text);
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

interface RawPlaylistItemsResponse {
  items: Array<{
    /** Pre-2026 field name. */
    track?: SpotifyTrack | null;
    /** Post-2026 field name. */
    item?: SpotifyTrack | null;
  }>;
}

/** Playlist contents — Feb 2026+: GET /playlists/{id}/items (was /tracks). */
export async function getPlaylistTracks(token: string, playlistId: string, limit = 100): Promise<SpotifyTrack[]> {
  const data = await apiGet<RawPlaylistItemsResponse>(
    token,
    `/playlists/${playlistId}/items?limit=${limit}&additional_types=track`
  );
  return (data.items ?? [])
    .map((i) => i.item ?? i.track ?? null)
    .filter((t): t is SpotifyTrack => !!t && typeof t.id === "string" && t.type !== "episode");
}

interface RawSearchResponse {
  tracks?: { items: (SpotifyTrack | null)[] };
  playlists?: { items: (SpotifyPlaylist | null)[] };
}

/** Search — Development Mode `limit` max is 10 (Feb 2026). */
export async function search(token: string, query: string): Promise<SpotifySearchResults> {
  const q = encodeURIComponent(query.trim());
  const data = await apiGet<RawSearchResponse>(
    token,
    `/search?q=${q}&type=track,playlist&limit=10&market=from_token`
  );
  return {
    tracks: (data.tracks?.items ?? []).filter((t): t is SpotifyTrack => !!t && !!t.id),
    playlists: (data.playlists?.items ?? []).filter((p): p is SpotifyPlaylist => !!p && !!p.id),
  };
}

export function getPlaylist(token: string, playlistId: string): Promise<SpotifyPlaylist> {
  // Request both legacy `tracks` and new `items` totals for compatibility.
  return apiGet<SpotifyPlaylist>(
    token,
    `/playlists/${playlistId}?fields=id,name,uri,images,tracks(total),items(total),owner(display_name)`
  );
}

interface RawRecentlyPlayedResponse {
  items: Array<{
    track: SpotifyTrack | null;
    context: { type: string; uri: string } | null;
  }>;
}

/**
 * Recently played, grouped into songs / albums / playlists.
 * The endpoint returns tracks with a play `context`; albums are derived from
 * each track's album, playlists are resolved from playlist contexts.
 */
export async function getRecentlyPlayed(token: string): Promise<RecentlyPlayed> {
  const data = await apiGet<RawRecentlyPlayedResponse>(token, `/me/player/recently-played?limit=50`);
  const items = data.items ?? [];

  const seenTrack = new Set<string>();
  const tracks: SpotifyTrack[] = [];
  for (const item of items) {
    const t = item.track;
    if (t?.id && !seenTrack.has(t.id)) {
      seenTrack.add(t.id);
      tracks.push(t);
    }
  }

  const seenAlbum = new Set<string>();
  const albums: SpotifyAlbum[] = [];
  for (const t of tracks) {
    const a = t.album;
    if (a?.id && !seenAlbum.has(a.id)) {
      seenAlbum.add(a.id);
      albums.push({ id: a.id, name: a.name, uri: a.uri, images: a.images, artists: t.artists });
    }
  }

  const seenPlaylist = new Set<string>();
  const playlistIds: string[] = [];
  for (const item of items) {
    const ctx = item.context;
    if (ctx?.type === "playlist" && ctx.uri) {
      const id = ctx.uri.split(":").pop();
      if (id && !seenPlaylist.has(id)) {
        seenPlaylist.add(id);
        playlistIds.push(id);
      }
    }
  }

  const playlists = (
    await Promise.all(playlistIds.slice(0, 12).map((id) => getPlaylist(token, id).catch(() => null)))
  ).filter((p): p is SpotifyPlaylist => !!p);

  return { tracks, albums, playlists };
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

/** Track/playlist total count — supports pre- and post-2026 playlist field names. */
export function playlistTrackCount(playlist: SpotifyPlaylist): number | null {
  return playlist.items?.total ?? playlist.tracks?.total ?? null;
}
