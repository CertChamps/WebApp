export type PredictionModalTutorialStep = 1 | 2;
export type PredictionTutorialStep = PredictionModalTutorialStep | 3;

export const PENDING_PREDICTION_TUTORIAL_KEY = "pending-prediction-tutorial";
export const PREDICTION_TUTORIAL_QUERY_PARAM = "predictionTutorial";

/** Set when onboarding completes or a full tutorial replay finishes. */
export function markPendingPredictionTutorial(): void {
  try {
    sessionStorage.setItem(PENDING_PREDICTION_TUTORIAL_KEY, "1");
  } catch {
    // ignore storage errors
  }
}

/** Returns true once if a prediction tutorial should auto-start. */
export function consumePendingPredictionTutorial(): boolean {
  try {
    if (sessionStorage.getItem(PENDING_PREDICTION_TUTORIAL_KEY) !== "1") return false;
    sessionStorage.removeItem(PENDING_PREDICTION_TUTORIAL_KEY);
    return true;
  } catch {
    return false;
  }
}

export function getPracticeHubWithTutorialPath(): string {
  return `/practice?${PREDICTION_TUTORIAL_QUERY_PARAM}=1`;
}

export function shouldStartPredictionTutorial(search: string): boolean {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return params.get(PREDICTION_TUTORIAL_QUERY_PARAM) === "1";
}

export function stripPredictionTutorialQuery(search: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  params.delete(PREDICTION_TUTORIAL_QUERY_PARAM);
  const next = params.toString();
  return next ? `?${next}` : "";
}
