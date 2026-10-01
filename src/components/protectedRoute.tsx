import React, { useContext } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { UserContext } from "../context/UserContext";
import { auth } from "../../firebase";
import { useUserProfileReady } from "../hooks/useUserProfileReady";
import { needsOnboarding } from "../lib/onboarding";
import ProfileLoadingScreen from "./onboarding/ProfileLoadingScreen";
import { featureForPath, signInPath } from "../lib/signIn";

type Props = {
  children: React.ReactElement;
  /** Allow access while onboarding is incomplete (e.g. the onboarding route itself). */
  allowOnboardingIncomplete?: boolean;
};

export const ProtectedRoute: React.FC<Props> = ({
  children,
  allowOnboardingIncomplete = false,
}) => {
  const { user } = useContext(UserContext);
  const location = useLocation();
  const profile = useUserProfileReady();

  if (!profile.ready) {
    return <ProfileLoadingScreen />;
  }

  if (!profile.isAuthenticated) {
    return (
      <Navigate to={signInPath(featureForPath(location.pathname), location.pathname + location.search, location.state?.backTo)} replace />
    );
  }

  const firebaseUser = auth.currentUser;
  const isEmailPasswordUser = firebaseUser?.providerData.some(
    (provider) => provider.providerId === "password"
  );

  if (isEmailPasswordUser && !firebaseUser?.emailVerified) {
    return <Navigate to={`/verify-email?${new URLSearchParams({ returnTo: location.pathname + location.search })}`} replace />;
  }

  if (!allowOnboardingIncomplete && needsOnboarding(user)) {
    return <Navigate to={`/onboarding?${new URLSearchParams({ returnTo: location.pathname + location.search })}`} replace />;
  }

  return children;
};
