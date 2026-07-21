import { useTimerOptional } from "../../context/TimerContext";
import { useSpotifyOptional } from "../../context/SpotifyContext";
import { TimerFloatingWidget } from "../TimerFloatingWidget";
import { SpotifyMiniPlayer } from "../spotify/SpotifyMiniPlayer";
import { FloatingWidgetStack, type FloatingWidgetSlot } from "./FloatingWidgetStack";

type FloatingWidgetsProps = {
  leftHandMode?: boolean;
  /** True when the Spotify tab is the currently visible sidebar view. */
  spotifyTabVisible: boolean;
  onOpenTimer: () => void;
  onOpenSpotify: () => void;
};

/**
 * Assembles the bottom-corner floating widgets (timer on top, Spotify below)
 * into the shared stack. Each widget's visibility is derived from its own
 * context so they appear/disappear independently and reflow smoothly.
 */
export function FloatingWidgets({
  leftHandMode = false,
  spotifyTabVisible,
  onOpenTimer,
  onOpenSpotify,
}: FloatingWidgetsProps) {
  const timer = useTimerOptional();
  const spotify = useSpotifyOptional();

  const timerVisible = !!timer?.state.running;
  // Only show the mini-player when a track is loaded on the in-app (Premium)
  // device AND the user isn't already looking at the Spotify tab.
  const spotifyVisible =
    !!spotify && spotify.isPremium && spotify.hasActiveSession && !spotifyTabVisible;

  const slots: FloatingWidgetSlot[] = [
    { id: "timer", visible: timerVisible, content: <TimerFloatingWidget onClick={onOpenTimer} /> },
    { id: "spotify", visible: spotifyVisible, content: <SpotifyMiniPlayer onOpen={onOpenSpotify} /> },
  ];

  return <FloatingWidgetStack slots={slots} side={leftHandMode ? "left" : "right"} />;
}
