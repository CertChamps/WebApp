type OnboardingUser = {
  hasCompletedOnboarding?: boolean;
};

export const ONBOARDING_REPLAY_PARAM = "replay";
export const FULL_TUTORIAL_REPLAY_PARAM = "tutorial";

/** Only users explicitly marked incomplete need onboarding (existing users are unaffected). */
export function needsOnboarding(user: OnboardingUser | null | undefined): boolean {
  return user?.hasCompletedOnboarding === false;
}

export function isOnboardingReplay(search: string): boolean {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return params.get(ONBOARDING_REPLAY_PARAM) === "1";
}

export function isFullTutorialReplay(search: string): boolean {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return params.get(FULL_TUTORIAL_REPLAY_PARAM) === "1";
}

export function getOnboardingReplayPath(returnTo = "/user/settings"): string {
  const params = new URLSearchParams({
    [ONBOARDING_REPLAY_PARAM]: "1",
    returnTo: sanitizeReturnPath(returnTo),
  });
  return `/onboarding?${params.toString()}`;
}

/** Replay onboarding from settings (welcome screens + subject picker). */
export function getFullTutorialReplayPath(): string {
  const params = new URLSearchParams({
    [ONBOARDING_REPLAY_PARAM]: "1",
    [FULL_TUTORIAL_REPLAY_PARAM]: "1",
  });
  return `/onboarding?${params.toString()}`;
}

export function sanitizeReturnPath(path: string | null | undefined, fallback = "/user/settings"): string {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return fallback;
  return path;
}

export function getPostAuthPath(
  user: OnboardingUser | null | undefined,
  prevRoute?: string
): string {
  if (needsOnboarding(user)) return "/onboarding";
  if (prevRoute) return prevRoute;
  return "/practice";
}
