import type { MouseEvent } from "react";
import { LuPause, LuPlay, LuSkipBack, LuSkipForward, LuMusic } from "react-icons/lu";
import { useSpotify } from "../../context/SpotifyContext";
import { SpotifyLogo } from "./SpotifyLogo";
import { spotify } from "./spotifyTheme";

type SpotifyMiniPlayerProps = {
  /** Reopen the tools sidebar on the Spotify tab. */
  onOpen?: () => void;
};

/**
 * Compact floating now-playing bar in Spotify's dark style. Positioning and
 * animation are handled by the shared FloatingWidgetStack — this component only
 * renders the bar. Clicking anywhere except the control buttons reopens the
 * Spotify tab.
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
      className="flex w-[264px] cursor-pointer items-center gap-2 rounded-xl bg-[#181818] p-2 shadow-lg ring-1 ring-white/10 transition-colors hover:bg-[#282828]"
    >
      <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[#282828]">
        {nowPlaying.albumArt ? (
          <img src={nowPlaying.albumArt} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <LuMusic size={16} className={spotify.textSub} />
        )}
        <SpotifyLogo className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 ${spotify.greenText}`} />
      </div>

      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="truncate text-xs font-semibold text-white" title={nowPlaying.name}>
          {nowPlaying.name}
        </p>
        <p className={`truncate text-[11px] ${spotify.textSub}`} title={nowPlaying.artist}>
          {nowPlaying.artist}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onPointerDown={stop}
          onClick={(e) => {
            stop(e);
            void previous();
          }}
          aria-label="Previous track"
          className={`flex h-9 w-9 items-center justify-center rounded-full ${spotify.textSub} transition-colors hover:bg-white/10 hover:text-white`}
        >
          <LuSkipBack size={17} strokeWidth={2} fill="currentColor" />
        </button>
        <button
          type="button"
          onPointerDown={stop}
          onClick={(e) => {
            stop(e);
            void togglePlay();
          }}
          aria-label={paused ? "Play" : "Pause"}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black transition-transform hover:scale-105"
        >
          {paused ? <LuPlay size={17} strokeWidth={0} fill="currentColor" className="ml-0.5" /> : <LuPause size={17} strokeWidth={0} fill="currentColor" />}
        </button>
        <button
          type="button"
          onPointerDown={stop}
          onClick={(e) => {
            stop(e);
            void next();
          }}
          aria-label="Next track"
          className={`flex h-9 w-9 items-center justify-center rounded-full ${spotify.textSub} transition-colors hover:bg-white/10 hover:text-white`}
        >
          <LuSkipForward size={17} strokeWidth={2} fill="currentColor" />
        </button>
      </div>
    </div>
  );
}
