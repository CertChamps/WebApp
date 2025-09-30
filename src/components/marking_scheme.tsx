import { useEffect, useRef, useState, createRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import pdfWorker from "pdfjs-dist/build/pdf.worker?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

type QuestionType = {
  year: string;
  pgNumber: string;
};

const MarkingScheme = ({ year, pgNumber }: QuestionType) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [pagesRendered, setPagesRendered] = useState(0); // ✅ track when pages render
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
      className="flex flex-col items-start overflow-y-auto border-2 color-shadow"
      style={{ height: "80vh", width: "650px" }}
    >
      <Document
        file={`/assets/marking_schemes/${year}.pdf`}
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

export default MarkingScheme;