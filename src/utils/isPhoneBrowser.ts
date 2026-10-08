import { Capacitor } from "@capacitor/core";

type PhoneCheckInput = {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  screenShortest: number;
  native: boolean;
};

/** Phones in a mobile browser. iPad, laptops, and the native app stay on the full app. */
export function isPhoneBrowserInput(input: PhoneCheckInput): boolean {
  if (input.native) return false;

  const ua = input.userAgent || "";
  const shortest = input.screenShortest;
  const isIpad =
    /iPad/i.test(ua) ||
    (input.platform === "MacIntel" && input.maxTouchPoints > 1 && shortest >= 700);
  if (isIpad) return false;

  if (/iPhone|iPod/i.test(ua)) return true;
  if (/Android/i.test(ua) && /Mobile/i.test(ua)) return true;
  if (/webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return true;

  return input.maxTouchPoints > 0 && shortest > 0 && shortest < 700;
}

export function isPhoneBrowser(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return isPhoneBrowserInput({
    userAgent: navigator.userAgent || "",
    platform: navigator.platform || "",
    maxTouchPoints: navigator.maxTouchPoints || 0,
    screenShortest: Math.min(window.screen.width, window.screen.height),
    native: Capacitor.isNativePlatform(),
  });
}
