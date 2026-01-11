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

    const pageIndex = parseInt(pgNumber, 10) - 1;
    
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
  }, [pgNumber, numPages, pagesRendered]);

  return (
    <div
      className="flex flex-col items-center shadow-small rounded-in color-bg relative ml-5 overflow-hidden"
      style={{ height: "72.5vh", width: "650px" }}
    >
      {/* ================= LOADING OVERLAY ================= */}
      {/* Opaque layer covering content while loading/scrolling */}
      {!scrollingDone && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center color-bg h-full w-full">
          <Lottie
            animationData={loadingAnim}
            loop={true}
            autoplay={true}
            className="h-32 w-32"
          />
          <p className="color-txt-sub font-medium mt-4">CertChamps is find the exact page for you, hold tight...</p>
        </div>
      )}

      {/* ================= CONTENT CONTAINER ================= */}
      {/* 
         Hidden (opacity-0) until scroll is done. 
         Contains Toggle Button + PDF 
      */}
      <div 
        className={`w-full h-full flex flex-col items-center transition-opacity duration-200 ${
          scrollingDone ? "opacity-100 overflow-y-auto scrollbar-minimal" : "opacity-0 overflow-hidden"
        }`}
      >
        {/* Dark Mode Toggle Button */}
        <button
            onClick={() => setDarkMode(!darkMode)}
            className="sticky top-2 right-2 z-10 p-2 rounded-in color-bg-accent hover:opacity-80 transition-all cursor-pointer ml-auto mr-2 mb-2 shadow-sm"
            title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
            {darkMode ? (
            <LuSun size={20} className="color-txt-accent" />
            ) : (
            <LuMoon size={20} className="color-txt-accent" />
            )}
        </button>

        <Document
            file={`/assets/log_tables.pdf`}
            onLoadSuccess={({ numPages }) => {
            setNumPages(numPages);
            setPagesRendered(0); 
            setScrollingDone(false); // Reset loading state when new file loads (if ever)
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
  );
};

export default LogTables;