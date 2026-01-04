import { LuCheck, LuArrowRight, LuSparkles } from "react-icons/lu";
import { useEffect, useState } from "react";

type AnswerNotiProps = {
    visible: boolean;
    onNext: () => void;
    message?: string;
  };
  
  export default function AnswerNoti({ visible, onNext, message }: AnswerNotiProps) {
    const [show, setShow] = useState(false);
    const [pulse, setPulse] = useState(false);
    const [shake, setShake] = useState(false);

    useEffect(() => {
      if (visible) {
        // Trigger entrance animation
        setTimeout(() => setShow(true), 50);
        // Trigger shake effect
        setTimeout(() => setShake(true), 100);
        setTimeout(() => setShake(false), 600);
        // Trigger pulse after entrance
        setTimeout(() => setPulse(true), 500);
      } else {
        setShow(false);
        setPulse(false);
        setShake(false);
      }
    }, [visible]);

    if (!visible) return null;

    return (
      <div 
        className={`fixed bottom-8 right-8 z-[600] transition-all duration-300 ${
          show ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
        }`}
      >
        <div 
          className={`relative flex items-center gap-4 px-5 py-4 rounded-2xl color-bg shadow-small ${
            shake ? 'animate-shake' : ''
          }`}
          style={{
            minWidth: '320px',
            maxWidth: '420px'
          }}
        >
          {/* Sparkle decoration */}
   
          {/* Success Icon */}
          <div 
            className={`w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
              pulse ? 'scale-110' : 'scale-100'
            }`}
          >
            <div className={`w-9 h-9 rounded-full bg-green-500 flex items-center justify-center shadow-lg transition-transform duration-300 ${
              show ? 'scale-100' : 'scale-0'
            }`}>
              <LuCheck size={20} className="text-white" strokeWidth={3} />
            </div>
          </div>

          {/* Message */}
          <div className="flex-1 min-w-0">
            <p className="font-bold color-txt-main text-sm">Nice one!</p>
            <p className="color-txt-sub text-xs truncate">
              {message || "You got it right!"}
            </p>
          </div>

          {/* Next Button */}
          <button
            className="flex items-center gap-1.5 px-4 py-2 rounded-full color-bg-accent color-txt-accent font-semibold text-sm hover:scale-105 active:scale-95 transition-transform duration-200 flex-shrink-0"
            onClick={onNext}
          >
            <span>Next</span>
            <LuArrowRight size={16} />
          </button>
        </div>

        <style>{`
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