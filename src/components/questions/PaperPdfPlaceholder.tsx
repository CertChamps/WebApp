import { useState } from "react";
import { Document, Page } from "react-pdf";

/** Loads the marking scheme PDF the same way as LogTables: react-pdf only, no iframe, no browser PDF chrome. */
type PaperPdfPlaceholderProps = {
  /** Two-digit year, e.g. "25" for 2025. PDF path: /assets/marking_schemes/{year}.pdf */
  year: string;
  /** Width of each rendered page. */
  pageWidth?: number;
};

export default function PaperPdfPlaceholder({ year, pageWidth = 480 }: PaperPdfPlaceholderProps) {
  const [numPages, setNumPages] = useState<number>(0);

  if (!year) {
    return (
      <div className="flex min-h-[300px] items-center justify-center color-txt-sub text-sm">
        No paper loaded.
      </div>
    );
  }

  return (
    <div className="h-full w-full min-h-[400px] overflow-y-auto overflow-x-hidden scrollbar-minimal">
      <Document
        file={`/assets/marking_schemes/${year}.pdf`}
        onLoadSuccess={({ numPages: n }) => setNumPages(n)}
        onLoadError={(err) => console.error("PDF load error:", err)}
      >
        {Array.from({ length: numPages }, (_, i) => (
          <div key={`page_${i + 1}`} className="flex justify-center my-2">
            <Page
              pageNumber={i + 1}
              width={pageWidth}
              renderTextLayer={false}
              renderAnnotationLayer={false}
            />
          </div>
        ))}
      </Document>
    </div>
  );
}
