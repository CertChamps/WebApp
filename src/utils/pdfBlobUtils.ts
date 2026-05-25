/** True if blob looks like a PDF (%PDF header). */
export async function isValidPdfBlob(blob: Blob): Promise<boolean> {
  if (!blob || blob.size < 5) return false;
  try {
    const head = await blob.slice(0, 5).text();
    return head.startsWith("%PDF");
  } catch {
    return false;
  }
}
