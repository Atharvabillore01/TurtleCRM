import { createBrowserRouter } from "react-router-dom";
import { LoginPage }         from "./pages/LoginPage.js";
import { OTPPage }           from "./pages/OTPPage.js";
import { OAuthCallbackPage } from "./pages/OAuthCallbackPage.js";
import { DashboardPage }     from "./pages/DashboardPage.js";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage.js";
import { RegisterPage }      from "./pages/RegisterPage.js";
import { ProtectedRoute }    from "./components/ProtectedRoute.js";

export const router = createBrowserRouter([
  {
    path:    "/",
    element: <LoginPage />,
  },
  {
    path:    "/register",
    element: <RegisterPage />,
  },
  {
    path:    "/verify-otp",
    element: <OTPPage />,
  },
  {
    path:    "/auth/callback",
    element: <OAuthCallbackPage />,
  },
  {
    path:    "/forgot-password",
    element: <ForgotPasswordPage />,
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
