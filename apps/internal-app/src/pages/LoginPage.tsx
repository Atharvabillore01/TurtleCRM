import { Navigate } from "react-router-dom";
import { TurtleLogo, LoadingSpinner } from "@turtle/ui";
import { GoogleOAuthButton } from "../components/GoogleOAuthButton.js";
import { useAuth } from "../hooks/useAuth.js";

export function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-brand-900">
        <LoadingSpinner size={32} label="" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-brand-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">

          <div className="flex justify-center mb-6">
            <TurtleLogo size={52} />
          </div>

          <h1 className="text-xl font-bold text-gray-900 mb-1">
            Turtle Internal Portal
          </h1>
          <p className="text-sm text-gray-500 mb-8">
            Sign in with your Turtle Google Workspace account
          </p>

          <GoogleOAuthButton />

          <p className="mt-6 text-xs text-gray-400">
            Only authorised Turtle Corporate accounts can access this portal.
          </p>
        </div>

        <p className="text-center text-xs text-gray-500 mt-4">
          Internal use only · Turtle Corporate
        </p>
      </div>
    </div>
  );
}
