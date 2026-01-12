import { useEffect, useRef, useState, createRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import pdfWorker from "pdfjs-dist/build/pdf.worker?url";
import React from "react";
import Lottie from "lottie-react";
import loadingAnim from "../assets/animations/loading.json";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

type QuestionType = {
  year: string;
  pgNumber: string;
};

const MarkingScheme = ({ year, pgNumber }: QuestionType) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [pagesRendered, setPagesRendered] = useState(0); 
  const [scrollingDone, setScrollingDone] = useState(false);
  const pageRefs = useRef<React.RefObject<HTMLDivElement>[]>([]);

  useEffect(() => {
    pageRefs.current = Array(numPages)
      .fill(null)
      .map((_, i) => pageRefs.current[i] || createRef<HTMLDivElement>());
  }, [numPages]);

  useEffect(() => {
    if (pagesRendered < numPages) return; // wait until all pages render
    
    const pageIndex = parseInt(pgNumber, 10) - 1;
    
    if (pageIndex >= 0 && pageRefs.current[pageIndex]?.current) {
      // 1. Scroll logic executes while PDF is physically present but visually invisible
      pageRefs.current[pageIndex].current.scrollIntoView({
        behavior: "auto", // Instant jump
        block: "start",
      });
      
      // 2. Short delay to ensure browser paints the scroll, then reveal
      setTimeout(() => setScrollingDone(true), 100); 
    } else {
        // Fallback
        setScrollingDone(true);
    }
  }, [pgNumber, numPages, pagesRendered]);

  if (!year || !pgNumber) {
    return (
      <div className="w-full flex flex-col items-center justify-center py-8">
        <span className="px-6 py-4 rounded-xl color-bg-accent color-txt-accent font-semibold text-lg text-center">
          No marking scheme available.
        </span>
      </div>
    );
  }

  return (
    <div
      className="relative flex flex-col items-start color-shadow scrollbar-minimal overflow-hidden"
      style={{ height: "80vh", width: "650px" }}
    >
      {/* ================= LOADING SCREEN ================= */}
      {/* 
          This sits on top. 
          Important: 'color-bg' class must provide an opaque background color 
          (e.g., bg-white or a dark theme color) for this to hide what's behind it.
      */}
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

      {/* ================= PDF CONTENT ================= */}
      {/* 
          Opacity is 0 while loading. It exists in the DOM (so we can scroll to it),
          but the user cannot see it.
      */}
      <div 
        className={`w-full transition-opacity duration-200 ${scrollingDone ? "opacity-100 overflow-y-auto" : "opacity-0 overflow-hidden"}`}
        style={{ height: "100%" }}
      >
        <Document
          file={`/assets/marking_schemes/${year}.pdf`}
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

export default React.memo(MarkingScheme);