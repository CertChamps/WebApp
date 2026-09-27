import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { useLocation } from "react-router-dom";
import { PRIVACY_URL } from "../lib/legal";

const MEASUREMENT_ID = "G-7SKFDGYV8J";
const CONSENT_KEY = "certchamps-analytics-consent";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function pagePath(location: { pathname: string; search: string; hash: string }) {
  return `${location.pathname}${location.search}${location.hash}`;
}

function isLocalHost() {
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

function configAnalytics(path: string) {
  if (typeof window.gtag !== "function") return;
  window.gtag("config", MEASUREMENT_ID, {
    anonymize_ip: true,
    debug_mode: isLocalHost(),
    page_title: document.title,
    page_location: window.location.href,
    page_path: path,
  });
}

function trackPageView(path: string) {
  if (typeof window.gtag !== "function") return;
  window.gtag("event", "page_view", {
    page_title: document.title,
    page_location: window.location.href,
    page_path: path,
    send_to: MEASUREMENT_ID,
  });
}

function setAnalyticsConsent(granted: boolean, path: string) {
  try {
    localStorage.setItem(CONSENT_KEY, granted ? "granted" : "denied");
  } catch {
    /* ignore quota / private mode */
  }
  if (typeof window.gtag !== "function") return;
  window.gtag("consent", "update", {
    analytics_storage: granted ? "granted" : "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  if (granted) configAnalytics(path);
}

export default function GoogleAnalytics() {
  const location = useLocation();
  const [showBanner, setShowBanner] = useState(false);
  const isNative = Capacitor.isNativePlatform();
  const skipFirstView = useRef(true);

  useEffect(() => {
    if (isNative) return;
    try {
      setShowBanner(!localStorage.getItem(CONSENT_KEY));
    } catch {
      setShowBanner(true);
    }
  }, [isNative]);

  useEffect(() => {
    if (isNative) return;
    if (skipFirstView.current) {
      skipFirstView.current = false;
      return;
    }
    trackPageView(pagePath(location));
  }, [isNative, location.pathname, location.search, location.hash]);

  if (isNative || !showBanner) return null;

  const choose = (granted: boolean) => {
    setAnalyticsConsent(granted, pagePath(location));
    setShowBanner(false);
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[9000] rounded-xl border-2 color-shadow color-bg p-4 shadow-lg md:left-auto md:right-6 md:max-w-md">
      <p className="text-sm leading-relaxed color-txt-sub">
        We use Google Analytics to understand how the app is used. You can accept or decline
        analytics cookies. See our{" "}
        <a
          href={PRIVACY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold color-txt-accent underline underline-offset-2"
        >
          Privacy Policy
        </a>
        .
      </p>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => choose(false)}
          className="rounded-md px-4 py-2 text-sm font-semibold color-txt-sub transition-opacity hover:opacity-80"
        >
          Decline
        </button>
        <button
          type="button"
          onClick={() => choose(true)}
          className="rounded-md px-4 py-2 text-sm font-bold color-bg-accent color-txt-accent transition-opacity hover:opacity-85"
        >
          Accept
        </button>
      </div>
    </div>
  );
}
