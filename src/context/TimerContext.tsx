import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

export type TimerMode = "stopwatch" | "timer" | "pomodoro";
export type PomodoroPhase = "work" | "shortBreak" | "longBreak";

const POMODORO_WORK_MS = 25 * 60 * 1000;
const POMODORO_SHORT_BREAK_MS = 5 * 60 * 1000;
const POMODORO_LONG_BREAK_MS = 15 * 60 * 1000;

export type TimerState = {
  mode: TimerMode;
  time: number;
  running: boolean;
  totalTime: number;
  pomodoroPhase: PomodoroPhase;
  pomodoroRound: number;
};

type TimerContextType = {
  state: TimerState;
  formatTime: (ms: number) => string;
  progress: number;
  setMode: (mode: TimerMode) => void;
  setTime: (ms: number) => void;
  setTimeFromMMSS: (mm: number, ss: number) => void;
  start: () => void;
  pause: () => void;
  reset: () => void;
  toggle: () => void;
  advancePomodoro: () => void;
};

const defaultState: TimerState = {
  mode: "stopwatch",
  time: 0,
  running: false,
  totalTime: 0,
  pomodoroPhase: "work",
  pomodoroRound: 1,
};

const TimerContext = createContext<TimerContextType | null>(null);

export function TimerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TimerState>(defaultState);

  const formatTime = useCallback((ms: number) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const pad = (n: number) => (n < 10 ? "0" + n : String(n));
    return `${pad(minutes)}:${pad(seconds)}`;
  }, []);

  const progress = state.totalTime > 0
    ? Math.max(0, 1 - state.time / state.totalTime)
    : (state.mode === "stopwatch" && state.time > 0 ? 1 : 0);

  const setMode = useCallback((mode: TimerMode) => {
    setState((prev) => {
      const base = { ...prev, mode, running: false };
      if (mode === "stopwatch") return { ...base, time: 0, totalTime: 0 };
      if (mode === "timer") return { ...base, time: 0, totalTime: 0 };
      if (mode === "pomodoro") {
        return {
          ...base,
          time: POMODORO_WORK_MS,
          totalTime: POMODORO_WORK_MS,
          pomodoroPhase: "work",
          pomodoroRound: 1,
        };
      }
      return base;
    });
  }, []);

  const setTime = useCallback((ms: number) => {
    setState((prev) => ({
      ...prev,
      time: Math.max(0, ms),
      totalTime: prev.mode === "timer" ? Math.max(0, ms) : prev.totalTime,
    }));
  }, []);

  const setTimeFromMMSS = useCallback((mm: number, ss: number) => {
    const ms = (mm * 60 + ss) * 1000;
    setState((prev) => ({
      ...prev,
      time: Math.max(0, ms),
      totalTime: prev.mode === "timer" ? Math.max(0, ms) : prev.totalTime,
    }));
  }, []);

  const advancePomodoro = useCallback(() => {
    setState((prev) => {
      if (prev.mode !== "pomodoro") return prev;
      if (prev.pomodoroPhase === "work") {
        const round = prev.pomodoroRound;
        const nextPhase = round % 4 === 0 ? "longBreak" : "shortBreak";
        const totalMs = nextPhase === "longBreak" ? POMODORO_LONG_BREAK_MS : POMODORO_SHORT_BREAK_MS;
        return {
          ...prev,
          pomodoroPhase: nextPhase,
          time: totalMs,
          totalTime: totalMs,
          pomodoroRound: nextPhase === "longBreak" ? round : round,
        };
      }
      return {
        ...prev,
        pomodoroPhase: "work",
        pomodoroRound: prev.pomodoroRound + 1,
        time: POMODORO_WORK_MS,
        totalTime: POMODORO_WORK_MS,
      };
    });
  }, []);

  const start = useCallback(() => {
    setState((prev) => {
      if (prev.running) return prev;
      if (prev.mode === "timer" && prev.time === 0) return prev;
      if (prev.mode === "pomodoro" && prev.time === 0) {
        return {
          ...prev,
          running: true,
          time: POMODORO_WORK_MS,
          totalTime: POMODORO_WORK_MS,
          pomodoroPhase: "work",
        };
      }
      return { ...prev, running: true };
    });
  }, []);

  const pause = useCallback(() => {
    setState((prev) => ({ ...prev, running: false }));
  }, []);

  const reset = useCallback(() => {
    setState((prev) => {
      if (prev.mode === "stopwatch") return { ...prev, time: 0, running: false, totalTime: 0 };
      if (prev.mode === "timer") return { ...prev, time: 0, running: false, totalTime: 0 };
      if (prev.mode === "pomodoro") {
        return {
          ...prev,
          time: POMODORO_WORK_MS,
          totalTime: POMODORO_WORK_MS,
          running: false,
          pomodoroPhase: "work",
          pomodoroRound: 1,
        };
      }
      return prev;
    });
  }, []);

  const toggle = useCallback(() => {
    setState((prev) => {
      if (prev.running) return { ...prev, running: false };
      if (prev.mode === "timer" && prev.time === 0) return prev;
      if (prev.mode === "pomodoro" && prev.time === 0) {
        return {
          ...prev,
          running: true,
          time: POMODORO_WORK_MS,
          totalTime: POMODORO_WORK_MS,
          pomodoroPhase: "work",
        };
      }
      return { ...prev, running: true };
    });
  }, []);

  const TICK_MS = 50; // Smooth countdown: update every 50ms so the circle animates continuously

  useEffect(() => {
    if (!state.running) return;
    const interval = setInterval(() => {
      setState((prev) => {
        if (prev.mode === "stopwatch") {
          return { ...prev, time: prev.time + TICK_MS };
        }
        if (prev.mode === "timer") {
          if (prev.time <= TICK_MS) return { ...prev, time: 0, running: false };
          return { ...prev, time: prev.time - TICK_MS };
        }
        if (prev.mode === "pomodoro") {
          if (prev.time <= TICK_MS) {
            const phase = prev.pomodoroPhase;
            if (phase === "work") {
              const round = prev.pomodoroRound;
              const nextPhase = round % 4 === 0 ? "longBreak" : "shortBreak";
              const totalMs = nextPhase === "longBreak" ? POMODORO_LONG_BREAK_MS : POMODORO_SHORT_BREAK_MS;
              return {
                ...prev,
                pomodoroPhase: nextPhase,
                time: totalMs,
                totalTime: totalMs,
                pomodoroRound: nextPhase === "longBreak" ? round : round,
              };
            }
            return {
              ...prev,
              pomodoroPhase: "work",
              pomodoroRound: prev.pomodoroRound + 1,
              time: POMODORO_WORK_MS,
              totalTime: POMODORO_WORK_MS,
            };
          }
          return { ...prev, time: prev.time - TICK_MS };
        }
        return prev;
      });
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [state.running, state.mode, state.pomodoroPhase, state.pomodoroRound]);

  const value: TimerContextType = {
    state,
    formatTime,
    progress,
    setMode,
    setTime,
    setTimeFromMMSS,
    start,
    pause,
    reset,
    toggle,
    advancePomodoro,
  };

  return <TimerContext.Provider value={value}>{children}</TimerContext.Provider>;
}

export function useTimer() {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error("useTimer must be used within TimerProvider");
  return ctx;
}

export function useTimerOptional() {
  return useContext(TimerContext);
}

export { POMODORO_WORK_MS, POMODORO_SHORT_BREAK_MS, POMODORO_LONG_BREAK_MS };
