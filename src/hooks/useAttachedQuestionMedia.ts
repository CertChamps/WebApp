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
  loading: boolean;
  error: string | null;
};

const EMPTY: AttachedQuestionMedia = {
  questionImages: [],
  markingSchemeImages: [],
  loading: false,
  error: null,
};

function toPageImages(urls: string[], labelPrefix: string): ZoomablePageImage[] {
  return urls.map((src, i) => ({ src, alt: `${labelPrefix} ${i + 1}`, key: `${labelPrefix}-${i}` }));
}

async function resolveStorageUrls(paths: string[]): Promise<string[]> {
  const results = await Promise.allSettled(paths.map((p) => getDownloadURL(ref(storage, p))));
  return results
    .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
    .map((r) => r.value);
}

/**
 * Resolves an attached question (bank paper / bank image / custom upload) into
 * renderable question + marking scheme images for the whiteboard Page View.
 */
export function useAttachedQuestionMedia(attachment: AttachedQuestion | null): AttachedQuestionMedia {
  const [state, setState] = useState<AttachedQuestionMedia>(EMPTY);
  const attachmentId = attachment?.id ?? null;

  useEffect(() => {
    if (!attachment || !attachmentId) {
      setState(EMPTY);
      return;
    }

    let cancelled = false;
    setState({ questionImages: [], markingSchemeImages: [], loading: true, error: null });

    (async () => {
      let questionUrls: string[] = [];
      let markingUrls: string[] = [];

      if (attachment.source === "custom" && attachment.custom) {
        const { questionPath, questionType, markingSchemePath, markingSchemeType } = attachment.custom;
        if (questionType === "pdf") {
          const blob = await fetchStorageBlob(questionPath);
          questionUrls = await renderPdfPages(blob);
        } else {
          questionUrls = await resolveStorageUrls([questionPath]);
        }
        if (markingSchemePath) {
          try {
            if (markingSchemeType === "pdf") {
              const msBlob = await fetchStorageBlob(markingSchemePath);
              markingUrls = await renderPdfPages(msBlob);
            } else {
              markingUrls = await resolveStorageUrls([markingSchemePath]);
            }
          } catch {
            markingUrls = [];
          }
        }
      } else if (attachment.source === "bank" && attachment.bank) {
        const bank = attachment.bank;
        if (bank.kind === "image") {
          questionUrls = await resolveStorageUrls(bank.imagePaths ?? []);
          markingUrls = await resolveStorageUrls(bank.markingSchemePaths ?? []);
        } else {
          if (bank.paperStoragePath) {
            const blob = await fetchStorageBlob(bank.paperStoragePath);
            if (bank.pageRegions && bank.pageRegions.length > 0) {
              questionUrls = await renderPdfRegions(blob, bank.pageRegions);
            } else if (bank.pageRange) {
              questionUrls = await renderPdfPages(blob, bank.pageRange);
            } else {
              questionUrls = await renderPdfPages(blob, [1, 1]);
            }
          }
          if (bank.markingSchemePageRange && bank.year != null) {
            try {
              const msPath = `marking-schemes/leaving-cert/${bank.subject}/${bank.level}-level/${bank.year}ms.pdf`;
              const msBlob = await fetchStorageBlob(msPath);
              markingUrls = await renderPdfPages(msBlob, [
                bank.markingSchemePageRange.start,
                bank.markingSchemePageRange.end,
              ]);
            } catch {
              markingUrls = [];
            }
          }
        }
      }

      if (cancelled) return;
      setState({
        questionImages: toPageImages(questionUrls, attachment.label || "Question"),
        markingSchemeImages: toPageImages(markingUrls, `${attachment.label || "Question"} marking scheme`),
        loading: false,
        error: null,
      });
    })().catch((err) => {
      if (cancelled) return;
      console.error("[useAttachedQuestionMedia] failed:", err);
      setState({
        questionImages: [],
        markingSchemeImages: [],
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load question",
      });
    });

    return () => {
      cancelled = true;
    };
  }, [attachmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  return state;
}
