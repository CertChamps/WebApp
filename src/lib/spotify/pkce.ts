// PKCE (Proof Key for Code Exchange) helpers for the Spotify Authorization
// Code flow. Uses the Web Crypto API — no dependencies, no client secret.

function base64UrlEncode(bytes: ArrayBuffer): string {
  const uint8 = new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < uint8.byteLength; i += 1) {
    binary += String.fromCharCode(uint8[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Generate a cryptographically-random code verifier (43-128 chars). */
export function generateCodeVerifier(length = 96): string {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const random = new Uint8Array(length);
  crypto.getRandomValues(random);
  let verifier = "";
  for (let i = 0; i < length; i += 1) {
    verifier += charset[random[i] % charset.length];
  }
  return verifier;
}

/** SHA-256 the verifier and base64url-encode it to produce the code challenge. */
export async function deriveCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(digest);
}

/** Random opaque value used to protect the OAuth flow against CSRF. */
export function generateState(): string {
  const random = new Uint8Array(16);
  crypto.getRandomValues(random);
  return base64UrlEncode(random.buffer);
}
