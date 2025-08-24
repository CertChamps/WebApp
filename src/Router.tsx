import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Login from './pages/login';
import Questions from './pages/questions';
import Social from './pages/social';
import Games from './pages/games';
import Navbar from './components/navbar';
import Settings from './pages/settings';

const router = createBrowserRouter([
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
]);

export default function AppRouter() {
  return <RouterProvider router={router} />;
}