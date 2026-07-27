import { useEffect, useState } from "react";

const DEFAULT_COLOR = "#3a3a3a";

/**
 * Extracts a vibrant dominant color from an album-art URL (like Spotify's own
 * "extracted color" gradient behind the now-playing view).
 *
 * Spotify's image CDN (i.scdn.co) serves `Access-Control-Allow-Origin: *`, so
 * loading with `crossOrigin = "anonymous"` lets us read the pixels without
 * tainting the canvas. On any failure we fall back to a neutral dark grey.
 */
export function useAlbumColor(url: string | null): string {
  const [color, setColor] = useState<string>(DEFAULT_COLOR);

  useEffect(() => {
    if (!url) {
      setColor(DEFAULT_COLOR);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";

    img.onload = () => {
      try {
        const size = 32;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);

        // Quantize into 12-bit color buckets and score by frequency, weighted
        // toward saturated pixels, ignoring near-black / near-white.
        const buckets = new Map<
          number,
          { count: number; r: number; g: number; b: number; score: number }
        >();
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          if (a < 125) continue;
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const lum = (max + min) / 2;
          if (lum < 24 || lum > 232) continue;
          const sat = max === 0 ? 0 : (max - min) / max;
          const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
          const weight = 1 + sat * 2.5;
          const cur = buckets.get(key);
          if (cur) {
            cur.count += 1;
            cur.r += r;
            cur.g += g;
            cur.b += b;
            cur.score += weight;
          } else {
            buckets.set(key, { count: 1, r, g, b, score: weight });
          }
        }

        let best: { count: number; r: number; g: number; b: number; score: number } | null = null;
        for (const v of buckets.values()) {
          if (!best || v.score > best.score) best = v;
        }
        if (best && !cancelled) {
          // Average of the winning bucket, darkened slightly for contrast.
          const r = Math.round((best.r / best.count) * 0.92);
          const g = Math.round((best.g / best.count) * 0.92);
          const b = Math.round((best.b / best.count) * 0.92);
          setColor(`rgb(${r}, ${g}, ${b})`);
        }
      } catch {
        if (!cancelled) setColor(DEFAULT_COLOR);
      }
    };
    img.onerror = () => {
      if (!cancelled) setColor(DEFAULT_COLOR);
    };
    img.src = url;

    return () => {
      cancelled = true;
    };
  }, [url]);

  return color;
}
