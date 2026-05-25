import { Capacitor } from "@capacitor/core";
import { getBlob, getDownloadURL, ref } from "firebase/storage";
import { storage } from "../../firebase";
import { fetchPdfBytes } from "./nativeHttp";
import { isValidPdfBlob } from "./pdfBlobUtils";

const FETCH_TIMEOUT_MS = 120_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

/**
 * Download a Firebase Storage object as a Blob.
 * Primary path: Firebase getBlob (same as before caching work — reliable with Storage auth).
 * On native, falls back to signed URL + Capacitor HTTP if getBlob fails.
 */
export async function fetchStorageBlob(storagePath: string): Promise<Blob> {
  if (!storagePath?.trim()) {
    throw new Error("Missing storage path for paper PDF");
  }

  const pathRef = ref(storage, storagePath);

  try {
    const blob = await withTimeout(getBlob(pathRef), FETCH_TIMEOUT_MS, "Storage getBlob");
    if (await isValidPdfBlob(blob)) return blob;
    console.warn("[fetchStorageBlob] getBlob returned non-PDF bytes", storagePath);
  } catch (getBlobErr) {
    if (!Capacitor.isNativePlatform()) throw getBlobErr;
    console.warn("[fetchStorageBlob] getBlob failed, trying download URL", getBlobErr);
  }

  if (Capacitor.isNativePlatform()) {
    const url = await getDownloadURL(pathRef);
    const ab = await withTimeout(fetchPdfBytes(url), FETCH_TIMEOUT_MS, "PDF download");
    const blob = new Blob([ab], { type: "application/pdf" });
    if (!(await isValidPdfBlob(blob))) {
      throw new Error("Downloaded file is not a valid PDF");
    }
    return blob;
  }

  throw new Error("Failed to load paper PDF from storage");
}
