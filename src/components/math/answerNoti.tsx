type AnswerNotiProps = {
    visible: boolean;
    onNext: () => void;
  };
  
  export default function AnswerNoti({ visible, onNext }: AnswerNotiProps) {
    if (!visible) return null;
    return (
      <div className="w-70 h-20 color-bg color-shadow border-2 rounded-out
          absolute left-1/2 bottom-3 -translate-x-1/2 p-4 flex items-center justify-between">
        <p>You are correct</p>
        <button className="blue-btn" onClick={onNext}>
          Next Question
        </button>
      </div>
    );
  }