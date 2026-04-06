import { useNavigate } from "react-router-dom";
import { TurtleLogo, LoadingSpinner } from "@turtle/ui";
import { useAuth } from "../hooks/useAuth.js";
import { useState } from "react";

export function DashboardPage() {
  const { logout }        = useAuth();
  const navigate          = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await logout();
    navigate("/", { replace: true });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Topbar */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <TurtleLogo size={36} />
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          aria-busy={loggingOut}
          className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-red-600 transition-colors disabled:opacity-50"
        >
          {loggingOut ? <LoadingSpinner size={16} label="" /> : null}
          {loggingOut ? "Signing out…" : "Sign out"}
        </button>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="text-5xl mb-4">🐢</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Welcome, Client
          </h1>
          <p className="text-gray-500 text-sm">
            You're securely signed in to Turtle Corporate.
          </p>
        </div>
      </main>
    </div>
  );
}
