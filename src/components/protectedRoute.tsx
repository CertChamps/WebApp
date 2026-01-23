// src/auth/ProtectedRoute.tsx
import React, {useContext} from "react";
import { Navigate, useLocation } from "react-router-dom";
import { UserContext } from "../context/UserContext";
import { auth } from "../../firebase";

type Props = {
  children: React.ReactElement;
};

export const ProtectedRoute: React.FC<Props> = ({ children }) => {
  const { user } = useContext(UserContext);
  const location = useLocation();

  if (!user) {
    // redirect to root ("/"). We include state.from so you can return after login.
    // console.log("No user found, redirecting to login.", location.pathname)
    return <Navigate to="/" state={{ prevRoute: location.pathname }} replace />;
  }

  // Check if user's email is verified (for email/password users)
  // Google users are automatically verified
  const firebaseUser = auth.currentUser;
  const isEmailPasswordUser = firebaseUser?.providerData.some(
    (provider) => provider.providerId === "password"
  );

  // Only require email verification for email/password users
  if (isEmailPasswordUser && !firebaseUser?.emailVerified) {
    // Redirect to verification page if not verified
    return <Navigate to="/verify-email" replace />;
  }

  return children;
};