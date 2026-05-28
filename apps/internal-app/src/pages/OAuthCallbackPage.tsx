import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { LoadingSpinner, ErrorMessage } from "@turtle/ui";
import { useAuth } from "../hooks/useAuth.js";

const BASE_URL = import.meta.env["VITE_AUTH_SERVICE_URL"] ?? "";

export function OAuthCallbackPage() {
  const navigate          = useNavigate();
  const [params]          = useSearchParams();
  const { login }         = useAuth();
  const [error, setError] = useState("");
  const ranRef            = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const oauthError = params.get("reason");
    if (oauthError) {
      setError(
        oauthError === "oauth_denied"
          ? "Google sign-in was cancelled. Please try again."
          : "OAuth sign-in failed. Please try again."
      );
      return;
    }

    // Refresh token was set as httpOnly cookie by the server redirect.
    (async () => {
      try {
        const res = await fetch(`${BASE_URL}/auth/refresh`, {
          method:      "POST",
          credentials: "include",
          headers:     { "Content-Type": "application/json" },
          body:        JSON.stringify({}),
        });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { accessToken: string };
        login(data.accessToken);
        navigate("/dashboard", { replace: true });
      } catch {
        setError("Failed to complete Google sign-in. Please try again.");
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-brand-900 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm text-center">
        {error ? (
          <>
            <ErrorMessage message={error} />
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="mt-4 text-sm text-brand-700 hover:underline"
            >
              ← Back to sign in
            </button>
          </>
        ) : (
          <>
            <LoadingSpinner size={32} label="" />
            <p className="mt-4 text-sm text-gray-500">Completing sign-in…</p>
          </>
        )}
      </div>
    </div>
  );
}
