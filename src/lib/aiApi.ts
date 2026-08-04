import { auth } from "../../firebase";

export type AiPurpose = "tutor" | "grading" | "discover" | "whiteboard";
export const METERED_CHAT_API_URL =
  "https://us-central1-certchamps-a7527.cloudfunctions.net/meteredChat";

export class AiRequestError extends Error {
  code: string;
  upgradeRequired: boolean;

  constructor(message: string, code = "AI_REQUEST_FAILED", upgradeRequired = false) {
    super(message);
    this.name = "AiRequestError";
    this.code = code;
    this.upgradeRequired = upgradeRequired;
  }
}

export type AiUsageSummary = {
  month: string;
  resetsAt: string;
  plan: "free" | "ace" | "admin";
  unlimited: boolean;
  usage: Record<AiPurpose, number>;
  limits: Record<AiPurpose, number>;
};

export function createAiUsageId(prefix: AiPurpose): string {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

export async function authenticatedAiFetch(
  url: string,
  body: Record<string, unknown>,
  purpose: AiPurpose,
  usageId = createAiUsageId(purpose),
  options: { signal?: AbortSignal } = {},
): Promise<Response> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("Sign in again to use AI.");
  }
  const idToken = await currentUser.getIdToken();
  return fetch(url, {
    method: "POST",
    signal: options.signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ ...body, purpose, usageId }),
  });
}

export async function aiResponseError(
  response: Response,
  fallback: string,
): Promise<Error> {
  const data = await response.json().catch(() => ({})) as {
    error?: string;
    code?: string;
    upgradeRequired?: boolean;
  };
  return new AiRequestError(
    data.error || fallback,
    data.code,
    data.upgradeRequired === true,
  );
}

export async function fetchAiUsage(): Promise<AiUsageSummary> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Sign in again to view your usage.");
  const idToken = await currentUser.getIdToken();
  const response = await fetch(
    "https://us-central1-certchamps-a7527.cloudfunctions.net/aiUsage",
    {
      method: "GET",
      headers: { Authorization: `Bearer ${idToken}` },
      cache: "no-store",
    },
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error || "Could not load usage.");
  }
  return response.json() as Promise<AiUsageSummary>;
}
