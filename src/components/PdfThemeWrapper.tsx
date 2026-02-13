import { useRef, useEffect, useCallback, useContext } from "react";
import { Page } from "react-pdf";
import { OptionsContext } from "../context/OptionsContext";
import { PDF_THEME_COLORS, PDF_THEMING_ENABLED } from "../utils/pdfThemeColors";
import { applyThemeToCanvas } from "../utils/pdfThemeUtils";

type PdfThemeWrapperProps = {
  pageNumber: number;
  width: number;
  onRenderSuccess?: () => void;
  className?: string;
  /** Resolution scale (default 4 for exam papers). Higher = sharper but more memory. */
  resolutionScale?: number;
  /** Override display height (e.g. log tables use ~300px per page instead of A4). When set, Page is rendered at this height. */
  height?: number;
  [key: string]: unknown;
};

/** Base scale for exam papers (4x for crisp text) */
const EXAM_RESOLUTION_SCALE = 4;
const getRenderScale = (baseScale: number) =>
  Math.min(4, Math.max(baseScale, typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1));

/**
 * Wraps react-pdf Page and applies theme colors to the canvas so the PDF
 * (black/white/grey) matches the app theme exactly.
 * Renders at 4x resolution for exam papers for crisp text.
 */
export default function PdfThemeWrapper({
  pageNumber,
  width,
  onRenderSuccess,
  className = "",
  resolutionScale = EXAM_RESOLUTION_SCALE,
  height: heightOverride,
  ...pageProps
}: PdfThemeWrapperProps) {
  const { options } = useContext(OptionsContext);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const theme = PDF_THEME_COLORS[options.theme] ?? PDF_THEME_COLORS.light;
  const scale = getRenderScale(resolutionScale);
  const renderWidth = Math.round(width * scale);
  // A4 aspect ratio 595:842; override when e.g. log tables use shorter pages (wrapper only; we don't pass height to Page to avoid broken render)
  const displayHeight = heightOverride ?? (width * 842) / 595;

  const processCanvas = useCallback(() => {
    const canvas = wrapperRef.current?.querySelector("canvas");
    if (!canvas) return;
    if (!PDF_THEMING_ENABLED || options.theme === "light") return; // Show original PDF when theming off or default theme
    applyThemeToCanvas(canvas, theme);
  }, [options.theme, theme.bg, theme.primary, theme.sub]);

  const handleRenderSuccess = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(processCanvas);
    });
    onRenderSuccess?.();
  }, [processCanvas, onRenderSuccess]);

  useEffect(() => {
    processCanvas();
  }, [options.theme, processCanvas]);

  return (
    <div
      ref={wrapperRef}
      className={`flex justify-center ${className}`.trim()}
      style={{
        width,
        height: displayHeight,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: "50%",
          transform: `translateX(-50%) scale(${1 / scale})`,
          transformOrigin: "top center",
          width: renderWidth,
        }}
      >
        <Page
          key={options.theme}
          pageNumber={pageNumber}
          width={renderWidth}
          renderTextLayer={false}
          renderAnnotationLayer={false}
          onRenderSuccess={handleRenderSuccess}
          {...pageProps}
        />
      </div>
    </div>
  );
}
