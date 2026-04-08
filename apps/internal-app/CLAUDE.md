# internal-app

Internal staff/admin portal. Google OAuth only — no password or OTP. React 18 + Vite + TypeScript + Tailwind.

**Port:** 3002 | **Dev:** `npm run dev`

## Routes
- `/` — login (Google OAuth button only)
- `/auth/callback` — OAuth redirect handler
- `/auth/error` — OAuth failure page
- `/dashboard` — protected internal dashboard

## Key files
- `src/pages/OAuthCallbackPage.tsx` — handles Google OAuth callback
- `src/router.tsx` — route definitions

## Non-obvious patterns
- Lightest of the three apps — no React Query, no OTP flow
- OAuth callback URL is distinct from advisor-app — separate Google Console client or redirect URI
- No password or OTP flows — staff access is OAuth-only by design
