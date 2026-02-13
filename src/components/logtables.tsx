import { useEffect, useRef, useState, createRef } from "react";
import { Document } from "react-pdf";
import PdfThemeWrapper from "./PdfThemeWrapper";
import Lottie from "lottie-react";
import loadingAnim from "../assets/animations/loading.json";

// Worker is set in main.tsx

type QuestionType = {
  pgNumber: string;
  /** When true, size to fill container (e.g. inside FloatingLogTables) instead of fixed 70vh/520px. */
  embedded?: boolean;
  /** Preloaded PDF blob or URL; when set, used instead of default /assets/log_tables.pdf. */
  file?: Blob | string | null;
};

const LOG_TABLES_DEFAULT_FILE = "/assets/log_tables.pdf";
const FIXED_PAGE_WIDTH = 480;
/** Fixed width we use to render the PDF when embedded; resize is done via CSS scale so the PDF never reloads. */
const EMBEDDED_BASE_WIDTH = 480;
const PAGE_GAP_PX = 0;
/** Log tables booklet pages are short (~300px), not A4; use this so we don't get huge gaps between pages. */
const LOG_TABLES_PAGE_HEIGHT = 330;

const LogTables = ({ pgNumber, embedded = false, file: fileProp }: QuestionType) => {
  const file = fileProp ?? LOG_TABLES_DEFAULT_FILE;
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(EMBEDDED_BASE_WIDTH);
  // Check for various "empty" states: null, "null", "NaN" (from bad math), or "0"
  const isNullPage = !pgNumber || pgNumber === "null" || pgNumber === "NaN" || pgNumber === "0";
  // If null, default to page 1 for the PDF viewer, but keep isNullPage true for UI
  const effectivePage = isNullPage ? "1" : pgNumber;
  const [numPages, setNumPages] = useState<number>(0);
  const [pagesRendered, setPagesRendered] = useState(0); 
  const [scrollingDone, setScrollingDone] = useState(false); // ✅ Controls visibility
  const pageRefs = useRef<React.RefObject<HTMLDivElement>[]>([]);

  // When embedded, track container width for CSS scale (PDF is always rendered at EMBEDDED_BASE_WIDTH)
  useEffect(() => {
    if (!embedded || !containerRef.current) return;
    const el = containerRef.current;
    const updateWidth = () => {
      const w = el.clientWidth;
      if (w > 0) setContainerWidth(w);
    };
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, [embedded]);

  useEffect(() => {
    pageRefs.current = Array(numPages)
      .fill(null)
      .map((_, i) => pageRefs.current[i] || createRef<HTMLDivElement>());
  }, [numPages]);

  // Scroll to target page invisible in background, then reveal
  useEffect(() => {
    if (pagesRendered < numPages) return; // wait until all pages render

    const pageIndex = parseInt(effectivePage, 10) - 1;
    
    if (pageIndex >= 0 && pageRefs.current[pageIndex]?.current) {
      // 1. Scroll instantly (behavior: auto) while hidden
      pageRefs.current[pageIndex].current.scrollIntoView({
        behavior: "auto",
        block: "start",
      });
      
      // 2. Short delay to ensure paint, then reveal
      setTimeout(() => setScrollingDone(true), 100);
    } else {
        // Fallback if page is not found
        setScrollingDone(true);
    }
  }, [effectivePage, numPages, pagesRendered]);

  return (
    <div
      className={`flex flex-col items-center color-bg relative overflow-hidden ${embedded ? "h-full w-full" : "shadow-small rounded-lg ml-5"}`}
      style={embedded ? { height: "100%", width: "100%" } : { height: "70vh", width: "520px" }}
    >
      {/* ================= 1. TOP BAR ================= */}
      {/* This is now the first element, so it sits at the top naturally. */}
        <div className="w-full flex items-center justify-between px-4 py-2 relative color-bg color-txt-main mb-1" style={{ minHeight: "52px" }}>
        <div className="flex-1 flex items-center">
          {isNullPage && (
            <span className="text-sm font-bold color-txt-sub">
              CertChamps thinks you might not need log tables for this one!
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isNullPage && (
            <button
              onClick={() => {
                const pageIndex = parseInt(effectivePage, 10) - 1;
                if (pageIndex >= 0 && pageRefs.current[pageIndex]?.current) {
                  pageRefs.current[pageIndex].current.scrollIntoView({ behavior: "smooth", block: "start" });
                }
              }}
              className="px-3 py-1 text-sm rounded-lg color-bg-grey-10 color-txt-main hover:opacity-80 transition-all cursor-pointer"
            >
              Jump to Pg {effectivePage}
            </button>
          )}
        </div>
      </div>

      {/* ================= 2. CONTENT AREA ================= */}
      {/* We wrap the PDF and the Loading Screen in this relative container */}
      <div ref={containerRef} className="relative w-full flex-1 overflow-hidden min-w-0">
        {/* LOADING OVERLAY - Now lives inside this container, so it won't cover the Top Bar */}
        {!scrollingDone && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center color-bg color-txt-main h-full w-full">
            <Lottie
              animationData={loadingAnim}
              loop={true}
              autoplay={true}
              className="h-32 w-32"
            />
            <p className="color-txt-sub font-medium mt-4">
               {isNullPage ? "Loading tables..." : "CertChamps is find the exact page for you, hold tight..."}
            </p>
          </div>
        )}

        {/* PDF DOCUMENT: when embedded we render at fixed width and scale with CSS so resize doesn't reload the PDF */}
        {embedded ? (
          (() => {
            const scale = containerWidth / EMBEDDED_BASE_WIDTH;
            const totalHeightPx =
              numPages > 0 ? numPages * LOG_TABLES_PAGE_HEIGHT + (numPages - 1) * PAGE_GAP_PX : 0;
            const scaledHeightPx = totalHeightPx * scale;

            return (
              <div
                className={`w-full h-full transition-opacity duration-200 ${
                  scrollingDone ? "opacity-100 overflow-y-auto scrollbar-minimal" : "opacity-0 overflow-hidden"
                }`}
              >
                <div
                  style={{
                    width: containerWidth,
                    height: scaledHeightPx,
                    minHeight: "100%",
                  }}
                >
                  <div
                    style={{
                      width: EMBEDDED_BASE_WIDTH,
                      height: totalHeightPx,
                      transform: `scale(${scale})`,
                      transformOrigin: "top left",
                    }}
                  >
                    <Document
                      file={file}
                      onLoadSuccess={({ numPages: n }) => {
                        setNumPages(n);
                        setPagesRendered(0);
                        setScrollingDone(false);
                      }}
                      onLoadError={(err) => console.error("PDF load error:", err)}
                    >
                      {Array.from({ length: numPages }, (_, index) => (
                        <div
                          key={`page_${index + 1}`}
                          ref={pageRefs.current[index]}
                          style={{ marginBottom: index < numPages - 1 ? PAGE_GAP_PX : 0 }}
                        >
                          <PdfThemeWrapper
                            pageNumber={index + 1}
                            width={EMBEDDED_BASE_WIDTH}
                            height={LOG_TABLES_PAGE_HEIGHT}
                            onRenderSuccess={() =>
                              setPagesRendered((count) => count + 1)
                            }
                          />
                        </div>
                      ))}
                    </Document>
                  </div>
                </div>
              </div>
            );
          })()
        ) : (
          <div
            className={`w-full h-full flex flex-col items-center transition-opacity duration-200 ${
              scrollingDone ? "opacity-100 overflow-y-auto scrollbar-minimal" : "opacity-0 overflow-hidden"
            }`}
          >
            <Document
              file={file}
              onLoadSuccess={({ numPages }) => {
                setNumPages(numPages);
                setPagesRendered(0);
                setScrollingDone(false); 
              }}
              onLoadError={(err) => console.error("PDF load error:", err)}
            >
              {Array.from({ length: numPages }, (_, index) => (
                <div
                  key={`page_${index + 1}`}
                  ref={pageRefs.current[index]}
                  className="mb-0"
                >
                  <PdfThemeWrapper
                    pageNumber={index + 1}
                    width={FIXED_PAGE_WIDTH}
                    height={LOG_TABLES_PAGE_HEIGHT}
                    onRenderSuccess={() =>
                      setPagesRendered((count) => count + 1)
                    }
                  />
                </div>
              ))}
            </Document>
          </div>
        )}
      </div>
    </div>
  );
};

export default LogTables;