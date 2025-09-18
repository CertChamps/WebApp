import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import pdfWorker from "pdfjs-dist/build/pdf.worker?url"; // ✅ local worker

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

type QuestionType = {
  pgNumber: string;
};

const LogTables = ({ pgNumber }: QuestionType) => {
  const [numPages, setNumPages] = useState<number>(0);
  console.log(numPages) //unused

  return (
    <div className="flex flex-col items-start">
        <p className="mt-2 color-txt-accent font-bold mb-2">
            Recommended page: {pgNumber}
        </p>
        <div className="border-2 color-shadow">
            <Document
                file="/assets/log_tables.pdf" // ✅ served from public/
                onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                onLoadError={(err) => console.error("PDF load error:", err)}
            >
                <Page
                    pageNumber={parseInt(pgNumber, 10) || 1}
                    width={600}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                />
            </Document>
        </div>
    </div>
  );
};

export default LogTables;