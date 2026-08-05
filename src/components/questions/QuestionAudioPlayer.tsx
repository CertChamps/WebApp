import { useEffect, useRef, useState } from "react";
import { getDownloadURL, ref } from "firebase/storage";
import { LuLoaderCircle, LuPause, LuPlay, LuVolume2 } from "react-icons/lu";
import { storage } from "../../../firebase";

export type QuestionAudioPlayerProps = {
  /** Firebase Storage path, e.g. exam-audio/….mp3 */
  audioPath: string;
  /** Absolute seek offset into the shared track (seconds). Playback cannot go before this. */
  startSec?: number;
  startLabel?: string;
  className?: string;
};

function formatTime(totalSec: number): string {
  if (!Number.isFinite(totalSec) || totalSec < 0) return "0:00";
  const s = Math.floor(totalSec);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, "0")}`;
}

/** Pause competing media in-page; browser/OS may also duck Spotify / other apps. */
function pauseOtherPageMedia(except: HTMLMediaElement | null) {
  const nodes = document.querySelectorAll("audio, video");
  nodes.forEach((node) => {
    if (!(node instanceof HTMLMediaElement)) return;
    if (except && node === except) return;
    try {
      node.pause();
    } catch {
      /* ignore */
    }
  });
  try {
    // Nudge the browser media session so other media clients yield when possible.
    if (navigator.mediaSession) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: "CertChamps listening",
        artist: "Exam audio",
      });
      navigator.mediaSession.playbackState = "playing";
    }
  } catch {
    /* ignore */
  }
}

/**
 * Compact listening player for practice / whiteboard question views.
 * Starts at `startSec` and clamps seeking so the user stays in that question's
 * region of the shared exam MP3 (cannot scrub earlier than the timestamp).
 */
export default function QuestionAudioPlayer({
  audioPath,
  startSec = 0,
  startLabel,
  className = "",
}: QuestionAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [currentRel, setCurrentRel] = useState(0);
  const [durationAbs, setDurationAbs] = useState(0);
  const [ready, setReady] = useState(false);

  const start = Math.max(0, startSec || 0);
  const playableDuration = Math.max(0, durationAbs - start);

  useEffect(() => {
    let cancelled = false;
    setLoadingUrl(true);
    setLoadError(null);
    setUrl(null);
    setReady(false);
    setPlaying(false);
    setCurrentRel(0);
    setDurationAbs(0);

    const path = audioPath.trim();
    if (!path) {
      setLoadingUrl(false);
      setLoadError("No audio");
      return;
    }

    getDownloadURL(ref(storage, path))
      .then((downloadUrl) => {
        if (!cancelled) {
          setUrl(downloadUrl);
          setLoadingUrl(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn("[QuestionAudioPlayer] failed to resolve audio:", err);
          setLoadError("Couldn't load audio");
          setLoadingUrl(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [audioPath]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !url) return;

    const onLoaded = () => {
      setDurationAbs(el.duration || 0);
      el.currentTime = start;
      setCurrentRel(0);
      setReady(true);
    };
    const onTime = () => {
      if (el.currentTime < start - 0.05) {
        el.currentTime = start;
      }
      setCurrentRel(Math.max(0, el.currentTime - start));
    };
    const onPlay = () => {
      pauseOtherPageMedia(el);
      try {
        if (navigator.mediaSession) {
          navigator.mediaSession.playbackState = "playing";
        }
      } catch {
        /* ignore */
      }
      setPlaying(true);
    };
    const onPause = () => {
      try {
        if (navigator.mediaSession) {
          navigator.mediaSession.playbackState = "paused";
        }
      } catch {
        /* ignore */
      }
      setPlaying(false);
    };
    const onEnded = () => {
      setPlaying(false);
      el.currentTime = start;
      setCurrentRel(0);
    };

    el.addEventListener("loadedmetadata", onLoaded);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);

    el.load();

    return () => {
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
      el.pause();
    };
  }, [url, start]);

  const togglePlay = async () => {
    const el = audioRef.current;
    if (!el || !ready) return;
    if (el.paused) {
      pauseOtherPageMedia(el);
      if (el.currentTime < start) el.currentTime = start;
      try {
        await el.play();
      } catch (err) {
        console.warn("[QuestionAudioPlayer] play failed:", err);
      }
    } else {
      el.pause();
    }
  };

  const onSeek = (rel: number) => {
    const el = audioRef.current;
    if (!el || !ready) return;
    const clamped = Math.min(Math.max(0, rel), playableDuration || 0);
    el.currentTime = start + clamped;
    setCurrentRel(clamped);
  };

  if (loadingUrl) {
    return (
      <div
        className={`flex w-full items-center gap-3 rounded-xl border border-transparent color-bg color-shadow px-4 py-3 ${className}`}
      >
        <LuLoaderCircle size={18} className="animate-spin color-txt-sub shrink-0" />
        <span className="text-sm color-txt-sub">Loading audio…</span>
      </div>
    );
  }

  if (loadError || !url) {
    return (
      <div
        className={`flex w-full items-center gap-3 rounded-xl border border-transparent color-bg color-shadow px-4 py-3 ${className}`}
      >
        <LuVolume2 size={18} className="color-txt-sub shrink-0" />
        <span className="text-sm color-txt-sub">{loadError ?? "Audio unavailable"}</span>
      </div>
    );
  }

  return (
    <div
      className={`flex w-full flex-col gap-2 rounded-xl border border-transparent color-bg color-shadow px-4 py-3 ${className}`}
    >
      <audio ref={audioRef} src={url} preload="metadata" playsInline />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void togglePlay()}
          disabled={!ready}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full color-bg-accent color-txt-accent cursor-pointer select-none transition-transform duration-150 hover:opacity-95 active:scale-95 disabled:opacity-50"
          aria-label={playing ? "Pause audio" : "Play audio"}
        >
          {playing ? <LuPause size={18} strokeWidth={2.4} /> : <LuPlay size={18} strokeWidth={2.4} className="ml-0.5" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium color-txt-main truncate">
              <LuVolume2 size={16} className="shrink-0 color-txt-sub" />
              Listening
              {start > 0 && (
                <span className="text-xs font-normal color-txt-sub">
                  from {startLabel?.trim() || formatTime(start)}
                </span>
              )}
            </span>
            <span className="text-xs tabular-nums color-txt-sub shrink-0">
              {formatTime(currentRel)} / {formatTime(playableDuration)}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={playableDuration || 0}
            step={0.1}
            value={Math.min(currentRel, playableDuration || 0)}
            disabled={!ready || playableDuration <= 0}
            onChange={(e) => onSeek(Number(e.target.value))}
            className="question-audio-slider"
            aria-label="Audio progress"
          />
        </div>
      </div>
    </div>
  );
}
