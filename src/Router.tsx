// src/AppRouter.tsx
import { createHashRouter, RouterProvider, Outlet, Navigate, useParams } from "react-router-dom";
import { useEffect } from "react";
import Login from "./pages/login";
import SignUp from "./pages/signup";
import VerifyEmail from "./pages/verifyEmail";
import Questions from "./pages/questions";
import PracticeHub from "./pages/PracticeHub";
import Social from "./pages/social/social";
import Discover from "./pages/discover";
import Games from "./pages/games";
import Whiteboards from "./pages/whiteboards";
import WhiteboardPageView from "./pages/whiteboardPage";
import Navbar from "./components/navbar";
import Replies from "./pages/social/replies";
import Settings from "./pages/settings";
import ManageAccount from "./pages/manageAccount";
import DeckViewer from "./pages/deckViewer";
import AddQuestions from "./pages/addQuestions";
import AdminCanvasViewer from "./pages/adminCanvasViewer";
import DiscoverModeration from "./pages/discoverModeration";
import ProfileViewer from "./pages/profileViewer";
import { ProtectedRoute } from "./components/protectedRoute";
import Progress from "./pages/progress/progress_main";
import SubjectProgressPage from "./pages/progress/SubjectProgressPage";
import Feedback from "./pages/feedback";
import MobileRedirect from "./pages/mobileRedirect";
import PhoneRedirect from "./components/PhoneRedirect";
import SessionTracker from "./components/SessionTracker";
import UsernamePrompt from "./components/prompts/username_prompt";
import ReleaseNotesPrompt from "./components/prompts/release_notes_prompt";
import OnboardingRoute from "./components/onboarding/OnboardingRoute";
import { SpotifyProvider } from "./context/SpotifyContext";
import { SpotifyCallback } from "./components/spotify";

/** Redirects /practice/:id (deck links from social) to /decks/:id */
function PracticeToDeckRedirect() {
  const { id } = useParams();
  return <Navigate to={`/decks/${id}`} replace />;
}

/**
 * Spotify forbids `#` in redirect URIs. OAuth lands on a real path like
 * `/callback?code=...` or `/spotify/callback?code=...`, which Vite serves as
 * index.html. Rewrite into the hash route so createHashRouter can run the
 * token exchange.
 */
function SpotifyOAuthPathBridge() {
  useEffect(() => {
    const { pathname, search, hash } = window.location;
    const normalized = pathname.replace(/\/$/, "") || "/";
    const isCallbackPath =
      normalized.endsWith("/callback") || normalized.endsWith("/spotify/callback");
    if (!isCallbackPath || !search) return;
    // Already on the hash callback — nothing to do.
    if (hash.startsWith("#/spotify/callback")) return;
    window.location.replace(`${window.location.origin}/#/spotify/callback${search}`);
  }, []);
  return null;
}

function RootLayout() {
  // SpotifyProvider is mounted app-wide so playback and auth persist across
  // navigation (music keeps playing when switching pages) and both the sidebar
  // tab and the floating mini-player share one session.
  return (
    <SpotifyProvider>
      <SpotifyOAuthPathBridge />
      <SessionTracker />
      <PhoneRedirect />
      <Outlet />
      <UsernamePrompt />
      <ReleaseNotesPrompt />
    </SpotifyProvider>
  );
}


const router = createHashRouter([
  {
    element: <RootLayout />,
    children: [
      { path: "/", element: <SignUp /> },
      { path: "/login", element: <Login /> },
      { path: "/verify-email", element: <VerifyEmail /> },
      { path: "/spotify/callback", element: <SpotifyCallback /> },
      {
        path: "/onboarding",
        element: (
          <ProtectedRoute allowOnboardingIncomplete>
            <OnboardingRoute />
          </ProtectedRoute>
        ),
      },

      // Protected routes
      {
        path: "/practice",
        element: (
          <ProtectedRoute>
            <div className="page-with-sidebar flex flex-1 min-w-0 min-h-0 w-full h-full overflow-hidden">
              <Navbar />
              <PracticeHub />
            </div>
          </ProtectedRoute>
        ),
      },
      {
        path: "/practice/session",
        element: (
          <ProtectedRoute>
            <div className="page-with-sidebar flex flex-1 min-w-0 min-h-0 w-full h-full overflow-hidden">
              <Navbar />
              <Questions />
            </div>
          </ProtectedRoute>
        ),
      },
      {
        path: "/practice/:id",
        element: (
          <ProtectedRoute>
            <PracticeToDeckRedirect />
          </ProtectedRoute>
        ),
      },
  {
    path: "/decks",
    element: (
      <ProtectedRoute>
        <Navigate to="/practice" replace />
      </ProtectedRoute>
    ),
  },
  {
    path: "/decks/my-decks",
    element: (
      <ProtectedRoute>
        <Navigate to="/practice" replace />
      </ProtectedRoute>
    ),
  },
  {
    path: "/whiteboards",
    element: (
      <ProtectedRoute>
        <div className="page-with-sidebar flex flex-1 min-w-0 min-h-0 w-full h-full overflow-hidden">
          <Navbar />
          <Whiteboards />
        </div>
      </ProtectedRoute>
    ),
  },
  {
    path: "/whiteboards/page/:pageId",
    element: (
      <ProtectedRoute>
        <div className="page-with-sidebar flex flex-1 min-w-0 min-h-0 w-full h-full overflow-hidden">
          <Navbar />
          <WhiteboardPageView />
        </div>
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
        <div className="page-with-sidebar flex flex-1 min-w-0 min-h-0 w-full h-full overflow-hidden">
          <Navbar />
          <Progress />
        </div>
      </ProtectedRoute>
    ),
  },
  {
    path: "/progress/subject/:subject/:level",
    element: (
      <ProtectedRoute>
        <div className="page-with-sidebar flex flex-1 min-w-0 min-h-0 w-full h-full overflow-hidden">
          <Navbar />
          <SubjectProgressPage />
        </div>
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
    path: "/discover",
    element: (
      <ProtectedRoute>
        <div className="page-with-sidebar flex flex-1 min-w-0 min-h-0 w-full h-full overflow-hidden">
          <Navbar />
          <Discover />
        </div>
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
    path: "/admin/canvas-viewer",
    element: (
      <ProtectedRoute>
        <div className="page-with-sidebar flex flex-1 min-w-0 min-h-0 w-full h-full overflow-hidden">
          <Navbar />
          <AdminCanvasViewer />
        </div>
      </ProtectedRoute>
    ),
  },
  {
    path: "/admin/discover-moderation",
    element: (
      <ProtectedRoute>
        <div className="page-with-sidebar flex flex-1 min-w-0 min-h-0 w-full h-full overflow-hidden">
          <Navbar />
          <DiscoverModeration />
        </div>
      </ProtectedRoute>
    ),
  },
  {
    path: "/feedback",
    element: (
      <ProtectedRoute>
        <>
          <Navbar />
          <Feedback />
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
    path: "/user/manage-account",
    element: (
      <ProtectedRoute>
        <>
          <Navbar />
          <ManageAccount />
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
