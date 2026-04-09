import { createBrowserRouter } from "react-router-dom";
import { LoginPage }         from "./pages/LoginPage.js";
import { OAuthCallbackPage } from "./pages/OAuthCallbackPage.js";
import { DashboardPage }     from "./pages/DashboardPage.js";
import { ProtectedRoute }    from "./components/ProtectedRoute.js";

export const router = createBrowserRouter([
  {
    path:    "/",
    element: <LoginPage />,
  },
  {
    path:    "/auth/callback",
    element: <OAuthCallbackPage />,
  },
  {
    path:    "/auth/error",
    element: <OAuthCallbackPage />,
  },
  {
    element:  <ProtectedRoute />,
    children: [
      {
        path:    "/dashboard",
        element: <DashboardPage />,
      },
    ],
  },
]);
