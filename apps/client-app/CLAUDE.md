# client-app

Customer-facing SPA. OTP-only auth (no password). React 18 + Vite + TypeScript + Tailwind.

**Port:** 3000 | **Dev:** `npm run dev`

## Routes
- `/` — phone/email input + OTP channel selection → calls `POST /auth/client/request-otp`
- `/verify-otp` — OTP input with countdown → calls `POST /auth/client/verify-otp`
- `/dashboard` — protected, redirects to `/` if no access token

## Key files
- `src/context/AuthContext.tsx` — access token in JS memory, silent refresh 30s before expiry
- `src/api/auth.api.ts` — `requestOTP()`, `verifyOTP()`
- `src/router.tsx` — route definitions + auth guards

## Non-obvious patterns
- Access token stored in React context (memory) — never localStorage/sessionStorage
- Axios interceptor on 401: calls `/auth/refresh`, queues concurrent requests, retries after new token
- Silent refresh: `AuthContext` schedules `setTimeout` at `(expiresIn - 30) * 1000` ms
- Uses React Query (retry=1, staleTime=30s)
- Shared components from `@turtle/ui` — do not re-implement OTPInput or CountdownTimer locally
