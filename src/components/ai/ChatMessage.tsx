import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkBreaks from "remark-breaks";
import rehypeKatex from "rehype-katex";
import { motion } from "framer-motion";
import "katex/dist/katex.min.css";
import type { Message } from "./useAI";

/**
 * Normalise math delimiters and ensure block math is recognised by remark-math.
 * remark-math treats $$ as block only when it has newlines around it (fenced style).
 * Single-line $$\frac{1}{2}$$ is parsed as inline; we wrap it in newlines to force block.
 */
function normaliseMathDelimiters(text: string): string {
  let s = text
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => `\n\n$$${m.trim()}$$\n\n`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, m) => `$${m}$`);
  // Single-line $$...$$ (AI often outputs this) -> add newlines so remark-math parses as block
  s = s.replace(/(?<!\$)\$\$([^\n]*?)\$\$(?!\$)/g, (_, m) => `\n\n$$${m.trim()}$$\n\n`);
  return s;
}

const mdComponents = {
  p: ({ children }: { children?: React.ReactNode }) => <p className="chat-markdown-p">{children}</p>,
  ul: ({ children }: { children?: React.ReactNode }) => <ul className="chat-markdown-ul">{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol className="chat-markdown-ol">{children}</ol>,
  li: ({ children }: { children?: React.ReactNode }) => <li className="chat-markdown-li">{children}</li>,
  code: ({ className, children, ...props }: { className?: string; children?: React.ReactNode }) => {
    const isInline = !className;
    return isInline ? (
      <code className="chat-markdown-code-inline" {...props}>{children}</code>
    ) : (
      <code className="chat-markdown-code-block" {...props}>{children}</code>
    );
  },
  pre: ({ children }: { children?: React.ReactNode }) => <pre className="chat-markdown-pre">{children}</pre>,
  strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-bold">{children}</strong>,
  em: ({ children }: { children?: React.ReactNode }) => <em className="italic">{children}</em>,
  blockquote: ({ children }: { children?: React.ReactNode }) => <blockquote className="chat-markdown-blockquote">{children}</blockquote>,
  hr: () => <hr className="chat-markdown-hr" />,
  h1: ({ children }: { children?: React.ReactNode }) => <h1 className="chat-markdown-h1">{children}</h1>,
  h2: ({ children }: { children?: React.ReactNode }) => <h2 className="chat-markdown-h2">{children}</h2>,
  h3: ({ children }: { children?: React.ReactNode }) => <h3 className="chat-markdown-h3">{children}</h3>,
  table: ({ children }: { children?: React.ReactNode }) => <div className="chat-markdown-table-wrap"><table className="chat-markdown-table">{children}</table></div>,
  thead: ({ children }: { children?: React.ReactNode }) => <thead>{children}</thead>,
  tbody: ({ children }: { children?: React.ReactNode }) => <tbody>{children}</tbody>,
  tr: ({ children }: { children?: React.ReactNode }) => <tr>{children}</tr>,
  th: ({ children }: { children?: React.ReactNode }) => <th>{children}</th>,
  td: ({ children }: { children?: React.ReactNode }) => <td>{children}</td>,
};

function MessageContent({ content }: { content: string }) {
  if (!content.trim()) return null;
  const normalised = normaliseMathDelimiters(content);
  return (
    <div className="chat-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
        rehypePlugins={[rehypeKatex]}
        components={mdComponents}
      >
        {normalised}
      </ReactMarkdown>
    </div>
  );
}

type ChatMessageProps = {
  message: Message;
  isStreaming?: boolean;
};

export function ChatMessage({ message, isStreaming = false }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.25, 0.4, 0.25, 1] }}
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[85%] rounded-[1.25rem] px-4 py-2.5 text-sm color-txt-main ${
          isUser ? "color-bg-grey-5 rounded-br-[0.35rem]" : "color-bg-grey-10 rounded-bl-[0.35rem]"
        }`}
      >
        {isUser ? (
          <p className="text-xs whitespace-pre-wrap break-words">{message.content}</p>
        ) : (
          <div className="text-xs chat-markdown-prose">
            <MessageContent content={message.content} />
            {isStreaming && <span className="animate-pulse inline-block ml-0.5">▊</span>}
          </div>
        )}
      </div>
    </motion.div>
  );
}

type ChatMessageLoadingProps = { streamingContent: string };

export function ChatMessageLoading({ streamingContent }: ChatMessageLoadingProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.25, 0.4, 0.25, 1] }}
      className="flex justify-start"
    >
      <div className="color-bg-grey-10 color-txt-main rounded-[1.25rem] rounded-bl-[0.35rem] px-4 py-2.5 text-sm max-w-[85%] overflow-hidden">
        {streamingContent ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }} className="text-xs">
            <MessageContent content={streamingContent} />
            <span className="animate-pulse inline-block ml-0.5">▊</span>
          </motion.div>
        ) : (
          <span className="inline-flex gap-1">
            <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
            <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
            <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
          </span>
        )}
      </div>
    </motion.div>
  );
}
