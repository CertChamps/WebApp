import { useEffect, useRef, useState, type ReactNode } from "react";
import { Document, Page } from "react-pdf";
import "../../lib/pdfWorker";
import { LuBookOpen, LuExternalLink, LuFileText, LuLoader, LuRotateCcw } from "react-icons/lu";
import {
  DISCOVER_VIDEO_IFRAME_ALLOW,
  getDiscoverVideoEmbed,
  getDiscoverVideoPlayerSrc,
} from "../../lib/discoverMedia";
import {
  getDiscoverPreviewKind,
  getPdfFirstPageDataUrl,
  getStoredOrRemoteThumbnail,
  hasMeaningfulThumbnail,
  loadDiscoverPdfBlob,
  type DiscoverPreviewSource,
} from "../../lib/discoverPreview";

type DiscoverMediaPreviewProps = {
  resource: DiscoverPreviewSource;
  variant: "hero" | "thumb";
  className?: string;
  onOpenResource?: () => void;
  resourceActionLabel?: string;
};

function PreviewFallback({
  resource,
  compact,
}: {
  resource: DiscoverPreviewSource;
  compact?: boolean;
}) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-3 color-txt-sub px-5 text-center">
      {resource.faviconUrl ? (
        <img
          src={resource.faviconUrl}
          alt=""
          className={`${compact ? "w-8 h-8 rounded-md" : "w-16 h-16 rounded-2xl color-bg p-2"} object-contain`}
        />
      ) : resource.resourceSource === "pdf" ? (
        <LuFileText size={compact ? 22 : 40} />
      ) : (
        <LuBookOpen size={compact ? 22 : 40} />
      )}
    </div>
  );
}

function PreviewSpinner({ compact }: { compact?: boolean }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center color-bg-grey-10 color-txt-sub">
      <LuLoader size={compact ? 18 : 22} className="animate-spin" />
    </div>
  );
}

function CannotLoadFallback({
  onOpenResource,
  onRetry,
  resourceActionLabel = "Open Resource",
}: {
  onOpenResource?: () => void;
  onRetry?: () => void;
  resourceActionLabel?: string;
}) {
  return (
    <div className="w-full h-full min-h-[240px] flex flex-col items-center justify-center gap-4 color-bg-grey-10 px-6 text-center">
      <p className="text-base font-semibold color-txt-main">Cannot Load Resource... Sorry :(</p>
      {(onRetry || onOpenResource) && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-2 rounded-xl color-bg px-4 py-2 text-sm font-semibold color-txt-main hover:opacity-90 cursor-pointer"
            >
              <LuRotateCcw size={15} />
              Try again
            </button>
          )}
          {onOpenResource && (
            <button
              type="button"
              onClick={onOpenResource}
              className="inline-flex items-center gap-2 rounded-xl color-bg color-txt-accent px-4 py-2 text-sm font-semibold hover:opacity-90 cursor-pointer"
            >
              <LuExternalLink size={15} />
              {resourceActionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function OpenResourceCorner({ onOpenResource, resourceActionLabel = "Open Resource" }: { onOpenResource?: () => void; resourceActionLabel?: string }) {
  if (!onOpenResource) return null;
  return (
    <button
      type="button"
      onClick={onOpenResource}
      className="absolute top-3 right-3 z-20 inline-flex items-center gap-2 rounded-xl color-bg color-txt-accent px-4 py-2 text-sm font-semibold hover:opacity-90 cursor-pointer"
    >
      <LuExternalLink size={15} />
      {resourceActionLabel}
    </button>
  );
}

function CoverImage({
  src,
  compact,
  objectTop,
  fallback,
}: {
  src: string;
  compact?: boolean;
  objectTop?: boolean;
  fallback: ReactNode;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [src]);

  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) setLoaded(true);
  }, [src, loaded]);

  if (failed) return <>{fallback}</>;
  return (
    <div className="relative w-full h-full">
      {!compact && !loaded && <PreviewSpinner />}
      <img
        ref={imgRef}
        src={src}
        alt=""
        className={`w-full h-full ${objectTop ? "object-cover object-top" : "object-cover"} ${
          loaded || compact ? "opacity-100" : "opacity-0"
        }`}
        loading={compact ? "lazy" : "eager"}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

function IframePreview({
  src,
  title,
  allow,
  sandbox,
  className = "",
}: {
  src: string;
  title: string;
  allow?: string;
  sandbox?: string;
  className?: string;
}) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    const timer = window.setTimeout(() => setLoaded(true), 8000);
    return () => window.clearTimeout(timer);
  }, [src]);

  return (
    <div className={`relative w-full h-full ${className}`}>
      {!loaded && <PreviewSpinner />}
      <iframe
        src={src}
        title={title}
        className="w-full h-full border-0 bg-white"
        allow={allow}
        sandbox={sandbox}
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}

function DirectVideoPreview({ src, className = "" }: { src: string; className?: string }) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
  }, [src]);

  return (
    <div className={`relative w-full h-full color-bg-grey-10 ${className}`}>
      {!loaded && <PreviewSpinner />}
      <video
        src={src}
        controls
        playsInline
        className="w-full h-full object-contain"
        onLoadedData={() => setLoaded(true)}
      />
    </div>
  );
}

const WEBSITE_PREVIEW_TIMEOUT_MS = 15_000;
const WEBSITE_IFRAME_SANDBOX =
  "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation allow-downloads";

function websitePreviewUrl(raw: string | undefined | null): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function WebsiteHero({
  resource,
  onOpenResource,
  resourceActionLabel,
}: {
  resource: DiscoverPreviewSource;
  onOpenResource?: () => void;
  resourceActionLabel?: string;
}) {
  const url = websitePreviewUrl(resource.websiteUrl);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const verifyTimerRef = useRef<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"loading" | "loaded" | "failed">(
    url ? "loading" : "failed"
  );
  const thumbnail = getStoredOrRemoteThumbnail(resource);

  useEffect(() => {
    setAttempt(0);
    setStatus(url ? "loading" : "failed");
  }, [url]);

  useEffect(() => {
    if (!url || status !== "loading") return;
    const timeout = window.setTimeout(() => setStatus("failed"), WEBSITE_PREVIEW_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [attempt, status, url]);

  useEffect(() => () => {
    if (verifyTimerRef.current != null) window.clearTimeout(verifyTimerRef.current);
  }, []);

  const markLoadedAfterVerification = () => {
    if (verifyTimerRef.current != null) window.clearTimeout(verifyTimerRef.current);
    verifyTimerRef.current = window.setTimeout(() => {
      const frame = iframeRef.current;
      if (!frame) return;

      try {
        // A blocked navigation commonly leaves the frame on its initial blank
        // document. Cross-origin access throwing is expected and means the
        // browser did navigate to the remote site.
        const href = frame.contentWindow?.location.href ?? "";
        const documentUrl = frame.contentDocument?.URL ?? "";
        if (href === "about:blank" || documentUrl === "about:blank") {
          setStatus("failed");
          return;
        }

        const text = frame.contentDocument?.body?.innerText?.toLowerCase() ?? "";
        if (text.includes("refused to connect") || text.includes("refused to display")) {
          setStatus("failed");
          return;
        }
      } catch {
        // Expected for a successfully loaded cross-origin website.
      }

      setStatus("loaded");
    }, 120);
  };

  const retry = () => {
    setAttempt((value) => value + 1);
    setStatus("loading");
  };

  if (!url) {
    return (
      <CannotLoadFallback
        onOpenResource={onOpenResource}
        resourceActionLabel={resourceActionLabel}
      />
    );
  }

  if (status === "failed") {
    if (thumbnail) {
      return (
        <div className="relative w-full h-full">
          <CoverImage
            src={thumbnail}
            objectTop
            fallback={(
              <CannotLoadFallback
                onOpenResource={onOpenResource}
                onRetry={retry}
                resourceActionLabel={resourceActionLabel}
              />
            )}
          />
          <button
            type="button"
            onClick={retry}
            className="absolute bottom-3 left-3 z-20 inline-flex items-center gap-2 rounded-xl color-bg px-3 py-2 text-xs font-semibold color-txt-main hover:opacity-90 cursor-pointer"
          >
            <LuRotateCcw size={14} />
            Retry live preview
          </button>
          <OpenResourceCorner
            onOpenResource={onOpenResource}
            resourceActionLabel={resourceActionLabel}
          />
        </div>
      );
    }

    return (
      <CannotLoadFallback
        onOpenResource={onOpenResource}
        onRetry={retry}
        resourceActionLabel={resourceActionLabel}
      />
    );
  }

  return (
    <div className="relative w-full h-full color-bg-grey-10">
      {status === "loading" && <PreviewSpinner />}
      <iframe
        key={`${url}-${attempt}`}
        ref={iframeRef}
        src={url}
        title={resource.title || "Website preview"}
        className={`w-full h-full border-0 bg-white ${status === "loaded" ? "opacity-100" : "opacity-0"}`}
        sandbox={WEBSITE_IFRAME_SANDBOX}
        allow="clipboard-read; clipboard-write; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={markLoadedAfterVerification}
        onError={() => setStatus("failed")}
      />
      <OpenResourceCorner
        onOpenResource={onOpenResource}
        resourceActionLabel={resourceActionLabel}
      />
    </div>
  );
}

function PdfThumb({ resource }: { resource: DiscoverPreviewSource }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [src, setSrc] = useState<string | null>(
    hasMeaningfulThumbnail(resource) ? resource.thumbnailUrl ?? null : null
  );
  const [loading, setLoading] = useState(!hasMeaningfulThumbnail(resource));

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setVisible(true);
      },
      { rootMargin: "240px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || src) {
      if (src) setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getPdfFirstPageDataUrl(resource.pdfPath, resource.websiteUrl).then((dataUrl) => {
      if (cancelled) return;
      setSrc(dataUrl);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, src, resource.pdfPath, resource.websiteUrl]);

  return (
    <div ref={hostRef} className="w-full h-full color-bg-grey-10">
      {src ? (
        <img src={src} alt="" className="w-full h-full object-cover object-top" loading="lazy" />
      ) : loading ? (
        <div className="w-full h-full flex items-center justify-center color-txt-sub">
          <LuLoader size={18} className="animate-spin" />
        </div>
      ) : (
        <PreviewFallback resource={resource} compact />
      )}
    </div>
  );
}

function PdfHero({
  resource,
  onOpenResource,
  resourceActionLabel,
}: {
  resource: DiscoverPreviewSource;
  onOpenResource?: () => void;
  resourceActionLabel?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<Blob | string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [width, setWidth] = useState(640);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setWidth(Math.max(280, Math.floor(el.clientWidth)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setFile(null);
    setNumPages(0);
    loadDiscoverPdfBlob(resource.pdfPath, resource.websiteUrl)
      .then((blob) => {
        if (cancelled) return;
        if (blob) {
          setFile(blob);
          return;
        }
        setFailed(true);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [resource.pdfPath, resource.websiteUrl]);

  if (failed) {
    return <CannotLoadFallback onOpenResource={onOpenResource} resourceActionLabel={resourceActionLabel} />;
  }

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-y-auto scrollbar-minimal color-bg-grey-10">
      <OpenResourceCorner onOpenResource={onOpenResource} resourceActionLabel={resourceActionLabel} />
      {loading && !file && (
        <div className="w-full h-full min-h-[240px] flex items-center justify-center color-txt-sub">
          <LuLoader size={22} className="animate-spin" />
        </div>
      )}
      {file && (
        <Document
          file={file}
          onLoadSuccess={({ numPages: next }) => {
            setNumPages(next);
            setLoading(false);
            setFailed(false);
          }}
          onLoadError={() => {
            setFailed(true);
            setLoading(false);
          }}
          loading={
            <div className="w-full min-h-[240px] flex items-center justify-center color-txt-sub">
              <LuLoader size={22} className="animate-spin" />
            </div>
          }
        >
          {Array.from({ length: Math.min(numPages, 40) }, (_, index) => (
            <Page
              key={`page-${index + 1}`}
              pageNumber={index + 1}
              width={width}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              className="!mb-2"
            />
          ))}
        </Document>
      )}
    </div>
  );
}

export default function DiscoverMediaPreview({
  resource,
  variant,
  className = "",
  onOpenResource,
  resourceActionLabel,
}: DiscoverMediaPreviewProps) {
  const kind = getDiscoverPreviewKind(resource);
  const videoEmbed = getDiscoverVideoEmbed(resource.websiteUrl);
  const thumbSrc = getStoredOrRemoteThumbnail(resource);

  if (variant === "thumb") {
    return (
      <div className={`w-full h-full ${className}`}>
        {kind === "pdf" && !hasMeaningfulThumbnail(resource) ? (
          <PdfThumb resource={resource} />
        ) : thumbSrc ? (
          <CoverImage
            src={thumbSrc}
            compact
            objectTop={kind !== "video"}
            fallback={<PreviewFallback resource={resource} compact />}
          />
        ) : (
          <PreviewFallback resource={resource} compact />
        )}
      </div>
    );
  }

  if (kind === "video" && videoEmbed) {
    return (
      <div className={`relative w-full h-full ${className}`}>
        {videoEmbed.kind === "direct" ? (
          <DirectVideoPreview src={videoEmbed.embedUrl} />
        ) : (
          <IframePreview
            src={getDiscoverVideoPlayerSrc(videoEmbed, { autoplay: false })}
            title={resource.title || "Video"}
            allow={DISCOVER_VIDEO_IFRAME_ALLOW}
          />
        )}
        <OpenResourceCorner onOpenResource={onOpenResource} resourceActionLabel={resourceActionLabel} />
      </div>
    );
  }

  if (kind === "pdf") {
    return (
      <div className={`w-full h-full ${className}`}>
        <PdfHero resource={resource} onOpenResource={onOpenResource} resourceActionLabel={resourceActionLabel} />
      </div>
    );
  }

  if (kind === "website") {
    return (
      <div className={`w-full h-full ${className}`}>
        <WebsiteHero
          resource={resource}
          onOpenResource={onOpenResource}
          resourceActionLabel={resourceActionLabel}
        />
      </div>
    );
  }

  if (thumbSrc) {
    return (
      <div className={`relative w-full h-full ${className}`}>
          <OpenResourceCorner onOpenResource={onOpenResource} resourceActionLabel={resourceActionLabel} />
          <CoverImage src={thumbSrc} fallback={<PreviewFallback resource={resource} />} />
      </div>
    );
  }

  return (
    <div className={`w-full h-full ${className}`}>
      <CannotLoadFallback onOpenResource={onOpenResource} resourceActionLabel={resourceActionLabel} />
    </div>
  );
}
