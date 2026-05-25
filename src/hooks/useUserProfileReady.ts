import { useContext } from "react";
import { auth } from "../../firebase";
import { UserContext } from "../context/UserContext";

export function useUserProfileReady() {
  const { user } = useContext(UserContext);
  const firebaseUser = auth.currentUser;

  if (!firebaseUser) {
    return { ready: true, isAuthenticated: false };
  }

  if (!user?.uid || user.uid !== firebaseUser.uid) {
    return { ready: false, isAuthenticated: true };
  }

  return { ready: true, isAuthenticated: true };
}
