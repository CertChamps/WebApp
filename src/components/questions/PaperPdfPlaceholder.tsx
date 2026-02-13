import { useState, useRef, useEffect, Component, type ReactNode, type MutableRefObject } from "react";
import { Document } from "react-pdf";
import PdfThemeWrapper from "../PdfThemeWrapper";

/** Catches PDF.js worker errors (e.g. messageHandler is null) so the app doesn't crash. */
class PdfErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

const PAGE_GAP_PX = 8;
const PDF_ASPECT = 842 / 595;

/** Compute pixel offset of a region's top edge in the scroll content (matches PaperPdfPlaceholder layout). */
export function getRegionScrollOffset(
  pageWidth: number,
  region: { page: number; y?: number }
): number {
  const pageHeightPx = pageWidth * PDF_ASPECT;
  const pageIndex = Math.max(0, (region.page ?? 1) - 1);
  const yPx = ((region.y ?? 0) / 595) * pageWidth;
  return pageIndex * (pageHeightPx + PAGE_GAP_PX) + yPx;
}

/** Compute pixel height of a region. */
export function getRegionHeightPx(pageWidth: number, region: { height?: number }): number {
  return ((region.height ?? 150) / 595) * pageWidth;
}

/** Loads a PDF: react-pdf only. Accepts a Blob (e.g. from Firebase), a URL string, or legacy year for static path. */
type PaperPdfPlaceholderProps = {
  /** PDF as Blob (e.g. from getBlob) or URL string. Preferred when loading from Storage. */
  file?: string | Blob | null;
  /** Legacy: two-digit year for static path /assets/marking_schemes/{year}.pdf. Ignored if file is set. */
  year?: string;
  /** Width of each rendered page. */
  pageWidth?: number;
  /** Called when the user scrolls to a different page (1-based page number). */
  onCurrentPageChange?: (page: number) => void;
  /** When set, scroll the PDF so this page (1-based) is in view. Cleared after scroll. */
  scrollToPage?: number;
  /** Called after scrolling to scrollToPage (so parent can clear scrollToPage). */
  onScrolledToPage?: () => void;
  /** Called when the PDF loads with total page count (for page indicator / go-to). */
  onNumPages?: (n: number) => void;
  /** Called when the PDF document has finished loading (for loading state). */
  onDocumentLoadSuccess?: () => void;
  /** Optional ref to the scroll container for programmatic scroll control. */
  scrollContainerRef?: MutableRefObject<HTMLDivElement | null>;
};

export default function PaperPdfPlaceholder({
  file: fileProp,
  year,
  pageWidth = 480,
  onCurrentPageChange,
  scrollToPage,
  onScrolledToPage,
  onNumPages,
  onDocumentLoadSuccess,
  scrollContainerRef: externalScrollRef,
}: PaperPdfPlaceholderProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const internalScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = externalScrollRef ?? internalScrollRef;
  const pageRefsRef = useRef<(HTMLDivElement | null)[]>([]);
  const ratiosRef = useRef<Record<number, number>>({});
  const lastReportedPageRef = useRef<number>(1);

  const file = fileProp ?? (year ? `/assets/marking_schemes/${year}.pdf` : null);

  useEffect(() => {
    if (!onCurrentPageChange || numPages === 0 || !scrollContainerRef.current) return;
    const root = scrollContainerRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const page = Number((entry.target as HTMLElement).dataset.page);
          if (!Number.isFinite(page)) continue;
          ratiosRef.current[page] = entry.intersectionRatio;
        }
        const pages = Object.keys(ratiosRef.current).map(Number);
        if (pages.length === 0) return;
        const best = pages.reduce((a, b) => (ratiosRef.current[a] >= ratiosRef.current[b] ? a : b));
        if (best !== lastReportedPageRef.current) {
          lastReportedPageRef.current = best;
          onCurrentPageChange(best);
        }
      },
      { root, rootMargin: "0px", threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    pageRefsRef.current.slice(0, numPages).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [numPages, onCurrentPageChange]);

  useEffect(() => {
    if (scrollToPage == null || scrollToPage < 1 || numPages === 0) return;
    const pageIndex = Math.min(scrollToPage, numPages) - 1;
    const el = pageRefsRef.current[pageIndex];
    if (el?.scrollIntoView) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      lastReportedPageRef.current = scrollToPage;
      onCurrentPageChange?.(scrollToPage);
      onScrolledToPage?.();
    }
  }, [scrollToPage, numPages, onCurrentPageChange, onScrolledToPage]);

  if (!file) {
    return (
      <div className="flex min-h-[300px] items-center justify-center color-txt-sub text-sm">
        No paper loaded.
      </div>
    );
  }

  const pdfFallback = (
    <div className="flex min-h-[200px] items-center justify-center color-txt-sub text-sm p-4 text-center">
      PDF could not be displayed. If this persists, refresh the page.
    </div>
  );

  return (
    <div
      ref={scrollContainerRef}
      className="h-full w-full min-h-0 overflow-y-auto overflow-x-hidden scrollbar-minimal"
      style={{ touchAction: "pan-y" }}
    >
      {loadError && (
        <div className="py-2 text-sm color-txt-sub">
          PDF failed to load: {loadError}
        </div>
      )}
      <PdfErrorBoundary fallback={pdfFallback}>
        <Document
          file={file}
          onLoadSuccess={({ numPages: n }) => {
            setNumPages(n);
            setLoadError(null);
            onNumPages?.(n);
            onDocumentLoadSuccess?.();
          }}
          onLoadError={(err) => {
            console.error("PDF load error:", err);
            setLoadError(err?.message ?? "Unknown error");
          }}
        >
          {Array.from({ length: numPages }, (_, i) => (
            <div
              key={`page_${i + 1}`}
              ref={(el) => {
                pageRefsRef.current[i] = el;
              }}
              data-page={i + 1}
              className="my-2"
            >
              <PdfThemeWrapper
                pageNumber={i + 1}
                width={pageWidth}
              />
            </div>
          ))}
        </Document>
      </PdfErrorBoundary>
    </div>
  );
}
