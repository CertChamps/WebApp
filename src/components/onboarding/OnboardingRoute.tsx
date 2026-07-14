import { useContext } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { UserContext } from "../../context/UserContext";
import { useUserProfileReady } from "../../hooks/useUserProfileReady";
import { isOnboardingReplay, needsOnboarding, sanitizeReturnPath } from "../../lib/onboarding";
import ProfileLoadingScreen from "./ProfileLoadingScreen";
import OnboardingFlow from "../../pages/onboarding/OnboardingFlow";

export default function OnboardingRoute() {
  const { user } = useContext(UserContext);
  const profile = useUserProfileReady();
  const [searchParams] = useSearchParams();
  const isReplay = isOnboardingReplay(`?${searchParams.toString()}`);

  if (!profile.ready) {
    return <ProfileLoadingScreen />;
  }

  if (!needsOnboarding(user) && !isReplay) {
    return <Navigate to="/practice" replace />;
  }

  return (
    <OnboardingFlow
      isReplay={isReplay}
      returnTo={sanitizeReturnPath(searchParams.get("returnTo"), "/user/settings")}
    />
  );
}
