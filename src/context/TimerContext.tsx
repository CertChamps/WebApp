import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

export type TimerMode = "stopwatch" | "timer" | "pomodoro";
export type PomodoroPhase = "work" | "shortBreak" | "longBreak";
type TimerModeSnapshot = {
  time: number;
  totalTime: number;
  pomodoroPhase: PomodoroPhase;
  pomodoroRound: number;
};

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
  modeSnapshots: Record<TimerMode, TimerModeSnapshot>;
  timesUpPending: boolean;
  timesUpNonce: number;
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
  acknowledgeTimesUp: () => void;
};

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
    play(523.25, 0, 0.12);
    play(659.25, 0.12, 0.12);
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
    // Ignore if AudioContext is unavailable or blocked.
  }
}

const defaultSnapshots: Record<TimerMode, TimerModeSnapshot> = {
  stopwatch: { time: 0, totalTime: 0, pomodoroPhase: "work", pomodoroRound: 1 },
  timer: { time: 0, totalTime: 0, pomodoroPhase: "work", pomodoroRound: 1 },
  pomodoro: {
    time: POMODORO_WORK_MS,
    totalTime: POMODORO_WORK_MS,
    pomodoroPhase: "work",
    pomodoroRound: 1,
  },
};

const defaultState: TimerState = {
  mode: "stopwatch",
  time: 0,
  running: false,
  totalTime: 0,
  pomodoroPhase: "work",
  pomodoroRound: 1,
  modeSnapshots: defaultSnapshots,
  timesUpPending: false,
  timesUpNonce: 0,
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
      const savedCurrent: TimerModeSnapshot = {
        time: prev.time,
        totalTime: prev.totalTime,
        pomodoroPhase: prev.pomodoroPhase,
        pomodoroRound: prev.pomodoroRound,
      };
      const nextSnapshots = {
        ...prev.modeSnapshots,
        [prev.mode]: savedCurrent,
      };
      const next = nextSnapshots[mode] ?? defaultSnapshots[mode];
      return {
        ...prev,
        mode,
        running: false,
        time: next.time,
        totalTime: next.totalTime,
        pomodoroPhase: next.pomodoroPhase,
        pomodoroRound: next.pomodoroRound,
        modeSnapshots: nextSnapshots,
      };
    });
  }, []);

  const setTime = useCallback((ms: number) => {
    setState((prev) => ({
      ...prev,
      time: Math.max(0, ms),
      totalTime: prev.mode === "timer" ? Math.max(0, ms) : prev.totalTime,
      modeSnapshots: {
        ...prev.modeSnapshots,
        [prev.mode]: {
          ...prev.modeSnapshots[prev.mode],
          time: Math.max(0, ms),
          totalTime: prev.mode === "timer" ? Math.max(0, ms) : prev.totalTime,
          pomodoroPhase: prev.pomodoroPhase,
          pomodoroRound: prev.pomodoroRound,
        },
      },
    }));
  }, []);

  const setTimeFromMMSS = useCallback((mm: number, ss: number) => {
    const ms = (mm * 60 + ss) * 1000;
    setState((prev) => ({
      ...prev,
      time: Math.max(0, ms),
      totalTime: prev.mode === "timer" ? Math.max(0, ms) : prev.totalTime,
      modeSnapshots: {
        ...prev.modeSnapshots,
        [prev.mode]: {
          ...prev.modeSnapshots[prev.mode],
          time: Math.max(0, ms),
          totalTime: prev.mode === "timer" ? Math.max(0, ms) : prev.totalTime,
          pomodoroPhase: prev.pomodoroPhase,
          pomodoroRound: prev.pomodoroRound,
        },
      },
    }));
  }, []);

  const advancePomodoro = useCallback(() => {
    setState((prev) => {
      if (prev.mode !== "pomodoro") return prev;
      if (prev.pomodoroPhase === "work") {
        const round = prev.pomodoroRound;
        const nextPhase = round % 4 === 0 ? "longBreak" : "shortBreak";
        const totalMs = nextPhase === "longBreak" ? POMODORO_LONG_BREAK_MS : POMODORO_SHORT_BREAK_MS;
        const nextState: TimerState = {
          ...prev,
          pomodoroPhase: nextPhase,
          time: totalMs,
          totalTime: totalMs,
          pomodoroRound: nextPhase === "longBreak" ? round : round,
          modeSnapshots: {
            ...prev.modeSnapshots,
            pomodoro: {
              time: totalMs,
              totalTime: totalMs,
              pomodoroPhase: nextPhase,
              pomodoroRound: nextPhase === "longBreak" ? round : round,
            },
          },
        };
        return nextState;
      }
      return {
        ...prev,
        pomodoroPhase: "work",
        pomodoroRound: prev.pomodoroRound + 1,
        time: POMODORO_WORK_MS,
        totalTime: POMODORO_WORK_MS,
        modeSnapshots: {
          ...prev.modeSnapshots,
          pomodoro: {
            time: POMODORO_WORK_MS,
            totalTime: POMODORO_WORK_MS,
            pomodoroPhase: "work",
            pomodoroRound: prev.pomodoroRound + 1,
          },
        },
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
          modeSnapshots: {
            ...prev.modeSnapshots,
            pomodoro: {
              time: POMODORO_WORK_MS,
              totalTime: POMODORO_WORK_MS,
              pomodoroPhase: "work",
              pomodoroRound: prev.pomodoroRound,
            },
          },
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
      if (prev.mode === "stopwatch") {
        return {
          ...prev,
          time: 0,
          running: false,
          totalTime: 0,
          modeSnapshots: {
            ...prev.modeSnapshots,
            stopwatch: { ...prev.modeSnapshots.stopwatch, time: 0, totalTime: 0 },
          },
        };
      }
      if (prev.mode === "timer") {
        return {
          ...prev,
          time: 0,
          running: false,
          totalTime: 0,
          modeSnapshots: {
            ...prev.modeSnapshots,
            timer: { ...prev.modeSnapshots.timer, time: 0, totalTime: 0 },
          },
        };
      }
      if (prev.mode === "pomodoro") {
        return {
          ...prev,
          time: POMODORO_WORK_MS,
          totalTime: POMODORO_WORK_MS,
          running: false,
          pomodoroPhase: "work",
          pomodoroRound: 1,
          modeSnapshots: {
            ...prev.modeSnapshots,
            pomodoro: {
              time: POMODORO_WORK_MS,
              totalTime: POMODORO_WORK_MS,
              pomodoroPhase: "work",
              pomodoroRound: 1,
            },
          },
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
          const nextTime = prev.time + TICK_MS;
          return {
            ...prev,
            time: nextTime,
            modeSnapshots: {
              ...prev.modeSnapshots,
              stopwatch: { ...prev.modeSnapshots.stopwatch, time: nextTime, totalTime: 0 },
            },
          };
        }
        if (prev.mode === "timer") {
          if (prev.time <= TICK_MS) {
            return {
              ...prev,
              time: 0,
              running: false,
              timesUpPending: true,
              timesUpNonce: prev.timesUpNonce + 1,
              modeSnapshots: {
                ...prev.modeSnapshots,
                timer: { ...prev.modeSnapshots.timer, time: 0, totalTime: prev.totalTime },
              },
            };
          }
          const nextTime = prev.time - TICK_MS;
          return {
            ...prev,
            time: nextTime,
            modeSnapshots: {
              ...prev.modeSnapshots,
              timer: { ...prev.modeSnapshots.timer, time: nextTime, totalTime: prev.totalTime },
            },
          };
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
                timesUpPending: true,
                timesUpNonce: prev.timesUpNonce + 1,
                modeSnapshots: {
                  ...prev.modeSnapshots,
                  pomodoro: {
                    time: totalMs,
                    totalTime: totalMs,
                    pomodoroPhase: nextPhase,
                    pomodoroRound: nextPhase === "longBreak" ? round : round,
                  },
                },
              };
            }
            return {
              ...prev,
              pomodoroPhase: "work",
              pomodoroRound: prev.pomodoroRound + 1,
              time: POMODORO_WORK_MS,
              totalTime: POMODORO_WORK_MS,
              timesUpPending: true,
              timesUpNonce: prev.timesUpNonce + 1,
              modeSnapshots: {
                ...prev.modeSnapshots,
                pomodoro: {
                  time: POMODORO_WORK_MS,
                  totalTime: POMODORO_WORK_MS,
                  pomodoroPhase: "work",
                  pomodoroRound: prev.pomodoroRound + 1,
                },
              },
            };
          }
          const nextTime = prev.time - TICK_MS;
          return {
            ...prev,
            time: nextTime,
            modeSnapshots: {
              ...prev.modeSnapshots,
              pomodoro: {
                ...prev.modeSnapshots.pomodoro,
                time: nextTime,
                totalTime: prev.totalTime,
                pomodoroPhase: prev.pomodoroPhase,
                pomodoroRound: prev.pomodoroRound,
              },
            },
          };
        }
        return prev;
      });
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [state.running, state.mode, state.pomodoroPhase, state.pomodoroRound]);

  useEffect(() => {
    if (!state.timesUpPending) return;
    playTimesUpSound();
  }, [state.timesUpNonce, state.timesUpPending]);

  const acknowledgeTimesUp = useCallback(() => {
    setState((prev) => ({ ...prev, timesUpPending: false }));
  }, []);

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
    acknowledgeTimesUp,
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
