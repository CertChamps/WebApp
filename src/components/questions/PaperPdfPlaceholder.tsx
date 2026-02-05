import { useState } from "react";
import { Document, Page } from "react-pdf";

/** Loads a PDF: react-pdf only. Accepts a Blob (e.g. from Firebase), a URL string, or legacy year for static path. */
type PaperPdfPlaceholderProps = {
  /** PDF as Blob (e.g. from getBlob) or URL string. Preferred when loading from Storage. */
  file?: string | Blob | null;
  /** Legacy: two-digit year for static path /assets/marking_schemes/{year}.pdf. Ignored if file is set. */
  year?: string;
  /** Width of each rendered page. */
  pageWidth?: number;
};

export default function PaperPdfPlaceholder({ file: fileProp, year, pageWidth = 480 }: PaperPdfPlaceholderProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  const file = fileProp ?? (year ? `/assets/marking_schemes/${year}.pdf` : null);

  if (!file) {
    return (
      <div className="flex min-h-[300px] items-center justify-center color-txt-sub text-sm">
        No paper loaded.
      </div>
    );
  }

  return (
    <div
      className="h-full w-full min-h-0 overflow-y-auto overflow-x-hidden scrollbar-minimal"
      style={{ touchAction: "pan-y" }}
    >
      {loadError && (
        <div className="py-2 text-sm color-txt-sub">
          PDF failed to load: {loadError}
        </div>
      )}
      <Document
        file={file}
        onLoadSuccess={({ numPages: n }) => {
          setNumPages(n);
          setLoadError(null);
        }}
        onLoadError={(err) => {
          console.error("PDF load error:", err);
          setLoadError(err?.message ?? "Unknown error");
        }}
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
