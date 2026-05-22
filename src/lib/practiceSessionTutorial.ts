export type PracticeSessionTutorialStep = 1 | 2 | 3 | 4;

export const PENDING_PRACTICE_SESSION_TUTORIAL_KEY = "pending-practice-session-tutorial";

/** Set when the user opens a prediction from stage 3 of the onboarding tutorial. */
export function markPendingPracticeSessionTutorial(): void {
  try {
    sessionStorage.setItem(PENDING_PRACTICE_SESSION_TUTORIAL_KEY, "1");
  } catch {
    // ignore storage errors
  }
}

/** Returns true once if the practice session tutorial should auto-start at step 1. */
export function consumePendingPracticeSessionTutorial(): boolean {
  try {
    if (sessionStorage.getItem(PENDING_PRACTICE_SESSION_TUTORIAL_KEY) !== "1") return false;
    sessionStorage.removeItem(PENDING_PRACTICE_SESSION_TUTORIAL_KEY);
    return true;
  } catch {
    return false;
  }
}
