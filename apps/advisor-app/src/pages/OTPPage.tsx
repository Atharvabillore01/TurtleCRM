import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { OTPInput, ErrorMessage, LoadingSpinner, TurtleLogo } from "@turtle/ui";
import { useOTPVerify } from "../hooks/useOTPVerify.js";
import { useAuth } from "../hooks/useAuth.js";
import { parseApiError } from "../hooks/useAdvisorLogin.js";

interface LocationState {
  sessionId: string;
  expiresIn: number;
}

export function OTPPage() {
  const navigate          = useNavigate();
  const location          = useLocation();
  const { login, sessionId: ctxSessionId } = useAuth();
  const verifyMut         = useOTPVerify();
  const [error, setError] = useState("");

  const state = location.state as LocationState | null;
  const sessionId = state?.sessionId ?? ctxSessionId;

  useEffect(() => {
    if (!sessionId) navigate("/", { replace: true });
  }, [sessionId, navigate]);

  if (!sessionId) return null;

  async function handleComplete(otp: string) {
    setError("");
    try {
      const res = await verifyMut.mutateAsync({ sessionId: sessionId!, otp });
      login(res.accessToken);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(parseApiError(err));
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-brand-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-xl p-8">

          <div className="flex justify-center mb-6">
            <TurtleLogo size={44} />
          </div>

          {/* Lock icon */}
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2D6A4F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0110 0v4"/>
              </svg>
            </div>
          </div>

          <h1 className="text-xl font-bold text-gray-900 text-center mb-1">
            Two-Factor Authentication
          </h1>
          <p className="text-sm text-gray-500 text-center mb-6">
            A code was sent to your registered device
          </p>

          <div
            className="flex justify-center mb-6"
            role="group"
            aria-label="Enter two-factor authentication code"
          >
            <OTPInput
              length={6}
              onComplete={handleComplete}
              disabled={verifyMut.isPending}
              error={!!error}
            />
          </div>

          {verifyMut.isPending && (
            <div className="flex justify-center mb-4">
              <LoadingSpinner size={20} label="Verifying…" />
            </div>
          )}

          {error && (
            <div className="mb-4">
              <ErrorMessage message={error} onDismiss={() => setError("")} />
            </div>
          )}

          {/* Compliance notice — no resend option */}
          <div className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded-lg">
            <p className="text-xs text-amber-700 text-center leading-relaxed">
              <span className="font-semibold">Cannot receive the code?</span>
              <br />
              Contact{" "}
              <a
                href="mailto:it-support@turtlecorporate.com"
                className="underline font-medium"
              >
                IT support
              </a>{" "}
              for assistance.
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate("/")}
            className="mt-5 w-full text-center text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← Back to sign in
          </button>
        </div>

        <p className="text-center text-xs text-gray-500 mt-4">
          For internal use only · Turtle Corporate
        </p>
      </div>
    </div>
  );
}
