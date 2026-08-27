import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  LuLoaderCircle,
} from "react-icons/lu";
import { z } from "zod";
import DrawingCanvas, {
  type CanvasObject,
  type RegisterDrawingSnapshot,
  type RegisterGetGradingCapture,
  type ToolMode,
} from "../questions/DrawingCanvas";
import QuestionAudioPlayer from "../questions/QuestionAudioPlayer";
import type { AttachedQuestion, WhiteboardPage } from "../../data/whiteboards";
import { useAttachedQuestionMedia } from "../../hooks/useAttachedQuestionMedia";
import { useDocumentStorage } from "../../hooks/useDocumentStorage";
import { renderPdfPages } from "../../utils/pdfPagesToImages";
import { getThemedPortalTarget } from "../../utils/themedPortal";
import {
  aiResponseError,
  AiRequestError,
  authenticatedAiFetch,
  createAiUsageId,
  METERED_CHAT_API_URL,
} from "../../lib/aiApi";
import {
  applyThemeTextColor,
  isThemeTextColorClass,
  stripBakedColorStyles,
} from "../../lib/themeTextColor";
import type { InjectedExchange } from "../ai/useAI";
import { buildGradingChatMessage } from "../../lib/grading/annotationBuilder";

export type DocumentCanvasStroke = {
  points: { x: number; y: number; pressure: number }[];
  tool: "pen" | "eraser";
  colorIndex?: number;
  thicknessIndex?: number;
  color?: string;
};

type Feedback = { id: string; quote: string; message: string; suggestion: string };
type SaveStatus = "loading" | "saved" | "dirty" | "saving" | "error";
type EditorMode = "text" | "pen";

type Props = {
  page: WhiteboardPage;
  attachments?: AttachedQuestion[];
  activeAttachmentId?: string | null;
  onSelectAttachment?: (id: string) => void;
  canvasStrokes: DocumentCanvasStroke[];
  canvasObjects: CanvasObject[];
  onStrokesChange: (strokes: DocumentCanvasStroke[]) => void;
  onObjectsChange: (objects: CanvasObject[]) => void;
  onUploadImage: (blob: Blob) => Promise<string>;
  registerDrawingSnapshot?: RegisterDrawingSnapshot;
  registerGetGradingCapture?: RegisterGetGradingCapture;
  registerGetDocumentText?: (fn: (() => string) | null) => void;
  registerCheckAnswer?: (fn: (() => Promise<void>) | null) => void;
  questionLabel?: string;
  questionImages?: string[];
  markingSchemeImages?: string[];
  subjectLabel?: string;
  onCheckStart?: () => void;
  onGradingComplete?: (exchange: InjectedExchange) => void;
  onTouch: () => Promise<void> | void;
  progressAliasId?: string | null;
  viewportClassName?: string;
  toolbarCenterX?: number | null;
  toolbarCenterAnimated?: boolean;
  onToolbarCenterChange?: (centerX: number | null) => void;
  toolbarExtras?: ReactNode;
};

const coerceNumber = z.preprocess((value) => {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) ? n : 0;
}, z.number());

const coerceBool = z.preprocess((value) => {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === 1 || value === "1") return true;
  if (value === "false" || value === 0 || value === "0") return false;
  return Boolean(value);
}, z.boolean());

const resultSchema = z.object({
  totalAwarded: coerceNumber,
  totalAvailable: coerceNumber,
  isFullMarks: coerceBool,
  overview: z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value.trim() : "Here's my read of this answer."),
    z.string().min(1).max(2500),
  ),
  parts: z.array(z.object({
    partId: z.preprocess((value) => String(value ?? "a"), z.string().min(1).max(40)),
    marksAwarded: coerceNumber,
    marksAvailable: coerceNumber,
    feedback: z.preprocess(
      (value) => (typeof value === "string" ? value : ""),
      z.string().max(2000),
    ),
  })).max(16).default([]),
  errors: z.array(z.object({
    quote: z.string().min(1).max(240),
    message: z.string().min(1).max(1200),
    suggestion: z.preprocess(
      (value) => (typeof value === "string" ? value : ""),
      z.string().max(800),
    ).default(""),
  })).max(8).default([]),
});

const ALLOWED_TAGS = new Set([
  "P", "DIV", "BR", "STRONG", "B", "EM", "I", "U", "S", "UL", "OL", "LI",
  "H1", "H2", "H3", "BLOCKQUOTE", "SPAN", "FONT", "FIGURE", "FIGCAPTION", "IMG",
  "SECTION",
]);
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  "*": new Set(["class"]),
  FONT: new Set(["size"]),
  SPAN: new Set(["style", "data-theme-ink"]),
  DIV: new Set(["data-question-id", "contenteditable", "class"]),
  SECTION: new Set(["data-doc-page"]),
  IMG: new Set(["src", "alt", "class", "width", "height"]),
};
/** Match the original document paper width so questions and writing line up. */
const DOCUMENT_WIDTH_CLASS = "w-full max-w-[816px] sm:min-w-[640px]";
const EMPTY_PAGE_HTML = "<p><br></p>";
const ALLOWED_CONTENT_CLASSES = new Set([
  "my-3", "my-5", "flex", "items-center", "gap-2", "rounded-xl", "rounded-md", "rounded-lg",
  "color-bg-grey-5", "color-bg-accent", "color-txt-main", "color-txt-accent", "color-txt-sub",
  "px-2", "px-3", "py-1", "py-3", "text-xs", "text-sm", "font-semibold", "cursor-pointer",
  "mx-auto", "h-auto", "max-w-full", "mt-1", "text-center",
]);
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_PDF_BYTES = 25 * 1024 * 1024;
const SAVE_DELAY_MS = 900;
const MAX_AI_ESSAY_CHARS = 30_000;

function sanitizeStyle(value: string): string {
  return stripBakedColorStyles(value)
    .split(";")
    .map((part) => part.trim())
    .filter((part) => /^(font-size|font-weight|font-style|text-decoration|text-align)\s*:/i.test(part))
    .filter((part) => !/(?:url|expression|var|calc)\s*\(/i.test(part))
    .filter((part) => {
      if (!/^font-size\s*:/i.test(part)) return true;
      const match = part.match(/^font-size\s*:\s*([0-9]+(?:\.[0-9]+)?)(px|pt|em|rem|%)$/i);
      if (!match) return false;
      const amount = Number(match[1]);
      const maximum = match[2] === "%" ? 800 : ["em", "rem"].includes(match[2].toLowerCase()) ? 8 : 128;
      return amount > 0 && amount <= maximum;
    })
    .join("; ");
}

function sanitizeHtml(raw: string, externalPaste = false): string {
  const parsed = new DOMParser().parseFromString(`<body>${raw}</body>`, "text/html");
  const elements = Array.from(parsed.body.querySelectorAll("*"));
  for (const element of elements) {
    if (!ALLOWED_TAGS.has(element.tagName)) {
      if (["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED"].includes(element.tagName)) element.remove();
      else element.replaceWith(...Array.from(element.childNodes));
      continue;
    }
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name === "class") {
        const safeClasses = attribute.value.split(/\s+/).filter((name) =>
          ALLOWED_CONTENT_CLASSES.has(name) || isThemeTextColorClass(name)
        );
        if (externalPaste || safeClasses.length === 0) element.removeAttribute("class");
        else element.setAttribute("class", safeClasses.join(" "));
        continue;
      }
      if (attribute.name === "data-theme-ink") {
        if (externalPaste || element.tagName !== "SPAN") {
          element.removeAttribute(attribute.name);
          continue;
        }
        const index = Number(attribute.value);
        if (!Number.isFinite(index) || index < 0 || index > 2) element.removeAttribute(attribute.name);
        else element.setAttribute("data-theme-ink", String(Math.round(index)));
        continue;
      }
      if (externalPaste && ["data-question-id", "contenteditable"].includes(attribute.name)) {
        element.removeAttribute(attribute.name);
        continue;
      }
      const globallyAllowed = ALLOWED_ATTRS["*"]?.has(attribute.name) ?? false;
      const tagAllowed = ALLOWED_ATTRS[element.tagName]?.has(attribute.name) ?? false;
      if (!globallyAllowed && !tagAllowed) element.removeAttribute(attribute.name);
    }
    if (element.hasAttribute("style")) {
      const safeStyle = sanitizeStyle(element.getAttribute("style") ?? "");
      if (safeStyle) element.setAttribute("style", safeStyle);
      else element.removeAttribute("style");
    }
    if (element instanceof HTMLImageElement) {
      if (externalPaste) {
        element.remove();
        continue;
      }
      const source = element.getAttribute("src") ?? "";
      if (!/^https:\/\//i.test(source) && !/^data:image\/(png|jpe?g|webp);base64,/i.test(source)) {
        element.remove();
        continue;
      }
      element.setAttribute("draggable", "false");
    }
  }
  return parsed.body.innerHTML;
}

function unwrapFeedbackMarks(root: ParentNode) {
  root.querySelectorAll("mark[data-document-feedback]").forEach((mark) => mark.replaceWith(...Array.from(mark.childNodes)));
}

function unwrapFeedbackMark(root: ParentNode, id: string) {
  root.querySelectorAll(`mark[data-document-feedback="${CSS.escape(id)}"]`).forEach((mark) => {
    mark.replaceWith(...Array.from(mark.childNodes));
  });
}

function markPlainText(mark: Element): string {
  return (mark.textContent ?? "").replace(/\u00a0/g, " ");
}

function serializableHtml(editor: HTMLElement): string {
  const clone = editor.cloneNode(true) as HTMLElement;
  unwrapFeedbackMarks(clone);
  clone.querySelectorAll("[data-transient]").forEach((node) => node.remove());
  return sanitizeHtml(clone.innerHTML);
}

function flattenSavedHtml(raw: string): string {
  const parsed = new DOMParser().parseFromString(`<body>${raw}</body>`, "text/html");
  parsed.querySelectorAll("[data-question-id]").forEach((node) => node.remove());
  const sections = Array.from(parsed.body.querySelectorAll("section[data-doc-page]"));
  const html = sections.length > 0
    ? sections.map((section) => section.innerHTML).join("")
    : parsed.body.innerHTML;
  return sanitizeHtml(html) || EMPTY_PAGE_HTML;
}

function extractEssayText(root: HTMLElement | DocumentFragment): string {
  const clone = root.cloneNode(true) as HTMLElement | DocumentFragment;
  clone.querySelectorAll("figure,[data-question-id],[data-transient]").forEach((node) => node.remove());
  clone.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
  clone.querySelectorAll("p,div,li,h1,h2,h3,blockquote").forEach((node) => node.append("\n"));
  return (clone.textContent ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function documentText(editor: HTMLElement): string {
  return extractEssayText(editor);
}

function DocumentQuestionSheet({
  attachment,
  active,
  onSelect,
}: {
  attachment: AttachedQuestion;
  active: boolean;
  onSelect?: (id: string) => void;
}) {
  const media = useAttachedQuestionMedia(attachment);
  const sheetClass = `overflow-hidden rounded-sm color-bg color-shadow border ${
    active ? "outline outline-2 outline-offset-2 color-txt-accent" : ""
  }`;

  return (
    <div
      className={`w-full ${sheetClass}`}
      data-question-sheet={attachment.id}
      onClick={() => onSelect?.(attachment.id)}
    >
      {media.audioPath && (
        <div className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
          <QuestionAudioPlayer
            audioPath={media.audioPath}
            startSec={media.audioStartSec}
            startLabel={media.audioStartLabel ?? undefined}
            className="w-full"
            autoLoad={false}
          />
        </div>
      )}
      {media.loading && media.questionImages.length === 0 && (
        <div className="flex min-h-[220px] items-center justify-center">
          <LuLoaderCircle size={20} className="animate-spin color-txt-sub" />
        </div>
      )}
      {media.error && media.questionImages.length === 0 && (
        <div className="px-5 py-8 text-center">
          <p className="text-sm font-semibold color-txt-main">Couldn't load this question</p>
        </div>
      )}
      {media.questionImages.map((image) => (
        <img
          key={image.key ?? image.src}
          src={image.src}
          alt={image.alt}
          draggable={false}
          className="block w-full h-auto select-none"
        />
      ))}
    </div>
  );
}

function findFeedbackRange(root: HTMLElement, quote: string): Range | null {
  if (!quote) return null;
  type IndexedText = { node: Text; start: number; end: number };
  const nodes: IndexedText[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let text = "";
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const start = text.length;
    const excluded = Boolean(node.parentElement?.closest("figure,[data-question-id],mark[data-document-feedback]"));
    text += excluded ? "\u0000".repeat(node.data.length) : node.data;
    if (!excluded) nodes.push({ node, start, end: text.length });
  }
  const matchStart = text.indexOf(quote);
  if (matchStart < 0) return null;
  const matchEnd = matchStart + quote.length;
  const start = nodes.find((entry) => matchStart >= entry.start && matchStart < entry.end);
  const end = nodes.find((entry) => matchEnd > entry.start && matchEnd <= entry.end);
  if (!start || !end) return null;
  const range = document.createRange();
  range.setStart(start.node, matchStart - start.start);
  range.setEnd(end.node, matchEnd - end.start);
  return range;
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error("Could not prepare imported page");
  return response.blob();
}

function parseSseLine(line: string): string {
  if (!line.startsWith("data:")) return "";
  const payload = line.slice(5).trim();
  if (!payload || payload === "[DONE]") return "";
  const frame = JSON.parse(payload) as {
    choices?: Array<{ delta?: { content?: string } }>;
    error?: { message?: string };
  };
  if (frame.error?.message) throw new Error(frame.error.message);
  return frame.choices?.[0]?.delta?.content ?? "";
}

async function readAiText(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json") && !contentType.includes("event-stream")) {
    const payload = await response.json() as { text?: string; content?: string };
    return (payload.text ?? payload.content ?? "").trim();
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The AI response was empty");
  const decoder = new TextDecoder();
  let buffer = "";
  let output = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) output += parseSseLine(line);
    if (done) break;
  }
  if (buffer.trim()) output += parseSseLine(buffer);
  return output.trim();
}

function parseAiResult(text: string) {
  const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The feedback response was incomplete");
  return resultSchema.parse(JSON.parse(unfenced.slice(start, end + 1)));
}

const DOCUMENT_FONT_SIZE_OPTIONS = [
  { value: "2", label: "Small" },
  { value: "3", label: "Normal" },
  { value: "4", label: "Large" },
  { value: "5", label: "Heading" },
];

const FEEDBACK_POPOVER_WIDTH = 280;

function FeedbackPopover({
  mark,
  item,
  onOkay,
}: {
  mark: HTMLElement;
  item: Feedback;
  onOkay: () => void;
}) {
  const [pos, setPos] = useState({ top: 0, left: 8, above: false });

  useLayoutEffect(() => {
    const update = () => {
      const rect = mark.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const above = spaceBelow < 170 && rect.top > 190;
      const left = Math.max(8, Math.min(rect.left + rect.width / 2 - FEEDBACK_POPOVER_WIDTH / 2, window.innerWidth - FEEDBACK_POPOVER_WIDTH - 8));
      setPos({
        top: above ? rect.top - 10 : rect.bottom + 10,
        left,
        above,
      });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [mark]);

  return createPortal(
    <div
      className="document-feedback-popover color-bg color-shadow border color-txt-main"
      style={{
        top: pos.top,
        left: pos.left,
        transform: pos.above ? "translateY(-100%)" : undefined,
      }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <div
        className="document-feedback-popover__caret"
        style={pos.above ? { bottom: -6, top: "auto" } : { top: -6 }}
      />
      <p className="text-[13px] leading-relaxed">{item.message}</p>
      {item.suggestion.trim() ? (
        <div className="mt-2 rounded-md color-bg-grey-5 px-2.5 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide color-txt-sub">Suggested change</p>
          <p className="mt-1 text-[13px] leading-relaxed color-txt-main">{item.suggestion.trim()}</p>
        </div>
      ) : null}
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onOkay}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold color-bg-accent color-txt-accent hover:opacity-90"
        >
          Okay!
        </button>
      </div>
    </div>,
    getThemedPortalTarget()
  );
}

export default function DocumentEditor({
  page,
  attachments = [],
  activeAttachmentId = null,
  onSelectAttachment,
  canvasStrokes,
  canvasObjects,
  onStrokesChange,
  onObjectsChange,
  onUploadImage,
  registerDrawingSnapshot,
  registerGetGradingCapture,
  registerGetDocumentText,
  registerCheckAnswer,
  questionLabel,
  questionImages = [],
  markingSchemeImages = [],
  subjectLabel,
  onCheckStart,
  onGradingComplete,
  onTouch,
  progressAliasId = null,
  viewportClassName,
  toolbarCenterX = null,
  toolbarCenterAnimated = false,
  onToolbarCenterChange,
  toolbarExtras,
}: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const documentViewportRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const htmlRef = useRef("");
  const revisionRef = useRef(0);
  const savedRevisionRef = useRef(0);
  const pageIdRef = useRef(page.id);
  const runIdRef = useRef(0);
  const importRunIdRef = useRef(0);
  const requestControllerRef = useRef<AbortController | null>(null);
  const onTouchRef = useRef(onTouch);
  onTouchRef.current = onTouch;
  const progressAliasIdRef = useRef(progressAliasId);
  progressAliasIdRef.current = progressAliasId;
  const loadReadyRef = useRef(false);
  const { loadDocument, saveDocument } = useDocumentStorage();

  const [mode, setMode] = useState<EditorMode>("text");
  const [canvasTool, setCanvasTool] = useState<ToolMode>("pen");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("loading");
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [importStatus, setImportStatus] = useState("");
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [activeFeedback, setActiveFeedback] = useState<Feedback | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState("");
  const feedbackRef = useRef<Feedback[]>([]);
  feedbackRef.current = feedback;
  const [formatState, setFormatState] = useState({
    bold: false,
    italic: false,
    bullet: false,
    fontSize: "3",
  });

  const draftKey = `document-draft:${page.id}`;

  const flushSave = useCallback(async () => {
    const editor = editorRef.current;
    if (!loadReadyRef.current || !editor || pageIdRef.current !== page.id) return;
    const html = serializableHtml(editor);
    const revision = revisionRef.current;
    if (revision === savedRevisionRef.current) return;
    htmlRef.current = html;
    setSaveStatus("saving");
    try {
      await saveDocument(page.id, html, progressAliasIdRef.current);
      if (pageIdRef.current !== page.id) return;
      if (revision === revisionRef.current) {
        savedRevisionRef.current = revision;
        setSaveStatus("saved");
        try { localStorage.removeItem(draftKey); } catch { /* storage may be unavailable */ }
      }
      await onTouchRef.current();
    } catch (error) {
      console.error("[DocumentEditor] save failed", error);
      if (pageIdRef.current === page.id) setSaveStatus("error");
    }
  }, [draftKey, page.id, saveDocument]);

  const scheduleSave = useCallback(() => {
    const editor = editorRef.current;
    if (!loadReadyRef.current || !editor) return;
    const html = serializableHtml(editor);
    htmlRef.current = html;
    revisionRef.current += 1;
    setSaveStatus("dirty");
    try { localStorage.setItem(draftKey, JSON.stringify({ html, updatedAt: Date.now() })); } catch { /* best effort */ }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { saveTimerRef.current = null; void flushSave(); }, SAVE_DELAY_MS);
  }, [draftKey, flushSave]);

  const dismissFeedback = useCallback((id: string) => {
    const editor = editorRef.current;
    if (editor) unwrapFeedbackMark(editor, id);
    setFeedback((items) => items.filter((item) => item.id !== id));
    setActiveFeedback((current) => (current?.id === id ? null : current));
  }, []);

  const pruneEditedMarks = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const remaining: Feedback[] = [];
    let activeGone = false;
    for (const item of feedbackRef.current) {
      const mark = editor.querySelector(`mark[data-document-feedback="${CSS.escape(item.id)}"]`);
      if (!mark) {
        if (activeFeedback?.id === item.id) activeGone = true;
        continue;
      }
      if (markPlainText(mark) === item.quote) {
        remaining.push(item);
        continue;
      }
      mark.replaceWith(...Array.from(mark.childNodes));
      if (activeFeedback?.id === item.id) activeGone = true;
    }
    if (remaining.length !== feedbackRef.current.length) setFeedback(remaining);
    if (activeGone) setActiveFeedback(null);
  }, [activeFeedback]);

  const handleUserMutation = useCallback(() => {
    pruneEditedMarks();
    scheduleSave();
  }, [pruneEditedMarks, scheduleSave]);

  useEffect(() => {
    pageIdRef.current = page.id;
    loadReadyRef.current = false;
    runIdRef.current += 1;
    importRunIdRef.current += 1;
    savedRangeRef.current = null;
    setMode("text");
    setChecking(false);
    setImportStatus("");
    setActiveFeedback(null);
    revisionRef.current = 0;
    savedRevisionRef.current = 0;
    setSaveStatus("loading");
    setLoadError("");
    setFeedback([]);
    setCheckError("");
    requestControllerRef.current?.abort();
    const editor = editorRef.current;
    if (!editor) return;
    let cancelled = false;
    void (async () => {
      let stored: { html: string; updatedAt: number } | null = null;
      try {
        const loaded = await loadDocument(page.id);
        if (loaded) stored = { html: loaded.html, updatedAt: loaded.updatedAt };
      } catch (error) {
        if (cancelled || pageIdRef.current !== page.id) return;
        console.error("[DocumentEditor] load failed", error);
        setLoadError("This document couldn't be loaded safely. Your saved content has not been changed.");
        setSaveStatus("loading");
        return;
      }
      let draft: { html?: string; updatedAt?: number } | null = null;
      try { draft = JSON.parse(localStorage.getItem(draftKey) ?? "null") as { html?: string; updatedAt?: number } | null; } catch { draft = null; }
      const hasRecoverableDraft = typeof draft?.html === "string" && draft.html !== stored?.html &&
        (Number(draft.updatedAt) || 0) >= (stored?.updatedAt ?? 0);
      const initial = hasRecoverableDraft && typeof draft?.html === "string"
        ? draft.html : stored?.html || page.documentContent || EMPTY_PAGE_HTML;
      if (cancelled || pageIdRef.current !== page.id) return;
      const safe = flattenSavedHtml(initial);
      editor.innerHTML = safe;
      htmlRef.current = serializableHtml(editor);
      loadReadyRef.current = true;
      const needsInitialSave = hasRecoverableDraft;
      setSaveStatus(needsInitialSave ? "dirty" : "saved");
      if (needsInitialSave) {
        revisionRef.current = 1;
        window.setTimeout(() => void flushSave(), 0);
      }
    })();
    return () => { cancelled = true; };
  }, [draftKey, flushSave, loadDocument, loadAttempt, page.documentContent, page.id]);

  useEffect(() => {
    const handleVisibility = () => { if (document.visibilityState === "hidden") void flushSave(); };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      requestControllerRef.current?.abort();
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (loadReadyRef.current && revisionRef.current !== savedRevisionRef.current && htmlRef.current) {
        void saveDocument(page.id, htmlRef.current, progressAliasIdRef.current);
      }
    };
  }, [flushSave, page.id, saveDocument]);

  useEffect(() => {
    if (!activeAttachmentId) return;
    const sheet = documentViewportRef.current?.querySelector(
      `[data-question-sheet="${CSS.escape(activeAttachmentId)}"]`
    );
    sheet?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [activeAttachmentId]);

  const rememberSelection = useCallback(() => {
    const selection = window.getSelection();
    const editor = editorRef.current;
    if (!selection?.rangeCount || !editor) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) savedRangeRef.current = range.cloneRange();
  }, []);

  const syncFormatState = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = window.getSelection();
    if (!selection?.rangeCount || !editor.contains(selection.anchorNode)) return;
    let fontSize = "3";
    try {
      const value = document.queryCommandValue("fontSize");
      if (value) fontSize = value;
    } catch {
      // queryCommandValue can throw in some browsers for unsupported commands
    }
    setFormatState({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      bullet: document.queryCommandState("insertUnorderedList"),
      fontSize,
    });
  }, []);

  const restoreSelection = useCallback(() => {
    const editor = editorRef.current;
    const range = savedRangeRef.current;
    if (!editor || !range || !editor.contains(range.commonAncestorContainer)) {
      editor?.focus();
      return;
    }
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, []);

  const runCommand = useCallback((command: string, value?: string) => {
    restoreSelection();
    document.execCommand(command, false, value);
    rememberSelection();
    syncFormatState();
    handleUserMutation();
  }, [handleUserMutation, rememberSelection, restoreSelection, syncFormatState]);

  const insertNode = useCallback((node: Node) => {
    restoreSelection();
    const editor = editorRef.current;
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (editor && range && editor.contains(range.commonAncestorContainer)) {
      range.deleteContents();
      range.insertNode(node);
      range.setStartAfter(node);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
      savedRangeRef.current = range.cloneRange();
    } else editor?.append(node);
    handleUserMutation();
  }, [handleUserMutation, restoreSelection]);

  useEffect(() => {
    if (!registerGetDocumentText) return;
    registerGetDocumentText(() => {
      const editor = editorRef.current;
      return editor ? documentText(editor) : "";
    });
    return () => registerGetDocumentText(null);
  }, [registerGetDocumentText]);

  const handleFiles = useCallback(async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || importStatus) return;
    const targetPageId = page.id;
    const importRunId = ++importRunIdRef.current;
    const isCurrent = () => pageIdRef.current === targetPageId && importRunIdRef.current === importRunId;
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if ((!isPdf && !file.type.startsWith("image/")) || file.size > (isPdf ? MAX_PDF_BYTES : MAX_IMAGE_BYTES)) {
      setCheckError(isPdf ? "PDFs must be 25 MB or smaller." : "Images must be 12 MB or smaller.");
      return;
    }
    setCheckError("");
    setImportStatus(isPdf ? "Preparing PDF..." : "Uploading image...");
    try {
      const pageDataUrls = isPdf ? await renderPdfPages(file) : [];
      const totalPages = isPdf ? pageDataUrls.length : 1;
      if (totalPages === 0) throw new Error("The PDF has no importable pages");
      const sources: string[] = [];
      for (let index = 0; index < totalPages; index += 1) {
        setImportStatus(isPdf ? `Uploading PDF page ${index + 1} of ${totalPages}...` : "Uploading image...");
        const blob = isPdf ? await dataUrlToBlob(pageDataUrls[index]) : file;
        if (!isCurrent()) return;
        const source = await onUploadImage(blob);
        if (!isCurrent()) return;
        sources.push(source);
      }
      if (!isCurrent()) return;
      for (let index = 0; index < sources.length; index += 1) {
        const figure = document.createElement("figure");
        figure.className = "my-5";
        const image = document.createElement("img");
        image.src = sources[index];
        image.alt = isPdf ? `${file.name}, page ${index + 1}` : file.name;
        image.className = "mx-auto h-auto max-w-full rounded-lg";
        image.draggable = false;
        figure.append(image);
        if (isPdf) {
          const caption = document.createElement("figcaption");
          caption.className = "mt-1 text-center text-xs color-txt-sub";
          caption.textContent = `Imported from ${file.name} · page ${index + 1}`;
          figure.append(caption);
        }
        insertNode(figure);
      }
      if (isPdf && totalPages >= 12) {
        setCheckError(
          "PDF imports are limited to the first 12 pages; all 12 available import slots were added."
        );
      }
    } catch (error) {
      if (isCurrent()) {
        console.error("[DocumentEditor] import failed", error);
        setCheckError("That file couldn't be added cleanly. Please retry.");
      }
    } finally {
      if (isCurrent()) {
        setImportStatus("");
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    }
  }, [importStatus, insertNode, onUploadImage, page.id]);

  const clearFeedbackMarks = useCallback(() => {
    const editor = editorRef.current;
    if (editor) unwrapFeedbackMarks(editor);
  }, []);

  const applyFeedbackMarks = useCallback((items: Feedback[]) => {
    const editor = editorRef.current;
    if (!editor) return;
    clearFeedbackMarks();
    for (const item of items) {
      const range = findFeedbackRange(editor, item.quote);
      if (!range) continue;
      try {
        const mark = document.createElement("mark");
        mark.dataset.documentFeedback = item.id;
        mark.className = "document-feedback-mark color-bg-accent";
        mark.append(range.extractContents());
        range.insertNode(mark);
      } catch {
        // A malformed cross-block quote should not prevent other feedback from rendering.
      }
    }
  }, [clearFeedbackMarks]);

  const checkAnswer = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor || checking) return;
    const selection = window.getSelection();
    const activeRange = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const selectedText =
      activeRange && editor.contains(activeRange.commonAncestorContainer)
        ? extractEssayText(activeRange.cloneContents())
        : "";
    const essay = selectedText.length >= 20 ? selectedText : documentText(editor);
    if (essay.length < 20) {
      setCheckError("Write a little more before checking your answer.");
      return;
    }
    if (essay.length > MAX_AI_ESSAY_CHARS) {
      setCheckError("Select a section of 30,000 characters or fewer, then check it again.");
      return;
    }
    const runId = ++runIdRef.current;
    const usageId = createAiUsageId("grading");
    setChecking(true);
    setCheckError("");
    setActiveFeedback(null);
    setFeedback([]);
    clearFeedbackMarks();
    onCheckStart?.();
    requestControllerRef.current?.abort();
    const hasQuestion = questionImages.length > 0 || Boolean(questionLabel);
    const hasScheme = markingSchemeImages.length > 0;
    const prompt = [
      `You are marking a student's document answer for ${subjectLabel || "Leaving Certificate"}.`,
      "Write ALL feedback in English, even if the student's writing or the question is in Irish, French, German, Spanish, or another language. Quotes copied from the essay must stay as exact original-language spans.",
      hasQuestion
        ? `Question: ${questionLabel || "see attached question images"}. Mark against the question${hasScheme ? " and marking scheme" : ""}. Award marks strictly.`
        : "No exam question is attached. Review the writing itself. Only award a numerical mark if this is clearly an exam-style answer with an obvious mark allocation; otherwise set totalAvailable to 0 and isFullMarks to false.",
      "Return JSON only with this exact shape:",
      '{"totalAwarded":0,"totalAvailable":0,"isFullMarks":false,"overview":"string","parts":[{"partId":"a","marksAwarded":0,"marksAvailable":0,"feedback":"string"}],"errors":[{"quote":"exact short span copied from the essay","message":"English explanation of the error","suggestion":"short corrected replacement for that quote"}]}',
      "If the question has multiple parts, overview is one sentence on the whole answer and each part has its own marks plus brief but detailed feedback.",
      "If it is a single-part / whole-answer question, put brief but detailed feedback in overview and either omit parts or include one part matching the total.",
      "Give 1 to 6 inline errors. Each quote must be an exact contiguous substring from <essay>. suggestion is a short replacement for that quote only — never a full rewrite.",
      "If the answer is full marks, set isFullMarks true and you may return an empty errors array.",
      `<essay>\n${essay}\n</essay>`,
    ].join("\n");
    let lastError: unknown;
    try {
      let result: z.infer<typeof resultSchema> | null = null;
      for (let attempt = 0; attempt < 3 && !result; attempt += 1) {
        if (runId !== runIdRef.current || pageIdRef.current !== page.id) return;
        const controller = new AbortController();
        requestControllerRef.current = controller;
        const timeout = window.setTimeout(() => controller.abort(), 45000);
        try {
          const response = await authenticatedAiFetch(METERED_CHAT_API_URL, {
            messages: [{
              role: "user",
              content: [
                { type: "text", text: prompt },
                ...questionImages.slice(0, 4).map((url) => ({ type: "image_url" as const, image_url: { url } })),
                ...markingSchemeImages.slice(0, 4).map((url) => ({ type: "image_url" as const, image_url: { url } })),
              ],
            }],
            temperature: 0.2,
          }, "grading", usageId, { signal: controller.signal });
          if (!response.ok) {
            const error = await aiResponseError(response, "Couldn't check your answer");
            if (error instanceof AiRequestError && error.code === "AI_QUOTA_EXCEEDED") throw error;
            if (response.status !== 429 && response.status < 500) throw error;
            throw Object.assign(error, { retryable: true });
          }
          result = parseAiResult(await readAiText(response));
        } catch (error) {
          lastError = error;
          if (runId !== runIdRef.current || pageIdRef.current !== page.id) return;
          const outputError = error instanceof SyntaxError || error instanceof z.ZodError ||
            (error instanceof Error && /incomplete|empty|json/i.test(error.message));
          const retryable = Boolean((error as { retryable?: boolean })?.retryable) ||
            (error as { name?: string })?.name === "AbortError" ||
            error instanceof TypeError ||
            outputError;
          if (!retryable || attempt === 2) throw error;
          await new Promise((resolve) => window.setTimeout(resolve, 500 * 2 ** attempt + Math.random() * 250));
        } finally {
          window.clearTimeout(timeout);
        }
      }
      if (!result) throw lastError ?? new Error("Couldn't check your answer");
      if (runId !== runIdRef.current || pageIdRef.current !== page.id) return;
      const items = result.errors.map((item, index) => ({ ...item, id: `${runId}-${index}` }));
      setFeedback(items);
      applyFeedbackMarks(items);
      onGradingComplete?.({
        nonce: `${Date.now()}`,
        userMessage: "Check Answer",
        assistantMessage: buildGradingChatMessage({
          totalAwarded: result.totalAwarded,
          totalAvailable: result.totalAvailable,
          isFullMarks: result.isFullMarks,
          overview: result.overview,
          parts: result.parts,
        }),
        action: { type: "markComplete", label: "Mark as complete" },
      });
    } catch (error) {
      if ((error as { name?: string })?.name !== "AbortError") {
        console.error("[DocumentEditor] check failed", error);
        setCheckError(error instanceof AiRequestError && error.code === "AI_QUOTA_EXCEEDED"
          ? error.message
          : `${error instanceof Error ? error.message : "Couldn't check your answer"}. You can retry.`);
      }
    } finally {
      if (runId === runIdRef.current) {
        requestControllerRef.current = null;
        setChecking(false);
      }
    }
  }, [
    applyFeedbackMarks,
    checking,
    clearFeedbackMarks,
    markingSchemeImages,
    onCheckStart,
    onGradingComplete,
    page.id,
    questionImages,
    questionLabel,
    subjectLabel,
  ]);

  useEffect(() => {
    if (!registerCheckAnswer) return;
    registerCheckAnswer(() => checkAnswer());
    return () => registerCheckAnswer(null);
  }, [registerCheckAnswer, checkAnswer]);

  const handleEditorClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const mark = target.closest("mark[data-document-feedback]");
    if (!(mark instanceof HTMLElement)) {
      setActiveFeedback(null);
      return;
    }
    setActiveFeedback(feedback.find((item) => item.id === mark.getAttribute("data-document-feedback")) ?? null);
  }, [feedback]);

  const activeMark = activeFeedback && editorRef.current
    ? editorRef.current.querySelector<HTMLElement>(`mark[data-document-feedback="${CSS.escape(activeFeedback.id)}"]`)
    : null;

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.querySelectorAll("mark[data-document-feedback]").forEach((mark) => {
      mark.classList.toggle("is-open", mark.getAttribute("data-document-feedback") === activeFeedback?.id);
    });
  }, [activeFeedback]);

  return (
    <div ref={documentViewportRef} className="relative h-full min-h-0 w-full overflow-hidden color-bg-grey-5">
      <div className={`h-full overflow-auto px-3 pb-24 scrollbar-minimal sm:px-8 ${
        attachments.length > 0 ? "pt-14 sm:pt-16" : "pt-5 sm:pt-8"
      } ${viewportClassName ?? ""}`}>
        <div className={`relative mx-auto flex flex-col gap-6 ${DOCUMENT_WIDTH_CLASS}`}>
          {attachments.map((attachment) => (
            <DocumentQuestionSheet
              key={attachment.id}
              attachment={attachment}
              active={attachment.id === activeAttachmentId}
              onSelect={onSelectAttachment}
            />
          ))}

          <div className="relative min-h-[1056px] overflow-hidden rounded-sm color-bg color-shadow border">
            <div
              ref={editorRef}
              contentEditable={mode === "text" && !loadError && saveStatus !== "loading"}
              suppressContentEditableWarning
              role="textbox"
              aria-label={`${page.name} document`}
              aria-multiline="true"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              data-gramm="false"
              data-enable-grammarly="false"
              onInput={(event) => {
                if ((event.nativeEvent as InputEvent).isComposing) {
                  scheduleSave();
                  syncFormatState();
                  return;
                }
                handleUserMutation();
                syncFormatState();
              }}
              onCompositionEnd={() => pruneEditedMarks()}
              onMouseUp={() => { rememberSelection(); syncFormatState(); }}
              onKeyUp={() => { rememberSelection(); syncFormatState(); }}
              onFocus={() => { rememberSelection(); syncFormatState(); }}
              onPaste={(event) => {
                event.preventDefault();
                const html = event.clipboardData.getData("text/html");
                const text = event.clipboardData.getData("text/plain");
                if (html) document.execCommand("insertHTML", false, sanitizeHtml(html, true));
                else document.execCommand("insertText", false, text);
                handleUserMutation();
                syncFormatState();
              }}
              onClick={handleEditorClick}
              className={`relative z-10 min-h-[1056px] px-8 py-12 text-[16px] leading-7 color-txt-main outline-none sm:px-14 sm:py-16 [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_figcaption]:color-txt-sub [&_img]:h-auto [&_img]:max-w-full [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6 ${mode === "text" ? "cursor-text" : "pointer-events-none select-none"}`}
            />
          </div>

          <div className={`absolute inset-0 z-20 ${mode === "pen" || canvasTool === "lasso" ? "pointer-events-auto" : "pointer-events-none"}`}>
            <DrawingCanvas
              initialStrokes={canvasStrokes}
              initialObjects={canvasObjects}
              onStrokesChange={onStrokesChange}
              onObjectsChange={onObjectsChange}
              onUploadImage={onUploadImage}
              registerDrawingSnapshot={registerDrawingSnapshot}
              registerGetGradingCapture={registerGetGradingCapture}
              wrapperClassName="bg-transparent"
              defaultGridMode="off"
              editorMode={mode}
              onToolChange={setCanvasTool}
              onRequestTextMode={() => setMode("text")}
              onRequestPenMode={() => setMode("pen")}
              onAttachRequest={() => {
                rememberSelection();
                fileInputRef.current?.click();
              }}
              suppressToolbar={Boolean(loadError) || saveStatus === "loading"}
              textFormat={{
                bold: formatState.bold,
                italic: formatState.italic,
                bullet: formatState.bullet,
                fontSize: formatState.fontSize,
                fontSizeOptions: DOCUMENT_FONT_SIZE_OPTIONS,
                onToggleBold: () => runCommand("bold"),
                onToggleItalic: () => runCommand("italic"),
                onToggleBullet: () => runCommand("insertUnorderedList"),
                onFontSizeChange: (value) => runCommand("fontSize", String(value)),
                onColorChange: (colorIndex) => {
                  restoreSelection();
                  applyThemeTextColor(colorIndex);
                  rememberSelection();
                  handleUserMutation();
                },
                onUndo: () => runCommand("undo"),
                onRedo: () => runCommand("redo"),
              }}
              toolbarPlacement="top"
              toolbarAnchorRef={documentViewportRef}
              toolbarExtras={toolbarExtras}
              toolbarCenterX={toolbarCenterX}
              toolbarCenterAnimated={toolbarCenterAnimated}
              onToolbarCenterChange={onToolbarCenterChange}
              allowViewportNavigation={false}
              readOnly={mode === "text" && canvasTool !== "lasso"}
            />
          </div>
        </div>
      </div>

      {(loadError || importStatus || checkError) && (
        <div className="absolute bottom-16 left-1/2 z-50 max-w-sm -translate-x-1/2 rounded-lg color-bg color-shadow border px-3 py-2 text-xs color-txt-sub">
          {loadError || checkError || importStatus}
          {loadError ? (
            <button type="button" className="ml-2 font-semibold color-txt-accent" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Retry</button>
          ) : null}
        </div>
      )}

      {activeFeedback && activeMark ? (
        <FeedbackPopover
          mark={activeMark}
          item={activeFeedback}
          onOkay={() => dismissFeedback(activeFeedback.id)}
        />
      ) : null}

      <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(event) => void handleFiles(event.target.files)} />
    </div>
  );
}
