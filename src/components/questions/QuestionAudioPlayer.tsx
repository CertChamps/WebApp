import { useEffect, useRef, useState, type CSSProperties } from "react";
import { getDownloadURL, ref } from "firebase/storage";
import { LuLoaderCircle, LuPause, LuPlay, LuVolume2 } from "react-icons/lu";
import { storage } from "../../../firebase";

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25] as const;
type PlaybackRate = (typeof PLAYBACK_RATES)[number];

/** ~160 kbps MP3 — used before we know Content-Length + duration. */
const EST_BYTES_PER_SEC = 20_000;
/** Prefetch about one minute around the playhead so play starts quickly. */
const PREFETCH_WINDOW_SEC = 60;
const PREFETCH_CHUNK_BYTES = EST_BYTES_PER_SEC * PREFETCH_WINDOW_SEC;

export type QuestionAudioPlayerProps = {
  /** Firebase Storage path, e.g. exam-audio/….mp3 */
  audioPath: string;
  /** Absolute seek offset into the shared track (seconds). Playback starts here. */
  startSec?: number;
  /** @deprecated Ignored — students can play the full track. Kept for call-site compatibility. */
  endSec?: number;
  startLabel?: string;
  className?: string;
  /** When false, skip resolving/loading audio until the user presses play. Default true. */
  autoLoad?: boolean;
};

function formatTime(totalSec: number): string {
  if (!Number.isFinite(totalSec) || totalSec < 0) return "0:00";
  const s = Math.floor(totalSec);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, "0")}`;
}

function formatRate(rate: number): string {
  return rate === 1 ? "1×" : `${rate}×`;
}

function stripFragment(url: string): string {
  return url.split("#")[0] ?? url;
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

/** Media-fragment URL so supporting browsers seek to the question start on load. */
function withMediaFragment(downloadUrl: string, start: number): string {
  const base = stripFragment(downloadUrl);
  if (start > 0) return `${base}#t=${start}`;
  return base;
}

const urlCache = new Map<string, string>();
const fileSizeCache = new Map<string, number>();
const warmRangeKeys = new Set<string>();

async function resolveAudioDownloadUrl(path: string): Promise<string> {
  const cached = urlCache.get(path);
  if (cached) return cached;
  const url = await getDownloadURL(ref(storage, path));
  urlCache.set(path, url);
  return url;
}

async function resolveFileSize(downloadUrl: string): Promise<number | null> {
  const base = stripFragment(downloadUrl);
  const cached = fileSizeCache.get(base);
  if (cached != null) return cached;
  try {
    const res = await fetch(base, { method: "HEAD", mode: "cors" });
    const len = Number(res.headers.get("content-length"));
    if (Number.isFinite(len) && len > 0) {
      fileSizeCache.set(base, len);
      return len;
    }
  } catch {
    /* ignore — Range warm-up is best-effort */
  }
  return null;
}

function secToByte(sec: number, durationSec: number | null, fileSize: number | null): number {
  if (fileSize != null && durationSec != null && durationSec > 0) {
    return Math.max(0, Math.min(fileSize - 1, Math.floor((sec / durationSec) * fileSize)));
  }
  return Math.max(0, Math.floor(sec * EST_BYTES_PER_SEC));
}

/**
 * Warm the HTTP cache for a byte window so the <audio> Range seeks hit cache.
 * Fire-and-forget; failures are ignored.
 */
function warmByteRange(downloadUrl: string, startByte: number, endByte: number): void {
  const base = stripFragment(downloadUrl);
  if (endByte < startByte) return;
  const key = `${base}:${startByte}-${endByte}`;
  if (warmRangeKeys.has(key)) return;
  warmRangeKeys.add(key);

  void fetch(base, {
    method: "GET",
    mode: "cors",
    headers: { Range: `bytes=${startByte}-${endByte}` },
    cache: "default",
  })
    .then((res) => {
      // Drain body so the response fully lands in cache; ignore content.
      return res.arrayBuffer();
    })
    .catch(() => {
      warmRangeKeys.delete(key);
    });
}

/** Prefetch ~1 minute of audio starting at `fromSec`, then optionally ahead. */
function warmAroundTime(
  downloadUrl: string,
  fromSec: number,
  durationSec: number | null,
  fileSize: number | null
): void {
  const startByte = secToByte(fromSec, durationSec, fileSize);
  const windowBytes =
    fileSize != null && durationSec != null && durationSec > 0
      ? Math.max(
          PREFETCH_CHUNK_BYTES,
          Math.ceil((PREFETCH_WINDOW_SEC / durationSec) * fileSize)
        )
      : PREFETCH_CHUNK_BYTES;
  const endByte =
    fileSize != null
      ? Math.min(fileSize - 1, startByte + windowBytes - 1)
      : startByte + windowBytes - 1;
  warmByteRange(downloadUrl, startByte, endByte);
}

/**
 * Listening player for practice / whiteboard question views.
 * Starts at `startSec`, then lets the student scrub/play the full exam track.
 * Prefetches ~1 minute from the timestamp (HTTP Range) and keeps warming ahead while playing.
 */
export default function QuestionAudioPlayer({
  audioPath,
  startSec = 0,
  startLabel,
  className = "",
  autoLoad = true,
}: QuestionAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wantPlayRef = useRef(false);
  const lastWarmSecRef = useRef(-Infinity);
  const fileSizeRef = useRef<number | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(autoLoad);
  const [playing, setPlaying] = useState(false);
  const [currentAbs, setCurrentAbs] = useState(0);
  const [durationAbs, setDurationAbs] = useState(0);
  const [ready, setReady] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(autoLoad);
  const [playbackRate, setPlaybackRate] = useState<PlaybackRate>(1);

  const start = Math.max(0, startSec || 0);

  useEffect(() => {
    if (!shouldLoad) {
      setLoadingUrl(false);
      return;
    }

    let cancelled = false;
    setLoadingUrl(true);
    setLoadError(null);
    setUrl(null);
    setReady(false);
    setPlaying(false);
    setCurrentAbs(0);
    setDurationAbs(0);
    lastWarmSecRef.current = -Infinity;
    fileSizeRef.current = null;

    const path = audioPath.trim();
    if (!path) {
      setLoadingUrl(false);
      setLoadError("No audio");
      return;
    }

    resolveAudioDownloadUrl(path)
      .then(async (downloadUrl) => {
        if (cancelled) return;
        // Warm ~1 min from the question timestamp before/while the element loads.
        const size = await resolveFileSize(downloadUrl);
        if (cancelled) return;
        fileSizeRef.current = size;
        warmAroundTime(downloadUrl, start, null, size);
        setUrl(withMediaFragment(downloadUrl, start));
        setLoadingUrl(false);
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
  }, [audioPath, shouldLoad, start]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !url) return;
    let positioned = false;

    const seekToStart = () => {
      if (positioned) return;
      positioned = true;
      try {
        el.currentTime = start;
      } catch {
        positioned = false;
        return;
      }
      const duration = el.duration || 0;
      setDurationAbs(duration);
      setCurrentAbs(start);
      setReady(true);
      el.playbackRate = playbackRate;
      // Refine the warm window now that duration is known.
      warmAroundTime(url, start, duration > 0 ? duration : null, fileSizeRef.current);
      lastWarmSecRef.current = start;
      if (wantPlayRef.current) {
        wantPlayRef.current = false;
        void el.play().catch((err) => {
          console.warn("[QuestionAudioPlayer] play failed:", err);
        });
      }
    };

    const onLoaded = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) {
        setDurationAbs(el.duration);
      }
      seekToStart();
    };

    const onTime = () => {
      const t = Math.max(0, el.currentTime);
      setCurrentAbs(t);
      // Keep ~1 min ahead of the playhead warm in the HTTP cache.
      if (t - lastWarmSecRef.current >= PREFETCH_WINDOW_SEC * 0.6) {
        lastWarmSecRef.current = t;
        warmAroundTime(
          url,
          t,
          Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null,
          fileSizeRef.current
        );
      }
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
      setCurrentAbs(start);
    };

    el.addEventListener("loadedmetadata", onLoaded);
    el.addEventListener("canplay", onLoaded);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);

    el.playbackRate = playbackRate;
    el.load();

    return () => {
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("canplay", onLoaded);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
      el.pause();
    };
    // playbackRate applied separately so remounting isn't needed on speed change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, start]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.playbackRate = playbackRate;
  }, [playbackRate]);

  const ensureLoadedAndPlay = async () => {
    if (!shouldLoad) {
      wantPlayRef.current = true;
      setShouldLoad(true);
      return;
    }
    const el = audioRef.current;
    if (!el || !ready) {
      wantPlayRef.current = true;
      return;
    }
    pauseOtherPageMedia(el);
    if (el.ended || el.currentTime >= (durationAbs || Infinity) - 0.05) {
      el.currentTime = start;
    }
    try {
      await el.play();
    } catch (err) {
      console.warn("[QuestionAudioPlayer] play failed:", err);
    }
  };

  const togglePlay = async () => {
    const el = audioRef.current;
    if (el && !el.paused) {
      el.pause();
      return;
    }
    await ensureLoadedAndPlay();
  };

  const onSeek = (abs: number) => {
    const el = audioRef.current;
    if (!el || !ready || !url) return;
    const max = durationAbs || 0;
    const clamped = Math.min(Math.max(0, abs), max);
    el.currentTime = clamped;
    setCurrentAbs(clamped);
    warmAroundTime(url, clamped, durationAbs > 0 ? durationAbs : null, fileSizeRef.current);
    lastWarmSecRef.current = clamped;
  };

  const jumpToTimestamp = () => {
    const el = audioRef.current;
    if (!el || !ready || start <= 0) return;
    el.currentTime = start;
    setCurrentAbs(start);
    if (url) {
      warmAroundTime(url, start, durationAbs > 0 ? durationAbs : null, fileSizeRef.current);
      lastWarmSecRef.current = start;
    }
  };

  const speedControls = (
    <div className="flex items-center gap-0.5 shrink-0" role="group" aria-label="Playback speed">
      {PLAYBACK_RATES.map((rate) => {
        const active = playbackRate === rate;
        return (
          <button
            key={rate}
            type="button"
            onClick={() => setPlaybackRate(rate)}
            className={`min-w-[2.1rem] rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums transition-colors cursor-pointer select-none ${
              active
                ? "color-bg-accent color-txt-accent"
                : "color-txt-sub hover:color-bg-grey-10"
            }`}
            aria-pressed={active}
            aria-label={`Playback speed ${formatRate(rate)}`}
            title={`Speed ${formatRate(rate)}`}
          >
            {formatRate(rate)}
          </button>
        );
      })}
    </div>
  );

  if (!shouldLoad) {
    return (
      <div
        className={`flex w-full items-center gap-3 rounded-xl border border-transparent color-bg color-shadow px-4 py-3 ${className}`}
      >
        <button
          type="button"
          onClick={() => void togglePlay()}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full color-bg-accent color-txt-accent cursor-pointer select-none transition-transform duration-150 hover:opacity-95 active:scale-95"
          aria-label="Play audio"
        >
          <LuPlay size={18} strokeWidth={2.4} className="ml-0.5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium color-txt-main truncate">
              <LuVolume2 size={16} className="shrink-0 color-txt-sub" />
              Listening
              {start > 0 && (
                <span className="text-xs font-normal color-txt-sub">
                  starts at {startLabel?.trim() || formatTime(start)}
                </span>
              )}
            </span>
            {speedControls}
          </div>
          <p className="text-xs color-txt-sub mt-0.5">Tap play to load audio</p>
        </div>
      </div>
    );
  }

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
      {/* preload=auto lets the browser stream ahead from the seek point via Range requests */}
      <audio ref={audioRef} src={url} preload="auto" playsInline />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void togglePlay()}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full color-bg-accent color-txt-accent cursor-pointer select-none transition-transform duration-150 hover:opacity-95 active:scale-95"
          aria-label={playing ? "Pause audio" : "Play audio"}
        >
          {!ready ? (
            <LuLoaderCircle size={18} className="animate-spin" />
          ) : playing ? (
            <LuPause size={18} strokeWidth={2.4} />
          ) : (
            <LuPlay size={18} strokeWidth={2.4} className="ml-0.5" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-flex min-w-0 items-center gap-1.5 text-sm font-medium color-txt-main truncate">
              <LuVolume2 size={16} className="shrink-0 color-txt-sub" />
              Listening
              {start > 0 && (
                <button
                  type="button"
                  onClick={jumpToTimestamp}
                  disabled={!ready}
                  className="text-xs font-normal color-txt-sub underline-offset-2 hover:underline disabled:no-underline cursor-pointer"
                  title="Jump back to question timestamp"
                >
                  from {startLabel?.trim() || formatTime(start)}
                </button>
              )}
            </span>
            <div className="ml-auto flex items-center gap-2 shrink-0">
              {speedControls}
              <span className="text-xs tabular-nums color-txt-sub">
                {formatTime(currentAbs)} / {formatTime(durationAbs)}
              </span>
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={durationAbs || 0}
            step={0.1}
            value={Math.min(currentAbs, durationAbs || 0)}
            disabled={!ready || durationAbs <= 0}
            onChange={(e) => onSeek(Number(e.target.value))}
            className="question-audio-slider"
            style={
              {
                "--audio-progress": `${
                  durationAbs > 0
                    ? Math.min(100, Math.max(0, (currentAbs / durationAbs) * 100))
                    : 0
                }%`,
              } as CSSProperties
            }
            aria-label="Audio progress"
          />
        </div>
      </div>
    </div>
  );
}
