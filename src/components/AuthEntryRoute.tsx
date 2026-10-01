import type { ReactElement } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useContext } from "react";
import { auth } from "../../firebase";
import { UserContext } from "../context/UserContext";
import { useUserProfileReady } from "../hooks/useUserProfileReady";
import { getPostAuthPath } from "../lib/onboarding";
import { signInDetails } from "../lib/signIn";
import ProfileLoadingScreen from "./onboarding/ProfileLoadingScreen";

export default function AuthEntryRoute({ children }: { children: ReactElement }) {
  const profile = useUserProfileReady();
  const { user } = useContext(UserContext);
  const location = useLocation();
  if (!profile.ready) return <ProfileLoadingScreen />;
  if (!profile.isAuthenticated) return children;
  const currentUser = auth.currentUser;
  const requiresVerification = currentUser?.providerData.some((provider) => provider.providerId === "password") && !currentUser.emailVerified;
  const { returnTo } = signInDetails(location.search, location.state);
  return <Navigate replace to={requiresVerification ? `/verify-email?${new URLSearchParams({ returnTo })}` : getPostAuthPath(user, returnTo)} />;
}
