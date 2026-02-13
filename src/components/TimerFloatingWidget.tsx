import { LuTimer } from "react-icons/lu";
import { useTimer } from "../context/TimerContext";

export function TimerFloatingWidget() {
  const { state, formatTime, progress } = useTimer();

  if (!state.running) return null;

  const modeLabel =
    state.mode === "stopwatch"
      ? "Stopwatch"
      : state.mode === "timer"
        ? "Timer"
        : state.pomodoroPhase === "work"
          ? `Pomodoro · Round ${state.pomodoroRound}`
          : state.pomodoroPhase === "shortBreak"
            ? "Short break"
            : "Long break";

  const showProgress = state.mode === "timer" || state.mode === "pomodoro";
  const progressPercent =
    showProgress && state.totalTime > 0
      ? Math.max(0, (1 - state.time / state.totalTime) * 100)
      : 0;

  return (
    <div
      className="fixed bottom-4 right-4 z-40 flex flex-col gap-2 w-44 rounded-xl border border-grey/25 color-bg color-shadow p-3"
      aria-live="polite"
      aria-label={`Timer: ${modeLabel}, ${formatTime(state.time)}`}
    >
      <div className="flex items-center gap-2">
        <LuTimer size={16} strokeWidth={2} className="color-txt-accent shrink-0" />
        <span className="text-xs font-medium color-txt-main truncate">{modeLabel}</span>
      </div>
      <div className="text-xl font-bold color-txt-main text-center tabular-nums">
        {formatTime(state.time)}
      </div>
      {showProgress && state.totalTime > 0 && (
        <div className="h-1.5 rounded-full color-bg-grey-10 overflow-hidden">
          <div
            className="h-full rounded-full color-bg-accent transition-all duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}
    </div>
  );
}
