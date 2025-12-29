// src/AppRouter.tsx
import { createHashRouter, RouterProvider } from "react-router-dom";
import Login from "./pages/login";
import SignUp from "./pages/signup";
import Questions from "./pages/questions";
import Social from "./pages/social/social";
import Games from "./pages/games";
import Navbar from "./components/navbar";
import Replies from "./pages/social/replies";
import Settings from "./pages/settings";
import DeckViewer from "./pages/deckViewer";
import Decks from "./pages/decks";
import ProfileViewer from "./pages/profileViewer";
import { ProtectedRoute } from "./components/protectedRoute";
import Progress from "./pages/progress/progress_main";

const router = createHashRouter([
  { path: "/", element: <SignUp /> },
  { path: "/login", element: <Login /> },

  // Protected routes
  {
    path: "/practice",
    element: (
      <ProtectedRoute>
        <>
          <Navbar />
          <Questions />
        </>
      </ProtectedRoute>
    ),
  },
  {
    path: "/practice/:id",
    element: (
      <ProtectedRoute>
        <>
          <Navbar />
          <Questions />
        </>
      </ProtectedRoute>
    ),
  },
  {
    path: "/decks",
    element: (
      <ProtectedRoute>
        <>
          <Navbar />
          <Decks />
        </>
      </ProtectedRoute>
    ),
  },
  {
    path: "/social/social",
    element: (
      <ProtectedRoute>
        <>
          <Navbar />
          <Social />
        </>
      </ProtectedRoute>
    ),
  },
  {
    path: "/progress",
    element: (
      <ProtectedRoute>
        <>
          <Navbar />
          <Progress />
        </>
      </ProtectedRoute>
    ),
  },
  {
    path: "/social/replies",
    element: (
      <ProtectedRoute>
        <>
          <Navbar />
          <Replies />
        </>
      </ProtectedRoute>
    ),
  },
  {
    path: "/games",
    element: (
      <ProtectedRoute>
        <>
          <Navbar />
          <Games />
        </>
      </ProtectedRoute>
    ),
  },
  {
    path: "/user/settings",
    element: (
      <ProtectedRoute>
        <>
          <Navbar />
          <Settings />
        </>
      </ProtectedRoute>
    ),
  },
  {
    path: "/decks/:id/*",
    element: (
      <ProtectedRoute>
        <DeckViewer />
      </ProtectedRoute>
    ),
  },
  {
    path: "/viewProfile/:userID",
    element: (
      <ProtectedRoute>
        <>
          <Navbar />
          <ProfileViewer />
        </>
      </ProtectedRoute>
    ),
  },
  {
    path: "/post/:id",
    element: (
      <ProtectedRoute>
        <>
          <Navbar />
          <Replies />
        </>
      </ProtectedRoute>
    ),
  },

  // If you also want a root login page instead of SignUp, keep one root route only.
  // Remove duplicates from your original file to avoid conflicts.
]);

export default function AppRouter() {
  return (
      <RouterProvider router={router} />
  );
}