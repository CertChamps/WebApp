import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Login from './pages/login';
import Questions from './pages/questions';
import Social from './pages/social/social';
import Games from './pages/games';
import Navbar from './components/navbar';
import Replies from './pages/social/replies';
import Settings from './pages/settings';
import DeckViewer from './pages/deckViewer';
import ProfileViewer from './pages/profileViewer';

const router = createBrowserRouter([
  { path: '/', element: ( <Login /> ), },
  { path: '/practice', element: (
    <>
      <Navbar />
      <Questions />
    </>
  ),},
  { path: '/social/social', element: (
    <>
      <Navbar />
      <Social />
    </>
  ),},
  { path: '/social/replies', element: (
    <>
      <Navbar />
      <Replies />
    </>
  ),},
  { path: '/games', element: (
    <>
      <Navbar />
      <Games />
    </>
  ),},
  {
    path: '/',
    element: (
      <>
        <Login />
      </>
    ),
  },
  {
    path: '/practice',
    element: (
      <>
        <Navbar />
        <Questions />
      </>
    ),
  },
  {
    path: '/social',
    element: (
      <>
        <Navbar />
        <Social />
      </>
    ),
  },
  {
    path: '/games',
    element: (
      <>
        <Navbar />
        <Games />
      </>
    ),
  },
    {
    path: '/user/settings',
    element: (
      <>
        <Navbar />
        <Settings />
      </>
    ),
  },
  {
    path: '/decks/:userID/:id/*',
    element: (
        <DeckViewer />
    ),
  },
  {
    path: '/viewProfile/:userID',
    element: (
        <ProfileViewer />
    ),
  },
  {
    path: '/post/:id',
    element: (
      <>
        <Navbar />
        <Replies />
      </>
    ),
  },
  
]);

export default function AppRouter() {
  return <RouterProvider router={router} />;
}