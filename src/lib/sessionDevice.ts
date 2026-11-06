import { Capacitor } from "@capacitor/core";

export type SessionDeviceCategory =
  | "ipad_app"
  | "mobile_app"
  | "ipad_web"
  | "mobile_web"
  | "desktop_web";

type DeviceInput = {
  native: boolean;
  nativePlatform: string;
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  screenShortest: number;
};

export function classifySessionDevice(input: DeviceInput): SessionDeviceCategory {
  const isIpad =
    /iPad/i.test(input.userAgent) ||
    (input.platform === "MacIntel" && input.maxTouchPoints > 1) ||
    (input.native && input.nativePlatform === "ios" && input.screenShortest >= 700);

  if (input.native) return isIpad ? "ipad_app" : "mobile_app";
  if (isIpad) return "ipad_web";

  const isPhone =
    /iPhone|iPod/i.test(input.userAgent) ||
    (/Android/i.test(input.userAgent) && /Mobile/i.test(input.userAgent)) ||
    /webOS|BlackBerry|IEMobile|Opera Mini/i.test(input.userAgent) ||
    (input.maxTouchPoints > 0 && input.screenShortest > 0 && input.screenShortest < 700);
  return isPhone ? "mobile_web" : "desktop_web";
}

export function getSessionDevice(): { category: SessionDeviceCategory; platform: string } {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { category: "desktop_web", platform: "web" };
  }
  const native = Capacitor.isNativePlatform();
  const nativePlatform = Capacitor.getPlatform();
  return {
    category: classifySessionDevice({
      native,
      nativePlatform,
      userAgent: navigator.userAgent || "",
      platform: navigator.platform || "",
      maxTouchPoints: navigator.maxTouchPoints || 0,
      screenShortest: Math.min(window.screen.width, window.screen.height),
    }),
    platform: native ? nativePlatform : "web",
  };
}

export function sessionDeviceLabel(value: unknown): string {
  if (value === "ipad_app") return "iPad app";
  if (value === "mobile_app") return "Mobile app";
  if (value === "ipad_web") return "iPad web";
  if (value === "mobile_web") return "Mobile web";
  if (value === "desktop_web") return "Web";
  return "Unknown device";
}

