import { useCallback, type ChangeEvent } from "react";
import {
  LuPause,
  LuPlay,
  LuSkipBack,
  LuSkipForward,
  LuVolume1,
  LuVolume2,
  LuVolumeX,
  LuMusic,
} from "react-icons/lu";
import { useSpotify } from "../../context/SpotifyContext";
import { SPOTIFY_GREEN, spotify } from "./spotifyTheme";
import { useAlbumColor } from "./useAlbumColor";

function formatMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function SpotifyNowPlaying() {
  const {
    nowPlaying,
    paused,
    positionMs,
    durationMs,
    volume,
    togglePlay,
    next,
    previous,
    seek,
    setVolume,
  } = useSpotify();

  const onSeek = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      void seek(Number(e.target.value));
    },
    [seek]
  );

  const onVolume = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      void setVolume(Number(e.target.value) / 100);
    },
    [setVolume]
  );

  const VolumeIcon = volume === 0 ? LuVolumeX : volume < 0.5 ? LuVolume1 : LuVolume2;

  const accent = useAlbumColor(nowPlaying?.albumArt ?? null);

  if (!nowPlaying) {
    return (
      <div className={`flex flex-col items-center justify-center gap-2 rounded-lg ${spotify.card} p-6 text-center`}>
        <LuMusic size={26} strokeWidth={1.5} className={`${spotify.textSub} opacity-60`} />
        <p className="text-sm font-medium text-white">Nothing playing</p>
        <p className={`text-xs ${spotify.textSub}`}>Pick a track or playlist below to start listening.</p>
      </div>
    );
  }

  const progressMax = durationMs || 1;

  return (
    <div
      className="flex flex-col gap-3 rounded-lg p-3"
      style={{ background: `linear-gradient(to bottom, ${accent} 0%, #191919 72%)` }}
    >
      <div className="flex flex-col items-center gap-3">
        <div className="aspect-square w-full max-w-[170px] overflow-hidden rounded-md bg-black/30 shadow-lg">
          {nowPlaying.albumArt ? (
            <img
              src={nowPlaying.albumArt}
              alt={nowPlaying.name}
              className="h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <LuMusic size={32} strokeWidth={1.5} className={`${spotify.textSub} opacity-50`} />
            </div>
          )}
        </div>
        <div className="w-full text-center">
          <p className="truncate text-sm font-bold text-white" title={nowPlaying.name}>
            {nowPlaying.name}
          </p>
          <p className={`truncate text-xs ${spotify.textSub}`} title={nowPlaying.artist}>
            {nowPlaying.artist}
          </p>
        </div>
      </div>

      {/* Seekable progress bar */}
      <div className="flex flex-col gap-1">
        <input
          type="range"
          min={0}
          max={progressMax}
          value={Math.min(positionMs, progressMax)}
          onChange={onSeek}
          aria-label="Seek"
          style={{ accentColor: SPOTIFY_GREEN }}
          className="h-1 w-full cursor-pointer rounded-full"
        />
        <div className={`flex justify-between text-[10px] tabular-nums ${spotify.textSub}`}>
          <span>{formatMs(positionMs)}</span>
          <span>{formatMs(durationMs)}</span>
        </div>
      </div>

      {/* Transport controls */}
      <div className="flex items-center justify-center gap-5">
        <button
          type="button"
          onClick={() => void previous()}
          aria-label="Previous track"
          className={`${spotify.textSub} transition-colors hover:text-white`}
        >
          <LuSkipBack size={20} strokeWidth={2} fill="currentColor" />
        </button>
        <button
          type="button"
          onClick={() => void togglePlay()}
          aria-label={paused ? "Play" : "Pause"}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-black transition-transform hover:scale-105"
        >
          {paused ? <LuPlay size={22} strokeWidth={0} fill="currentColor" className="ml-0.5" /> : <LuPause size={22} strokeWidth={0} fill="currentColor" />}
        </button>
        <button
          type="button"
          onClick={() => void next()}
          aria-label="Next track"
          className={`${spotify.textSub} transition-colors hover:text-white`}
        >
          <LuSkipForward size={20} strokeWidth={2} fill="currentColor" />
        </button>
      </div>

      {/* Volume */}
      <div className="flex items-center gap-2">
        <VolumeIcon size={16} strokeWidth={2} className={`shrink-0 ${spotify.textSub}`} />
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          onChange={onVolume}
          aria-label="Volume"
          style={{ accentColor: SPOTIFY_GREEN }}
          className="h-1 w-full cursor-pointer rounded-full"
        />
      </div>
    </div>
  );
}
