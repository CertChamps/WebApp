import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export type NativeShareDestination = "question" | "discover";
export type NativeShareKind = "image" | "pdf" | "url";

export type NativeIncomingShare = {
  id: string;
  destination: NativeShareDestination;
  kind: NativeShareKind;
  fileName?: string;
  mimeType?: string;
  fileUrl?: string;
  url?: string;
  title?: string;
  description?: string;
  createdAt: number;
};

type ShareBridgePlugin = {
  getPendingShare(): Promise<{ share: NativeIncomingShare | null }>;
  completeShare(options: { id: string }): Promise<void>;
};

const ShareBridge = registerPlugin<ShareBridgePlugin>("ShareBridge");
const listeners = new Set<() => void>();
let activeShare: NativeIncomingShare | null = null;
let draining = false;

function emit() {
  for (const listener of listeners) listener();
}

export function getIncomingShare(destination?: NativeShareDestination): NativeIncomingShare | null {
  if (!activeShare) return null;
  return !destination || activeShare.destination === destination ? activeShare : null;
}

export function subscribeIncomingShare(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Photos / iOS often labels shares with a UUID or PHAsset id instead of IMG_0587. */
function isOpaqueShareName(value: string | undefined | null): boolean {
  const stem = (value ?? "").replace(/\.[^.]+$/, "").trim();
  if (!stem) return true;
  if (/^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(stem)) return true;
  if (/^[0-9a-f-]{20,}$/i.test(stem) && (stem.match(/-/g) ?? []).length >= 2) return true;
  if (/^[0-9a-f]{16,}$/i.test(stem)) return true;
  return false;
}

function stripExtension(value: string): string {
  return value.replace(/\.[^.]+$/, "").trim();
}

function nameFromPayloadUrl(share: NativeIncomingShare): string | undefined {
  if (!share.fileUrl) return undefined;
  const last = decodeURIComponent(share.fileUrl.split("/").pop() ?? "");
  const prefix = `${share.id}-`;
  const raw = last.startsWith(prefix) ? last.slice(prefix.length) : last;
  return raw || undefined;
}

/** Human title like IMG_0587 — skips UUID / asset-id labels from the share sheet. */
export function incomingShareDisplayName(
  share: NativeIncomingShare,
  file?: Pick<File, "name">
): string {
  const candidates = [share.title, share.fileName, nameFromPayloadUrl(share), file?.name];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const stem = stripExtension(candidate);
    if (stem && !isOpaqueShareName(stem)) return stem;
  }
  return share.kind === "pdf" ? "Shared question" : share.kind === "url" ? "Shared link" : "Shared image";
}

async function drainNativeShare() {
  if (draining || activeShare || Capacitor.getPlatform() !== "ios") return;
  draining = true;
  try {
    const result = await ShareBridge.getPendingShare();
    if (!result.share) return;
    activeShare = result.share;
    emit();
    window.location.hash =
      result.share.destination === "question" ? "#/whiteboards?incomingShare=1" : "#/discover?share=1&incomingShare=1";
  } catch (error) {
    console.warn("[native share] Could not read incoming item:", error);
  } finally {
    draining = false;
  }
}

export async function startNativeShareIntake(): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) return () => undefined;

  const handles: PluginListenerHandle[] = [];
  handles.push(await CapacitorApp.addListener("appUrlOpen", ({ url }) => {
    if (url.startsWith("com.certchamps.app://share")) void drainNativeShare();
  }));
  handles.push(await CapacitorApp.addListener("appStateChange", ({ isActive }) => {
    if (isActive) void drainNativeShare();
  }));
  void drainNativeShare();

  return () => {
    for (const handle of handles) void handle.remove();
  };
}

export async function incomingShareFile(share: NativeIncomingShare): Promise<File> {
  if (!share.fileUrl || share.kind === "url") {
    throw new Error("This shared item does not contain a file.");
  }
  const response = await fetch(Capacitor.convertFileSrc(share.fileUrl));
  if (!response.ok) throw new Error("The shared file could not be opened.");
  const blob = await response.blob();
  const fallbackName = share.kind === "pdf" ? "shared-question.pdf" : "shared-image.jpg";
  const original = share.fileName && !isOpaqueShareName(share.fileName)
    ? share.fileName
    : nameFromPayloadUrl(share);
  const file = new File([blob], original && !isOpaqueShareName(original) ? original : fallbackName, {
    type: share.mimeType || blob.type || (share.kind === "pdf" ? "application/pdf" : "image/jpeg"),
  });
  if (share.kind === "pdf") return file;
  const { normalizeImageFile } = await import("./normalizeImageFile");
  return normalizeImageFile(file);
}

export async function completeIncomingShare(share: NativeIncomingShare): Promise<void> {
  try {
    if (Capacitor.getPlatform() === "ios") {
      await ShareBridge.completeShare({ id: share.id });
    }
  } finally {
    if (activeShare?.id === share.id) {
      activeShare = null;
      emit();
      void drainNativeShare();
    }
  }
}
