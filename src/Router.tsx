// src/AppRouter.tsx
import { createHashRouter, RouterProvider, Outlet } from "react-router-dom";
import Login from "./pages/login";
import SignUp from "./pages/signup";
import VerifyEmail from "./pages/verifyEmail";
import Questions from "./pages/questions";
import Social from "./pages/social/social";
import Games from "./pages/games";
import Navbar from "./components/navbar";
import Replies from "./pages/social/replies";
import Settings from "./pages/settings";
import DeckViewer from "./pages/deckViewer";
import Decks from "./pages/decks";
import MyDecks from "./pages/myDecks";
import AddQuestions from "./pages/addQuestions";
import ProfileViewer from "./pages/profileViewer";
import { ProtectedRoute } from "./components/protectedRoute";
import Progress from "./pages/progress/progress_main";
import Tutorial from "./components/tutorial/Tutorial";
import { useTutorialContext } from "./context/TutorialContext";
import MobileRedirect from "./pages/mobileRedirect";
import PhoneRedirect from "./components/PhoneRedirect";

// Layout component that includes the Tutorial overlay
function RootLayout() {
  const { showTutorial, setShowTutorial, completeTutorial } = useTutorialContext();
  
  return (
    <>
      <PhoneRedirect />
      <Outlet />
      <Tutorial
        isOpen={showTutorial}
        onClose={() => setShowTutorial(false)}
        onComplete={completeTutorial}
      />
    </>
  );
}


const router = createHashRouter([
  {
    element: <RootLayout />,
    children: [
      { path: "/", element: <SignUp /> },
      { path: "/login", element: <Login /> },
      { path: "/verify-email", element: <VerifyEmail /> },

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
    path: "/decks/my-decks",
    element: (
      <ProtectedRoute>
        <>
          <Navbar />
          <MyDecks />
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
    path: "/admin/add-questions",
    element: (
      <ProtectedRoute>
        <>
          <Navbar />
          <AddQuestions />
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
    {
    path: "/mobileRedirect",
    element: (
      <ProtectedRoute>
        <>
          <MobileRedirect/>
        </>
      </ProtectedRoute>
    ),
  },


  // If you also want a root login page instead of SignUp, keep one root route only.
  // Remove duplicates from your original file to avoid conflicts.
    ],
  },
]);

export default function AppRouter() {
  return (
      <RouterProvider router={router} />
  );
}