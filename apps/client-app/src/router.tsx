import { createBrowserRouter } from "react-router-dom";
import { LoginPage }     from "./pages/LoginPage.js";
import { OTPPage }       from "./pages/OTPPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
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
]);
