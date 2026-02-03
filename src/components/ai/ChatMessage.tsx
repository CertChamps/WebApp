import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import katex from "katex";
import { motion } from "framer-motion";
import "katex/dist/katex.min.css";
import type { Message } from "./useAI";

const MATH_PLACEHOLDER = "\uE000";
type Segment = { type: "text"; value: string } | { type: "math"; value: string; display: boolean };

function splitMathSegments(text: string): Segment[] {
  const parts: Segment[] = [];
  let s = text
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, m) => `${MATH_PLACEHOLDER}B${m}${MATH_PLACEHOLDER}b`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, m) => `${MATH_PLACEHOLDER}I${m}${MATH_PLACEHOLDER}i`)
    .replace(/\$\$([\s\S]*?)\$\$/g, (_, m) => `${MATH_PLACEHOLDER}B${m}${MATH_PLACEHOLDER}b`)
    .replace(/\$([^$\n]+?)\$/g, (_, m) => `${MATH_PLACEHOLDER}I${m}${MATH_PLACEHOLDER}i`);
  const re = new RegExp(`${MATH_PLACEHOLDER}([BI])([\\s\\S]*?)${MATH_PLACEHOLDER}([bi])`, "g");
  let lastIdx = 0;
  let m;
  while ((m = re.exec(s)) !== null) {
    if (m.index > lastIdx) {
      const textPart = s.slice(lastIdx, m.index);
      if (textPart) parts.push({ type: "text", value: textPart });
    }
    parts.push({ type: "math", value: m[2], display: m[1] === "B" });
    lastIdx = re.lastIndex;
  }
  if (lastIdx < s.length) {
    const textPart = s.slice(lastIdx);
    if (textPart) parts.push({ type: "text", value: textPart });
  }
  return parts.length ? parts : [{ type: "text", value: text }];
}

const mdComponents = {
  p: ({ children }: { children?: React.ReactNode }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }: { children?: React.ReactNode }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
  li: ({ children }: { children?: React.ReactNode }) => <li className="ml-1">{children}</li>,
  code: ({ className, children, ...props }: { className?: string; children?: React.ReactNode }) => {
    const isInline = !className;
    return isInline ? (
      <code className="px-1 py-0.5 rounded bg-grey/20 text-sm font-mono" {...props}>{children}</code>
    ) : (
      <code className="block p-3 rounded my-2 overflow-x-auto bg-grey/20 text-sm font-mono whitespace-pre" {...props}>{children}</code>
    );
  },
  pre: ({ children }: { children?: React.ReactNode }) => <pre className="my-2 overflow-x-auto text-xs">{children}</pre>,
  strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-bold">{children}</strong>,
  h1: ({ children }: { children?: React.ReactNode }) => <h3 className="font-bold text-base mt-2 mb-1">{children}</h3>,
  h2: ({ children }: { children?: React.ReactNode }) => <h3 className="font-bold text-sm mt-2 mb-1">{children}</h3>,
  h3: ({ children }: { children?: React.ReactNode }) => <h3 className="font-semibold text-sm mt-2 mb-1">{children}</h3>,
};

function MessageContent({ content }: { content: string }) {
  if (!content.trim()) return null;
  const segments = splitMathSegments(content);
  return (
    <div className="chat-markdown">
      {segments.map((seg, i) => {
        if (seg.type === "text") {
          if (!seg.value.trim()) return null;
          return (
            <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={mdComponents}>
              {seg.value}
            </ReactMarkdown>
          );
        }
        try {
          const html = katex.renderToString(seg.value.trim(), { throwOnError: false, displayMode: seg.display });
          return (
            <span
              key={i}
              className={seg.display ? "block my-2 overflow-x-auto" : "inline"}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        } catch {
          return <code key={i} className="text-sm">${seg.value}$</code>;
        }
      })}
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
