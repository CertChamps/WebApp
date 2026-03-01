import { memo } from "react";
import { Document } from "react-pdf";
import PdfThemeWrapper from "../PdfThemeWrapper";

export type PdfRegion = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type CroppedPdfRegionsProps = {
  file: string | Blob | null;
  regions: PdfRegion[];
  pageWidth: number;
  className?: string;
};

/**
 * Renders the same as the full paper (react-pdf Document + Page via PdfThemeWrapper)
 * but clipped to each region. Same resolution and pipeline as full paper, just cropped.
 * Memoized so same file/regions reference avoids re-mounting Document.
 */
function CroppedPdfRegions({
  file,
  regions,
  pageWidth,
  className = "",
}: CroppedPdfRegionsProps) {
  if (!file || regions.length === 0) {
    return (
      <div className={`flex min-h-[120px] items-center justify-center color-txt-sub text-sm rounded-xl color-bg-grey-5 ${className}`}>
        No PDF or regions
      </div>
    );
  }

  return (
    <Document
      file={file}
      onLoadError={(err) => console.error("CroppedPdfRegions PDF load error:", err)}
    >
      {regions.map((region, i) => {
        const scale = pageWidth / 595;
        const leftPx = region.x * scale;
        const topPx = region.y * scale;
        const widthPx = region.width * scale;
        const heightPx = region.height * scale;

        return (
          <div
            key={`${region.page}-${region.y}-${i}`}
            className="overflow-hidden rounded-xl color-shadow"
            style={{
              width: widthPx,
              height: heightPx,
            }}
          >
            <div
              style={{
                width: pageWidth,
                marginLeft: -leftPx,
                marginTop: -topPx,
              }}
            >
              <PdfThemeWrapper
                pageNumber={region.page}
                width={pageWidth}
              />
            </div>
          </div>
        );
      })}
    </Document>
  );
}

export default memo(CroppedPdfRegions);
