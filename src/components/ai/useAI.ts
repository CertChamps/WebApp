import { useState, useRef, useEffect, useCallback } from "react";
import { AiRequestError, aiResponseError, authenticatedAiFetch, METERED_CHAT_API_URL } from "../../lib/aiApi";

export type Message = { role: "user" | "assistant"; content: string; source?: "chat" | "injected" };
export type AIChatError = {
  message: string;
  code: string | null;
  upgradeRequired: boolean;
};
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
/** Optional: return music stave analysis (detected note positions as text). */
export type GetStaveAnalysis = () => string | null;
/** Optional: return current exam paper (first page) as image data URL so the AI can see the paper. */
export type GetPaperSnapshot = () => string | null;
/** Optional: return live workspace text (e.g. document editor contents). */
export type GetWorkspaceText = () => string | null;

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

/**
 * Attachment and history budgets. The chat endpoint rejects anything larger, so
 * the payload is trimmed here by priority rather than letting a multi-page
 * question fail the whole request.
 */
const MAX_ATTACHED_IMAGES = 6;
const MAX_QUESTION_IMAGES = 4;
const MAX_MARKING_SCHEME_IMAGES = 2;
const MAX_HISTORY_MESSAGES = 16;
const MAX_MESSAGE_CHARACTERS = 8_000;

type AttachmentKind = "question" | "work" | "markingScheme" | "paper";

const ATTACHMENT_LABELS: Record<AttachmentKind, string> = {
  question: "the current question",
  work: "the student's own handwritten work",
  markingScheme: "the official marking scheme for this question",
  paper: "the exam paper the student has open",
};

function selectAttachments(sources: {
  questionImageUrls: string[];
  markingSchemeImageUrls: string[];
  drawingDataUrl: string | null;
  paperDataUrl: string | null;
}): { url: string; kind: AttachmentKind }[] {
  const tiers: { kind: AttachmentKind; urls: (string | null)[]; limit: number }[] = [
    { kind: "question", urls: sources.questionImageUrls, limit: MAX_QUESTION_IMAGES },
    { kind: "work", urls: [sources.drawingDataUrl], limit: 1 },
    { kind: "markingScheme", urls: sources.markingSchemeImageUrls, limit: MAX_MARKING_SCHEME_IMAGES },
    { kind: "paper", urls: [sources.paperDataUrl], limit: 1 },
  ];

  const seen = new Set<string>();
  const selected: { url: string; kind: AttachmentKind }[] = [];
  for (const tier of tiers) {
    let taken = 0;
    for (const url of tier.urls) {
      if (selected.length >= MAX_ATTACHED_IMAGES) return selected;
      if (taken >= tier.limit) break;
      if (!url || seen.has(url)) continue;
      seen.add(url);
      selected.push({ url, kind: tier.kind });
      taken += 1;
    }
  }
  return selected;
}

function describeAttachments(attachments: { kind: AttachmentKind }[]): string | null {
  if (attachments.length === 0) return null;
  const lines = attachments.map((a, i) => `Image ${i + 1}: ${ATTACHMENT_LABELS[a.kind]}`);
  return `Attached images, in order:\n${lines.join("\n")}`;
}

function trimHistory(history: Message[]): { role: Message["role"]; content: string }[] {
  return history.slice(-MAX_HISTORY_MESSAGES).map((m) => ({
    role: m.role,
    content:
      m.content.length > MAX_MESSAGE_CHARACTERS
        ? `${m.content.slice(0, MAX_MESSAGE_CHARACTERS)}\n[earlier text trimmed]`
        : m.content,
  }));
}

const STAVE_CONTEXT = `The user's canvas shows a music stave. The snapshot image has position labels on the left of each stave group:
Lines (bottom to top): L1, L2, L3, L4, L5
Spaces (bottom to top): S1, S2, S3, S4

Treble clef mapping: L1=E4, S1=F4, L2=G4, S2=A4, L3=B4, S3=C5, L4=D5, S4=E5, L5=F5
Bass clef mapping: L1=G2, S1=A2, L2=B2, S2=C3, L3=D3, S3=E3, L4=F3, S4=G3, L5=A3

Determine the clef from the question context. Use the position labels visible on the stave image AND the programmatic note detection below to identify note pitches accurately.`;

function buildQuestionContext(
  question: any,
  staveAnalysis?: string | null,
  workspaceText?: string | null,
  attachmentSummary?: string | null,
): string | undefined {
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
  if (attachmentSummary) {
    parts.push(attachmentSummary);
  } else if (!questionTexts.length && name) {
    parts.push("Use only the named question/part above as context. Do not answer other parts unless asked.");
  }
  if (staveAnalysis) {
    parts.push(STAVE_CONTEXT);
    parts.push(staveAnalysis);
  }
  const trimmedWorkspace = workspaceText?.trim();
  if (trimmedWorkspace) {
    parts.push(
      "The student's current document / written work is included below. Use it when answering.",
      `<student_work>\n${trimmedWorkspace.slice(0, 30_000)}\n</student_work>`,
    );
  }
  return parts.length ? parts.join("\n") : undefined;
}

export function useAI(
  question?: any,
  getDrawingSnapshot?: GetDrawingSnapshot | null,
  getStaveAnalysis?: GetStaveAnalysis | null,
  getPaperSnapshot?: GetPaperSnapshot | null,
  injectedExchange?: InjectedExchange | null,
  getWorkspaceText?: GetWorkspaceText | null,
) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AIChatError | null>(null);
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
    if (!injectedExchange) {
      lastInjectedNonceRef.current = null;
      setMessages((prev) => prev.filter((msg) => msg.source !== "injected"));
      return;
    }

    if (!injectedExchange?.nonce) return;
    if (lastInjectedNonceRef.current === injectedExchange.nonce) return;
    lastInjectedNonceRef.current = injectedExchange.nonce;
    const userText = injectedExchange.userMessage.trim();
    const assistantText = injectedExchange.assistantMessage.trim();
    if (!userText && !assistantText) return;
    setMessages((prev) => {
      const next = [...prev];
      if (userText) next.push({ role: "user", content: userText, source: "injected" });
      if (assistantText) next.push({ role: "assistant", content: assistantText, source: "injected" });
      return next;
    });
  }, [injectedExchange]);

  const sendMessage = useCallback(async () => {
    const text = inputValueRef.current.trim();
    if (!text || loading) return;

    setInput("");
    setError(null);
    const userMessage: Message = { role: "user", content: text, source: "chat" };
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    try {
      const drawingDataUrl = getDrawingSnapshot?.() ?? null;
      const staveAnalysis = getStaveAnalysis?.() ?? null;
      const paperDataUrl = getPaperSnapshot?.() ?? null;
      const workspaceText = getWorkspaceText?.() ?? null;
      const questionImageUrls: string[] = Array.isArray(question?.imageUrls) ? question.imageUrls : [];
      const markingSchemeImageUrls: string[] = Array.isArray(question?.markingSchemeImageUrls)
        ? question.markingSchemeImageUrls
        : [];
      const apiMessages: { role: Message["role"]; content: unknown }[] = trimHistory([...messages, userMessage]);
      const lastUserContent = apiMessages[apiMessages.length - 1].content;
      const attachments = selectAttachments({
        questionImageUrls,
        markingSchemeImageUrls,
        drawingDataUrl,
        paperDataUrl,
      });
      if (attachments.length > 0 && typeof lastUserContent === "string") {
        apiMessages[apiMessages.length - 1] = {
          role: "user",
          content: [
            { type: "text", text: lastUserContent },
            ...attachments.map(({ url }) => ({ type: "image_url" as const, image_url: { url } })),
          ],
        };
      }
      const context = buildQuestionContext(
        question,
        staveAnalysis,
        workspaceText,
        describeAttachments(attachments),
      );
      const res = await authenticatedAiFetch(
        METERED_CHAT_API_URL,
        { messages: apiMessages, context },
        "tutor",
      );

      if (!res.ok) {
        throw await aiResponseError(res, "The AI tutor could not respond.");
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

      setMessages((m) => [...m, { role: "assistant", content: fullText, source: "chat" }]);
      setStreamingContent("");
    } catch (err) {
      setStreamingContent("");
      setError({
        message: err instanceof Error ? err.message : "Something went wrong",
        code: err instanceof AiRequestError ? err.code : null,
        upgradeRequired: err instanceof AiRequestError && err.upgradeRequired,
      });
    } finally {
      setLoading(false);
      if (!isIOSLikeDevice()) {
        inputRef.current?.focus();
      }
    }
  }, [messages, question, loading, getDrawingSnapshot, getStaveAnalysis, getPaperSnapshot, getWorkspaceText]);

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
