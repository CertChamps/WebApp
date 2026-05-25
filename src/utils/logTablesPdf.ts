/** Shared log-tables PDF blob so we only fetch once per app session. */
let cachedBlob: Blob | null = null;
let loadPromise: Promise<Blob | null> | null = null;

/** Absolute URL so PDF.js works in Capacitor (relative paths crash WKWebView). */
export function getLogTablesAssetUrl(): string {
  if (typeof window === "undefined") return "/assets/log_tables.pdf";
  const base = import.meta.env.BASE_URL ?? "/";
  const path = base.endsWith("/") ? `${base}assets/log_tables.pdf` : `${base}/assets/log_tables.pdf`;
  return new URL(path, window.location.href).href;
}

export function getLogTablesPdfBlob(): Promise<Blob | null> {
  if (cachedBlob) return Promise.resolve(cachedBlob);
  if (loadPromise) return loadPromise;
  loadPromise = fetch(getLogTablesAssetUrl())
    .then((res) => (res.ok ? res.blob() : null))
    .then((blob) => {
      cachedBlob = blob;
      return blob;
    })
    .catch((err) => {
      console.warn("[logTablesPdf] fetch failed", err);
      return null;
    })
    .finally(() => {
      loadPromise = null;
    });
  return loadPromise;
}

/** Warm cache in background (e.g. when opening questions / past-paper mode). */
export function preloadLogTablesPdf(): void {
  void getLogTablesPdfBlob();
}
