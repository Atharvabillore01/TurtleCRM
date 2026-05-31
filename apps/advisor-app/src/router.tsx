import { createBrowserRouter } from "react-router-dom";
import { LoginPage }      from "./pages/LoginPage.js";
import { OTPPage }        from "./pages/OTPPage.js";
import { DashboardPage }  from "./pages/DashboardPage.js";
import { ProtectedRoute } from "./components/ProtectedRoute.js";

export const router = createBrowserRouter([
  {
    path:    "/",
    element: <LoginPage />,
  },
  {
    path:    "/verify-otp",
    element: <OTPPage />,
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
], {
  // Vite injects BASE_URL from vite.config.ts `base`. Trim trailing slash
  // because createBrowserRouter expects "/advisor", not "/advisor/".
  basename: (import.meta.env.BASE_URL || "/").replace(/\/$/, "") || "/",
});
