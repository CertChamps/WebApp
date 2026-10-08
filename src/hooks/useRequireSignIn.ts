import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { auth } from "../../firebase";
import { signInPath } from "../lib/signIn";

export function useRequireSignIn() {
  const location = useLocation();
  const navigate = useNavigate();
  return useCallback(async (feature: string, returnTo = location.pathname + location.search) => {
    await auth.authStateReady();
    if (auth.currentUser) return true;
    navigate(signInPath(feature, returnTo, location.pathname + location.search));
    return false;
  }, [location.pathname, location.search, navigate]);
}
