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
  product: SpotifyProduct;
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
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  uri: string;
  images: SpotifyImage[];
  tracks: { total: number };
  owner: { display_name: string | null };
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
