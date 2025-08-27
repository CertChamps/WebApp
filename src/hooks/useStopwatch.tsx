import { useEffect, useRef, useState } from 'react';

 //================================================ TIME FORMATTING ===================================//
const formatTime = (totalSeconds: number): string => {

  // Calculate hours minutes and seconds 
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  // Format appropriately
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
};
  //===============================================================================================//

export const useStopwatch = () => {
  //================================================ TIME STATE ===================================//
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  //===============================================================================================//

  //======================================= START THE STOPWATCH ===================================//
  const start = () => {
    if (!intervalRef.current) {
      intervalRef.current = setInterval(() => {
        setSecondsElapsed(prev => prev + 1);
      }, 1000);
      setIsRunning(true);
    }
  };
  //===============================================================================================//

  //======================================= STOP THE STOPWATCH ===================================//
  const stop = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      setIsRunning(false);
    }
  };
  //===============================================================================================//

  //======================================= RESET THE STOPWATCH ===================================//
  const reset = () => {
    stop();
    setSecondsElapsed(0);
  };
  //===============================================================================================//

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return {
    timeFormatted: formatTime(secondsElapsed),
    secondsElapsed,
    setSecondsElapsed,
    isRunning,
    start,
    stop,
    reset,
  };
};
