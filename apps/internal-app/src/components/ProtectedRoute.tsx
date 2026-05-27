import { Outlet, Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";
import { LoadingSpinner } from "@turtle/ui";

export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner size={32} label="" />
      </div>
    );
  }

  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
}
