import { auth } from "../../firebase";
import { isDiscoverVideoUrl } from "./discoverMedia";

export const CAPTURE_WEBSITE_THUMBNAIL_URL =
  "https://us-central1-certchamps-a7527.cloudfunctions.net/captureWebsiteThumbnail";

export async function captureWebsiteThumbnailBlob(
  url: string,
  signal?: AbortSignal
): Promise<Blob | null> {
  if (!url.trim() || isDiscoverVideoUrl(url)) return null;
  const currentUser = auth.currentUser;
  if (!currentUser) return null;

  const idToken = await currentUser.getIdToken();
  const response = await fetch(CAPTURE_WEBSITE_THUMBNAIL_URL, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ url }),
  });
  if (!response.ok) return null;
  const blob = await response.blob();
  if (!blob.type.startsWith("image/") || blob.size < 32) return null;
  return blob;
}
