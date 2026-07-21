import { useCallback, useEffect, useRef, useState } from "react";
import {
  LuSearch,
  LuChevronLeft,
  LuListMusic,
  LuLoaderCircle,
  LuPlay,
  LuX,
  LuClock3,
  LuLibrary,
  LuDisc3,
  LuTriangleAlert,
} from "react-icons/lu";
import { useSpotify } from "../../context/SpotifyContext";
import {
  SpotifyApiError,
  playlistTrackCount,
  type RecentlyPlayed,
  type SpotifyAlbum,
  type SpotifyPlaylist,
  type SpotifySearchResults,
  type SpotifyTrack,
} from "../../lib/spotify";
import { spotify } from "./spotifyTheme";

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof SpotifyApiError) {
    // Prefer the Spotify error detail we parse into the message after the status.
    const match = e.message.match(/failed \(\d+\):\s*(.+)$/);
    if (match?.[1]) return match[1];
    if (e.status === 401 || e.status === 403) {
      return "Spotify blocked this request. Reconnect to refresh permissions, or open a playlist you own.";
    }
    return e.message;
  }
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

function isAuthError(e: unknown): boolean {
  return e instanceof SpotifyApiError && (e.status === 401 || e.status === 403);
}

function ErrorNotice({
  message,
  authError,
  onReconnect,
  onRetry,
}: {
  message: string;
  authError: boolean;
  onReconnect: () => void;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-2 py-6 text-center">
      <LuTriangleAlert size={18} className="text-[#f0c26b]" />
      <p className={`max-w-[240px] text-xs ${spotify.textSub}`}>{message}</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {authError ? (
          <button
            type="button"
            onClick={onReconnect}
            className={`rounded-full px-4 py-1.5 text-[11px] font-bold text-black ${spotify.green}`}
          >
            Reconnect
          </button>
        ) : null}
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-full bg-white/10 px-4 py-1.5 text-[11px] font-semibold text-white hover:bg-white/20"
          >
            Try again
          </button>
        ) : null}
      </div>
    </div>
  );
}

function TrackRow({ track, onPlay }: { track: SpotifyTrack; onPlay: () => void }) {
  const art = track.album?.images?.[track.album.images.length - 1]?.url ?? null;
  return (
    <button
      type="button"
      onClick={onPlay}
      className={`group flex w-full items-center gap-2 rounded-md p-1.5 text-left transition-colors ${spotify.rowHover}`}
    >
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-[#282828]">
        {art ? <img src={art} alt="" className="h-full w-full object-cover" draggable={false} /> : null}
        <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
          <LuPlay size={14} strokeWidth={0} fill="currentColor" className="text-white" />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-white">{track.name}</p>
        <p className={`truncate text-[11px] ${spotify.textSub}`}>
          {(track.artists ?? []).map((a) => a.name).join(", ") || "Unknown artist"}
        </p>
      </div>
    </button>
  );
}

function CardRow({
  title,
  subtitle,
  art,
  rounded,
  fallback,
  onOpen,
}: {
  title: string;
  subtitle: string;
  art: string | null;
  rounded: boolean;
  fallback: React.ReactNode;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group flex w-full items-center gap-2 rounded-md p-1.5 text-left transition-colors ${spotify.rowHover}`}
    >
      <div
        className={`relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden bg-[#282828] ${
          rounded ? "rounded-full" : "rounded"
        }`}
      >
        {art ? <img src={art} alt="" className="h-full w-full object-cover" draggable={false} /> : fallback}
        <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
          <LuPlay size={14} strokeWidth={0} fill="currentColor" className="text-white" />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-white">{title}</p>
        <p className={`truncate text-[11px] ${spotify.textSub}`}>{subtitle}</p>
      </div>
    </button>
  );
}

function PlaylistRow({ playlist, onOpen }: { playlist: SpotifyPlaylist; onOpen: () => void }) {
  const count = playlistTrackCount(playlist);
  return (
    <CardRow
      title={playlist.name}
      subtitle={count != null ? `${count} tracks` : "Playlist"}
      art={playlist.images?.[0]?.url ?? null}
      rounded={false}
      fallback={<LuListMusic size={16} className={spotify.textSub} />}
      onOpen={onOpen}
    />
  );
}

function AlbumRow({ album, onPlay }: { album: SpotifyAlbum; onPlay: () => void }) {
  return (
    <CardRow
      title={album.name}
      subtitle={(album.artists ?? []).map((a) => a.name).join(", ") || "Album"}
      art={album.images?.[0]?.url ?? null}
      rounded={false}
      fallback={<LuDisc3 size={16} className={spotify.textSub} />}
      onOpen={onPlay}
    />
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <p className={`px-1 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wide ${spotify.textSub}`}>{children}</p>
  );
}

function Loading() {
  return (
    <div className={`flex items-center justify-center py-6 ${spotify.textSub}`}>
      <LuLoaderCircle size={18} className="animate-spin" />
    </div>
  );
}

type BrowseTab = "library" | "recent";
type FetchError = { auth: boolean; message: string };

export function SpotifyBrowse() {
  const {
    searchCatalog,
    fetchPlaylists,
    fetchPlaylistTracks,
    fetchRecentlyPlayed,
    playTrack,
    playContext,
    beginLogin,
  } = useSpotify();

  const [tab, setTab] = useState<BrowseTab>("library");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SpotifySearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<FetchError | null>(null);

  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(true);

  const [recent, setRecent] = useState<RecentlyPlayed | null>(null);
  const [recentLoading, setRecentLoading] = useState(false);
  const [recentError, setRecentError] = useState<FetchError | null>(null);
  const [recentNonce, setRecentNonce] = useState(0);

  const reconnect = useCallback(() => void beginLogin(), [beginLogin]);

  const [openPlaylist, setOpenPlaylist] = useState<SpotifyPlaylist | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<SpotifyTrack[]>([]);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [tracksError, setTracksError] = useState<FetchError | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPlaylistsLoading(true);
    fetchPlaylists()
      .then((data) => {
        if (!cancelled) setPlaylists(data);
      })
      .catch(() => {
        if (!cancelled) setPlaylists([]);
      })
      .finally(() => {
        if (!cancelled) setPlaylistsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchPlaylists]);

  useEffect(() => {
    if (tab !== "recent") return;
    let cancelled = false;
    setRecentLoading(true);
    setRecentError(null);
    fetchRecentlyPlayed()
      .then((data) => {
        if (!cancelled) {
          setRecent(data);
          setRecentError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setRecent(null);
          setRecentError({ auth: isAuthError(e), message: errorMessage(e, "Couldn't load recently played.") });
        }
      })
      .finally(() => {
        if (!cancelled) setRecentLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, recentNonce, fetchRecentlyPlayed]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (!trimmed) {
      setResults(null);
      setSearching(false);
      setSearchError(null);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      searchCatalog(trimmed)
        .then((r) => {
          setResults(r);
          setSearchError(null);
        })
        .catch((e) => {
          setResults(null);
          setSearchError({ auth: isAuthError(e), message: errorMessage(e, "Search failed.") });
        })
        .finally(() => setSearching(false));
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, searchCatalog]);

  const openPlaylistView = useCallback(
    (playlist: SpotifyPlaylist) => {
      setOpenPlaylist(playlist);
      setTracksLoading(true);
      setPlaylistTracks([]);
      setTracksError(null);
      fetchPlaylistTracks(playlist.id)
        .then((t) => {
          setPlaylistTracks(t);
          setTracksError(null);
        })
        .catch((e) => {
          setPlaylistTracks([]);
          setTracksError({
            auth: isAuthError(e),
            message: errorMessage(
              e,
              "Couldn't load playlist songs. Spotify only allows this for playlists you own."
            ),
          });
        })
        .finally(() => setTracksLoading(false));
    },
    [fetchPlaylistTracks]
  );

  const showTabs = !query.trim() && !openPlaylist;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className={`flex items-center gap-2 rounded-full ${spotify.input} px-3 py-2`}>
        <LuSearch size={15} className={`shrink-0 ${spotify.textSub}`} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tracks, playlists…"
          className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-[#b3b3b3]"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className={`${spotify.textSub} hover:text-white`}
          >
            <LuX size={14} />
          </button>
        ) : null}
      </div>

      {showTabs ? (
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setTab("library")}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
              tab === "library" ? spotify.pillActive : spotify.pill
            }`}
          >
            <LuLibrary size={13} strokeWidth={2.2} />
            Library
          </button>
          <button
            type="button"
            onClick={() => setTab("recent")}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
              tab === "recent" ? spotify.pillActive : spotify.pill
            }`}
          >
            <LuClock3 size={13} strokeWidth={2.2} />
            Recent
          </button>
        </div>
      ) : null}

      <div className="scrollbar-minimal min-h-0 flex-1 overflow-y-auto pr-0.5">
        {query.trim() ? (
          searching ? (
            <Loading />
          ) : searchError ? (
            <ErrorNotice
              message={searchError.message}
              authError={searchError.auth}
              onReconnect={reconnect}
              onRetry={() => {
                setSearchError(null);
                setQuery((q) => q + " ");
                setTimeout(() => setQuery((q) => q.trim()), 0);
              }}
            />
          ) : results && (results.tracks.length > 0 || results.playlists.length > 0) ? (
            <div className="flex flex-col gap-3">
              {results.tracks.length > 0 && (
                <div>
                  <SectionHeader>Tracks</SectionHeader>
                  <div className="flex flex-col">
                    {results.tracks.map((t) => (
                      <TrackRow key={t.id} track={t} onPlay={() => void playTrack(t.uri)} />
                    ))}
                  </div>
                </div>
              )}
              {results.playlists.length > 0 && (
                <div>
                  <SectionHeader>Playlists</SectionHeader>
                  <div className="flex flex-col">
                    {results.playlists.map((p) => (
                      <PlaylistRow key={p.id} playlist={p} onOpen={() => openPlaylistView(p)} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className={`px-1 py-6 text-center text-xs ${spotify.textSub}`}>No results found.</p>
          )
        ) : openPlaylist ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1 pb-1">
              <button
                type="button"
                onClick={() => setOpenPlaylist(null)}
                aria-label="Back"
                className={`flex items-center gap-1 text-xs ${spotify.textSub} transition-colors hover:text-white`}
              >
                <LuChevronLeft size={16} />
                Back
              </button>
              <button
                type="button"
                onClick={() => void playContext(openPlaylist.uri)}
                className={`ml-auto flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold text-black ${spotify.green}`}
              >
                <LuPlay size={12} strokeWidth={0} fill="currentColor" />
                Play
              </button>
            </div>
            <p className="truncate px-1 text-sm font-bold text-white" title={openPlaylist.name}>
              {openPlaylist.name}
            </p>
            {tracksLoading ? (
              <Loading />
            ) : tracksError ? (
              <ErrorNotice
                message={tracksError.message}
                authError={tracksError.auth}
                onReconnect={reconnect}
                onRetry={() => openPlaylistView(openPlaylist)}
              />
            ) : playlistTracks.length > 0 ? (
              <div className="flex flex-col">
                {playlistTracks.map((t) => (
                  <TrackRow key={t.id} track={t} onPlay={() => void playContext(openPlaylist.uri, t.uri)} />
                ))}
              </div>
            ) : (
              <p className={`px-1 py-6 text-center text-xs ${spotify.textSub}`}>
                No songs to show. You can still press Play to start the playlist.
              </p>
            )}
          </div>
        ) : tab === "recent" ? (
          recentLoading ? (
            <Loading />
          ) : recentError ? (
            <ErrorNotice
              message={recentError.message}
              authError={recentError.auth}
              onReconnect={reconnect}
              onRetry={() => setRecentNonce((n) => n + 1)}
            />
          ) : recent && (recent.tracks.length || recent.albums.length || recent.playlists.length) ? (
            <div className="flex flex-col gap-3">
              {recent.tracks.length > 0 && (
                <div>
                  <SectionHeader>Recent songs</SectionHeader>
                  <div className="flex flex-col">
                    {recent.tracks.map((t) => (
                      <TrackRow key={t.id} track={t} onPlay={() => void playTrack(t.uri)} />
                    ))}
                  </div>
                </div>
              )}
              {recent.albums.length > 0 && (
                <div>
                  <SectionHeader>Recent albums</SectionHeader>
                  <div className="flex flex-col">
                    {recent.albums.map((a) => (
                      <AlbumRow key={a.id} album={a} onPlay={() => void playContext(a.uri)} />
                    ))}
                  </div>
                </div>
              )}
              {recent.playlists.length > 0 && (
                <div>
                  <SectionHeader>Recent playlists</SectionHeader>
                  <div className="flex flex-col">
                    {recent.playlists.map((p) => (
                      <PlaylistRow key={p.id} playlist={p} onOpen={() => openPlaylistView(p)} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className={`px-1 py-6 text-center text-xs ${spotify.textSub}`}>Nothing played recently.</p>
          )
        ) : (
          <div>
            <SectionHeader>Your playlists</SectionHeader>
            {playlistsLoading ? (
              <Loading />
            ) : playlists.length > 0 ? (
              <div className="flex flex-col">
                {playlists.map((p) => (
                  <PlaylistRow key={p.id} playlist={p} onOpen={() => openPlaylistView(p)} />
                ))}
              </div>
            ) : (
              <p className={`px-1 py-6 text-center text-xs ${spotify.textSub}`}>No playlists yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
