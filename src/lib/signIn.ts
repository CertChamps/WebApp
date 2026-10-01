export function safeAppPath(value: unknown, fallback = "/practice"): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\r\n]/.test(value)) return fallback;
  if (["/", "/login", "/signup", "/forgot-password", "/verify-email"].includes(value.split(/[?#]/)[0])) return fallback;
  return value;
}

export function publicPage(path: string): { path: string; label: string } {
  if (path === "/discover" || path.startsWith("/discover?")) {
    const [pathname, search] = safeAppPath(path, "/discover").split("?");
    const params = new URLSearchParams(search);
    params.delete("share");
    params.delete("incomingShare");
    return { path: pathname + (params.size ? `?${params}` : ""), label: "Discover" };
  }
  return { path: path.startsWith("/practice?") || path === "/practice" ? safeAppPath(path) : "/practice", label: "Practice Hub" };
}

export function signInPath(feature: string, returnTo: string, backTo = returnTo): string {
  const page = publicPage(backTo);
  return `/login?${new URLSearchParams({ feature, returnTo: safeAppPath(returnTo), backTo: page.path }).toString()}`;
}

export function signInDetails(search: string, state?: { prevRoute?: string } | null) {
  const params = new URLSearchParams(search);
  const returnTo = safeAppPath(params.get("returnTo") ?? state?.prevRoute);
  const back = publicPage(params.get("backTo") ?? returnTo);
  return { feature: params.get("feature"), returnTo, back };
}

export function featureForPath(path: string): string {
  if (path.startsWith("/whiteboards")) return "Whiteboards";
  if (path.startsWith("/progress")) return "Progress";
  if (path.startsWith("/user/manage-account")) return "Manage account";
  if (path.startsWith("/user")) return "Settings";
  if (path.startsWith("/feedback")) return "Feedback";
  if (path.startsWith("/viewProfile")) return "Profiles";
  if (path.startsWith("/social") || path.startsWith("/post")) return "Community";
  if (path.startsWith("/practice/session")) return "Practice session";
  return "this feature";
}
