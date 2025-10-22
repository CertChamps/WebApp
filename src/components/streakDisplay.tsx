import React, { useEffect, useState, useMemo } from "react";
import { LuFlame } from "react-icons/lu";

type StreakDisplayProps = {
  streak: number;
};

const StreakDisplay: React.FC<StreakDisplayProps> = ({ streak }) => {
  // Wiggle only if streak > 0, faster as streak increases
  const wiggleSpeed = useMemo(() => {
    if (streak <= 0) return 0;
    const calculated = 3 - Math.min(streak / 10, 2.5);
    return Math.max(calculated, 0.5);
  }, [streak]);

  return (
    <div
      className="flex flex-col items-center gap-0.5 px-5 py-1 rounded-full 
                 font-semibold ml-2 color-bg-grey-5 select-none"
    >
      <div
        className={'relative flex items-center justify-center'}
        style={{
          animation:
            streak > 0
              ? `wiggle ${wiggleSpeed}s ease-in-out infinite`
              : "none",
        }}
      >
        <LuFlame
          className="color-txt-main transition-transform duration-200"
          size={28}
        />
      </div>

      <div className="flex flex-row gap-1">
        <span className="color-txt-accent txt-bold">Streak:</span>
        <span className="color-txt-accent txt-bold">{streak}</span>
      </div>
    </div>
  );
};

export default StreakDisplay;