import { useContext, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { LuArrowRight, LuSendHorizontal, LuSparkles } from "react-icons/lu";
import { useNavigate } from "react-router-dom";
import { UserContext } from "../../context/UserContext";
import { useAI } from "./useAI";
import { ChatMessage, ChatMessageLoading } from "./ChatMessage";
import type { InjectedExchange } from "./useAI";

type AIChatProps = {
  question?: any;
  /** Optional: return current drawing as PNG data URL so the AI can see handwriting/maths. */
  getDrawingSnapshot?: (() => string | null) | null;
  /** Optional: return music stave analysis (detected note positions as text). */
  getStaveAnalysis?: (() => string | null) | null;
  /** Optional: return current exam paper (first page) as image so the AI can see the paper. */
  getPaperSnapshot?: (() => string | null) | null;
  /** Optional: return live document / workspace text for chat context. */
  getWorkspaceText?: (() => string | null) | null;
  /** Optional: externally injected exchange (e.g. from Check My Answer). */
  injectedExchange?: InjectedExchange | null;
  /** Optional action for grading flow (full-marks completion CTA). */
  onMarkCompleteFromGrading?: (() => void) | null;
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

export function AIChat({ question, getDrawingSnapshot, getStaveAnalysis, getPaperSnapshot, getWorkspaceText, injectedExchange, onMarkCompleteFromGrading }: AIChatProps) {
  const { user } = useContext(UserContext);
  const navigate = useNavigate();
  const [aiPlaceholder] = useState(() => AI_PLACEHOLDERS[Math.floor(Math.random() * AI_PLACEHOLDERS.length)]);
  const [completedActionNonce, setCompletedActionNonce] = useState<string | null>(null);
  const {
    messages,
    streamingContent,
    input,
    setInput,
    loading,
    error,
    sendMessage,
    handleKeyDown,
    messagesContainerRef,
    messagesEndRef,
    inputRef,
    hasQuestion,
  } = useAI(question, getDrawingSnapshot, getStaveAnalysis, getPaperSnapshot, injectedExchange, getWorkspaceText);

  const displayName = user?.username?.trim() || "there";
  const emptyMessage = hasQuestion
    ? "Ask about this question. I can explain concepts, give hints, or walk through steps. If you draw maths, music notation, or handwriting on the canvas, I can see it too. If you have a past paper open, I can see it as well."
    : "How can I help? I can explain concepts, hints, or steps. Draw on the canvas (maths, music notation, handwriting) and I’ll recognise it. If you have a past paper open, I can see it as well.";
  const showMarkCompleteAction = Boolean(
    injectedExchange?.action?.type === "markComplete" &&
      injectedExchange.nonce &&
      completedActionNonce !== injectedExchange.nonce &&
      onMarkCompleteFromGrading,
  );
  const allowanceReached = error?.code === "AI_QUOTA_EXCEEDED";

  const handleMarkComplete = () => {
    if (!onMarkCompleteFromGrading || !injectedExchange?.nonce) return;
    onMarkCompleteFromGrading();
    setCompletedActionNonce(injectedExchange.nonce);
  };

  return (
    <div className="ai-chat-shell pointer-events-auto h-full min-h-0 overflow-hidden">
      <div ref={messagesContainerRef} className="ai-chat-messages overflow-y-auto overflow-x-hidden px-4 pt-4 pb-3 space-y-4 min-h-0">
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
        {error && (
          <div className={`ai-chat-notice ${allowanceReached ? "ai-chat-notice--allowance" : ""}`} role="alert">
            <span className="ai-chat-notice__icon" aria-hidden>
              <LuSparkles size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold color-txt-main">
                {allowanceReached ? "Monthly AI allowance reached" : "AI couldn’t respond"}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed color-txt-sub">
                {allowanceReached && error.upgradeRequired
                  ? "You’ve used your free messages. ACE includes a larger monthly allowance."
                  : error.message}
              </p>
            </div>
            {allowanceReached && error.upgradeRequired && (
              <button
                type="button"
                onClick={() => navigate("/user/manage-account?tab=payments")}
                className="ai-chat-notice__action"
              >
                View ACE
                <LuArrowRight size={14} aria-hidden />
              </button>
            )}
          </div>
        )}
        {injectedExchange?.action?.type === "markComplete" && injectedExchange.nonce && (
          <div className="flex justify-start">
            {showMarkCompleteAction ? (
              <button
                type="button"
                onClick={handleMarkComplete}
                className="rounded-lg px-3 py-2 text-xs font-semibold color-bg-accent color-txt-accent hover:opacity-90 transition-opacity"
              >
                {injectedExchange.action.label}
              </button>
            ) : completedActionNonce === injectedExchange.nonce ? (
              <p className="text-xs color-txt-sub">Marked complete ✓</p>
            ) : null}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="ai-chat-composer color-bg border-t border-grey/15 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] p-3 pt-2">
        <div className="flex items-start rounded-out border border-grey/25 color-bg overflow-hidden focus-within:ring-2 focus-within:ring-inset focus-within:ring-grey/20">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={allowanceReached ? "Your AI allowance has been used for this month." : aiPlaceholder}
            rows={2}
            disabled={loading || allowanceReached}
            aria-disabled={loading || allowanceReached}
            className="flex-1 resize-none min-h-[2.75rem] max-h-24 border-0 bg-transparent color-txt-main pl-4 pr-2 py-2.5 text-sm placeholder:color-txt-sub/70 focus:outline-none focus:ring-0 disabled:opacity-50"
          />
          <button
            onClick={sendMessage}
            disabled={loading || allowanceReached || !input.trim()}
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
