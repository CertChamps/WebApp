import { createBrowserRouter, RouterProvider } from 'react-router-dom';

// ============ IMPORTS FOR PAGE COMPONENTS ============ //
import Login from './pages/login';
import Questions from './pages/questions';
import Social from './pages/social';


// ================= ROUTES ================= // 
/* Connect a url to a component to be rendered in the app */
const router = createBrowserRouter([
  {
    path: '/',
    element: <Login />,
  },
  {
    path: '/questions',
    element: <Questions />,
  },
  {
    path: '/social',
    element: <Social />,
  },
]);

// =============== ROUTER COMPONENT ============== // 
export default function AppRouter() {
  return <RouterProvider router={router} />;
}
