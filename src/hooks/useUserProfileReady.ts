import { useContext } from "react";
import { auth } from "../../firebase";
import { UserContext } from "../context/UserContext";

export function useUserProfileReady() {
  const { user, authReady } = useContext(UserContext);
  const firebaseUser = auth.currentUser;

  if (!authReady) return { ready: false, isAuthenticated: !!firebaseUser };

  if (!firebaseUser) {
    return { ready: true, isAuthenticated: false };
  }

  if (!user?.uid || user.uid !== firebaseUser.uid) {
    return { ready: false, isAuthenticated: true };
  }

  return { ready: true, isAuthenticated: true };
}
