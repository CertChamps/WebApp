import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Login from './pages/login';
import Questions from './pages/questions';
import Social from './pages/social/social';
import Games from './pages/games';
import Navbar from './components/navbar';
import Replies from './pages/social/replies';
import QReplies from './pages/social/q_replies';

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
  { path: '/social/q_replies', element: (
    <>
      <Navbar />
      <QReplies />
    </>
  ),},
  { path: '/games', element: (
    <>
      <Navbar />
      <Games />
    </>
  ),},
]);

export default function AppRouter() {
  return <RouterProvider router={router} />;
}