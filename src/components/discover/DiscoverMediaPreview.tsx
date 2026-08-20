import { useEffect, useRef, useState, type ReactNode } from "react";
import { Document, Page } from "react-pdf";
import { LuBookOpen, LuFileText, LuLoader } from "react-icons/lu";
import { getDiscoverVideoEmbed } from "../../lib/discoverMedia";
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
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  return (
    <img
      src={src}
      alt=""
      className={`w-full h-full ${objectTop ? "object-cover object-top" : "object-cover"}`}
      loading={compact ? "lazy" : "eager"}
      onError={() => setFailed(true)}
    />
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

function PdfHero({ resource }: { resource: DiscoverPreviewSource }) {
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
    setNumPages(0);
    loadDiscoverPdfBlob(resource.pdfPath, resource.websiteUrl)
      .then((blob) => {
        if (cancelled) return;
        if (blob) {
          setFile(blob);
          return;
        }
        if (resource.websiteUrl) {
          setFile(resource.websiteUrl);
          return;
        }
        setFailed(true);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        if (resource.websiteUrl) setFile(resource.websiteUrl);
        else {
          setFailed(true);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [resource.pdfPath, resource.websiteUrl]);

  if (failed && resource.websiteUrl) {
    return (
      <iframe
        src={resource.websiteUrl}
        title={resource.title || "PDF"}
        className="w-full h-full"
      />
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full overflow-y-auto scrollbar-minimal color-bg-grey-10">
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

function WebsiteHero({ resource }: { resource: DiscoverPreviewSource }) {
  const url = resource.websiteUrl?.trim() || "";
  if (!url) return <PreviewFallback resource={resource} />;

  return (
    <iframe
      src={url}
      title={resource.title || "Website preview"}
      className="w-full h-full bg-white"
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation"
    />
  );
}

export default function DiscoverMediaPreview({
  resource,
  variant,
  className = "",
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
    const embedSrc = videoEmbed.embedUrl.replace("autoplay=1", "autoplay=0");
    if (videoEmbed.kind === "direct") {
      return (
        <video
          src={embedSrc}
          controls
          className={`w-full h-full object-contain color-bg-grey-10 ${className}`}
        />
      );
    }
    return (
      <iframe
        src={embedSrc}
        title={resource.title || "Video"}
        className={`w-full h-full ${className}`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  }

  if (kind === "pdf") {
    return (
      <div className={`w-full h-full ${className}`}>
        <PdfHero resource={resource} />
      </div>
    );
  }

  if (kind === "website") {
    return (
      <div className={`w-full h-full ${className}`}>
        <WebsiteHero resource={resource} />
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
      <PreviewFallback resource={resource} />
    </div>
  );
}
