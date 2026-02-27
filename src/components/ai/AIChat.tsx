import { useContext, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { LuSendHorizontal } from "react-icons/lu";
import { UserContext } from "../../context/UserContext";
import { useAI } from "./useAI";
import { ChatMessage, ChatMessageLoading } from "./ChatMessage";

type AIChatProps = {
  question?: any;
  /** Optional: return current drawing as PNG data URL so the AI can see handwriting/maths. */
  getDrawingSnapshot?: (() => string | null) | null;
  /** Optional: return current exam paper (first page) as image so the AI can see the paper. */
  getPaperSnapshot?: (() => string | null) | null;
};

const AI_PLACEHOLDERS = [
  "Ask me anything about this question...",
  "Stuck? I can give you a hint...",
  "Type your answer and I'll check it...",
  "Need a step-by-step walkthrough?",
  "What part are you unsure about?",
  "Try explaining your approach to me...",
  "Want me to break this down?",
  "Not sure where to start? Ask me...",
  "I can see your drawing, ask away! <3",
  "If you want to give up, I'm here for you.",
  "No question is a stupid question:)",
];

export function AIChat({ question, getDrawingSnapshot, getPaperSnapshot }: AIChatProps) {
  const { user } = useContext(UserContext);
  const [aiPlaceholder] = useState(() => AI_PLACEHOLDERS[Math.floor(Math.random() * AI_PLACEHOLDERS.length)]);
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
  } = useAI(question, getDrawingSnapshot, getPaperSnapshot);

  const displayName = user?.username?.trim() || "there";
  const emptyMessage = hasQuestion
    ? "Ask about this question. I can explain concepts, give hints, or walk through steps. If you draw maths or handwriting on the canvas, I can see it too. If you have a past paper open, I can see it as well."
    : "How can I can help? I can explain concepts, hints, or steps. Draw on the canvas and I’ll recognise it. If you have a past paper open, I can see it too.";

  return (
    <div className="pointer-events-auto flex h-full flex-col overflow-hidden">
      <div className="ai-chat-messages flex-1 overflow-y-auto overflow-x-hidden px-4 pt-4 pb-3 space-y-4 min-h-0">
        {messages.length === 0 && !loading && (
          <div className="text-center h-[90%] flex flex-col justify-center items-center">
            <h3 className="font-bold color-txt-main mb-2 text-2xl">Hey, {displayName}</h3>
            <p className="text-sm color-txt-sub w-3/4 mx-auto">{emptyMessage}</p>
          </div>
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
        <div className="flex items-start rounded-out border border-grey/25 color-bg overflow-hidden focus-within:ring-2 focus-within:ring-inset focus-within:ring-grey/20">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={aiPlaceholder}
            rows={2}
            disabled={loading}
            className="flex-1 resize-none min-h-[2.75rem] max-h-24 border-0 bg-transparent color-txt-main pl-4 pr-2 py-2.5 text-sm placeholder:color-txt-sub/70 focus:outline-none focus:ring-0 disabled:opacity-50"
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            aria-label="Send"
            className="shrink-0 p-2.5 color-txt-main hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            <LuSendHorizontal size={20} strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}
