import { useState, useRef, useEffect, useCallback } from "react";

export type Message = { role: "user" | "assistant"; content: string };
export type InjectedExchange = {
  nonce: string;
  userMessage: string;
  assistantMessage: string;
  action?: {
    type: "markComplete";
    label: string;
  } | null;
};

/** Optional: return current drawing as PNG data URL (e.g. from canvas) so the AI can see it. */
export type GetDrawingSnapshot = () => string | null;
/** Optional: return current exam paper (first page) as image data URL so the AI can see the paper. */
export type GetPaperSnapshot = () => string | null;

const CHAT_API_URL = "https://us-central1-certchamps-a7527.cloudfunctions.net/chat";

function isIOSLikeDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const userAgent = navigator.userAgent || "";
  const platform = navigator.platform || "";
  return /iPad|iPhone|iPod/i.test(userAgent) || (platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function romanToInt(input: string): number | null {
  const s = input.trim().toUpperCase();
  if (!s) return null;
  const map: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };
  let total = 0;
  let prev = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    const val = map[s[i] ?? ""];
    if (!val) return null;
    if (val < prev) total -= val;
    else total += val;
    prev = val;
  }
  return total > 0 ? total : null;
}

function parsePartIndexFromName(name: string | undefined): number | null {
  if (!name) return null;
  const alpha = name.match(/(?:^|\b)part\s*([a-z])\b/i) ?? name.match(/\(([a-z])\)/i);
  if (alpha) {
    const ch = alpha[1]?.toUpperCase();
    if (ch) return ch.charCodeAt(0) - 64;
  }
  const roman =
    name.match(/(?:^|\b)part\s*(i{1,3}|iv|v|vi{0,3}|ix|x)\b/i) ??
    name.match(/\((i{1,3}|iv|v|vi{0,3}|ix|x)\)/i);
  if (roman?.[1]) {
    const n = romanToInt(roman[1]);
    if (n != null) return n;
  }
  const numeric = name.match(/(?:^|\b)part\s*(\d+)\b/i);
  if (numeric?.[1]) {
    const n = Number(numeric[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const qSuffix = name.match(/\bq(?:uestion)?\s*\d+\s*([a-z])\b/i);
  if (qSuffix?.[1]) {
    const ch = qSuffix[1].toUpperCase();
    return ch.charCodeAt(0) - 64;
  }
  return null;
}

function buildQuestionContext(question: any): string | undefined {
  const name = question?.properties?.name ?? question?.questionName;
  const tags = question?.properties?.tags ?? question?.tags;
  const rawContent = Array.isArray(question?.content) ? question.content : [];
  const partIndex = parsePartIndexFromName(typeof name === "string" ? name : undefined);
  const scopedContent =
    partIndex != null && partIndex > 0 && partIndex <= rawContent.length
      ? [rawContent[partIndex - 1]]
      : rawContent;

  const parts: string[] = [];
  if (name) parts.push(`Question: ${name}`);
  if (Array.isArray(tags) && tags.length) parts.push(`Topics: ${tags.join(", ")}`);
  if (partIndex != null) {
    parts.push(`Scope: Answer ONLY this specific part (Part ${partIndex}) unless the user explicitly asks about another part.`);
  }
  const questionTexts = scopedContent
    .map((c: any, i: number) => (c?.question ? `Part ${i + 1}: ${c.question}` : null))
    .filter(Boolean);
  if (questionTexts.length) parts.push(`\n${questionTexts.join("\n\n")}`);
  if (!questionTexts.length && name) {
    parts.push("Use only the named question/part above as context. Do not answer other parts unless asked.");
  }
  return parts.length ? parts.join("\n") : undefined;
}

export function useAI(
  question?: any,
  getDrawingSnapshot?: GetDrawingSnapshot | null,
  getPaperSnapshot?: GetPaperSnapshot | null,
  injectedExchange?: InjectedExchange | null
) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputValueRef = useRef("");

  useEffect(() => {
    inputValueRef.current = input;
  }, [input]);

  const scrollToBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const top = container.scrollHeight;
    container.scrollTo({
      top,
      behavior: isIOSLikeDevice() ? "auto" : "smooth",
    });
  }, []);
  useEffect(() => scrollToBottom(), [messages, streamingContent]);

  const questionId = question?.id;
  useEffect(() => {
    setMessages([]);
    setStreamingContent("");
    setError(null);
  }, [questionId]);

  const lastInjectedNonceRef = useRef<string | null>(null);
  useEffect(() => {
    if (!injectedExchange?.nonce) return;
    if (lastInjectedNonceRef.current === injectedExchange.nonce) return;
    lastInjectedNonceRef.current = injectedExchange.nonce;
    const userText = injectedExchange.userMessage.trim();
    const assistantText = injectedExchange.assistantMessage.trim();
    if (!userText && !assistantText) return;
    setMessages((prev) => {
      const next = [...prev];
      if (userText) next.push({ role: "user", content: userText });
      if (assistantText) next.push({ role: "assistant", content: assistantText });
      return next;
    });
  }, [injectedExchange]);

  const sendMessage = useCallback(async () => {
    const text = inputValueRef.current.trim();
    if (!text || loading) return;

    setInput("");
    setError(null);
    const userMessage: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    try {
      const drawingDataUrl = getDrawingSnapshot?.() ?? null;
      const paperDataUrl = getPaperSnapshot?.() ?? null;
      const apiMessages = [...messages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const lastUserContent = apiMessages[apiMessages.length - 1].content;
      const imageUrls = [drawingDataUrl, paperDataUrl].filter((url): url is string => Boolean(url));
      if (imageUrls.length > 0 && lastUserContent !== undefined) {
        apiMessages[apiMessages.length - 1] = {
          role: "user",
          content: [
            { type: "text", text: lastUserContent },
            ...imageUrls.map((url) => ({ type: "image_url" as const, image_url: { url } })),
          ],
        } as any;
      }
      const context = buildQuestionContext(question);
      const res = await fetch(CHAT_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, context }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.details || "Request failed");
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      if (!reader) throw new Error("No response body");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data) as {
                choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>;
                error?: { message?: string };
              };
              if (parsed.error) throw new Error(parsed.error.message || "Stream error");
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullText += content;
                setStreamingContent(fullText);
              }
            } catch (e) {
              if (e instanceof SyntaxError) continue;
              throw e;
            }
          }
        }
      }

      setMessages((m) => [...m, { role: "assistant", content: fullText }]);
      setStreamingContent("");
    } catch (err) {
      setStreamingContent("");
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
      if (!isIOSLikeDevice()) {
        inputRef.current?.focus();
      }
    }
  }, [messages, question, loading, getDrawingSnapshot, getPaperSnapshot]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage]
  );

  return {
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
    hasQuestion: Boolean(question),
  };
}
