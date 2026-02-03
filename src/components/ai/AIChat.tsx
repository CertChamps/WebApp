import { AnimatePresence } from "framer-motion";
import { useAI } from "./useAI";
import { ChatMessage, ChatMessageLoading } from "./ChatMessage";

type AIChatProps = {
  question?: any;
  /** Optional: return current drawing as PNG data URL so the AI can see handwriting/maths. */
  getDrawingSnapshot?: (() => string | null) | null;
};

export function AIChat({ question, getDrawingSnapshot }: AIChatProps) {
  const {
    messages,
    streamingContent,
    input,
    setInput,
    loading,
    error,
    sendMessage,
    handleKeyDown,
    messagesEndRef,
    inputRef,
    hasQuestion,
  } = useAI(question, getDrawingSnapshot);

  const emptyMessage = hasQuestion
    ? "Ask about this question—I can explain concepts, give hints, or walk through steps. If you draw maths or handwriting on the canvas, I can see it too."
    : "Ask a question about the problem. I can help explain concepts, hints, or steps. Draw on the canvas and I’ll recognise it.";

  return (
    <div className="pointer-events-auto flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-3 space-y-4 min-h-0">
        {messages.length === 0 && !loading && (
          <p className="text-sm color-txt-sub text-center py-12">{emptyMessage}</p>
        )}
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <ChatMessage key={i} message={msg} />
          ))}
          {loading && <ChatMessageLoading streamingContent={streamingContent} />}
        </AnimatePresence>
        {error && <p className="text-sm text-[var(--color-red)] text-center py-2">{error}</p>}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 pt-0">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Could input your answers here too?"
            rows={2}
            disabled={loading}
            className="flex-1 resize-none min-h-[2.75rem] max-h-24 rounded-out color-bg border border-grey/25 color-txt-main px-4 py-2.5 text-sm placeholder:color-txt-sub/70 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-grey/20 disabled:opacity-50"
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            aria-label="Send"
            className="color-bg-grey-10 color-txt-main h-[2.75rem] w-[2.75rem] shrink-0 rounded-full flex items-center justify-center hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
