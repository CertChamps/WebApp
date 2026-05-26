import { Capacitor } from "@capacitor/core";

/** True on iPad (native iOS app, iPadOS Safari, and iPadOS desktop UA). */
export function isIPad(): boolean {
  if (typeof navigator === "undefined") return false;
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios") return true;
  const ua = navigator.userAgent || "";
  if (/iPad/i.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}
