import { useEffect, useState } from "react";
import { getDownloadURL, ref } from "firebase/storage";
import { storage } from "../../firebase";
import { fetchStorageBlob } from "../utils/fetchStorageBlob";
import { renderPdfPages, renderPdfRegions } from "../utils/pdfPagesToImages";
import type { AttachedQuestion } from "../data/whiteboards";
import type { ZoomablePageImage } from "../components/questions/ZoomableQuestionImage";

export type AttachedQuestionMedia = {
  questionImages: ZoomablePageImage[];
  markingSchemeImages: ZoomablePageImage[];
  audioPath: string | null;
  audioStartSec: number;
  audioEndSec: number | null;
  audioStartLabel: string | null;
  loading: boolean;
  /** True while marking scheme pages are still resolving after the question is ready. */
  markingLoading: boolean;
  error: string | null;
};

const EMPTY: AttachedQuestionMedia = {
  questionImages: [],
  markingSchemeImages: [],
  audioPath: null,
  audioStartSec: 0,
  audioEndSec: null,
  audioStartLabel: null,
  loading: false,
  markingLoading: false,
  error: null,
};

/** Leaner PDF raster for whiteboard seeding — sharp enough at ~55% viewport width. */
const WB_PDF_RENDER = {
  scale: 1.35,
  mimeType: "image/jpeg" as const,
  quality: 0.82,
};

type CacheEntry = Omit<AttachedQuestionMedia, "loading" | "markingLoading" | "error"> & {
  markingComplete: boolean;
};

const mediaCache = new Map<string, CacheEntry>();
const mediaInflight = new Map<string, Promise<CacheEntry>>();

function toPageImages(urls: string[], labelPrefix: string): ZoomablePageImage[] {
  return urls.map((src, i) => ({ src, alt: `${labelPrefix} ${i + 1}`, key: `${labelPrefix}-${i}` }));
}

async function resolveStorageUrls(paths: string[]): Promise<string[]> {
  const results = await Promise.allSettled(paths.map((p) => getDownloadURL(ref(storage, p))));
  return results
    .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
    .map((r) => r.value);
}

async function loadQuestionUrls(attachment: AttachedQuestion): Promise<{
  questionUrls: string[];
  audioPath: string | null;
  audioStartSec: number;
  audioEndSec: number | null;
  audioStartLabel: string | null;
}> {
  let questionUrls: string[] = [];
  let audioPath: string | null = null;
  let audioStartSec = 0;
  let audioEndSec: number | null = null;
  let audioStartLabel: string | null = null;

  if (attachment.source === "custom" && attachment.custom) {
    const { questionPath, questionType } = attachment.custom;
    if (questionType === "pdf") {
      const blob = await fetchStorageBlob(questionPath);
      questionUrls = await renderPdfPages(blob, undefined, WB_PDF_RENDER);
    } else {
      questionUrls = await resolveStorageUrls([questionPath]);
    }
  } else if (attachment.source === "bank" && attachment.bank) {
    const bank = attachment.bank;
    if (bank.kind === "image") {
      questionUrls = await resolveStorageUrls(bank.imagePaths ?? []);
      const path = bank.audioPath?.trim();
      if (path) {
        audioPath = path;
        audioStartSec =
          typeof bank.audioStartSec === "number" && Number.isFinite(bank.audioStartSec)
            ? Math.max(0, bank.audioStartSec)
            : 0;
        audioEndSec =
          typeof bank.audioEndSec === "number" &&
          Number.isFinite(bank.audioEndSec) &&
          bank.audioEndSec > audioStartSec
            ? bank.audioEndSec
            : null;
        audioStartLabel = bank.audioStartLabel?.trim() || null;
      }
    } else if (bank.paperStoragePath) {
      const blob = await fetchStorageBlob(bank.paperStoragePath);
      if (bank.pageRegions && bank.pageRegions.length > 0) {
        questionUrls = await renderPdfRegions(blob, bank.pageRegions, WB_PDF_RENDER);
      } else if (bank.pageRange) {
        questionUrls = await renderPdfPages(blob, bank.pageRange, WB_PDF_RENDER);
      } else {
        questionUrls = await renderPdfPages(blob, [1, 1], WB_PDF_RENDER);
      }
    }
  }

  return { questionUrls, audioPath, audioStartSec, audioEndSec, audioStartLabel };
}

/** Resolve only the visible question pages for one-off canvas attachment placement. */
export async function resolveAttachedQuestionImageUrls(
  attachment: AttachedQuestion
): Promise<string[]> {
  const cached = mediaCache.get(attachment.id);
  if (cached?.questionImages.length) {
    return cached.questionImages.map((image) => image.src).filter(Boolean);
  }
  const result = await loadQuestionUrls(attachment);
  if (result.questionUrls.length === 0) {
    throw new Error("No question image available");
  }
  return result.questionUrls;
}

async function loadMarkingUrls(attachment: AttachedQuestion): Promise<string[]> {
  try {
    if (attachment.source === "custom" && attachment.custom?.markingSchemePath) {
      const { markingSchemePath, markingSchemeType } = attachment.custom;
      if (markingSchemeType === "pdf") {
        const msBlob = await fetchStorageBlob(markingSchemePath);
        return renderPdfPages(msBlob, undefined, WB_PDF_RENDER);
      }
      return resolveStorageUrls([markingSchemePath]);
    }
    if (attachment.source === "bank" && attachment.bank) {
      const bank = attachment.bank;
      if (bank.kind === "image") {
        return resolveStorageUrls(bank.markingSchemePaths ?? []);
      }
      if (bank.markingSchemePageRange && bank.year != null) {
        const msPath = `marking-schemes/leaving-cert/${bank.subject}/${bank.level}-level/${bank.year}ms.pdf`;
        const msBlob = await fetchStorageBlob(msPath);
        return renderPdfPages(
          msBlob,
          [bank.markingSchemePageRange.start, bank.markingSchemePageRange.end],
          WB_PDF_RENDER
        );
      }
    }
  } catch {
    return [];
  }
  return [];
}

/**
 * Resolves an attached question into renderable images for the whiteboard.
 * Question pages resolve first (and are cached); marking scheme loads in the background.
 */
export function useAttachedQuestionMedia(
  attachment: AttachedQuestion | null,
  /** Bump to force a reload after invalidateAttachedQuestionMedia. */
  reloadToken = 0
): AttachedQuestionMedia {
  const [state, setState] = useState<AttachedQuestionMedia>(EMPTY);
  const attachmentId = attachment?.id ?? null;

  useEffect(() => {
    if (!attachment || !attachmentId) {
      setState(EMPTY);
      return;
    }

    let cancelled = false;
    const cached = mediaCache.get(attachmentId);
    if (cached?.questionImages.length) {
      setState({
        ...cached,
        loading: false,
        markingLoading: !cached.markingComplete,
        error: null,
      });
      if (cached.markingComplete) return;
    } else {
      setState({ ...EMPTY, loading: true });
    }

    const run = async () => {
      let entry = mediaCache.get(attachmentId);
      if (!entry || entry.questionImages.length === 0) {
        const existing = mediaInflight.get(attachmentId);
        const loadPromise =
          existing ??
          (async () => {
            const q = await loadQuestionUrls(attachment);
            if (q.questionUrls.length === 0) {
              throw new Error("No question image available");
            }
            const next: CacheEntry = {
              questionImages: toPageImages(q.questionUrls, attachment.label || "Question"),
              markingSchemeImages: [],
              audioPath: q.audioPath,
              audioStartSec: q.audioStartSec,
              audioEndSec: q.audioEndSec,
              audioStartLabel: q.audioStartLabel,
              markingComplete: false,
            };
            mediaCache.set(attachmentId, next);
            return next;
          })().finally(() => {
            mediaInflight.delete(attachmentId);
          });

        if (!existing) mediaInflight.set(attachmentId, loadPromise);
        entry = await loadPromise;
      }

      if (cancelled) return;
      setState({
        ...entry,
        loading: false,
        markingLoading: !entry.markingComplete,
        error: null,
      });

      if (entry.markingComplete) return;

      const markingUrls = await loadMarkingUrls(attachment);
      if (cancelled) return;
      const updated: CacheEntry = {
        ...entry,
        markingSchemeImages: toPageImages(
          markingUrls,
          `${attachment.label || "Question"} marking scheme`
        ),
        markingComplete: true,
      };
      mediaCache.set(attachmentId, updated);
      setState({
        ...updated,
        loading: false,
        markingLoading: false,
        error: null,
      });
    };

    void run().catch((err) => {
      if (cancelled) return;
      console.error("[useAttachedQuestionMedia] failed:", err);
      mediaCache.delete(attachmentId);
      setState({
        ...EMPTY,
        loading: false,
        markingLoading: false,
        error: err instanceof Error ? err.message : "Failed to load question",
      });
    });

    return () => {
      cancelled = true;
    };
  }, [attachmentId, reloadToken]); // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}

/** Drop cached media so the next hook mount reloads (e.g. retry after failure). */
export function invalidateAttachedQuestionMedia(attachmentId: string): void {
  mediaCache.delete(attachmentId);
  mediaInflight.delete(attachmentId);
}
