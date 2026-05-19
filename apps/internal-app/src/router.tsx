import { createBrowserRouter } from "react-router-dom";
import { LoginPage }         from "./pages/LoginPage.js";
import { OAuthCallbackPage } from "./pages/OAuthCallbackPage.js";
import { DashboardPage }     from "./pages/DashboardPage.js";
import { AppLayout }         from "./components/AppLayout.js";
import { ProtectedRoute }    from "./components/ProtectedRoute.js";
import AiValidationPage      from "./routes/AiValidationPage.js";

export const router = createBrowserRouter([
  { path: "/",             element: <LoginPage /> },
  { path: "/auth/callback", element: <OAuthCallbackPage /> },
  { path: "/auth/error",   element: <OAuthCallbackPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: "/dashboard",              element: <DashboardPage /> },
          { path: "/dashboard/ai-validation", element: <AiValidationPage /> },
        ],
      },
    ],
  },
]);
