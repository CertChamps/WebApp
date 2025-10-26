import { useState, useEffect } from "react";


const Timer = () => {
    const [time, setTime] = useState(0);
    const [running, setRunning] = useState(false);

    useEffect(() => {
        let interval: string | number | NodeJS.Timeout | undefined;
        if (running) {
            interval = setInterval(() => {
                setTime((prevTime) => prevTime + 10);
            }, 10);
        } else if (!running) {
            clearInterval(interval);
        }
        return () => clearInterval(interval);
    }, [running]);

    return (
        <div
        className="flex flex-col items-center justify-center min-h-screen pb-40"
        >
        <div className="color-txt-main fontsize-xl font-bold mb-4 text-8xl">
            <span>{Math.floor(time / 60000 % 60) > 9 ? Math.floor(time / 60000 % 60) : "0" + Math.floor(time / 60000 % 60)}:</span>
            <span>{Math.floor(time / 1000 % 60) > 9 ? Math.floor(time / 1000 % 60) : "0" + Math.floor(time / 1000 % 60)}</span>
        </div>
        <div className="flex flex-row gap-2">
            <button className="px-12 py-2 rounded-out font-bold 
                                color-bg-accent color-txt-accent 
                                cursor-pointer hover:scale-95 duration-200"
                    onClick={() => setRunning(true)}
            >
                Start
            </button>
            <button className="px-12 py-2 rounded-out font-bold 
                                color-bg-accent color-txt-accent 
                                cursor-pointer hover:scale-95 duration-200"
                    onClick={() => setRunning(false)}                    
            >
                Stop
            </button>
            <button className="px-12 py-2 rounded-out font-bold 
                                color-bg-accent color-txt-accent 
                                cursor-pointer hover:scale-95 duration-200"
                    onClick={() => setTime(0)}
            >
                Reset
            </button>
        </div>
        </div>
    );
};

export default Timer;