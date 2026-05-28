/** Returns the Google OAuth redirect URL for internal team — browser navigates there directly */
export function getInternalGoogleOAuthUrl(): string {
  const base = import.meta.env["VITE_AUTH_SERVICE_URL"] ?? "";
  return `${base}/auth/oauth/internal/google`;
}
