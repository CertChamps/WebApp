import { useEffect, useRef, useState } from "react";
import { Document } from "react-pdf";
import PdfThemeWrapper from "../PdfThemeWrapper";
import Lottie from "lottie-react";
import loadingAnim from "../../assets/animations/loading.json";

export type MarkingSchemePageRange = { start: number; end: number };

type PastPaperMarkingSchemeProps = {
  /** PDF as Blob (e.g. from Firebase Storage). */
  file: Blob | null;
  /** 1-based inclusive page range to show. If null, show nothing. */
  pageRange: MarkingSchemePageRange | null;
  /** Width of each page in px. When fillWidth is true, this is ignored and container width is used. */
  pageWidth?: number;
  /** When true, page width fills the container (measured via ResizeObserver). */
  fillWidth?: boolean;
  /** Optional class for the container. */
  className?: string;
};

/**
 * Renders marking scheme pages from Firebase Storage for past paper questions.
 * Only shows pages within the given range (inclusive).
 */
export default function PastPaperMarkingScheme({
  file,
  pageRange,
  pageWidth = 550,
  fillWidth = false,
  className = "",
}: PastPaperMarkingSchemeProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [measuredWidth, setMeasuredWidth] = useState<number>(fillWidth ? 0 : pageWidth);

  const effectiveWidth = fillWidth ? Math.max(measuredWidth, 1) : pageWidth;

  useEffect(() => {
    if (!fillWidth) return;
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const w = e.contentRect.width;
        if (w > 0) setMeasuredWidth(w);
      }
    });
    ro.observe(el);
    setMeasuredWidth(el.clientWidth || 280);
    return () => ro.disconnect();
  }, [fillWidth]);

  useEffect(() => {
    if (!file) {
      setNumPages(0);
      setLoadError(null);
      return;
    }
    setLoadError(null);
  }, [file]);

  if (!file) {
    return (
      <div
        className={`flex flex-col items-center justify-center py-12 color-txt-sub text-sm ${className}`}
      >
        No marking scheme loaded.
      </div>
    );
  }

  if (!pageRange || pageRange.start < 1 || pageRange.end < 1) {
    return (
      <div
        className={`flex flex-col items-center justify-center py-12 color-txt-sub text-sm ${className}`}
      >
        No marking scheme page range for this question.
      </div>
    );
  }

  const startPage = Math.max(1, Math.min(pageRange.start, pageRange.end));
  const endPage = Math.max(startPage, Math.max(pageRange.start, pageRange.end));
  const pageCount = endPage - startPage + 1;

  return (
    <div
      className={`relative flex flex-col overflow-hidden scrollbar-minimal ${className}`}
      style={{ height: "100%", minHeight: 0 }}
    >
      {loadError && (
        <div className="shrink-0 py-6 px-4 text-sm text-red-400 text-center rounded-xl color-bg-grey-5">
          {loadError}
        </div>
      )}
      <div ref={fillWidth ? scrollRef : undefined} className="flex-1 min-h-0 overflow-y-auto py-1 w-full">
        <Document
          file={file}
          onLoadSuccess={({ numPages: n }) => {
            setNumPages(n);
            setLoadError(null);
          }}
          onLoadError={(err) => {
            console.error("Marking scheme PDF load error:", err);
            setLoadError(err?.message ?? "Failed to load marking scheme");
          }}
        >
          {numPages > 0 &&
            Array.from({ length: pageCount }, (_, i) => {
              const pageNum = startPage + i;
              if (pageNum > numPages) return null;
              return (
                <div
                  key={`ms_page_${pageNum}`}
                  className="flex flex-col items-center my-4"
                >
                  <div className="color-shadow rounded-lg overflow-hidden color-bg-grey-5/50">
                    <PdfThemeWrapper
                      pageNumber={pageNum}
                      width={effectiveWidth}
                    />
                  </div>
                  {pageCount > 1 && (
                    <span className="mt-2 text-xs color-txt-sub font-medium">
                      Page {pageNum} of marking scheme
                    </span>
                  )}
                </div>
              );
            })}
        </Document>
      </div>
      {numPages === 0 && !loadError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center color-bg rounded-xl">
          <Lottie
            animationData={loadingAnim}
            loop
            autoplay
            className="h-28 w-28"
          />
          <p className="color-txt-sub text-sm mt-4 font-medium">Loading marking scheme…</p>
        </div>
      )}
    </div>
  );
}
