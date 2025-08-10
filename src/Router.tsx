import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Login from './pages/login';
import Questions from './pages/questions';
import Social from './pages/social';
import Games from './pages/games';
import Navbar from './components/navbar';

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
        <Games/>
      </>
    ),
  },
]);

export default function AppRouter() {
  return <RouterProvider router={router} />;
}