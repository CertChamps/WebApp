import { useContext, useEffect, useMemo, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { UserContext } from "../context/UserContext";
import { useSessionTracking } from "../hooks/useSessionTracking";
import {
  getLastWhiteboardsSubject,
  WHITEBOARDS_SUBJECT_CHANGED_EVENT,
} from "../data/whiteboards";

const AUTH_PATHS = ["/", "/login", "/signup", "/verify-email"];

function isWhiteboardsPath(pathname: string): boolean {
  return pathname === "/whiteboards" || pathname.startsWith("/whiteboards/");
}

/** Invisible component that tracks study sessions when user is logged in and on app pages. */
export default function SessionTracker() {
  const { user } = useContext(UserContext);
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const isAuthPage = AUTH_PATHS.some((p) => pathname === p || pathname === p + "/");
  const uid = !isAuthPage && user?.uid ? user.uid : undefined;
  const [whiteboardSubject, setWhiteboardSubject] = useState(() => getLastWhiteboardsSubject());

  useEffect(() => {
    if (!isWhiteboardsPath(pathname)) return;
    const sync = () => setWhiteboardSubject(getLastWhiteboardsSubject());
    sync();
    window.addEventListener(WHITEBOARDS_SUBJECT_CHANGED_EVENT, sync);
    return () => window.removeEventListener(WHITEBOARDS_SUBJECT_CHANGED_EVENT, sync);
  }, [pathname]);

  const subject = useMemo(() => {
    if (pathname === "/practice/session" || pathname === "/practice/session/") {
      return searchParams.get("subject") || undefined;
    }
    if (isWhiteboardsPath(pathname)) {
      return whiteboardSubject || undefined;
    }
    return undefined;
  }, [pathname, searchParams, whiteboardSubject]);

  useSessionTracking(uid, subject);
  return null;
}
