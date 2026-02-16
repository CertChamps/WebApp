import { LuTimer, LuClock, LuCoffee } from "react-icons/lu";
import { useTimer } from "../context/TimerContext";

type TimerFloatingWidgetProps = {
  /** When true, position on the left (for left-hand layout). */
  leftHandMode?: boolean;
};

export function TimerFloatingWidget({ leftHandMode = false }: TimerFloatingWidgetProps) {
  const { state, formatTime } = useTimer();

  if (!state.running) return null;

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
    <div
      className={`fixed bottom-3 z-10 flex flex-col gap-0.5 w-[220px] rounded-xl color-bg p-2 ${leftHandMode ? "left-20" : "right-3"}`}
      aria-live="polite"
      aria-label={`Timer: ${modeLabel}, ${formatTime(state.time)}`}
    >
      <div className="flex items-center  justify-center gap-2 min-w-0">
        <div className="flex h-7 px-0.5 shrink-0 items-center justify-center rounded-md color-txt-main">
          <Icon size={12} strokeWidth={2} />
        </div>
        <span className="text-xs font-medium color-txt-main truncate lowercase">
          {modeLabel}
        </span>
        <span className="ml-auto text-lg font-bold tabular-nums color-txt-main shrink-0">
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
    </div>
  );
}
