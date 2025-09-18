type StreakDisplayProps = {
    streak: number;
  };
  
  const StreakDisplay = ({ streak }: StreakDisplayProps) => {
    return <div>Streak: {streak}</div>;
  };
  
  export default StreakDisplay;