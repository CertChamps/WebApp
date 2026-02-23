import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { LuPlay, LuPause, LuRotateCcw, LuTimer, LuClock, LuCoffee } from "react-icons/lu";
import { useTimer, type TimerMode } from "../context/TimerContext";

const MODES: { id: TimerMode; label: string; icon: React.ReactNode }[] = [
  { id: "stopwatch", label: "Stopwatch", icon: <LuClock size={14} strokeWidth={2} /> },
  { id: "timer", label: "Timer", icon: <LuTimer size={14} strokeWidth={2} /> },
  { id: "pomodoro", label: "Pomodoro", icon: <LuCoffee size={14} strokeWidth={2} /> },
];

/** Shift display: new digit goes on the right, previous right shifts left. e.g. "00" + "1" -> "01", "01" + "2" -> "12". */
function applyDigitLeftToRight(current: string, digit: string): string {
  const c = current.replace(/\D/g, "").padStart(2, "0");
  const right = c[1] ?? "0";
  return (right + digit).slice(-2);
}

function applySecondsDigit(current: string, digit: string): string {
  const raw = applyDigitLeftToRight(current, digit);
  const val = Math.min(59, parseInt(raw, 10));
  return String(val).padStart(2, "0");
}

/** Play a silly "time's up" sound: two-tone ding then a descending wah-wah slide */
function playTimesUpSound() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const play = (frequency: number, startTime: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(frequency, startTime);
      gain.gain.setValueAtTime(0.2, startTime);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };
    play(523.25, 0, 0.12);     // C5
    play(659.25, 0.12, 0.12);  // E5
    const slide = ctx.createOscillator();
    const g = ctx.createGain();
    slide.connect(g);
    g.connect(ctx.destination);
    slide.type = "sawtooth";
    slide.frequency.setValueAtTime(392, 0.3);
    slide.frequency.exponentialRampToValueAtTime(98, 0.85);
    g.gain.setValueAtTime(0.1, 0.3);
    g.gain.exponentialRampToValueAtTime(0.01, 0.85);
    slide.start(0.3);
    slide.stop(0.85);
  } catch {
    // Ignore if AudioContext not supported or blocked
  }
}

export default function Timer() {
  const { state, formatTime, setMode, setTimeFromMMSS, start, pause, reset } = useTimer();
  const [editing, setEditing] = useState(false);
  const [editMins, setEditMins] = useState("00");
  const [editSecs, setEditSecs] = useState("00");
  const [activeField, setActiveField] = useState<"mins" | "secs">("mins");
  const [showTimesUpModal, setShowTimesUpModal] = useState(false);
  const minsRef = useRef<HTMLInputElement | null>(null);
  const secsRef = useRef<HTMLInputElement | null>(null);
  const switchingFocusRef = useRef(false);
  const prevRunningRef = useRef(state.running);

  const canEdit = state.mode === "timer" && !state.running;
  const showProgress = state.mode === "timer" || state.mode === "pomodoro";

  const progressPercent = showProgress && state.totalTime > 0
    ? Math.max(0, (1 - state.time / state.totalTime) * 100)
    : 0;

  useEffect(() => {
    if (!editing) return;
    (activeField === "mins" ? minsRef.current : secsRef.current)?.focus();
  }, [editing, activeField]);

  // When countdown hits zero (timer or pomodoro), show popup and play sound
  useEffect(() => {
    const wasRunning = prevRunningRef.current;
    prevRunningRef.current = state.running;
    if (
      wasRunning &&
      !state.running &&
      state.time === 0 &&
      (state.mode === "timer" || state.mode === "pomodoro")
    ) {
      playTimesUpSound();
      setShowTimesUpModal(true);
    }
  }, [state.running, state.time, state.mode]);

  const handleDisplayClick = () => {
    if (!canEdit) return;
    const mins = Math.floor(state.time / 60000);
    const secs = Math.floor((state.time / 1000) % 60);
    setEditMins(String(mins).padStart(2, "0"));
    setEditSecs(String(secs).padStart(2, "0"));
    setActiveField("mins");
    setEditing(true);
  };

  const handleEditSubmit = () => {
    if (!editing || switchingFocusRef.current) return;
    const mm = Math.min(99, parseInt(editMins.padStart(2, "0"), 10));
    const ss = Math.min(59, parseInt(editSecs.padStart(2, "0"), 10));
    setTimeFromMMSS(mm, ss);
    setEditing(false);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const related = e.relatedTarget as HTMLElement | null;
    if (related && (related === minsRef.current || related === secsRef.current)) return;
    handleEditSubmit();
  };

  const handleMinsKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (editMins.replace(/\D/g, "").padStart(2, "0") !== "00") {
        setActiveField("secs");
        secsRef.current?.focus();
      } else handleEditSubmit();
      return;
    }
    if (e.key === "Escape") {
      setEditing(false);
      return;
    }
    if (e.key >= "0" && e.key <= "9") {
      e.preventDefault();
      const next = applyDigitLeftToRight(editMins, e.key);
      setEditMins(next);
      // Only move to seconds after user has typed 2 digits (minutes value is 10–99, i.e. first char not "0")
      if (next[0] !== "0") {
        switchingFocusRef.current = true;
        setActiveField("secs");
        setTimeout(() => {
          secsRef.current?.focus();
          switchingFocusRef.current = false;
        }, 0);
      }
      return;
    }
    if (e.key === "Backspace") {
      e.preventDefault();
      const c = editMins.replace(/\D/g, "").padStart(2, "0");
      const next = ("0" + (c[0] ?? "0")).slice(-2); // shift right: 12 -> 01, 01 -> 00
      setEditMins(next);
    }
  };

  const handleSecsKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleEditSubmit();
      return;
    }
    if (e.key === "Escape") {
      setEditing(false);
      return;
    }
    if (e.key >= "0" && e.key <= "9") {
      e.preventDefault();
      const next = applySecondsDigit(editSecs, e.key);
      setEditSecs(next);
      return;
    }
    if (e.key === "Backspace") {
      e.preventDefault();
      const c = editSecs.replace(/\D/g, "").padStart(2, "0");
      const next = ("0" + (c[0] ?? "0")).slice(-2); // shift right: 12 -> 01, 01 -> 00
      setEditSecs(next);
      if (next === "00") {
        switchingFocusRef.current = true;
        setActiveField("mins");
        setTimeout(() => {
          minsRef.current?.focus();
          switchingFocusRef.current = false;
        }, 0);
      }
    }
  };

  const pomodoroLabel =
    state.mode === "pomodoro"
      ? state.pomodoroPhase === "work"
        ? `Round ${state.pomodoroRound} · Work`
        : state.pomodoroPhase === "shortBreak"
          ? "Short break"
          : "Long break"
      : null;

  return (
    <>
    <div className="flex flex-col items-center justify-center h-full py-6 px-4">
      {/* Mode Dropdown */}
      <div className="relative mb-6">
        <select
          value={state.mode}
          onChange={(e) => setMode(e.target.value as TimerMode)}
          className="flex items-center gap-2 pl-10 pr-10 py-2.5 rounded-xl color-bg-grey-5 border border-grey/20 color-txt-main text-sm font-medium appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-inset focus:ring-grey/30"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='%239ca3af' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10l-5 5z'/%3E%3C/svg%3E")`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 0.5rem center",
            backgroundSize: "1rem",
          }}
        >
          {MODES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none flex items-center gap-2">
          {state.mode === "stopwatch" && <LuClock size={14} strokeWidth={2} className="color-txt-sub" />}
          {state.mode === "timer" && <LuTimer size={14} strokeWidth={2} className="color-txt-sub" />}
          {state.mode === "pomodoro" && <LuCoffee size={14} strokeWidth={2} className="color-txt-sub" />}
        </div>
      </div>

      {/* Pomodoro phase label */}
      {pomodoroLabel && (
        <p className="text-xs color-txt-sub mb-2">{pomodoroLabel}</p>
      )}

      {/* Circular progress + time */}
      <div className="relative flex items-center justify-center mb-6">
        <svg className="w-48 h-48 -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            className="color-txt-sub"
          />
          {showProgress && (
            <circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
              strokeLinecap="round"
              className="color-txt-accent"
              style={{ transition: "stroke-dashoffset 0.05s linear" }}
              strokeDasharray={`${2 * Math.PI * 44}`}
              strokeDashoffset={`${2 * Math.PI * 44 * (progressPercent / 100)}`}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {editing ? (
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-baseline gap-2 text-xs color-txt-sub mb-1">
                <span className={activeField === "mins" ? "color-txt-main font-medium" : ""}>MM</span>
                <span className="invisible">:</span>
                <span className={activeField === "secs" ? "color-txt-main font-medium" : ""}>SS</span>
              </div>
              <div className="flex items-center gap-1 text-3xl font-bold tabular-nums">
                <motion.div
                  animate={{ scale: activeField === "mins" ? 1.02 : 1 }}
                  transition={{ duration: 0.12 }}
                  className={`flex items-center justify-center rounded-lg px-2 py-1 transition-colors duration-150 ${
                    activeField === "mins" ? "color-bg-grey-5 color-txt-main" : "color-txt-sub"
                  }`}
                >
                  <input
                    ref={(el) => { minsRef.current = el; }}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={editMins.replace(/\D/g, "").padStart(2, "0")}
                    onChange={() => {}}
                    onKeyDown={handleMinsKeyDown}
                    onFocus={() => setActiveField("mins")}
                    onBlur={handleBlur}
                    className="w-14 bg-transparent border-0 text-center focus:outline-none focus:ring-0 color-inherit"
                  />
                </motion.div>
                <span className={`transition-colors duration-150 ${activeField === "secs" ? "color-txt-main" : "color-txt-sub"}`}>:</span>
                <motion.div
                  animate={{ scale: activeField === "secs" ? 1.02 : 1 }}
                  transition={{ duration: 0.12 }}
                  className={`flex items-center justify-center rounded-lg px-2 py-1 transition-colors duration-150 ${
                    activeField === "secs" ? "color-bg-grey-5 color-txt-main" : "color-txt-sub"
                  }`}
                >
                  <input
                    ref={(el) => { secsRef.current = el; }}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={editSecs.replace(/\D/g, "").padStart(2, "0")}
                    onChange={() => {}}
                    onKeyDown={handleSecsKeyDown}
                    onFocus={() => setActiveField("secs")}
                    onBlur={handleBlur}
                    className="w-14 bg-transparent border-0 text-center focus:outline-none focus:ring-0 color-inherit"
                  />
                </motion.div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleDisplayClick}
              className={`text-3xl font-bold color-txt-main ${canEdit ? "cursor-text hover:color-txt-accent/80" : ""}`}
            >
              {formatTime(state.time)}
            </button>
          )}
        </div>
      </div>

      {/* Controls - icons for stopwatch, inline for timer/pomodoro */}
      {state.mode === "stopwatch" ? (
        <div className="flex gap-3">
          {!state.running ? (
            <button
              type="button"
              onClick={start}
              aria-label="Start"
              className="flex items-center justify-center w-12 h-12 rounded-full color-bg-accent color-txt-accent hover:opacity-90 transition-opacity"
            >
              <LuPlay size={22} strokeWidth={2} className="ml-0.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={pause}
              aria-label="Pause"
              className="flex items-center justify-center w-12 h-12 rounded-full color-bg-accent color-txt-accent hover:opacity-90 transition-opacity"
            >
              <LuPause size={22} strokeWidth={2} />
            </button>
          )}
          <button
            type="button"
            onClick={reset}
            aria-label="Reset"
            className="flex items-center justify-center w-12 h-12 rounded-full color-bg-grey-10 color-txt-sub hover:color-txt-main transition-colors"
          >
            <LuRotateCcw size={20} strokeWidth={2} />
          </button>
        </div>
      ) : (
        <div className="flex gap-3">
          {!state.running ? (
            <button
              type="button"
              onClick={start}
              disabled={state.mode === "timer" && state.time === 0}
              aria-label="Start"
              className="flex items-center justify-center w-12 h-12 rounded-full color-bg-accent color-txt-accent hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              <LuPlay size={22} strokeWidth={2} className="ml-0.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={pause}
              aria-label="Pause"
              className="flex items-center justify-center w-12 h-12 rounded-full color-bg-accent color-txt-accent hover:opacity-90 transition-opacity"
            >
              <LuPause size={22} strokeWidth={2} />
            </button>
          )}
          <button
            type="button"
            onClick={reset}
            aria-label="Reset"
            className="flex items-center justify-center w-12 h-12 rounded-full color-bg-grey-10 color-txt-sub hover:color-txt-main transition-colors"
          >
            <LuRotateCcw size={20} strokeWidth={2} />
          </button>
        </div>
      )}

      {/* Time's up popup */}
      {showTimesUpModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="times-up-title"
          onClick={() => setShowTimesUpModal(false)}
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="rounded-2xl shadow-xl p-8 max-w-sm w-full color-bg color-txt-main border border-[var(--grey-10)] text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <p id="times-up-title" className="text-2xl font-bold mb-2">Time's up!</p>
            <p className="text-sm color-txt-sub mb-6">Hope you got through it.</p>
            <button
              type="button"
              onClick={() => setShowTimesUpModal(false)}
              className="px-6 py-2.5 rounded-xl font-medium color-bg-accent color-txt-accent hover:opacity-90 transition-opacity"
            >
              Dismiss
            </button>
          </motion.div>
        </div>
      )}
    </div>
    </>
  );
}
