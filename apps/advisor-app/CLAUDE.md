# advisor-app

Advisor/consultant portal. Password + OTP 2FA + Google OAuth. React 18 + Vite + TypeScript + Tailwind.

**Port:** 3001 | **Dev:** `npm run dev`

## Routes
- `/` — login (password or Google OAuth button)
- `/auth/callback` — Google OAuth redirect handler, extracts tokens from URL params
- `/dashboard` — protected advisor dashboard

## Key files
- `src/pages/OAuthCallbackPage.tsx` — extracts tokens from OAuth redirect, stores in auth context
- `src/api/auth.api.ts` — wraps `/auth/advisor/*` endpoints
- `src/context/AuthContext.tsx` — same memory-only token pattern as client-app

## Non-obvious patterns
- OAuth is primary flow — password+OTP is secondary
- No React Query (unlike client-app) — uses plain axios + useState
- OAuth callback URL is separate from client-app's callback — configured in Google Console per app
- 2FA flow: `POST /auth/advisor/login` → OTP screen → `POST /auth/advisor/verify-otp` → dashboard
