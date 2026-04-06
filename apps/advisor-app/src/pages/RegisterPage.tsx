import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { TurtleLogo, ErrorMessage, LoadingSpinner } from "@turtle/ui";
import { PasswordInput }       from "../components/PasswordInput.js";
import { useRegisterAdvisor, parseApiError } from "../hooks/useRegisterAdvisor.js";

export function RegisterPage() {
  const navigate    = useNavigate();
  const registerMut = useRegisterAdvisor();

  const [username,    setUsername]    = useState("");
  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [confirm,     setConfirm]     = useState("");
  const [otpChannel,  setOtpChannel]  = useState<"email" | "sms">("email");
  const [otpTarget,   setOtpTarget]   = useState("");
  const [error,       setError]       = useState("");
  const [success,     setSuccess]     = useState("");

  const isPending = registerMut.isPending;

  const passwordsMatch = password === confirm;
  const isValid =
    username.trim().length >= 3 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    password.length >= 8 &&
    passwordsMatch &&
    (otpChannel === "email" || otpTarget.trim().length > 0);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isValid || isPending) return;
    setError("");
    setSuccess("");

    try {
      const res = await registerMut.mutateAsync({
        username:    username.trim(),
        email:       email.trim(),
        password,
        otp_channel: otpChannel,
        otp_target:  otpChannel === "sms" ? otpTarget.trim() : email.trim(),
      });
      setSuccess(res.message);
      setTimeout(() => navigate("/"), 2000);
    } catch (err) {
      setPassword("");
      setConfirm("");
      setError(parseApiError(err));
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-brand-900 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-xl p-8">

          {/* Logo + heading */}
          <div className="flex justify-center mb-6">
            <TurtleLogo size={48} />
          </div>
          <h1 className="text-xl font-bold text-gray-900 text-center mb-0.5">
            Create Advisor Account
          </h1>
          <p className="text-xs text-gray-400 text-center mb-6">
            Turtle Staff Portal
          </p>

          {success ? (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-center">
              <p className="text-sm font-semibold text-green-700 mb-1">Account created!</p>
              <p className="text-xs text-green-600">Redirecting to login…</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-4">

              {/* Username */}
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="john.doe"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isPending}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm
                    focus:outline-none focus:ring-2 focus:ring-brand-700 focus:border-brand-700
                    disabled:bg-gray-50"
                />
              </div>

              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="john@turtlecorporate.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isPending}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm
                    focus:outline-none focus:ring-2 focus:ring-brand-700 focus:border-brand-700
                    disabled:bg-gray-50"
                />
              </div>

              {/* Password */}
              <PasswordInput
                id="new-password"
                label="Password"
                placeholder="Min. 8 characters"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isPending}
              />

              {/* Confirm password */}
              <div>
                <PasswordInput
                  id="confirm-password"
                  label="Confirm Password"
                  placeholder="Re-enter password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  disabled={isPending}
                />
                {confirm.length > 0 && !passwordsMatch && (
                  <p className="mt-1 text-xs text-red-500">Passwords do not match</p>
                )}
              </div>

              {/* OTP channel */}
              <div>
                <p className="block text-sm font-medium text-gray-700 mb-2">OTP verification via</p>
                <div className="flex gap-4">
                  {(["email", "sms"] as const).map((ch) => (
                    <label key={ch} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="otpChannel"
                        value={ch}
                        checked={otpChannel === ch}
                        onChange={() => setOtpChannel(ch)}
                        disabled={isPending}
                        className="accent-brand-700"
                      />
                      <span className="text-sm text-gray-700 capitalize">{ch}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Phone number — only shown when SMS is selected */}
              {otpChannel === "sms" && (
                <div>
                  <label htmlFor="otp-target" className="block text-sm font-medium text-gray-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    id="otp-target"
                    type="tel"
                    autoComplete="tel"
                    placeholder="+91 98765 43210"
                    value={otpTarget}
                    onChange={(e) => setOtpTarget(e.target.value)}
                    disabled={isPending}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm
                      focus:outline-none focus:ring-2 focus:ring-brand-700 focus:border-brand-700
                      disabled:bg-gray-50"
                  />
                </div>
              )}

              {error && (
                <ErrorMessage message={error} onDismiss={() => setError("")} />
              )}

              <button
                type="submit"
                disabled={!isValid || isPending}
                aria-busy={isPending}
                className="w-full bg-brand-700 hover:bg-brand-800 disabled:bg-gray-200
                  disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg
                  transition-colors flex items-center justify-center gap-2"
              >
                {isPending && <LoadingSpinner size={16} color="#fff" label="" />}
                {isPending ? "Creating account…" : "Create account"}
              </button>
            </form>
          )}

          {/* Back to login */}
          <p className="text-center text-xs text-gray-500 mt-5">
            Already have an account?{" "}
            <Link to="/" className="text-brand-700 hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </div>

        <p className="text-center text-xs text-gray-500 mt-4">
          For internal use only · Turtle Corporate
        </p>
      </div>
    </div>
  );
}
