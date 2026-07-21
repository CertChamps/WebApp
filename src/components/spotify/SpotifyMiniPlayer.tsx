import type { MouseEvent } from "react";
import { LuPause, LuPlay, LuSkipBack, LuSkipForward, LuMusic } from "react-icons/lu";
import { useSpotify } from "../../context/SpotifyContext";
import { SpotifyLogo } from "./SpotifyLogo";

type SpotifyMiniPlayerProps = {
  /** Reopen the tools sidebar on the Spotify tab. */
  onOpen?: () => void;
};

/**
 * Compact floating now-playing bar. Positioning/animation is handled by the
 * shared FloatingWidgetStack — this component only renders the bar content.
 * Clicking anywhere except the control buttons reopens the Spotify tab.
 */
export function SpotifyMiniPlayer({ onOpen }: SpotifyMiniPlayerProps) {
  const { nowPlaying, paused, togglePlay, next, previous } = useSpotify();

  if (!nowPlaying) return null;

  const stop = (e: MouseEvent) => e.stopPropagation();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen?.();
      }}
      title="Open Spotify"
      className="flex w-[220px] cursor-pointer items-center gap-2 rounded-xl border border-grey/25 color-bg p-2 backdrop-blur-xl transition-colors hover:border-grey/40"
    >
      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md color-bg-grey-10">
        {nowPlaying.albumArt ? (
          <img src={nowPlaying.albumArt} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <LuMusic size={16} className="color-txt-sub" />
        )}
        <SpotifyLogo className="absolute -bottom-0.5 -right-0.5 h-3 w-3 color-txt-main opacity-80" />
      </div>

      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="truncate text-xs font-semibold color-txt-main" title={nowPlaying.name}>
          {nowPlaying.name}
        </p>
        <p className="truncate text-[11px] color-txt-sub" title={nowPlaying.artist}>
          {nowPlaying.artist}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          onClick={(e) => {
            stop(e);
            void previous();
          }}
          aria-label="Previous track"
          className="flex h-7 w-6 items-center justify-center color-txt-sub transition-colors hover:color-txt-main"
        >
          <LuSkipBack size={15} strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            stop(e);
            void togglePlay();
          }}
          aria-label={paused ? "Play" : "Pause"}
          className="flex h-8 w-8 items-center justify-center rounded-full color-bg-accent color-txt-accent transition-opacity hover:opacity-80"
        >
          {paused ? <LuPlay size={15} strokeWidth={2} className="ml-0.5" /> : <LuPause size={15} strokeWidth={2} />}
        </button>
        <button
          type="button"
          onClick={(e) => {
            stop(e);
            void next();
          }}
          aria-label="Next track"
          className="flex h-7 w-6 items-center justify-center color-txt-sub transition-colors hover:color-txt-main"
        >
          <LuSkipForward size={15} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
