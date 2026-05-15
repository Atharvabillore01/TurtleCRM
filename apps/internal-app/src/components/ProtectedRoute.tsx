import { Outlet } from "react-router-dom";
// import { Navigate } from "react-router-dom";
// import { useAuth } from "../hooks/useAuth.js";

export function ProtectedRoute() {
  // AUTH DISABLED FOR FRONTEND DEVELOPMENT
  // const { isAuthenticated } = useAuth();
  // return isAuthenticated ? <Outlet /> : <Navigate to="/" replace />;
  return <Outlet />;
}
