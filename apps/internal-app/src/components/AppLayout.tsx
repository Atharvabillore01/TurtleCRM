import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { TurtleLogo, LoadingSpinner } from "@turtle/ui";
import { useAuth } from "../hooks/useAuth.js";
import { useDevMode } from "../hooks/useDevMode.js";

// Shown by default; set VITE_SHOW_DEV_TOGGLE=false in production to hide it
const SHOW_DEV_TOGGLE = import.meta.env["VITE_SHOW_DEV_TOGGLE"] !== "false";

function IconHome() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function IconSparkles() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3L13.5 8.5H19L14.5 12L16 17.5L12 14L8 17.5L9.5 12L5 8.5H10.5L12 3Z" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

const NAV = [
  { path: "/dashboard", label: "Dashboard",    Icon: IconHome },
  { path: "/dashboard/ai-validation", label: "AI Validation", Icon: IconSparkles },
];

export function AppLayout() {
  const { logout, email }        = useAuth();
  const navigate                 = useNavigate();
  const location                 = useLocation();
  const { devMode, toggle }      = useDevMode();
  const [loggingOut, setOut]     = useState(false);
  const [settingsOpen, setSettings] = useState(false);

  async function handleLogout() {
    setOut(true);
    await logout();
    navigate("/", { replace: true });
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* ── Top header ── */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <TurtleLogo size={32} />
          <span className="text-xs font-medium text-gray-400 border-l border-gray-200 pl-3">
            Internal Portal
          </span>
        </div>
        <div className="flex items-center gap-4">
          {email && <span className="text-xs text-gray-400 hidden sm:block">{email}</span>}
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
          >
            {loggingOut && <LoadingSpinner size={12} label="" />}
            {loggingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </header>

      {/* ── Body: sidebar + content ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <aside className="w-52 bg-white border-r border-gray-100 flex flex-col shrink-0">
          <nav className="flex-1 px-3 py-4 space-y-0.5">
            {NAV.map(({ path, label, Icon }) => {
              const active = location.pathname === path;
              return (
                <button
                  key={path}
                  type="button"
                  onClick={() => navigate(path)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? "bg-gray-100 text-gray-900"
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                  }`}
                >
                  <Icon />
                  {label}
                </button>
              );
            })}
          </nav>

          {/* Settings panel */}
          <div className="px-3 pb-4 border-t border-gray-100 pt-3">
            <button
              type="button"
              onClick={() => setSettings((v) => !v)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"
            >
              <IconSettings />
              Settings
            </button>

            {settingsOpen && (
              <div className="mt-2 rounded-xl bg-gray-50 border border-gray-100 p-3 space-y-3">
                {SHOW_DEV_TOGGLE ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-gray-700">Dev Mode</p>
                      <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">
                        {devMode ? "Manual transcript input" : "Auto via Fireflies"}
                      </p>
                    </div>
                    {/* Toggle switch */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={devMode}
                      onClick={toggle}
                      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                        devMode ? "bg-gray-800" : "bg-gray-300"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${
                          devMode ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                ) : (
                  <p className="text-[10px] text-gray-400">
                    No settings available in this environment.
                  </p>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
