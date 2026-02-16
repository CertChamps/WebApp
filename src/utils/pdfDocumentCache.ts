import { getDocument } from "pdfjs-dist";

const MAX_DOCUMENTS = 10;

type PDFDoc = Awaited<ReturnType<typeof getDocument>["promise"]>;
type CacheEntry = { blob: Blob; promise: Promise<PDFDoc> };
let docCache: CacheEntry[] = [];

/**
 * Load a PDF document from a Blob. Caches by blob reference so the same blob
 * is only parsed once (shared across usePaperSnapshot, PdfRegionView, etc.).
 * LRU eviction keeps memory bounded.
 */
export function getDocumentCached(blob: Blob): Promise<PDFDoc> {
  const i = docCache.findIndex((e) => e.blob === blob);
  if (i >= 0) {
    const [entry] = docCache.splice(i, 1);
    docCache.push(entry);
    return entry.promise;
  }
  const promise = blob
    .arrayBuffer()
    .then((ab) => getDocument(ab).promise)
    .catch((err) => {
      docCache = docCache.filter((e) => e.blob !== blob);
      throw err;
    });
  docCache.push({ blob, promise });
  if (docCache.length > MAX_DOCUMENTS) docCache.shift();
  return promise;
}
