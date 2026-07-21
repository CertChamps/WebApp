import { useCallback, useEffect, useRef, useState } from "react";
import { LuSearch, LuChevronLeft, LuListMusic, LuLoaderCircle, LuPlay, LuX } from "react-icons/lu";
import { useSpotify } from "../../context/SpotifyContext";
import type { SpotifyPlaylist, SpotifySearchResults, SpotifyTrack } from "../../lib/spotify";

function TrackRow({ track, onPlay }: { track: SpotifyTrack; onPlay: () => void }) {
  const art = track.album?.images?.[track.album.images.length - 1]?.url ?? null;
  return (
    <button
      type="button"
      onClick={onPlay}
      className="group flex w-full items-center gap-2 rounded-lg p-1.5 text-left transition-colors hover:color-bg-grey-5"
    >
      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded color-bg-grey-10">
        {art ? <img src={art} alt="" className="h-full w-full object-cover" draggable={false} /> : null}
        <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
          <LuPlay size={14} strokeWidth={2.5} className="text-white" />
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold color-txt-main">{track.name}</p>
        <p className="truncate text-[11px] color-txt-sub">{track.artists.map((a) => a.name).join(", ")}</p>
      </div>
    </button>
  );
}

function PlaylistRow({ playlist, onOpen }: { playlist: SpotifyPlaylist; onOpen: () => void }) {
  const art = playlist.images?.[0]?.url ?? null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-2 rounded-lg p-1.5 text-left transition-colors hover:color-bg-grey-5"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded color-bg-grey-10">
        {art ? (
          <img src={art} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <LuListMusic size={16} className="color-txt-sub" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold color-txt-main">{playlist.name}</p>
        <p className="truncate text-[11px] color-txt-sub">{playlist.tracks.total} tracks</p>
      </div>
    </button>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-6 color-txt-sub">
      <LuLoaderCircle size={18} className="animate-spin" />
    </div>
  );
}

export function SpotifyBrowse() {
  const { searchCatalog, fetchPlaylists, fetchPlaylistTracks, playTrack, playContext } = useSpotify();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SpotifySearchResults | null>(null);
  const [searching, setSearching] = useState(false);

  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(true);

  const [openPlaylist, setOpenPlaylist] = useState<SpotifyPlaylist | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<SpotifyTrack[]>([]);
  const [tracksLoading, setTracksLoading] = useState(false);

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
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (!trimmed) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      searchCatalog(trimmed)
        .then((r) => setResults(r))
        .catch(() => setResults({ tracks: [], playlists: [] }))
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
      fetchPlaylistTracks(playlist.id)
        .then((t) => setPlaylistTracks(t))
        .catch(() => setPlaylistTracks([]))
        .finally(() => setTracksLoading(false));
    },
    [fetchPlaylistTracks]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/* Search bar */}
      <div className="flex items-center gap-2 rounded-out border border-grey/25 px-2.5 py-1.5 focus-within:color-shadow-accent">
        <LuSearch size={15} className="shrink-0 color-txt-sub" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tracks, playlists…"
          className="min-w-0 flex-1 bg-transparent text-xs color-txt-main outline-none placeholder:color-txt-sub"
        />
        {query ? (
          <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="color-txt-sub hover:color-txt-main">
            <LuX size={14} />
          </button>
        ) : null}
      </div>

      <div className="scrollbar-minimal min-h-0 flex-1 overflow-y-auto pr-0.5">
        {query.trim() ? (
          // ---- Search results ----
          searching ? (
            <Loading />
          ) : results && (results.tracks.length > 0 || results.playlists.length > 0) ? (
            <div className="flex flex-col gap-3">
              {results.tracks.length > 0 && (
                <div>
                  <p className="px-1 pb-1 text-[11px] font-bold uppercase tracking-wide color-txt-sub">Tracks</p>
                  <div className="flex flex-col">
                    {results.tracks.map((t) => (
                      <TrackRow key={t.id} track={t} onPlay={() => void playTrack(t.uri)} />
                    ))}
                  </div>
                </div>
              )}
              {results.playlists.length > 0 && (
                <div>
                  <p className="px-1 pb-1 text-[11px] font-bold uppercase tracking-wide color-txt-sub">Playlists</p>
                  <div className="flex flex-col">
                    {results.playlists.map((p) => (
                      <PlaylistRow key={p.id} playlist={p} onOpen={() => openPlaylistView(p)} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="px-1 py-6 text-center text-xs color-txt-sub">No results found.</p>
          )
        ) : openPlaylist ? (
          // ---- Single playlist view ----
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1 pb-1">
              <button
                type="button"
                onClick={() => setOpenPlaylist(null)}
                aria-label="Back to playlists"
                className="flex items-center gap-1 text-xs color-txt-sub transition-colors hover:color-txt-main"
              >
                <LuChevronLeft size={16} />
                Back
              </button>
              <button
                type="button"
                onClick={() => void playContext(openPlaylist.uri)}
                className="ml-auto flex items-center gap-1 rounded-full color-bg-accent color-txt-accent px-3 py-1 text-[11px] font-semibold transition-opacity hover:opacity-80"
              >
                <LuPlay size={12} strokeWidth={2.5} />
                Play all
              </button>
            </div>
            <p className="truncate px-1 text-sm font-bold color-txt-main" title={openPlaylist.name}>
              {openPlaylist.name}
            </p>
            {tracksLoading ? (
              <Loading />
            ) : (
              <div className="flex flex-col">
                {playlistTracks.map((t) => (
                  <TrackRow
                    key={t.id}
                    track={t}
                    onPlay={() => void playContext(openPlaylist.uri, t.uri)}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          // ---- Playlist browse ----
          <div>
            <p className="px-1 pb-1 text-[11px] font-bold uppercase tracking-wide color-txt-sub">Your playlists</p>
            {playlistsLoading ? (
              <Loading />
            ) : playlists.length > 0 ? (
              <div className="flex flex-col">
                {playlists.map((p) => (
                  <PlaylistRow key={p.id} playlist={p} onOpen={() => openPlaylistView(p)} />
                ))}
              </div>
            ) : (
              <p className="px-1 py-6 text-center text-xs color-txt-sub">No playlists yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
