import { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserContext } from "../context/UserContext";
import { getStorage, ref, getDownloadURL } from "firebase/storage";
import { setDoc, doc, getDoc, getDocs, collection, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import {
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
} from "firebase/auth";
import { auth } from "../../firebase";

type authprops = { prevRoute?: string };

export default function useAuthentication(props?: authprops) {
  const { setUser } = useContext(UserContext);
  const [error, setError] = useState<any>({});
  
  // Track if we are currently handling a manual login to prevent the listener from interfering
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const storage = getStorage();
  const navigate = useNavigate();

  /** ==================== CREATE / SETUP USER ==================== */
  const createUser = async (uid: string, username: string, email: string, emailVerified: boolean = false) => {
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
      isPro: false,
    };

    // 1. Set Context
    setUser({ ...userData, picture: imageUrl, decks: [], isPro: false });

    // 2. Write to DB
    await setDoc(doc(db, "user-data", uid), userData);

    // 3. Redirect
    if (!emailVerified) {
      navigate("/verify-email");
    } else {
      props?.prevRoute ? navigate(props.prevRoute) : navigate("/practice");
    }
  };

/** ==================== SETUP EXISTING / NEW USER ==================== */
const userSetup = async (uid: string, username: string, email: string) => {
  const currentPath = window.location.pathname;
  console.log("1. Starting userSetup. Current Path:", currentPath);

  try {

    const userDoc = await getDoc(doc(db, "user-data", uid));
    const currentUser = auth.currentUser;
    const isEmailVerified = currentUser?.emailVerified ?? false;

    if (userDoc.exists()) {
      const userData = userDoc.data();
      
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
        isPro: userData.isPro === true,
      });

      console.log("2. Context Set. Verified:", isEmailVerified);

      // --- NAVIGATION LOGIC ---
      if (!isEmailVerified) {
        console.log("3. Redirecting to verify-email");
        navigate("/verify-email");
      } else {
        // Broaden the check: If we are on ANY auth-related page, move to app
        const authPages = ['/login', '/signup', '/']; 
        const isAuthPage = authPages.some(path => currentPath === path || currentPath === path + '/');

        if (isAuthPage) {
          console.log("3. Redirecting to practice");
          props?.prevRoute ? navigate(props.prevRoute) : navigate("/practice");
        } else {
          console.log("3. Already on a protected page, no redirect needed.");
        }
      }

    } else {
      console.log("2. New user detected, creating profile...");
      await createUser(uid, username, email, isEmailVerified);
    }
  } catch (err) {
    console.error("CRITICAL ERROR in userSetup:", err);
  }
};

/** ==================== AUTH LISTENER ==================== */
useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, async (user) => {
    // We only want the auto-listener to run if the user is NOT in the middle 
    // of a manual Google Login button click.
    if (user && user.email && !isLoggingIn) {
      console.log("Auth State Changed (Auto-Login)");
      await userSetup(user.uid, user.displayName || "", user.email);
    }
  });
  return () => unsubscribe();
}, [isLoggingIn]); // Listener restarts if isLoggingIn changes


  /** ==================== GOOGLE LOGIN ==================== */
  const loginWithGoogle = async () => {
    setIsLoggingIn(true); // Stop auto-listener
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      if (user && user.email) {
          // Await the setup so we know when it's done
          await userSetup(user.uid, user.displayName ?? "newUser", user.email);
      }
    } catch (err: any) {
      console.error("Google Login Error:", err);
      setError((prev: any) => ({ ...prev, general: "Failed to login with Google." }));
    } finally {
        setIsLoggingIn(false);
    }
  };

  /** ==================== SIGN UP EMAIL ==================== */
  const signUpWithEmail = async (
    username: string,
    email: string,
    password: string,
    captchaToken: string
  ) => {
    setError({});

    // --- CAPTCHA CHECKS RESTORED ---
    if (!captchaToken) {
      setError((prev: any) => ({ ...prev, general: "Please complete CAPTCHA first." }));
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
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      if (user) {
        await sendEmailVerification(user);
        // 3️⃣ Create user in Firestore
        await createUser(user.uid, username, email, false);
      }
    } catch (err: any) {
      const code = err.code;
      if (code === "auth/email-already-in-use")
        setError((prev: any) => ({ ...prev, email: "Email already in use." }));
      else if (code === "auth/weak-password")
        setError((prev: any) => ({ ...prev, password: "Password too weak." }));
      else setError((prev: any) => ({ ...prev, general: "Something went wrong. Try again." }));
    }
  };

  /** ==================== SIGN IN EMAIL ==================== */
  const signInWithEmail = async (email: string, password: string) => {
    setError({});
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      if (user) {
        if (!user.emailVerified) {
          await userSetup(user.uid, "", email);
          navigate("/verify-email");
        } else {
          await userSetup(user.uid, "", email);
          props?.prevRoute ? navigate(props.prevRoute) : navigate("/practice");
        }
      }
    } catch (err: any) {
      setError((prev: any) => ({ ...prev, general: "Invalid email or password." }));
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

  return { loginWithGoogle, signUpWithEmail, signInWithEmail, userSetup, error, setError };
}