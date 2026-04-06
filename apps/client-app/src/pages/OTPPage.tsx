import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { OTPInput, CountdownTimer, ErrorMessage, LoadingSpinner, TurtleLogo } from "@turtle/ui";
import { useVerifyOTP, useRequestOTP, parseApiError } from "../hooks/useOTP.js";
import { useAuth } from "../hooks/useAuth.js";
import type { OTPChannel } from "@turtle/types";

interface LocationState {
  channel:     OTPChannel;
  destination: string;
  requestId:   string;
  expiresIn:   number;
}

function maskDestination(channel: OTPChannel, destination: string): string {
  if (channel === "sms") {
    // Show last 4 digits: +91 ••••••1234
    const digits = destination.replace(/\D/g, "");
    return destination.replace(digits, `••••••${digits.slice(-4)}`);
  }
  // Email: joh***@gmail.com
  const [local, domain] = destination.split("@");
  if (!local || !domain) return destination;
  return `${local.slice(0, 3)}${"•".repeat(Math.max(0, local.length - 3))}@${domain}`;
}

export function OTPPage() {
  const navigate      = useNavigate();
  const location      = useLocation();
  const { login }     = useAuth();
  const verifyMut     = useVerifyOTP();
  const requestMut    = useRequestOTP();

  // Guard: if arrived without state, bounce back
  const state = location.state as LocationState | null;

  useEffect(() => {
    if (!state) navigate("/", { replace: true });
  }, [state, navigate]);

  const [error,      setError]      = useState("");
  const [expired,    setExpired]    = useState(false);
  const [timerKey,   setTimerKey]   = useState(0); // increment to reset timer
  const [requestId,  setRequestId]  = useState(state?.requestId ?? "");
  const [expiresIn,  setExpiresIn]  = useState(state?.expiresIn ?? 300);

  if (!state) return null;

  const { channel, destination } = state;
  const masked = maskDestination(channel, destination);

  async function handleComplete(otp: string) {
    setError("");
    try {
      const res = await verifyMut.mutateAsync({ requestId, destination, otp });
      login(res.accessToken);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(parseApiError(err));
    }
  }

  async function handleResend() {
    setError("");
    setExpired(false);
    try {
      const res = await requestMut.mutateAsync({ channel, destination });
      setRequestId(res.requestId);
      setExpiresIn(res.expiresIn);
      setTimerKey((k) => k + 1);
    } catch (err) {
      setError(parseApiError(err));
    }
  }

  const isSubmitting = verifyMut.isPending;

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-lg p-8">

          <div className="flex justify-center mb-8">
            <TurtleLogo size={48} />
          </div>

          <h1 className="text-2xl font-bold text-gray-900 text-center mb-1">
            Enter OTP
          </h1>
          <p className="text-sm text-gray-500 text-center mb-1">
            We sent a 6-digit code to
          </p>
          <p
            className="text-sm font-semibold text-brand-700 text-center mb-6"
            aria-label={`OTP sent to ${destination}`}
          >
            {masked}
          </p>

          {/* OTP Input */}
          <div
            className="flex justify-center mb-6"
            role="group"
            aria-label="Enter one-time password"
          >
            <OTPInput
              length={6}
              onComplete={handleComplete}
              disabled={isSubmitting || expired}
              error={!!error}
            />
          </div>

          {/* Loading */}
          {isSubmitting && (
            <div className="flex justify-center mb-4">
              <LoadingSpinner size={20} label="Verifying…" />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-4">
              <ErrorMessage message={error} onDismiss={() => setError("")} />
            </div>
          )}

          {/* Timer + Resend */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">
              {expired ? (
                <span className="text-red-500 font-medium">OTP expired</span>
              ) : (
                <>
                  Expires in{" "}
                  <CountdownTimer
                    key={timerKey}
                    seconds={expiresIn}
                    onExpire={() => setExpired(true)}
                  />
                </>
              )}
            </span>

            <button
              type="button"
              onClick={handleResend}
              disabled={!expired || requestMut.isPending}
              aria-busy={requestMut.isPending}
              className={`font-semibold transition-colors ${
                expired && !requestMut.isPending
                  ? "text-brand-700 hover:text-brand-800 cursor-pointer"
                  : "text-gray-300 cursor-not-allowed"
              }`}
            >
              {requestMut.isPending ? "Sending…" : "Resend OTP"}
            </button>
          </div>

          {/* Back link */}
          <button
            type="button"
            onClick={() => navigate("/")}
            className="mt-6 w-full text-center text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← Change {channel === "sms" ? "phone number" : "email address"}
          </button>
        </div>
      </div>
    </div>
  );
}
