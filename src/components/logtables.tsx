import { useEffect, useRef, useState, createRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import pdfWorker from "pdfjs-dist/build/pdf.worker?url";
import { LuMoon, LuSun } from "react-icons/lu";
import Lottie from "lottie-react";
import loadingAnim from "../assets/animations/loading.json";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

type QuestionType = {
  pgNumber: string;
};

const LogTables = ({ pgNumber }: QuestionType) => {
  // Check for various "empty" states: null, "null", "NaN" (from bad math), or "0"
  const isNullPage = !pgNumber || pgNumber === "null" || pgNumber === "NaN" || pgNumber === "0";
  // If null, default to page 1 for the PDF viewer, but keep isNullPage true for UI
  const effectivePage = isNullPage ? "1" : pgNumber;
  const [numPages, setNumPages] = useState<number>(0);
  const [pagesRendered, setPagesRendered] = useState(0); 
  const [scrollingDone, setScrollingDone] = useState(false); // ✅ Controls visibility
  const [darkMode, setDarkMode] = useState(false);
  const pageRefs = useRef<React.RefObject<HTMLDivElement>[]>([]);

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
      className="flex flex-col items-center shadow-small rounded-lg color-bg relative ml-5 overflow-hidden"
      style={{ height: "77vh", width: "650px" }}
    >
      {/* ================= 1. TOP BAR ================= */}
      {/* This is now the first element, so it sits at the top naturally. */}
        <div className="w-full flex items-center justify-between px-4 py-2 bg-opacity-80 relative border-b-2 color-shadow mb-1" style={{ minHeight: '52px' }}>
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
              className="px-3 py-1 text-sm rounded-lg color-bg hover:opacity-80 transition-all cursor-pointer shadow-small"
            >
              Jump to Pg {effectivePage}
            </button>
          )}
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-lg color-bg hover:opacity-80 transition-all cursor-pointer shadow-small color-txt-accent"
          >
            {darkMode ? <LuSun size={18} /> : <LuMoon size={18} />}
          </button>
        </div>
      </div>

      {/* ================= 2. CONTENT AREA ================= */}
      {/* We wrap the PDF and the Loading Screen in this relative container */}
      <div className="relative w-full flex-1 overflow-hidden">
        {/* LOADING OVERLAY - Now lives inside this container, so it won't cover the Top Bar */}
        {!scrollingDone && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center color-bg h-full w-full">
            <Lottie
              animationData={loadingAnim}
              loop={true}
              autoplay={true}
              className="h-32 w-32"
            />
            <p className="color-txt-sub font-medium mt-4">
               {isNullPage ? "Loading tables..." : "Finding your page..."}
            </p>
          </div>
        )}

        {/* PDF DOCUMENT */}
        <div
          className={`w-full h-full flex flex-col items-center transition-opacity duration-200 ${
            scrollingDone ? "opacity-100 overflow-y-auto scrollbar-minimal" : "opacity-0 overflow-hidden"
          }`}
        >
          <Document
            file={`/assets/log_tables.pdf`}
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
                className="flex justify-center my-2"
                style={{
                  filter: darkMode ? "invert(0.9) hue-rotate(180deg) brightness(0.8) contrast(0.9)" : "none",
                  transition: "filter 0.3s ease",
                }}
              >
                <Page
                  pageNumber={index + 1}
                  width={600}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
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
};

export default LogTables;