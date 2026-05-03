import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";

export function DashboardPage() {
  const { email, name } = useAuth();
  const navigate        = useNavigate();

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-2xl">
            🐢
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Welcome{name ? `, ${name}` : ""}
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {email ?? "Internal Team Member"} · Securely signed in
            </p>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-6 space-y-2">
          <p className="text-sm text-gray-500 mb-4">
            Turtle Corporate internal team portal. Select a tool from the sidebar.
          </p>

          <button
            type="button"
            onClick={() => navigate("/autofill")}
            className="w-full flex items-center justify-between border border-gray-100 rounded-xl px-5 py-4 hover:border-gray-300 hover:bg-gray-50 transition-colors text-left group"
          >
            <div>
              <p className="text-sm font-medium text-gray-800">AI Field Autofill</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Extract CRM fields from call transcripts
              </p>
            </div>
            <span className="text-gray-300 group-hover:text-gray-500 transition-colors text-lg">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
