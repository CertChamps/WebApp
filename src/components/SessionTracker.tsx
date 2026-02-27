import { useContext } from "react";
import { useLocation } from "react-router-dom";
import { UserContext } from "../context/UserContext";
import { useSessionTracking } from "../hooks/useSessionTracking";

const AUTH_PATHS = ["/", "/login", "/signup", "/verify-email"];

/** Invisible component that tracks study sessions when user is logged in and on app pages. */
export default function SessionTracker() {
  const { user } = useContext(UserContext);
  const { pathname } = useLocation();
  const isAuthPage = AUTH_PATHS.some((p) => pathname === p || pathname === p + "/");
  const uid = !isAuthPage && user?.uid ? user.uid : undefined;
  useSessionTracking(uid);
  return null;
}
