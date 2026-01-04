import { useEffect, useState } from 'react';

interface ConfettiPiece {
  id: number;
  left: number;
  delay: number;
  duration: number;
  color: string;
  size: number;
  rotation: number;
}

interface ConfettiProps {
  show: boolean;
  onComplete?: () => void;
}

const COLORS = [
  '#FFD700', // Gold
  '#FF6B6B', // Coral
  '#4ECDC4', // Teal
  '#A78BFA', // Purple
  '#60A5FA', // Blue
  '#34D399', // Green
];

export default function Confetti({ show, onComplete }: ConfettiProps) {
  const [pieces, setPieces] = useState<ConfettiPiece[]>([]);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (show) {
      // Generate confetti pieces
      const newPieces: ConfettiPiece[] = [];
      const pieceCount = 50;
      
      for (let i = 0; i < pieceCount; i++) {
        newPieces.push({
          id: i,
          left: Math.random() * 100, // percentage across screen
          delay: Math.random() * 0.3, // stagger the start
          duration: 1.5 + Math.random() * 1, // 1.5-2.5s fall time
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          size: 6 + Math.random() * 6, // 6-12px
          rotation: Math.random() * 360,
        });
      }
      
      setPieces(newPieces);
      setIsVisible(true);
      
      // Clean up after animation
      const timer = setTimeout(() => {
        setIsVisible(false);
        setPieces([]);
        onComplete?.();
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [show, onComplete]);

  if (!isVisible || pieces.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
      {pieces.map((piece) => (
        <div
          key={piece.id}
          className="absolute confetti-piece"
          style={{
            left: `${piece.left}%`,
            top: '-20px',
            width: `${piece.size}px`,
            height: `${piece.size}px`,
            backgroundColor: piece.color,
            borderRadius: piece.id % 3 === 0 ? '50%' : '2px',
            transform: `rotate(${piece.rotation}deg)`,
            animation: `confetti-fall ${piece.duration}s ease-out ${piece.delay}s forwards`,
            opacity: 0,
          }}
        />
      ))}
      
      <style>{`
        @keyframes confetti-fall {
          0% {
            opacity: 1;
            transform: translateY(0) rotate(0deg) scale(1);
          }
          100% {
            opacity: 0;
            transform: translateY(100vh) rotate(720deg) scale(0.5);
          }
        }
      `}</style>
    </div>
  );
}
