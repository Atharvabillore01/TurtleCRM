import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { TurtleLogo, ErrorMessage, LoadingSpinner } from "@turtle/ui";
import { useRequestOTP, parseApiError } from "../hooks/useOTP.js";
import type { OTPChannel } from "@turtle/types";

const COUNTRY_CODES = [
  { code: "+91",  label: "🇮🇳 +91"  },
  { code: "+1",   label: "🇺🇸 +1"   },
  { code: "+44",  label: "🇬🇧 +44"  },
  { code: "+61",  label: "🇦🇺 +61"  },
  { code: "+971", label: "🇦🇪 +971" },
  { code: "+65",  label: "🇸🇬 +65"  },
  { code: "+60",  label: "🇲🇾 +60"  },
];

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 5)  return digits;
  if (digits.length <= 10) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return `${digits.slice(0, 5)}-${digits.slice(5, 10)}`;
}

export function LoginPage() {
  const navigate       = useNavigate();
  const requestOTPMut  = useRequestOTP();

  const [channel,     setChannel]     = useState<OTPChannel>("sms");
  const [countryCode, setCountryCode] = useState("+91");
  const [phone,       setPhone]       = useState("");
  const [email,       setEmail]       = useState("");
  const [error,       setError]       = useState("");

  const destination =
    channel === "sms"
      ? `${countryCode}${phone.replace(/\D/g, "")}`
      : email.trim();

  const isValid =
    channel === "sms"
      ? phone.replace(/\D/g, "").length >= 10
      : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!isValid) return;

    try {
      const res = await requestOTPMut.mutateAsync({ channel, destination });
      navigate("/verify-otp", {
        state: {
          channel,
          destination,
          requestId: res.requestId,
          expiresIn: res.expiresIn,
        },
      });
    } catch (err) {
      setError(parseApiError(err));
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-lg p-8">

          {/* Logo */}
          <div className="flex justify-center mb-8">
            <TurtleLogo size={52} />
          </div>

          <h1 className="text-2xl font-bold text-gray-900 text-center mb-1">
            Sign in
          </h1>
          <p className="text-sm text-gray-500 text-center mb-6">
            We'll send you a one-time password
          </p>

          {/* Channel toggle */}
          <div
            role="tablist"
            aria-label="Login method"
            className="flex rounded-lg bg-gray-100 p-1 mb-5"
          >
            {(["sms", "email"] as OTPChannel[]).map((ch) => (
              <button
                key={ch}
                role="tab"
                aria-selected={channel === ch}
                type="button"
                onClick={() => { setChannel(ch); setError(""); }}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                  channel === ch
                    ? "bg-white text-brand-700 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {ch === "sms" ? "📱 Phone" : "✉️ Email"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} noValidate>

            {channel === "sms" ? (
              <div className="mb-4">
                <label
                  htmlFor="phone"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Mobile number
                </label>
                <div className="flex gap-2">
                  <select
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    aria-label="Country code"
                    className="border border-gray-300 rounded-lg px-2 py-2.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  >
                    {COUNTRY_CODES.map((c) => (
                      <option key={c.code} value={c.code}>{c.label}</option>
                    ))}
                  </select>
                  <input
                    id="phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder="98765-43210"
                    value={phone}
                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                    aria-required="true"
                  />
                </div>
              </div>
            ) : (
              <div className="mb-4">
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  aria-required="true"
                />
              </div>
            )}

            {error && (
              <div className="mb-4">
                <ErrorMessage message={error} onDismiss={() => setError("")} />
              </div>
            )}

            <button
              type="submit"
              disabled={!isValid || requestOTPMut.isPending}
              aria-busy={requestOTPMut.isPending}
              className="w-full bg-brand-700 hover:bg-brand-800 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {requestOTPMut.isPending ? (
                <LoadingSpinner size={18} color="#fff" label="" />
              ) : null}
              {requestOTPMut.isPending ? "Sending OTP…" : "Send OTP"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Turtle Corporate · Secure Login
        </p>
      </div>
    </div>
  );
}
