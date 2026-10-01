import { useContext, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserContext } from "../context/UserContext";
import { getStorage, ref, getDownloadURL } from "firebase/storage";
import { setDoc, doc, getDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";
import { isAdminUid } from "../constants/adminUids";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
} from "firebase/auth";
import { auth } from "../../firebase";
import { signInWithGoogle } from "../lib/nativeGoogleLogin";
import { signInWithApple } from "../lib/nativeAppleLogin";
import { setPaymentsUser } from "../lib/payments";
import { getPostAuthPath } from "../lib/onboarding";
import { setFavouriteSubjectIds } from "../data/practiceHubSubjects";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
} from "../lib/legal";

type authprops = { prevRoute?: string; observeSession?: boolean };
let manualAuthInProgress = false;

function getCurrentAppPath(): string {
  const hashPath = window.location.hash.replace(/^#/, "");
  if (hashPath) return hashPath.split("?")[0];
  return window.location.pathname;
}

function parseOnboardingStatus(value: unknown): boolean | undefined {
  if (value === true) return true;
  if (value === false) return false;
  return undefined;
}

export default function useAuthentication(props?: authprops) {
  const { setUser, setAuthReady } = useContext(UserContext);
  const [error, setError] = useState<any>({});
  
  const storage = getStorage();
  const navigate = useNavigate();
  const setupRef = useRef<typeof userSetup | null>(null);

  /** ==================== CREATE / SETUP USER ==================== */
  const createUser = async (
    uid: string,
    username: string,
    email: string,
    emailVerified: boolean = false,
    legalAccepted: boolean = false,
  ) => {
    // FALLBACK: If "crown.png" is missing, use a placeholder to prevent crash
    let imageUrl = "";
    try {
        imageUrl = await getDownloadURL(ref(storage, "crown.png"));
    } catch (e) {
        console.warn("Default image 'crown.png' not found. Using placeholder.");
        imageUrl = "https://via.placeholder.com/150"; 
    }

    const userData = {
      uid,
      username,
      email,
      picture: "crown.png",
      friends: [],
      pendingFriends: [],
      notifications: [],
      rank: 0,
      xp: 0,
      streak: 0,
      highestStreak: 0,
      savedQuestions: [],
      emailVerified,
      isAdmin: isAdminUid(uid, email),
      isPro: false,
      releaseNotesSeenVersions: [],
      hasCompletedOnboarding: false,
      studyingSubjects: [],
      ...(legalAccepted ? {
        termsVersion: CURRENT_TERMS_VERSION,
        termsAcceptedAt: serverTimestamp(),
        privacyVersion: CURRENT_PRIVACY_VERSION,
        privacyAcknowledgedAt: serverTimestamp(),
      } : {}),
    };

    if (auth.currentUser?.uid !== uid) return;
    // 1. Set Context
    setUser({
      ...userData,
      picture: imageUrl,
      decks: [],
      isPro: false,
      hasCompletedOnboarding: false,
      studyingSubjects: [],
      termsVersion: legalAccepted ? CURRENT_TERMS_VERSION : undefined,
      privacyVersion: legalAccepted ? CURRENT_PRIVACY_VERSION : undefined,
    });

    // 2. Write to DB
    await setDoc(doc(db, "user-data", uid), userData);

    // Session restoration leaves public pages in place; auth entry routes redirect.
    if (props?.observeSession) return;
    // 3. Redirect
    if (!emailVerified) {
      navigate(`/verify-email?${new URLSearchParams({ returnTo: props?.prevRoute ?? "/practice" })}`);
    } else {
      navigate(getPostAuthPath({ hasCompletedOnboarding: false }, props?.prevRoute));
    }
  };

/** ==================== SETUP EXISTING / NEW USER ==================== */
const userSetup = async (uid: string, username: string, email: string, legalAccepted: boolean = false) => {
  const currentPath = getCurrentAppPath();
  console.log("1. Starting userSetup. Current Path:", currentPath);

  try {

    const userDoc = await getDoc(doc(db, "user-data", uid));
    const currentUser = auth.currentUser;
    if (currentUser?.uid !== uid) return;
    const isEmailVerified = currentUser?.emailVerified ?? false;

    if (userDoc.exists()) {
      const userData = userDoc.data();
      if (legalAccepted) {
        await setDoc(doc(db, "user-data", uid), {
          termsVersion: CURRENT_TERMS_VERSION,
          termsAcceptedAt: serverTimestamp(),
          privacyVersion: CURRENT_PRIVACY_VERSION,
          privacyAcknowledgedAt: serverTimestamp(),
        }, { merge: true });
      }
      
      // Safe Image Loading
      let imageUrl = "";
      const picPath = userData.picture || "crown.png";
      try {
        imageUrl = await getDownloadURL(ref(storage, picPath));
      } catch (e) {
        imageUrl = "https://via.placeholder.com/150";
      }

      // const decksRef = collection(db, "user-data", uid, "decks");
      // const deckSnapshot = await getDocs(decksRef);
      // const decks = deckSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

      const studyingSubjects = Array.isArray(userData.studyingSubjects)
        ? userData.studyingSubjects.filter((x): x is string => typeof x === "string")
        : [];
      const hasFavouriteSubjects =
        userData != null && Object.prototype.hasOwnProperty.call(userData, "favouriteSubjects");
      const favouriteSubjects = Array.isArray(userData.favouriteSubjects)
        ? userData.favouriteSubjects.filter((x): x is string => typeof x === "string")
        : [];
      let hasCompletedOnboarding = parseOnboardingStatus(userData.hasCompletedOnboarding);
      try {
        const cachedRaw = localStorage.getItem("USER");
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          if (cached?.uid === userDoc.id && cached?.hasCompletedOnboarding === true) {
            hasCompletedOnboarding = true;
          }
        }
      } catch {
        // ignore cache read errors
      }

      if (hasFavouriteSubjects) {
        setFavouriteSubjectIds(favouriteSubjects, { syncRemote: false });
      } else if (studyingSubjects.length > 0) {
        setFavouriteSubjectIds(studyingSubjects);
      }

      if (auth.currentUser?.uid !== uid) return;
      setUser({
        uid: userDoc.id,
        username: userData.username || username,
        email: userData.email || email,
        picture: imageUrl,
        friends: userData.friends || [],
        pendingFriends: userData.pendingFriends || [],
        notifications: userData.notifications || [],
        rank: userData.rank || 0,
        xp: userData.xp || 0,
        streak: userData.streak || 0,
        highestStreak: userData.highestStreak || 0,
        savedQuestions: userData.savedQuestions || [],
        //decks,
        emailVerified: isEmailVerified,
        isAdmin: userData.isAdmin === true || isAdminUid(userDoc.id, userData.email || email),
        isPro: userData.isPro === true,
        subscriptionPeriodEnd: typeof userData.subscriptionPeriodEnd === "number" ? userData.subscriptionPeriodEnd : undefined,
        subscriptionPlan: userData.subscriptionPlan,
        subscriptionCancelAtPeriodEnd: userData.subscriptionCancelAtPeriodEnd === true,
        billingSubscriptions: userData.billingSubscriptions ?? {},
        paymentProvider:
          userData.paymentProvider === "stripe" || userData.paymentProvider === "apple"
            ? userData.paymentProvider
            : undefined,
        stripeCustomerId: typeof userData.stripeCustomerId === "string" ? userData.stripeCustomerId : undefined,
        appleOriginalTransactionId:
          typeof userData.appleOriginalTransactionId === "string"
            ? userData.appleOriginalTransactionId
            : undefined,
        releaseNotesSeenVersions: Array.isArray(userData.releaseNotesSeenVersions)
          ? userData.releaseNotesSeenVersions
          : [],
        hasCompletedOnboarding,
        studyingSubjects,
        termsVersion: legalAccepted ? CURRENT_TERMS_VERSION : userData.termsVersion,
        privacyVersion: legalAccepted ? CURRENT_PRIVACY_VERSION : userData.privacyVersion,
      });

      console.log("2. Context Set. Verified:", isEmailVerified);

      // Identify the user to RevenueCat so any Apple IAP webhook fires
      // with our Firebase UID in `app_user_id`. No-op on web / Android.
      void setPaymentsUser(uid);

      // Log daily login for activity heatmap
      try {
        const now = new Date();
        const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        await setDoc(doc(db, "user-data", uid, "daily-logins", dateKey), {
          timestamp: serverTimestamp(),
        }, { merge: true });
      } catch (e) {
        console.warn("Failed to log daily login:", e);
      }

      if (props?.observeSession) return { hasCompletedOnboarding };

      // --- NAVIGATION LOGIC ---
      if (currentUser?.providerData.some((provider) => provider.providerId === "password") && !isEmailVerified) {
        console.log("3. Redirecting to verify-email");
        navigate(`/verify-email?${new URLSearchParams({ returnTo: props?.prevRoute ?? "/practice" })}`);
        return { hasCompletedOnboarding };
      }

      const authPages = ["/login", "/signup", "/"];
      const isAuthPage = authPages.some(
        (path) => getCurrentAppPath() === path || getCurrentAppPath() === `${path}/`
      );

      if (isAuthPage) {
        const destination = getPostAuthPath({ hasCompletedOnboarding }, props?.prevRoute);
        console.log("3. Redirecting to", destination);
        navigate(destination);
      } else {
        console.log("3. Already on a protected page, no redirect needed.");
      }

      return { hasCompletedOnboarding };

    } else {
      console.log("2. New user detected, creating profile...");
      await createUser(uid, username, email, isEmailVerified, legalAccepted);
      return { hasCompletedOnboarding: false as const };
    }
  } catch (err) {
    console.error("CRITICAL ERROR in userSetup:", err);
  }

  return undefined;
};

/** ==================== AUTH LISTENER ==================== */
setupRef.current = userSetup;
useEffect(() => {
  if (!props?.observeSession) return;
  const unsubscribe = onAuthStateChanged(auth, async (user) => {
    // Manual sign-in creates/hydrates its own profile, including signup details.
    if (user && user.email && !manualAuthInProgress) {
      await setupRef.current?.(user.uid, user.displayName || "", user.email);
    } else if (!user) {
      setUser({});
    }
    setAuthReady(true);
  });
  return () => unsubscribe();
}, [props?.observeSession, setAuthReady, setUser]);


  /** ==================== GOOGLE LOGIN ====================
   * Single entry point — signInWithGoogle() picks the native plugin on
   * iOS/Android Capacitor and the existing web popup on the browser.
   */
  const loginWithGoogle = async (legalAccepted: boolean = false) => {
    manualAuthInProgress = true;
    try {
      const result = await signInWithGoogle();
      const user = result.user;

      if (user && user.email) {
        await userSetup(user.uid, user.displayName ?? "newUser", user.email, legalAccepted);
      }
    } catch (err: any) {
      // Capacitor / Firebase errors have non-enumerable props, so a bare
      // console.error(err) prints `{}`. Pull the useful bits out by hand.
      const code = err?.code ?? err?.errorCode;
      const message = err?.message ?? err?.errorMessage ?? String(err);
      console.error("Google Login Error:", { code, message, raw: err });
      setError((prev: any) => ({
        ...prev,
        general: code ? `Google login failed (${code}): ${message}` : `Google login failed: ${message}`,
      }));
    } finally {
      manualAuthInProgress = false;
    }
  };

  /** ==================== APPLE LOGIN ====================
   * Single entry point — signInWithApple() picks the native plugin on
   * iOS/Android Capacitor and the Firebase web popup on the browser
   * (including iPad Safari).
   */
  const loginWithApple = async (legalAccepted: boolean = false) => {
    manualAuthInProgress = true;
    try {
      const result = await signInWithApple();
      const user = result.user;

      if (user && user.email) {
        await userSetup(user.uid, user.displayName ?? "newUser", user.email, legalAccepted);
      } else if (user) {
        // Apple users may opt out of sharing their email. We still create a
        // Firebase session, but we can't proceed without one in our schema.
        setError((prev: any) => ({
          ...prev,
          general:
            "Apple did not share an email with us. Please retry and choose 'Share My Email'.",
        }));
      }
    } catch (err: any) {
      const code = err?.code ?? err?.errorCode;
      const message = err?.message ?? err?.errorMessage ?? String(err);
      console.error("Apple Login Error:", { code, message, raw: err });
      // Silently swallow user-cancelled flows (no need to scare the user).
      const cancelled =
        code === "auth/popup-closed-by-user" ||
        code === "auth/cancelled-popup-request" ||
        /cancel/i.test(message ?? "");
      if (!cancelled) {
        setError((prev: any) => ({
          ...prev,
          general: code
            ? `Apple login failed (${code}): ${message}`
            : `Apple login failed: ${message}`,
        }));
      }
    } finally {
      manualAuthInProgress = false;
    }
  };

  /** ==================== SIGN UP EMAIL ==================== */
  const signUpWithEmail = async (
    username: string,
    email: string,
    password: string,
    captchaToken: string,
    legalAccepted: boolean = false,
  ) => {
    setError({});

    // --- CAPTCHA CHECKS RESTORED ---
    if (!captchaToken) {
      setError((prev: any) => ({ ...prev, general: "Please complete CAPTCHA first." }));
      return;
    }
    if (!legalAccepted) {
      setError((prev: any) => ({ ...prev, legal: "You must agree before creating an account." }));
      return;
    }

    // 1️⃣ Verify captcha server-side
    try {
        const verify = await fetch(
          "https://us-central1-certchamps-a7527.cloudfunctions.net/verifyCaptcha",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: captchaToken }),
          }
        ).then((res) => res.json());

        if (!verify.success) {
          setError((prev: any) => ({ ...prev, general: "Captcha verification failed." }));
          return;
        }
    } catch (err) {
        setError((prev: any) => ({ ...prev, general: "Captcha server error." }));
        return;
    }

    // 2️⃣ Validate username
    if (username.length < 2) return setError((prev: any) => ({ ...prev, username: "Too short" }));
    if (username.length > 10) return setError((prev: any) => ({ ...prev, username: "Too long" }));
    // -------------------------------

    try {
      manualAuthInProgress = true;
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      if (user) {
        await sendEmailVerification(user);
        // 3️⃣ Create user in Firestore
        await createUser(user.uid, username, email, false, true);
      }
    } catch (err: any) {
      const code = err.code;
      if (code === "auth/email-already-in-use")
        setError((prev: any) => ({ ...prev, email: "Email already in use." }));
      else if (code === "auth/weak-password")
        setError((prev: any) => ({ ...prev, password: "Password too weak." }));
      else setError((prev: any) => ({ ...prev, general: "Something went wrong. Try again." }));
    } finally {
      manualAuthInProgress = false;
    }
  };

  /** ==================== SIGN IN EMAIL ==================== */
  const signInWithEmail = async (email: string, password: string) => {
    setError({});
    manualAuthInProgress = true;
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      if (user) {
        await userSetup(user.uid, "", email);
      }
    } catch (err: any) {
      setError((prev: any) => ({ ...prev, general: "Invalid email or password." }));
    } finally {
      manualAuthInProgress = false;
    }
  };

  /** ==================== EXISTING USERS ==================== */
  // useEffect(() => {
  //   const unsubscribe = onAuthStateChanged(auth, async (user) => {
  //     // Only run auto-setup if we aren't manually logging in right now
  //     if (user && user.email && user.uid && !isLoggingIn) {
  //        try {
  //          await userSetup(user.uid, "", user.email);
  //        } catch(e) {
  //          console.log("Auto-login setup failed", e);
  //        }
  //     }
  //   });
  //   return () => unsubscribe();
  // }, [isLoggingIn]); 

  return { loginWithGoogle, loginWithApple, signUpWithEmail, signInWithEmail, userSetup, error, setError };
}
