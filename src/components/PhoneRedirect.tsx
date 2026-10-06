import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";

export default function PhoneRedirect() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const width = window.innerWidth;
    const touch = navigator.maxTouchPoints > 0;
    const nativeIPad = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios" &&
      (/iPad/i.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

    const publicOrAuthPage = ["/", "/login", "/forgot-password", "/verify-email", "/onboarding", "/practice", "/discover", "/mobileRedirect"].includes(location.pathname);
    if (touch && width <= 600 && !nativeIPad && !publicOrAuthPage) {
      navigate("/mobileRedirect");
    }
  }, [navigate, location]);

  return null;
}
