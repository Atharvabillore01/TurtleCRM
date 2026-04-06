import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { LoadingSpinner, ErrorMessage } from "@turtle/ui";
import { exchangeRefreshToken } from "../api/auth.api.js";
import { useAuth } from "../hooks/useAuth.js";
import { useState } from "react";

export function OAuthCallbackPage() {
  const navigate        = useNavigate();
  const [params]        = useSearchParams();
  const { login }       = useAuth();
  const [error, setError] = useState("");
  const ranRef          = useRef(false);

  useEffect(() => {
    // Strict-mode safe: only run once
    if (ranRef.current) return;
    ranRef.current = true;

    const refreshToken = params.get("refresh_token");
    const oauthError   = params.get("reason");

    if (oauthError || !refreshToken) {
      setError(
        oauthError === "oauth_denied"
          ? "Google sign-in was cancelled. Please try again."
          : "OAuth callback failed. Please try signing in again."
      );
      return;
    }

    (async () => {
      try {
        const res = await exchangeRefreshToken(refreshToken);
        login(res.accessToken);
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
              onClick={() => navigate("/")}
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
