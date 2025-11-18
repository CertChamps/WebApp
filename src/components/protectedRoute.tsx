// src/auth/ProtectedRoute.tsx
import React, {useContext} from "react";
import { Navigate, useLocation } from "react-router-dom";
import { UserContext } from "../context/UserContext";

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

  return children;
};