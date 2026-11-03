import { useEffect, useRef, useState } from "react";
import { LuFileText, LuPencil } from "react-icons/lu";
import type { WhiteboardPage } from "../../data/whiteboards";
import { whiteboardCanvasId, whiteboardQuestionCanvasId } from "../../data/whiteboards";
import { useCanvasStorage, type SavedCanvasData } from "../../hooks/useCanvasStorage";
import { useDocumentStorage } from "../../hooks/useDocumentStorage";

function plainText(html: string): string {
  return new DOMParser().parseFromString(html, "text/html").body.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function drawCanvasPreview(canvas: HTMLCanvasElement, data: SavedCanvasData): boolean {
  const strokes = data.strokes.filter((stroke) => stroke.tool === "pen" && stroke.points.length > 0);
  const boxes = data.textBoxes.filter((box) => plainText(box.text));
  const objects = data.objects.filter((object) => !object.pinnedToSide);
  if (!strokes.length && !boxes.length && !objects.length) return false;

  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  const bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  const include = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    bounds.left = Math.min(bounds.left, x);
    bounds.top = Math.min(bounds.top, y);
    bounds.right = Math.max(bounds.right, x);
    bounds.bottom = Math.max(bounds.bottom, y);
  };
  strokes.forEach((stroke) => stroke.points.forEach((point) => include(point.x, point.y)));
  boxes.forEach((box) => { include(box.x, box.y); include(box.x + box.width, box.y + box.height); });
  objects.forEach((object) => { include(object.x, object.y); include(object.x + object.width, object.y + object.height); });
  if (!Number.isFinite(bounds.left)) return false;

  const draw = (images: Map<string, HTMLImageElement>) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const contentWidth = Math.max(80, bounds.right - bounds.left);
    const contentHeight = Math.max(80, bounds.bottom - bounds.top);
    const scale = Math.min((canvas.width - 16) / contentWidth, (canvas.height - 16) / contentHeight);
    ctx.save();
    ctx.translate((canvas.width - contentWidth * scale) / 2 - bounds.left * scale, (canvas.height - contentHeight * scale) / 2 - bounds.top * scale);
    ctx.scale(scale, scale);
    objects.forEach((object) => {
      const image = images.get(object.id);
      if (image) ctx.drawImage(image, object.x, object.y, object.width, object.height);
    });
    strokes.forEach((stroke) => {
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      stroke.points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
      ctx.strokeStyle = "#34425a";
      ctx.lineWidth = 2 / scale;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
    });
    boxes.forEach((box) => {
      ctx.fillStyle = "#34425a";
      ctx.font = `${box.fontWeight} ${box.fontSize}px sans-serif`;
      ctx.fillText(plainText(box.text).slice(0, 80), box.x, box.y + box.fontSize, box.width);
    });
    ctx.restore();
  };
  const images = new Map<string, HTMLImageElement>();
  draw(images);
  objects.forEach((object) => {
    if (!object.src) return;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => { images.set(object.id, image); draw(images); };
    image.src = object.src;
  });
  return true;
}

export default function PageThumbnail({ page }: { page: WhiteboardPage }) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [hasPreview, setHasPreview] = useState(false);
  const [documentText, setDocumentText] = useState("");
  const { loadCanvas } = useCanvasStorage();
  const { loadDocument } = useDocumentStorage();

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: "150px" });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    if (page.pageType === "document") {
      void loadDocument(page.id, page.attachedQuestions[0]?.id, { fallbackToPage: true })
        .then((saved) => {
          if (cancelled) return;
          setDocumentText(plainText(saved?.html || page.documentContent));
        })
        .catch(() => { if (!cancelled) setDocumentText(plainText(page.documentContent)); });
    } else {
      const firstQuestion = page.attachedQuestions[0]?.id;
      const rootId = whiteboardCanvasId(page.id);
      void loadCanvas(firstQuestion ? whiteboardQuestionCanvasId(page.id, firstQuestion) : rootId)
        .then(async (data) => {
          if (!data && firstQuestion) data = await loadCanvas(rootId);
          if (cancelled || !data || !canvasRef.current) return;
          setHasPreview(drawCanvasPreview(canvasRef.current, data));
        })
        .catch(() => undefined);
    }
    return () => { cancelled = true; };
  }, [visible, page.id, page.pageType, page.documentContent, page.attachedQuestions, loadCanvas, loadDocument]);

  return (
    <span ref={rootRef} className="practice-browser__page-icon" aria-hidden>
      {page.pageType === "document" && documentText ? (
        <span className="practice-browser__document-preview">{documentText}</span>
      ) : page.pageType === "whiteboard" ? (
        <>
          <canvas ref={canvasRef} width={160} height={160} className={hasPreview ? "practice-browser__canvas-preview" : "practice-browser__canvas-preview practice-browser__canvas-preview--empty"} />
          {!hasPreview && (page.emoji || <LuPencil size={28} />)}
        </>
      ) : page.emoji || <LuFileText size={28} />}
    </span>
  );
}
