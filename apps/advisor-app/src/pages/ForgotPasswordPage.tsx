import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { TurtleLogo, SuccessMessage } from "@turtle/ui";

export function ForgotPasswordPage() {
  const [email,     setEmail]     = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
  }

  const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-brand-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-xl p-8">

          <div className="flex justify-center mb-6">
            <TurtleLogo size={44} />
          </div>

          <h1 className="text-xl font-bold text-gray-900 text-center mb-1">
            Password Reset
          </h1>
          <p className="text-sm text-gray-500 text-center mb-6">
            Password resets are managed by IT
          </p>

          {submitted ? (
            <>
              <SuccessMessage
                message="Your request has been noted. An IT team member will contact you within one business day."
              />
              <p className="text-xs text-gray-400 text-center mt-4">
                For urgent access, call your IT helpdesk directly.
              </p>
            </>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <div className="mb-4">
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Work email address
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@turtlecorporate.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-required="true"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm
                    focus:outline-none focus:ring-2 focus:ring-brand-700 focus:border-brand-700"
                />
              </div>

              {/* Compliance notice */}
              <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                <p className="text-xs text-blue-700 leading-relaxed">
                  <span className="font-semibold">No self-service reset available.</span>
                  <br />
                  Submitting this form notifies IT support, who will verify your identity and assist you.
                </p>
              </div>

              <button
                type="submit"
                disabled={!isValid}
                className="w-full bg-brand-700 hover:bg-brand-800 disabled:bg-gray-200
                  disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg
                  transition-colors mb-4"
              >
                Notify IT Support
              </button>
            </form>
          )}

          <Link
            to="/"
            className="block text-center text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← Back to sign in
          </Link>
        </div>

        <p className="text-center text-xs text-gray-500 mt-4">
          For internal use only · Turtle Corporate
        </p>
      </div>
    </div>
  );
}
