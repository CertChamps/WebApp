import { Capacitor } from "@capacitor/core";
import {
  OAuthProvider,
  signInWithPopup,
  signInWithCredential,
  type UserCredential,
} from "firebase/auth";
import { auth } from "../../firebase";

/**
 * Single Sign in with Apple entry point for the whole app.
 *
 * - On native iOS / Android (Capacitor): opens the OS-level Apple sign-in
 *   sheet via @capgo/capacitor-social-login, then exchanges the returned
 *   identity token for a Firebase credential.
 * - On web (incl. iPad Safari): uses Firebase's signInWithPopup with the
 *   Apple OAuth provider.
 *
 * Returns the standard Firebase UserCredential in both cases so callers
 * don't need to know which platform they're on.
 *
 * IMPORTANT — Apple nonce flow (native only):
 *   Apple expects a SHA-256 hash of the nonce, while Firebase needs the
 *   raw (unhashed) nonce to verify the JWT. We generate a random raw nonce,
 *   send the SHA-256 hash to Apple, and pass the raw value to Firebase.
 *   Firebase's web popup flow handles the nonce internally.
 */

let socialLoginInitialized = false;

async function initializeNativeApple(): Promise<void> {
  if (socialLoginInitialized) return;

  console.log("[AppleAuth] init starting", {
    platform: Capacitor.getPlatform(),
  });

  const { SocialLogin } = await import("@capgo/capacitor-social-login");

  // On iOS we want the Apple JWT returned directly to the app rather than
  // bounced through a backend, so redirectUrl must be an empty string.
  await SocialLogin.initialize({
    apple: {
      redirectUrl: "",
    },
  });

  socialLoginInitialized = true;
  console.log("[AppleAuth] init complete");
}

/** Generates a URL-safe random string for the Apple nonce. */
function generateNonceString(length = 32): string {
  const charset =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._";
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += charset[randomValues[i] % charset.length];
  }
  return result;
}

/** SHA-256 hex digest of the input string (used as the hashed nonce sent to Apple). */
async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function describeError(err: unknown): string {
  if (!err) return "unknown (no error object)";
  if (err instanceof Error) {
    const code = (err as any).code;
    return code ? `${code}: ${err.message}` : err.message;
  }
  if (typeof err === "string") return err;
  try {
    const anyErr = err as any;
    const code = anyErr.code ?? anyErr.errorCode;
    const msg = anyErr.message ?? anyErr.errorMessage ?? JSON.stringify(anyErr);
    return code ? `${code}: ${msg}` : msg;
  } catch {
    return String(err);
  }
}

async function signInWithAppleNative(): Promise<UserCredential> {
  console.log("[AppleAuth] signInWithAppleNative() called");
  await initializeNativeApple();

  const { SocialLogin } = await import("@capgo/capacitor-social-login");

  // Generate raw nonce + hashed nonce for Apple/Firebase verification.
  const rawNonce = generateNonceString();
  const hashedNonce = await sha256Hex(rawNonce);

  // ---- Stage 1: native Apple sign-in sheet ----
  let response;
  try {
    console.log("[AppleAuth] calling SocialLogin.login");
    response = await SocialLogin.login({
      provider: "apple",
      options: {
        scopes: ["email", "name"],
        nonce: hashedNonce,
      },
    });
    console.log("[AppleAuth] SocialLogin.login returned");
  } catch (err) {
    const detail = describeError(err);
    console.error("[AppleAuth] SocialLogin.login FAILED", detail, err);
    throw new Error(`Native Apple sign-in failed: ${detail}`);
  }

  const result = response.result as {
    idToken?: string | null;
    profile?: { email?: string | null; givenName?: string | null; familyName?: string | null };
  };

  const idToken = result?.idToken ?? null;
  console.log("[AppleAuth] tokens received", { hasIdToken: !!idToken });

  if (!idToken) {
    throw new Error("Native Apple sign-in returned no usable identity token.");
  }

  // ---- Stage 2: exchange for Firebase credential ----
  try {
    const provider = new OAuthProvider("apple.com");
    const credential = provider.credential({ idToken, rawNonce });
    console.log("[AppleAuth] signing in to Firebase with credential");
    const userCredential = await signInWithCredential(auth, credential);
    console.log("[AppleAuth] Firebase sign-in OK", userCredential.user.uid);

    // Apple returns the user's name only on the very first sign-in. If we
    // got one, set it on the Firebase user so downstream code can display
    // a sensible default.
    try {
      const fullName = [result?.profile?.givenName, result?.profile?.familyName]
        .filter(Boolean)
        .join(" ")
        .trim();
      if (fullName && !userCredential.user.displayName) {
        const { updateProfile } = await import("firebase/auth");
        await updateProfile(userCredential.user, { displayName: fullName });
      }
    } catch (nameErr) {
      console.warn("[AppleAuth] failed to set Apple displayName", nameErr);
    }

    return userCredential;
  } catch (err) {
    const detail = describeError(err);
    console.error(
      "[AppleAuth] Firebase signInWithCredential FAILED",
      detail,
      err
    );
    throw new Error(`Firebase rejected Apple credential: ${detail}`);
  }
}

async function signInWithAppleWeb(): Promise<UserCredential> {
  const provider = new OAuthProvider("apple.com");
  provider.addScope("email");
  provider.addScope("name");
  // Force account chooser each time so users on shared devices see the prompt.
  provider.setCustomParameters({ locale: "en" });
  return signInWithPopup(auth, provider);
}

export async function signInWithApple(): Promise<UserCredential> {
  const platform = Capacitor.getPlatform();
  const isNative = Capacitor.isNativePlatform();
  console.log("[AppleAuth] signInWithApple()", { platform, isNative });

  if (isNative && (platform === "ios" || platform === "android")) {
    return signInWithAppleNative();
  }
  return signInWithAppleWeb();
}
