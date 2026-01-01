import { useEffect, useRef, useState, createRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import pdfWorker from "pdfjs-dist/build/pdf.worker?url";
import { LuMoon, LuSun } from "react-icons/lu";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

type QuestionType = {
  pgNumber: string;
};

const LogTables = ({ pgNumber }: QuestionType) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [pagesRendered, setPagesRendered] = useState(0); // ✅ track when pages render
  const [darkMode, setDarkMode] = useState(false);
  const pageRefs = useRef<React.RefObject<HTMLDivElement>[]>([]);

  useEffect(() => {
    pageRefs.current = Array(numPages)
      .fill(null)
      .map((_, i) => pageRefs.current[i] || createRef<HTMLDivElement>());
  }, [numPages]);

  // Scroll to target page, but ONLY after all requested pages rendered at least once
  useEffect(() => {
    if (pagesRendered < numPages) return; // wait until all pages render

    const pageIndex = parseInt(pgNumber, 10) - 1;
    if (pageIndex >= 0 && pageRefs.current[pageIndex]?.current) {
      pageRefs.current[pageIndex].current.scrollIntoView({
        behavior: "auto",
        block: "start",
      });
    }
  }, [pgNumber, numPages, pagesRendered]);

  return (
    <div
      className="flex flex-col items-center overflow-y-auto scrollbar-minimal shadow-small rounded-in color-bg relative"
      style={{ height: "80vh", width: "650px" }}
    >
      {/* Dark Mode Toggle Button */}
      <button
        onClick={() => setDarkMode(!darkMode)}
        className="sticky top-2 right-2 z-10 p-2 rounded-in color-bg-accent hover:opacity-80 transition-all cursor-pointer ml-auto mr-2 mb-2"
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
          setPagesRendered(0); // reset render tracker
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
              } // ✅ track render success
            />
          </div>
        ))}
      </Document>
    </div>
  );
};

export default LogTables;