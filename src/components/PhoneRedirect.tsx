import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export default function PhoneRedirect() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const width = window.innerWidth;
    const touch = navigator.maxTouchPoints > 0;

    if (touch && width <= 600) {
      navigate("/mobileRedirect");
    }
  }, [navigate, location]);

  return null;
}