import { createBrowserRouter } from "react-router-dom";
import { LoginPage }         from "./pages/LoginPage.js";
import { OAuthCallbackPage } from "./pages/OAuthCallbackPage.js";
import { DashboardPage }     from "./pages/DashboardPage.js";
import { AutofillPage }      from "./pages/AutofillPage.js";
import { AppLayout }         from "./components/AppLayout.js";
import { ProtectedRoute }    from "./components/ProtectedRoute.js";

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
          { path: "/dashboard", element: <DashboardPage /> },
          { path: "/autofill",  element: <AutofillPage /> },
        ],
      },
    ],
  },
]);
