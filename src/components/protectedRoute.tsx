import React, { useContext } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { UserContext } from "../context/UserContext";
import { auth } from "../../firebase";
import { useUserProfileReady } from "../hooks/useUserProfileReady";
import { needsOnboarding } from "../lib/onboarding";
import ProfileLoadingScreen from "./onboarding/ProfileLoadingScreen";

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

  if (!profile.isAuthenticated) {
    return (
      <Navigate to="/" state={{ prevRoute: location.pathname }} replace />
    );
  }

  if (!profile.ready) {
    return <ProfileLoadingScreen />;
  }

  const firebaseUser = auth.currentUser;
  const isEmailPasswordUser = firebaseUser?.providerData.some(
    (provider) => provider.providerId === "password"
  );

  if (isEmailPasswordUser && !firebaseUser?.emailVerified) {
    return <Navigate to="/verify-email" replace />;
  }

  if (!allowOnboardingIncomplete && needsOnboarding(user)) {
    return <Navigate to="/onboarding" replace />;
  }

  return children;
};
