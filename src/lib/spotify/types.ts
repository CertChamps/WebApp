// Minimal Spotify Web API response shapes used by this integration.
// Kept intentionally narrow (only the fields we read) rather than pulling in a
// large third-party type package.

export type SpotifyProduct = "premium" | "free" | "open" | (string & {});

export interface SpotifyImage {
  url: string;
  height: number | null;
  width: number | null;
}

export interface SpotifyUserProfile {
  id: string;
  display_name: string | null;
  email?: string;
  /** Removed from GET /me in Feb 2026 Development Mode — treat as unknown when absent. */
  product?: SpotifyProduct;
  images?: SpotifyImage[];
}

export interface SpotifyArtistRef {
  id: string;
  name: string;
  uri: string;
}

export interface SpotifyAlbumRef {
  id: string;
  name: string;
  uri: string;
  images: SpotifyImage[];
}

export interface SpotifyTrack {
  id: string;
  name: string;
  uri: string;
  duration_ms: number;
  artists: SpotifyArtistRef[];
  album: SpotifyAlbumRef;
  /** Present on playlist items; "episode" entries are filtered out. */
  type?: string;
}

export interface SpotifyAlbum {
  id: string;
  name: string;
  uri: string;
  images: SpotifyImage[];
  artists?: SpotifyArtistRef[];
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  uri: string;
  images: SpotifyImage[];
  /**
   * Track count paging object.
   * Pre-Feb 2026: `tracks`. Post-Feb 2026 Development Mode: `items`.
   * Often missing on search results / non-owned playlists.
   */
  tracks?: { total: number } | null;
  items?: { total: number } | null;
  owner: { display_name: string | null };
}

/** Recently played, grouped for the "Recent" view. */
export interface RecentlyPlayed {
  tracks: SpotifyTrack[];
  albums: SpotifyAlbum[];
  playlists: SpotifyPlaylist[];
}

/** Stored token bundle (localStorage). */
export interface SpotifyTokenBundle {
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds when the access token expires. */
  expiresAt: number;
  scope: string;
}

export type SpotifySearchResults = {
  tracks: SpotifyTrack[];
  playlists: SpotifyPlaylist[];
};
