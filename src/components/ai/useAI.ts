import { useState, useRef, useEffect, useCallback } from "react";

export type Message = { role: "user" | "assistant"; content: string };

/** Optional: return current drawing as PNG data URL (e.g. from canvas) so the AI can see it. */
export type GetDrawingSnapshot = () => string | null;

const CHAT_API_URL = "https://us-central1-certchamps-a7527.cloudfunctions.net/chat";

function buildQuestionContext(question: any): string | undefined {
  if (!question?.content?.length) return undefined;
  const parts: string[] = [];
  const name = question?.properties?.name;
  const tags = question?.properties?.tags;
  if (name) parts.push(`Question: ${name}`);
  if (Array.isArray(tags) && tags.length) parts.push(`Topics: ${tags.join(", ")}`);
  const questionTexts = question.content
    .map((c: any, i: number) => (c?.question ? `Part ${i + 1}: ${c.question}` : null))
    .filter(Boolean);
  if (questionTexts.length) parts.push(`\n${questionTexts.join("\n\n")}`);
  return parts.length ? parts.join("\n") : undefined;
}

export function useAI(question?: any, getDrawingSnapshot?: GetDrawingSnapshot | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputValueRef = useRef("");

  useEffect(() => {
    inputValueRef.current = input;
  }, [input]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);
  useEffect(() => scrollToBottom(), [messages, streamingContent]);

  const questionId = question?.id;
  useEffect(() => {
    setMessages([]);
    setStreamingContent("");
    setError(null);
  }, [questionId]);

  const sendMessage = useCallback(async () => {
    const text = inputValueRef.current.trim();
    if (!text || loading) return;

    setInput("");
    setError(null);
    const userMessage: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    try {
      const imageDataUrl = getDrawingSnapshot?.() ?? null;
      const apiMessages = [...messages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const lastUserContent = apiMessages[apiMessages.length - 1].content;
      if (imageDataUrl && lastUserContent !== undefined) {
        apiMessages[apiMessages.length - 1] = {
          role: "user",
          content: [
            { type: "text", text: lastUserContent },
            { type: "image_url", image_url: { url: imageDataUrl } },
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
      inputRef.current?.focus();
    }
  }, [messages, question, loading, getDrawingSnapshot]);

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
    messagesEndRef,
    inputRef,
    hasQuestion: Boolean(question),
  };
}
