import { LuX } from "react-icons/lu";
import { useEffect, useState } from "react";

type WrongAnswerNotiProps = {
    visible: boolean;
    onDismiss: () => void;
    message?: string;
    attemptsLeft?: number;
  };
  
  export default function WrongAnswerNoti({ visible, onDismiss, message, attemptsLeft }: WrongAnswerNotiProps) {
    const [show, setShow] = useState(false);
    const [shake, setShake] = useState(false);

    useEffect(() => {
      if (visible) {
        // Trigger entrance animation
        setTimeout(() => setShow(true), 50);
        // Trigger shake effect
        setTimeout(() => setShake(true), 100);
        setTimeout(() => setShake(false), 600);
        
        // Auto-dismiss after 2.5 seconds
        const timer = setTimeout(() => {
          setShow(false);
          setTimeout(() => onDismiss(), 300);
        }, 2500);

        return () => clearTimeout(timer);
      } else {
        setShow(false);
        setShake(false);
      }
    }, [visible, onDismiss]);

    if (!visible) return null;

    return (
      <div 
        className={`fixed bottom-8 right-8 z-[600] transition-all duration-300 ${
          show ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
        }`}
      >
        <div 
          className={`relative flex items-center gap-4 px-5 py-4 rounded-2xl color-bg shadow-small border ${
            shake ? 'animate-shake' : ''
          }`}
          style={{
            minWidth: '300px',
            maxWidth: '400px'
          }}
        >
          {/* Error Icon */}
          <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
            <div className={`w-9 h-9 rounded-full bg-red-500 flex items-center justify-center shadow-lg transition-transform duration-300 ${
              show ? 'scale-100' : 'scale-0'
            }`}>
              <LuX size={20} className="text-white" strokeWidth={3} />
            </div>
          </div>

          {/* Message */}
          <div className="flex-1 min-w-0">
            <p className="font-bold color-txt-main text-sm">Not quite!</p>
            <p className="color-txt-sub text-xs">
              {attemptsLeft !== undefined && attemptsLeft > 0 
                ? `${attemptsLeft} attempt${attemptsLeft !== 1 ? 's' : ''} left. ${message || "Try again!"}`
                : message || "Keep trying!"
              }
            </p>
          </div>

          {/* Progress bar that shrinks as auto-dismiss timer runs */}
          <div className="absolute bottom-0 left-0 right-0 h-1 rounded-b-2xl overflow-hidden">
            <div 
              className="h-full bg-red-500/50 rounded-b-2xl"
              style={{
                animation: 'shrink-bar 2.5s linear forwards'
              }}
            />
          </div>
        </div>

        <style>{`
          @keyframes shrink-bar {
            from { width: 100%; }
            to { width: 0%; }
          }
          .animate-shake {
            animation: shake 0.5s ease-in-out;
          }
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            20% { transform: translateX(-8px); }
            40% { transform: translateX(8px); }
            60% { transform: translateX(-6px); }
            80% { transform: translateX(6px); }
          }
        `}</style>
      </div>
    );
  }
