import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  createRef,
} from "react";
import { Document } from "react-pdf";
import PdfThemeWrapper from "./PdfThemeWrapper";
import Lottie from "lottie-react";
import loadingAnim from "../assets/animations/loading.json";
import { getLogTablesAssetUrl } from "../utils/logTablesPdf";

type QuestionType = {
  pgNumber: string;
  /** When true, size to fill container (e.g. inside FloatingLogTables) instead of fixed 70vh/520px. */
  embedded?: boolean;
  /** PDF blob; null = parent is still loading; undefined = use bundled asset URL. */
  file?: Blob | string | null;
};

const FIXED_PAGE_WIDTH = 480;
const EMBEDDED_BASE_WIDTH = 480;
const PAGE_GAP_PX = 0;
const LOG_TABLES_PAGE_HEIGHT = 330;
/** Only mount nearby pages — full booklet is 96 pages and crashes iPad if all render at once. */
const VISIBLE_BUFFER = 2;

export type LogTablesHandle = { scrollToCurrentPage: () => void };

const LogTables = forwardRef<LogTablesHandle, QuestionType>(
  ({ pgNumber, embedded = false, file: fileProp }, ref) => {
    const file =
      fileProp === undefined ? getLogTablesAssetUrl() : fileProp === null ? null : fileProp;
    const filePending = fileProp === null;

    const containerRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(EMBEDDED_BASE_WIDTH);

    const isNullPage = !pgNumber || pgNumber === "null" || pgNumber === "NaN" || pgNumber === "0";
    const effectivePage = isNullPage ? "1" : pgNumber;
    const targetPageNum = Math.max(1, parseInt(effectivePage, 10) || 1);

    const [numPages, setNumPages] = useState(0);
    const [visibleRange, setVisibleRange] = useState({ min: 1, max: 3 });
    const [scrollingDone, setScrollingDone] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [targetPageReady, setTargetPageReady] = useState(false);
    const pageRefs = useRef<React.RefObject<HTMLDivElement | null>[]>([]);
    const didScrollToTarget = useRef(false);

    const clampRange = useCallback(
      (min: number, max: number) => {
        if (numPages <= 0) return { min: 1, max: 1 };
        return {
          min: Math.max(1, Math.min(min, numPages)),
          max: Math.max(1, Math.min(max, numPages)),
        };
      },
      [numPages]
    );

    useImperativeHandle(
      ref,
      () => ({
        scrollToCurrentPage: () => {
          const pageIndex = targetPageNum - 1;
          const el = pageRefs.current[pageIndex]?.current;
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        },
      }),
      [targetPageNum]
    );

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

    useEffect(() => {
      if (numPages <= 0) return;
      const t = Math.min(targetPageNum, numPages);
      setVisibleRange(
        clampRange(t - VISIBLE_BUFFER, t + VISIBLE_BUFFER)
      );
      setScrollingDone(false);
      setTargetPageReady(false);
      didScrollToTarget.current = false;
    }, [numPages, targetPageNum, clampRange]);

    const updateVisibleRangeFromScroll = useCallback(() => {
      const el = scrollRef.current;
      if (!el || numPages <= 0) return;
      const scale = embedded ? containerWidth / EMBEDDED_BASE_WIDTH : 1;
      const pageStep = LOG_TABLES_PAGE_HEIGHT * scale + PAGE_GAP_PX * scale;
      if (pageStep <= 0) return;
      const first = Math.floor(el.scrollTop / pageStep);
      const last = Math.ceil((el.scrollTop + el.clientHeight) / pageStep) - 1;
      setVisibleRange(
        clampRange(first - VISIBLE_BUFFER + 1, last + VISIBLE_BUFFER + 1)
      );
    }, [numPages, containerWidth, embedded, clampRange]);

    useEffect(() => {
      if (!targetPageReady || didScrollToTarget.current || numPages <= 0) return;
      const pageIndex = Math.min(targetPageNum, numPages) - 1;
      const el = pageRefs.current[pageIndex]?.current;
      if (el) {
        el.scrollIntoView({ behavior: "auto", block: "start" });
        didScrollToTarget.current = true;
        setTimeout(() => setScrollingDone(true), 80);
      } else {
        setScrollingDone(true);
      }
    }, [targetPageReady, targetPageNum, numPages]);

    const onPageRenderSuccess = useCallback(
      (pageNumber: number) => {
        if (pageNumber === Math.min(targetPageNum, numPages || targetPageNum)) {
          setTargetPageReady(true);
        }
      },
      [targetPageNum, numPages]
    );

    const onDocumentLoad = useCallback(
      ({ numPages: n }: { numPages: number }) => {
        setNumPages(n);
        setLoadError(null);
        setScrollingDone(false);
        setTargetPageReady(false);
        didScrollToTarget.current = false;
      },
      []
    );

    const scale = embedded ? containerWidth / EMBEDDED_BASE_WIDTH : 1;
    const pageWidth = embedded ? EMBEDDED_BASE_WIDTH : FIXED_PAGE_WIDTH;
    const totalHeightPx =
      numPages > 0 ? numPages * LOG_TABLES_PAGE_HEIGHT + (numPages - 1) * PAGE_GAP_PX : 0;
    const scaledHeightPx = totalHeightPx * scale;

    const scrollClassName = `w-full h-full transition-opacity duration-200 ${
      scrollingDone && !filePending ? "opacity-100 overflow-y-auto scrollbar-minimal" : "opacity-0 overflow-hidden"
    }`;

    const pdfPages =
      numPages > 0
        ? Array.from({ length: numPages }, (_, index) => {
            const pageNumber = index + 1;
            const inRange = pageNumber >= visibleRange.min && pageNumber <= visibleRange.max;
            return (
              <div
                key={`page_${pageNumber}`}
                ref={pageRefs.current[index]}
                style={{
                  height: LOG_TABLES_PAGE_HEIGHT,
                  marginBottom: index < numPages - 1 ? PAGE_GAP_PX : 0,
                }}
              >
                {inRange ? (
                  <PdfThemeWrapper
                    pageNumber={pageNumber}
                    width={pageWidth}
                    height={LOG_TABLES_PAGE_HEIGHT}
                    onRenderSuccess={() => onPageRenderSuccess(pageNumber)}
                  />
                ) : null}
              </div>
            );
          })
        : null;

    return (
      <div
        className={`flex flex-col items-center color-bg relative overflow-hidden ${embedded ? "h-full w-full" : "shadow-small rounded-lg ml-5"}`}
        style={embedded ? { height: "100%", width: "100%" } : { height: "70vh", width: "520px" }}
      >
        {(!embedded || isNullPage) && (
          <div
            className="w-full flex items-center justify-between px-4 py-2 relative color-bg color-txt-main"
            style={{ minHeight: "52px" }}
          >
            <div className="flex-1 flex items-center">
              {isNullPage && (
                <span className="text-sm font-bold color-txt-sub">
                  CertChamps thinks you might not need log tables for this one!
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!embedded && !isNullPage && (
                <button
                  type="button"
                  onClick={() => {
                    const pageIndex = targetPageNum - 1;
                    pageRefs.current[pageIndex]?.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                  }}
                  className="px-3 py-1 text-sm rounded-lg color-bg-grey-10 color-txt-main hover:opacity-80 transition-all cursor-pointer"
                >
                  Jump to Pg {effectivePage}
                </button>
              )}
            </div>
          </div>
        )}

        <div ref={containerRef} className="relative w-full flex-1 overflow-hidden min-w-0">
          {(filePending || !scrollingDone) && !loadError && (
            <div className="absolute inset-0 z-40 flex flex-col items-center justify-center color-bg color-txt-main h-full w-full">
              <Lottie animationData={loadingAnim} loop autoplay className="h-32 w-32" />
              <p className="color-txt-sub font-medium mt-4">
                {filePending
                  ? "Loading log tables…"
                  : isNullPage
                    ? "Loading tables..."
                    : "Finding your page…"}
              </p>
            </div>
          )}

          {loadError && (
            <div className="absolute inset-0 z-40 flex items-center justify-center color-bg p-4 text-center text-sm color-txt-sub">
              {loadError}
            </div>
          )}

          {file != null && (
            embedded ? (
              <div ref={scrollRef} className={scrollClassName} onScroll={updateVisibleRangeFromScroll}>
                <div style={{ width: containerWidth, height: scaledHeightPx, minHeight: "100%" }}>
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
                      onLoadSuccess={onDocumentLoad}
                      onLoadError={(err) => {
                        console.error("Log tables PDF load error:", err);
                        setLoadError("Could not load log tables PDF.");
                        setScrollingDone(true);
                      }}
                    >
                      {pdfPages}
                    </Document>
                  </div>
                </div>
              </div>
            ) : (
              <div
                ref={scrollRef}
                className={scrollClassName}
                onScroll={updateVisibleRangeFromScroll}
              >
                <Document
                  file={file}
                  onLoadSuccess={onDocumentLoad}
                  onLoadError={(err) => {
                    console.error("Log tables PDF load error:", err);
                    setLoadError("Could not load log tables PDF.");
                    setScrollingDone(true);
                  }}
                >
                  {pdfPages}
                </Document>
              </div>
            )
          )}
        </div>
      </div>
    );
  }
);

LogTables.displayName = "LogTables";

export default LogTables;
