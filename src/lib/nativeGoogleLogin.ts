import { Capacitor } from "@capacitor/core";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
  type UserCredential,
} from "firebase/auth";
import { auth } from "../../firebase";

/**
 * Single Google sign-in entry point for the whole app.
 *
 * - On native iOS / Android: opens the OS-level Google account picker
 *   via @capgo/capacitor-social-login, then exchanges the returned
 *   idToken for a Firebase credential.
 * - On web: keeps the existing signInWithPopup() flow.
 *
 * Returns the standard Firebase UserCredential in both cases so the
 * rest of the app doesn't need to know which platform it's on.
 */

const GOOGLE_WEB_CLIENT_ID = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID as
  | string
  | undefined;
const GOOGLE_IOS_CLIENT_ID = import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID as
  | string
  | undefined;

let socialLoginInitialized = false;

async function initializeNativeGoogle(): Promise<void> {
  if (socialLoginInitialized) return;

  if (!GOOGLE_IOS_CLIENT_ID) {
    throw new Error(
      "Missing VITE_GOOGLE_IOS_CLIENT_ID — set it in your .env so the native plugin can initialize."
    );
  }

  const { SocialLogin } = await import("@capgo/capacitor-social-login");

  await SocialLogin.initialize({
    google: {
      iOSClientId: GOOGLE_IOS_CLIENT_ID,
      iOSServerClientId: GOOGLE_WEB_CLIENT_ID,
      webClientId: GOOGLE_WEB_CLIENT_ID,
      mode: "online",
    },
  });

  socialLoginInitialized = true;
}

async function signInWithGoogleNative(): Promise<UserCredential> {
  await initializeNativeGoogle();

  const { SocialLogin } = await import("@capgo/capacitor-social-login");

  const response = await SocialLogin.login({
    provider: "google",
    options: { scopes: ["email", "profile"] },
  });

  const result = response.result as {
    idToken?: string | null;
    accessToken?: { token?: string | null } | null;
  };

  const idToken = result?.idToken ?? null;
  const accessToken = result?.accessToken?.token ?? null;

  if (!idToken && !accessToken) {
    throw new Error("Native Google sign-in returned no usable token.");
  }

  const credential = GoogleAuthProvider.credential(idToken, accessToken);
  return signInWithCredential(auth, credential);
}

async function signInWithGoogleWeb(): Promise<UserCredential> {
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
}

export async function signInWithGoogle(): Promise<UserCredential> {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios") {
    return signInWithGoogleNative();
  }
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
    return signInWithGoogleNative();
  }
  return signInWithGoogleWeb();
}
