import { Capacitor } from "@capacitor/core";

export type DiscoverVideoEmbed =
  | { kind: "youtube"; id: string; embedUrl: string; titleHint?: string }
  | { kind: "vimeo"; id: string; embedUrl: string; titleHint?: string }
  | { kind: "direct"; embedUrl: string; titleHint?: string };

/** Hosted HTTPS page so YouTube receives a valid Referer from the iPad WKWebView. */
const YOUTUBE_IOS_PROXY = "https://app.certchamps.ie/youtube-embed.html";

export const DISCOVER_VIDEO_IFRAME_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen";

function safeUrl(input: string): URL | null {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

export function extractYoutubeId(url: string): string | null {
  const parsed = safeUrl(url);
  if (!parsed) return null;
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();

  if (host === "youtu.be") {
    return parsed.pathname.split("/").filter(Boolean)[0] ?? null;
  }

  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    const fromQuery = parsed.searchParams.get("v");
    if (fromQuery) return fromQuery;

    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live") {
      return parts[1] ?? null;
    }
  }

  return null;
}

export function extractVimeoId(url: string): string | null {
  const parsed = safeUrl(url);
  if (!parsed) return null;
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  if (host !== "vimeo.com" && host !== "player.vimeo.com") return null;

  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts[0] === "video") return parts[1] ?? null;
  return parts[0] && /^\d+$/.test(parts[0]) ? parts[0] : null;
}

function isDirectVideoUrl(url: string): boolean {
  const parsed = safeUrl(url);
  if (!parsed) return false;
  return /\.(mp4|webm|ogg|m4v)(\?|#|$)/i.test(parsed.pathname);
}

export function getDiscoverVideoEmbed(url: string | undefined | null): DiscoverVideoEmbed | null {
  if (!url?.trim()) return null;

  const youtubeId = extractYoutubeId(url);
  if (youtubeId) {
    return {
      kind: "youtube",
      id: youtubeId,
      embedUrl: getYoutubeEmbedUrl(youtubeId, true),
    };
  }

  const vimeoId = extractVimeoId(url);
  if (vimeoId) {
    return {
      kind: "vimeo",
      id: vimeoId,
      embedUrl: getVimeoEmbedUrl(vimeoId, true),
    };
  }

  if (isDirectVideoUrl(url)) {
    return { kind: "direct", embedUrl: url };
  }

  return null;
}

export function isDiscoverVideoUrl(url: string | undefined | null): boolean {
  return Boolean(getDiscoverVideoEmbed(url));
}

function getYoutubeEmbedUrl(id: string, autoplay: boolean): string {
  const params = new URLSearchParams({
    autoplay: autoplay ? "1" : "0",
    rel: "0",
    playsinline: "1",
    modestbranding: "1",
  });
  return `https://www.youtube.com/embed/${id}?${params.toString()}`;
}

function getVimeoEmbedUrl(id: string, autoplay: boolean): string {
  const params = new URLSearchParams({
    autoplay: autoplay ? "1" : "0",
    playsinline: "1",
  });
  return `https://player.vimeo.com/video/${id}?${params.toString()}`;
}

/** iframe src for the in-app player. Native iOS must go through the HTTPS proxy. */
export function getDiscoverVideoPlayerSrc(
  embed: DiscoverVideoEmbed,
  options?: { autoplay?: boolean }
): string {
  const autoplay = options?.autoplay ?? false;
  if (embed.kind === "youtube") {
    if (typeof window !== "undefined" && Capacitor.isNativePlatform()) {
      const proxy = new URL(YOUTUBE_IOS_PROXY);
      proxy.searchParams.set("v", embed.id);
      proxy.searchParams.set("autoplay", autoplay ? "1" : "0");
      return proxy.toString();
    }
    return getYoutubeEmbedUrl(embed.id, autoplay);
  }
  if (embed.kind === "vimeo") {
    return getVimeoEmbedUrl(embed.id, autoplay);
  }
  return embed.embedUrl;
}

export function getDiscoverVideoPoster(url: string | undefined | null): string | null {
  const embed = getDiscoverVideoEmbed(url);
  if (!embed) return null;
  if (embed.kind === "youtube") {
    return `https://i.ytimg.com/vi/${embed.id}/hqdefault.jpg`;
  }
  if (embed.kind === "vimeo") {
    return `https://vumbnail.com/${embed.id}.jpg`;
  }
  return null;
}
