import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  clearTokens,
  exchangeCodeForTokens,
  getCurrentUser,
  getMyPlaylists,
  getPlaylistTracks,
  isExpired,
  isSpotifyConfigured,
  loadSpotifyPlaybackSdk,
  loadTokens,
  refreshAccessToken,
  saveTokens,
  search as apiSearch,
  SPOTIFY_DEVICE_NAME,
  startPlayback,
  transferPlayback,
  type SpotifyPlaylist,
  type SpotifySearchResults,
  type SpotifyTokenBundle,
  type SpotifyTrack,
  type SpotifyUserProfile,
} from "../lib/spotify";

export type SpotifyStatus = "disconnected" | "connecting" | "connected";

export interface NowPlaying {
  id: string | null;
  name: string;
  artist: string;
  albumArt: string | null;
  durationMs: number;
}

interface SpotifyContextValue {
  configured: boolean;
  status: SpotifyStatus;
  profile: SpotifyUserProfile | null;
  isPremium: boolean;
  error: string | null;

  // Playback
  deviceReady: boolean;
  nowPlaying: NowPlaying | null;
  paused: boolean;
  positionMs: number;
  durationMs: number;
  volume: number;
  /** True when a track is loaded (playing or paused) on the in-app device. */
  hasActiveSession: boolean;

  // Auth actions
  beginLogin: () => Promise<void>;
  completeLogin: (code: string, state: string) => Promise<void>;
  disconnect: () => void;

  // Playback actions
  togglePlay: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  seek: (ms: number) => Promise<void>;
  setVolume: (v: number) => Promise<void>;
  playContext: (contextUri: string, offsetUri?: string) => Promise<void>;
  playTrack: (trackUri: string) => Promise<void>;

  // Web API helpers
  searchCatalog: (query: string) => Promise<SpotifySearchResults>;
  fetchPlaylists: () => Promise<SpotifyPlaylist[]>;
  fetchPlaylistTracks: (playlistId: string) => Promise<SpotifyTrack[]>;
}

const SpotifyContext = createContext<SpotifyContextValue | null>(null);

export function SpotifyProvider({ children }: { children: ReactNode }) {
  const configured = isSpotifyConfigured();

  const [status, setStatus] = useState<SpotifyStatus>("disconnected");
  const [profile, setProfile] = useState<SpotifyUserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deviceReady, setDeviceReady] = useState(false);
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [paused, setPaused] = useState(true);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [volume, setVolumeState] = useState(0.5);

  const tokenRef = useRef<SpotifyTokenBundle | null>(null);
  const playerRef = useRef<Spotify.Player | null>(null);
  const deviceIdRef = useRef<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transferredRef = useRef(false);
  const positionSyncRef = useRef<{ base: number; at: number; paused: boolean }>({
    base: 0,
    at: Date.now(),
    paused: true,
  });

  const isPremium = profile?.product === "premium";
  const hasActiveSession = !!nowPlaying;

  // ---- Token management ---------------------------------------------------

  const scheduleRefresh = useCallback((bundle: SpotifyTokenBundle) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    const delay = Math.max(5_000, bundle.expiresAt - Date.now() - 60_000);
    refreshTimerRef.current = setTimeout(() => {
      void getValidAccessToken().catch(() => {
        /* handled inside getValidAccessToken */
      });
    }, delay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const teardown = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    try {
      playerRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    playerRef.current = null;
    deviceIdRef.current = null;
    transferredRef.current = false;
    tokenRef.current = null;
    setDeviceReady(false);
    setNowPlaying(null);
    setPaused(true);
    setPositionMs(0);
    setDurationMs(0);
  }, []);

  const disconnect = useCallback(() => {
    teardown();
    clearTokens();
    setProfile(null);
    setStatus("disconnected");
    setError(null);
  }, [teardown]);

  /** Returns a valid (refreshed if needed) access token, or throws. */
  const getValidAccessToken = useCallback(async (): Promise<string> => {
    const current = tokenRef.current ?? loadTokens();
    if (!current) throw new Error("Not authenticated with Spotify");

    if (!isExpired(current)) {
      tokenRef.current = current;
      return current.accessToken;
    }

    try {
      const refreshed = await refreshAccessToken(current.refreshToken);
      tokenRef.current = refreshed;
      scheduleRefresh(refreshed);
      return refreshed.accessToken;
    } catch (err) {
      // Refresh failed — drop cleanly back to the connect state.
      disconnect();
      throw err;
    }
  }, [disconnect, scheduleRefresh]);

  // ---- Web Playback SDK ---------------------------------------------------

  const applyPlayerState = useCallback((state: Spotify.PlaybackState | null) => {
    if (!state) {
      // Null means playback moved to another device / nothing active here.
      return;
    }
    const track = state.track_window?.current_track;
    if (track) {
      setNowPlaying({
        id: track.id,
        name: track.name,
        artist: track.artists.map((a) => a.name).join(", "),
        albumArt: track.album?.images?.[0]?.url ?? null,
        durationMs: state.duration,
      });
    }
    setPaused(state.paused);
    setDurationMs(state.duration);
    setPositionMs(state.position);
    positionSyncRef.current = { base: state.position, at: Date.now(), paused: state.paused };
  }, []);

  const setupPlayer = useCallback(async () => {
    if (playerRef.current) return;
    const SpotifySdk = await loadSpotifyPlaybackSdk();

    const player = new SpotifySdk.Player({
      name: SPOTIFY_DEVICE_NAME,
      getOAuthToken: (cb) => {
        getValidAccessToken()
          .then((token) => cb(token))
          .catch(() => {
            /* disconnect already handled */
          });
      },
      volume: 0.5,
    });

    player.addListener("ready", ({ device_id }) => {
      deviceIdRef.current = device_id;
      setDeviceReady(true);
    });
    player.addListener("not_ready", () => {
      setDeviceReady(false);
    });
    player.addListener("player_state_changed", (state) => {
      applyPlayerState(state);
    });
    player.addListener("initialization_error", ({ message }) => {
      setError(message);
    });
    player.addListener("authentication_error", () => {
      // Token likely invalid — attempt a refresh; if it fails we disconnect.
      void getValidAccessToken().catch(() => undefined);
    });
    player.addListener("account_error", () => {
      setError("Spotify Premium is required for in-app playback.");
    });
    player.addListener("playback_error", ({ message }) => {
      setError(message);
    });

    const connected = await player.connect();
    if (connected) {
      playerRef.current = player;
      void player.getVolume().then((v) => setVolumeState(v)).catch(() => undefined);
    }
  }, [applyPlayerState, getValidAccessToken]);

  // ---- Session hydration --------------------------------------------------

  const hydrateSession = useCallback(async () => {
    setStatus("connecting");
    setError(null);
    try {
      const token = await getValidAccessToken();
      const me = await getCurrentUser(token);
      setProfile(me);
      setStatus("connected");
      if (tokenRef.current) scheduleRefresh(tokenRef.current);
      if (me.product === "premium") {
        await setupPlayer();
      }
    } catch (err) {
      teardown();
      clearTokens();
      setProfile(null);
      setStatus("disconnected");
      setError(err instanceof Error ? err.message : "Could not connect to Spotify");
    }
  }, [getValidAccessToken, scheduleRefresh, setupPlayer, teardown]);

  // On mount: if we already have stored tokens, restore the session.
  useEffect(() => {
    if (!configured) return;
    const stored = loadTokens();
    if (stored) {
      tokenRef.current = stored;
      void hydrateSession();
    }
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured]);

  // Advance the progress bar locally between SDK state updates.
  useEffect(() => {
    if (paused || !nowPlaying) return;
    const interval = setInterval(() => {
      const sync = positionSyncRef.current;
      if (sync.paused) return;
      const next = Math.min(sync.base + (Date.now() - sync.at), durationMs);
      setPositionMs(next);
    }, 300);
    return () => clearInterval(interval);
  }, [paused, nowPlaying, durationMs]);

  useEffect(() => {
    positionSyncRef.current = { base: positionMs, at: Date.now(), paused };
    // Only re-anchor when play/pause flips, not on every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  // ---- Auth actions -------------------------------------------------------

  const beginLogin = useCallback(async () => {
    setError(null);
    // Remember where the user was so the callback can send them back.
    try {
      localStorage.setItem("SPOTIFY_RETURN_PATH", window.location.hash || "#/whiteboards");
    } catch {
      /* ignore */
    }
    const { beginAuthorization } = await import("../lib/spotify/spotifyAuth");
    await beginAuthorization();
  }, []);

  const completeLogin = useCallback(
    async (code: string, state: string) => {
      const bundle = await exchangeCodeForTokens(code, state);
      tokenRef.current = bundle;
      saveTokens(bundle);
      await hydrateSession();
    },
    [hydrateSession]
  );

  // ---- Playback actions ---------------------------------------------------

  const ensureActiveDevice = useCallback(async () => {
    const deviceId = deviceIdRef.current;
    if (!deviceId) throw new Error("Spotify player is not ready yet");
    if (!transferredRef.current) {
      const token = await getValidAccessToken();
      await transferPlayback(token, deviceId, false);
      transferredRef.current = true;
    }
    return deviceId;
  }, [getValidAccessToken]);

  const playContext = useCallback(
    async (contextUri: string, offsetUri?: string) => {
      const deviceId = await ensureActiveDevice();
      const token = await getValidAccessToken();
      await startPlayback(token, deviceId, { contextUri, offsetUri });
    },
    [ensureActiveDevice, getValidAccessToken]
  );

  const playTrack = useCallback(
    async (trackUri: string) => {
      const deviceId = await ensureActiveDevice();
      const token = await getValidAccessToken();
      await startPlayback(token, deviceId, { uris: [trackUri] });
    },
    [ensureActiveDevice, getValidAccessToken]
  );

  const togglePlay = useCallback(async () => {
    await playerRef.current?.togglePlay();
  }, []);

  const next = useCallback(async () => {
    await playerRef.current?.nextTrack();
  }, []);

  const previous = useCallback(async () => {
    await playerRef.current?.previousTrack();
  }, []);

  const seek = useCallback(async (ms: number) => {
    await playerRef.current?.seek(ms);
    setPositionMs(ms);
    positionSyncRef.current = { base: ms, at: Date.now(), paused: positionSyncRef.current.paused };
  }, []);

  const setVolume = useCallback(async (v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolumeState(clamped);
    await playerRef.current?.setVolume(clamped);
  }, []);

  // ---- Web API helpers ----------------------------------------------------

  const searchCatalog = useCallback(
    async (query: string) => {
      const token = await getValidAccessToken();
      return apiSearch(token, query);
    },
    [getValidAccessToken]
  );

  const fetchPlaylists = useCallback(async () => {
    const token = await getValidAccessToken();
    return getMyPlaylists(token);
  }, [getValidAccessToken]);

  const fetchPlaylistTracks = useCallback(
    async (playlistId: string) => {
      const token = await getValidAccessToken();
      return getPlaylistTracks(token, playlistId);
    },
    [getValidAccessToken]
  );

  const value = useMemo<SpotifyContextValue>(
    () => ({
      configured,
      status,
      profile,
      isPremium,
      error,
      deviceReady,
      nowPlaying,
      paused,
      positionMs,
      durationMs,
      volume,
      hasActiveSession,
      beginLogin,
      completeLogin,
      disconnect,
      togglePlay,
      next,
      previous,
      seek,
      setVolume,
      playContext,
      playTrack,
      searchCatalog,
      fetchPlaylists,
      fetchPlaylistTracks,
    }),
    [
      configured,
      status,
      profile,
      isPremium,
      error,
      deviceReady,
      nowPlaying,
      paused,
      positionMs,
      durationMs,
      volume,
      hasActiveSession,
      beginLogin,
      completeLogin,
      disconnect,
      togglePlay,
      next,
      previous,
      seek,
      setVolume,
      playContext,
      playTrack,
      searchCatalog,
      fetchPlaylists,
      fetchPlaylistTracks,
    ]
  );

  return <SpotifyContext.Provider value={value}>{children}</SpotifyContext.Provider>;
}

export function useSpotify() {
  const ctx = useContext(SpotifyContext);
  if (!ctx) throw new Error("useSpotify must be used within SpotifyProvider");
  return ctx;
}

export function useSpotifyOptional() {
  return useContext(SpotifyContext);
}
