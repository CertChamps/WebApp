import { useEffect, useRef, useState, type ReactNode } from "react";
import { Document, Page } from "react-pdf";
import "../../lib/pdfWorker";
import { LuBookOpen, LuExternalLink, LuFileText, LuLoader } from "react-icons/lu";
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

function CannotLoadFallback({ onOpenResource }: { onOpenResource?: () => void }) {
  return (
    <div className="w-full h-full min-h-[240px] flex flex-col items-center justify-center gap-4 color-bg-grey-10 px-6 text-center">
      <p className="text-base font-semibold color-txt-main">Cannot Load Resource... Sorry :(</p>
      {onOpenResource && (
        <button
          type="button"
          onClick={onOpenResource}
          className="inline-flex items-center gap-2 rounded-xl color-bg color-txt-accent px-4 py-2 text-sm font-semibold hover:opacity-90 cursor-pointer"
        >
          <LuExternalLink size={15} />
          Open Resource
        </button>
      )}
    </div>
  );
}

function OpenResourceCorner({ onOpenResource }: { onOpenResource?: () => void }) {
  if (!onOpenResource) return null;
  return (
    <button
      type="button"
      onClick={onOpenResource}
      className="absolute top-3 right-3 z-20 inline-flex items-center gap-2 rounded-xl color-bg color-txt-accent px-4 py-2 text-sm font-semibold hover:opacity-90 cursor-pointer"
    >
      <LuExternalLink size={15} />
      Open Resource
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
}: {
  resource: DiscoverPreviewSource;
  onOpenResource?: () => void;
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
    return <CannotLoadFallback onOpenResource={onOpenResource} />;
  }

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-y-auto scrollbar-minimal color-bg-grey-10">
      <OpenResourceCorner onOpenResource={onOpenResource} />
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
        <OpenResourceCorner onOpenResource={onOpenResource} />
      </div>
    );
  }

  if (kind === "pdf") {
    return (
      <div className={`w-full h-full ${className}`}>
        <PdfHero resource={resource} onOpenResource={onOpenResource} />
      </div>
    );
  }

  if (kind === "website") {
    return (
      <div className={`w-full h-full ${className}`}>
        <CannotLoadFallback onOpenResource={onOpenResource} />
      </div>
    );
  }

  if (thumbSrc) {
    return (
      <div className={`w-full h-full ${className}`}>
          <CoverImage src={thumbSrc} fallback={<PreviewFallback resource={resource} />} />
      </div>
    );
  }

  return (
    <div className={`w-full h-full ${className}`}>
      <CannotLoadFallback onOpenResource={onOpenResource} />
    </div>
  );
}
