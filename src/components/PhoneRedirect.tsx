import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export default function PhoneRedirect() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const width = window.innerWidth;
    const touch = navigator.maxTouchPoints > 0;

    const publicOrAuthPage = ["/", "/login", "/forgot-password", "/verify-email", "/onboarding", "/practice", "/discover", "/mobileRedirect"].includes(location.pathname);
    if (touch && width <= 600 && !publicOrAuthPage) {
      navigate("/mobileRedirect");
    }
  }, [navigate, location]);

  return null;
}
