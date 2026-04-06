import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { TurtleLogo, LoadingSpinner } from "@turtle/ui";
import { RoleBadge } from "../components/RoleBadge.js";
import { useAuth }   from "../hooks/useAuth.js";

export function DashboardPage() {
  const { logout, role }      = useAuth();
  const navigate              = useNavigate();
  const [loggingOut, setOut]  = useState(false);

  async function handleLogout() {
    setOut(true);
    await logout();
    navigate("/", { replace: true });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Topbar */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TurtleLogo size={34} />
          <span className="text-xs font-medium text-gray-400 border-l border-gray-200 pl-3">
            Advisor Portal
          </span>
        </div>
        <div className="flex items-center gap-3">
          <RoleBadge role={role} />
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            aria-busy={loggingOut}
            className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-red-600 transition-colors disabled:opacity-50"
          >
            {loggingOut && <LoadingSpinner size={14} label="" />}
            {loggingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-full bg-brand-50 flex items-center justify-center text-2xl">
              🐢
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                Welcome, Advisor
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <RoleBadge role={role} />
                <span className="text-xs text-gray-400">·</span>
                <span className="text-xs text-gray-400">Securely signed in</span>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-6">
            <p className="text-sm text-gray-500">
              This is the Turtle Corporate advisor portal. Your dashboard content will appear here.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
