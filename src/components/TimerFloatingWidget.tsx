import { LuTimer, LuClock, LuCoffee } from "react-icons/lu";
import { useTimer } from "../context/TimerContext";

type TimerFloatingWidgetProps = {
  /** Optional click handler (e.g. open timer panel in sidebar). */
  onClick?: () => void;
};

/**
 * Compact timer bar. Positioning/visibility is owned by the shared
 * FloatingWidgetStack — this component only renders the bar content.
 */
export function TimerFloatingWidget({ onClick }: TimerFloatingWidgetProps) {
  const { state, formatTime } = useTimer();

  const modeLabel =
    state.mode === "stopwatch"
      ? "stopwatch"
      : state.mode === "timer"
        ? "timer"
        : state.pomodoroPhase === "work"
          ? `pomodoro . round ${state.pomodoroRound}`
          : state.pomodoroPhase === "shortBreak"
            ? "short break"
            : "long break";

  const showProgress = state.mode === "timer" || state.mode === "pomodoro";
  const progressPercent =
    showProgress && state.totalTime > 0
      ? Math.max(0, (1 - state.time / state.totalTime) * 100)
      : 0;

  const Icon =
    state.mode === "stopwatch"
      ? LuClock
      : state.mode === "pomodoro"
        ? LuCoffee
        : LuTimer;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-[220px] flex-col gap-0.5 rounded-xl border border-grey/25 color-bg p-2 backdrop-blur-xl transition-colors hover:border-grey/40"
      aria-live="polite"
      aria-label={`Timer: ${modeLabel}, ${formatTime(state.time)}`}
      title={onClick ? "Open timer panel" : undefined}
    >
      <div className="flex items-center  justify-center gap-2 min-w-0">
        <div className="flex h-7 px-0.5 shrink-0 items-center justify-center rounded-md color-txt-main">
          <Icon size={12} strokeWidth={2} />
        </div>
        <span className="text-xs font-medium color-txt-main truncate lowercase">
          {modeLabel}
        </span>
        <span className="ml-auto text-lg font-bold tabular-nums color-txt-accent shrink-0">
          {formatTime(state.time)}
        </span>
      </div>
      {showProgress && state.totalTime > 0 && (
        <div className="h-1 color-bg-grey-10 overflow-hidden rounded-sm">
          <div
            className="h-full color-bg-accent transition-[width] duration-100 ease-linear"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}
    </button>
  );
}
