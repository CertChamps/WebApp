import { useState, useEffect } from "react";

const Timer = () => {
  const [time, setTime] = useState(0); // time in ms
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<"stopwatch" | "timer">("stopwatch");
  const [inputMinutes, setInputMinutes] = useState(25); // default 25 min timer

  useEffect(() => {
    let interval: NodeJS.Timeout | undefined;

    if (running) {
      interval = setInterval(() => {
        setTime((prev) => {
          if (mode === "stopwatch") return prev + 1000;
          if (mode === "timer") {
            if (prev <= 0) {
              setRunning(false);
              return 0;
            }
            return prev - 1000;
          }
          return prev;
        });
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [running, mode]);

  const formatTime = (t: number) => {
    const hours = Math.floor(t / 3600000);
    const minutes = Math.floor((t / 60000) % 60);
    const seconds = Math.floor((t / 1000) % 60);
    const pad = (n: number) => (n < 10 ? "0" + n : n);
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  };

  const handleStart = () => {
    if (mode === "timer" && time === 0) {
      setTime(inputMinutes * 60 * 1000);
    }
    setRunning(true);
  };

  const handleReset = () => {
    setRunning(false);
    setTime(0);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full py-8">
      {/* Mode Toggle */}
      <div className="flex gap-4 mb-8">
        <button
          className={`px-6 py-2 rounded-out font-bold color-bg-accent color-txt-accent hover:scale-95 duration-200 ${
            mode === "stopwatch" ? "opacity-100" : "opacity-70"
          }`}
          onClick={() => {
            setMode("stopwatch");
            setRunning(false);
            setTime(0);
          }}
        >
          Stopwatch
        </button>

        <button
          className={`px-6 py-2 rounded-out font-bold color-bg-accent color-txt-accent hover:scale-95 duration-200 ${
            mode === "timer" ? "opacity-100" : "opacity-70"
          }`}
          onClick={() => {
            setMode("timer");
            setRunning(false);
            setTime(0);
          }}
        >
          Timer
        </button>
      </div>

      {/* Time Display */}
      <div className="color-txt-main fontsize-xl font-bold mb-8 text-8xl text-center">
        {formatTime(time)}
      </div>

      {/* Input only for Timer Mode */}
      {mode === "timer" && !running && time === 0 && (
        <div className="flex flex-row items-center mb-6">
          <span className="color-txt-main font-bold mr-4">
            Duration
          </span>
          <input
            type="number"
            value={inputMinutes}
            onChange={(e) => setInputMinutes(Number(e.target.value))}
            className="px-4 py-2 rounded-out text-center color-txt-accent color-bg-accent w-32"
            min={1}
          />
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-row flex-wrap gap-3 justify-center">
        {!running ? (
          <button
            className="px-12 py-2 rounded-out font-bold 
                        color-bg-accent color-txt-accent 
                        cursor-pointer hover:scale-95 duration-200"
            onClick={handleStart}
          >
            Start
          </button>
        ) : (
          <button
            className="px-12 py-2 rounded-out font-bold 
                        color-bg-accent color-txt-accent 
                        cursor-pointer hover:scale-95 duration-200"
            onClick={() => setRunning(false)}
          >
            Pause
          </button>
        )}

        <button
          className="px-12 py-2 rounded-out font-bold 
                      color-bg-accent color-txt-accent 
                      cursor-pointer hover:scale-95 duration-200"
          onClick={handleReset}
        >
          Reset
        </button>
      </div>
    </div>
  );
};

export default Timer;