import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { TurtleLogo, ErrorMessage, LoadingSpinner } from "@turtle/ui";
import { GoogleOAuthButton } from "../components/GoogleOAuthButton.js";
import { PasswordInput }     from "../components/PasswordInput.js";
import { useAdvisorLogin, parseApiError } from "../hooks/useAdvisorLogin.js";
import { useAuth }           from "../hooks/useAuth.js";
import { getGoogleOAuthUrl } from "../api/auth.api.js";

const MAX_ATTEMPTS = 5;

export function LoginPage() {
  const navigate      = useNavigate();
  const { setSessionId } = useAuth();
  const loginMut      = useAdvisorLogin();

  const [username,      setUsername]      = useState("");
  const [password,      setPassword]      = useState("");
  const [error,         setError]         = useState("");
  const [attempts,      setAttempts]      = useState(0);
  const [oauthLoading,  setOauthLoading]  = useState(false);

  const isLocked  = attempts >= MAX_ATTEMPTS;
  const isValid   = username.trim().length >= 3 && password.length >= 8;
  const isPending = loginMut.isPending;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isValid || isLocked) return;
    setError("");

    try {
      const res = await loginMut.mutateAsync({ username: username.trim(), password });
      // Clear password from component state immediately after submission
      setPassword("");
      setSessionId(res.sessionId);
      navigate("/verify-otp", {
        state: { sessionId: res.sessionId, expiresIn: res.expiresIn },
      });
    } catch (err) {
      setPassword("");
      const next = attempts + 1;
      setAttempts(next);
      if (next >= MAX_ATTEMPTS) {
        setError("Account locked. Please contact IT support.");
      } else {
        const base = parseApiError(err);
        setError(`${base} (attempt ${next} of ${MAX_ATTEMPTS})`);
      }
    }
  }

  function handleGoogleLogin() {
    setOauthLoading(true);
    window.location.href = getGoogleOAuthUrl();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-brand-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        <div className="bg-white rounded-2xl shadow-xl p-8">

          {/* Logo + heading */}
          <div className="flex justify-center mb-6">
            <TurtleLogo size={48} />
          </div>
          <h1 className="text-xl font-bold text-gray-900 text-center mb-0.5">
            Turtle Team Login
          </h1>
          <p className="text-xs text-gray-400 text-center mb-6">
            Advisor &amp; Staff Portal
          </p>

          {/* Lockout banner */}
          {isLocked ? (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-center">
              <p className="text-sm font-semibold text-red-700 mb-1">Account Locked</p>
              <p className="text-xs text-red-500">
                Too many failed attempts. Please contact{" "}
                <a href="mailto:it-support@turtlecorporate.com" className="underline">
                  IT support
                </a>
                .
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>

              {/* Username */}
              <div className="mb-4">
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="your.username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isPending}
                  aria-required="true"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm
                    focus:outline-none focus:ring-2 focus:ring-brand-700 focus:border-brand-700
                    disabled:bg-gray-50"
                />
              </div>

              {/* Password */}
              <div className="mb-1">
                <PasswordInput
                  id="password"
                  label="Password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isPending}
                  aria-required="true"
                />
              </div>

              {/* Forgot password */}
              <div className="text-right mb-4">
                <Link
                  to="/forgot-password"
                  className="text-xs text-brand-700 hover:text-brand-800 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>

              {error && (
                <div className="mb-4">
                  <ErrorMessage message={error} onDismiss={() => setError("")} />
                </div>
              )}

              <button
                type="submit"
                disabled={!isValid || isPending}
                aria-busy={isPending}
                className="w-full bg-brand-700 hover:bg-brand-800 disabled:bg-gray-200
                  disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg
                  transition-colors flex items-center justify-center gap-2 mb-4"
              >
                {isPending && <LoadingSpinner size={16} color="#fff" label="" />}
                {isPending ? "Signing in…" : "Sign in"}
              </button>
            </form>
          )}

          {/* Divider */}
          {!isLocked && (
            <>
              <div className="relative mb-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2 bg-white text-gray-400">or</span>
                </div>
              </div>

              <GoogleOAuthButton
                loading={oauthLoading}
                onClick={handleGoogleLogin}
              />
            </>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-500 mt-4">
          For internal use only · Turtle Corporate
        </p>
      </div>
    </div>
  );
}
