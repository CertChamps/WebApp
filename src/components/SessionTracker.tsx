import { useContext, useMemo } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { UserContext } from "../context/UserContext";
import { useSessionTracking } from "../hooks/useSessionTracking";

const AUTH_PATHS = ["/", "/login", "/signup", "/verify-email"];

/** Invisible component that tracks study sessions when user is logged in and on app pages. */
export default function SessionTracker() {
  const { user } = useContext(UserContext);
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const isAuthPage = AUTH_PATHS.some((p) => pathname === p || pathname === p + "/");
  const uid = !isAuthPage && user?.uid ? user.uid : undefined;

  const subject = useMemo(() => {
    if (pathname === "/practice/session" || pathname === "/practice/session/") {
      return searchParams.get("subject") || undefined;
    }
    return undefined;
  }, [pathname, searchParams]);

  useSessionTracking(uid, subject);
  return null;
}
