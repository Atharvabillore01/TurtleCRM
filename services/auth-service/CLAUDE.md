# auth-service

JWT issuer and auth orchestrator. Does NOT generate OTPs itself — publishes `auth.otp.requested` to the event bus and calls `otp-service /otp/verify` for validation.

**Port:** 4000 | **Dev:** `npm run dev`

## Key files
- `src/index.ts` — Fastify entry, plugin registration
- `src/routes/client.ts` — `POST /auth/client/request-otp`, `POST /auth/client/verify-otp`
- `src/routes/advisor.ts` — `POST /auth/advisor/login`, `POST /auth/advisor/verify-otp`
- `src/routes/oauth.ts` — Google OAuth: `GET /auth/oauth/google` → callback
- `src/routes/refresh.ts` — `POST /auth/refresh` (rotates refresh token)
- `src/plugins/eventbus.ts` — `initEventBus()`, `publishEvent()`

## Non-obvious patterns
- Access token: 15 min, JS memory only (never set in cookie with long path)
- Refresh token: 7 days, httpOnly cookie at path `/auth` only — not readable by JS
- Advisor login is 2-step: password check → stores `advisor:session:{sessionId}` in Redis → publishes OTP
- On verify: checks Redis session + calls otp-service → if both pass, issues JWT pair and deletes session key
- Token rotation: refresh endpoint deletes `refresh:{userId}:{tokenId}` and writes new key atomically
- OAuth callback issues tokens same as password flow — same JWT structure

## Rules
- Never issue tokens without verifying OTP (client) or password+OTP (advisor)
- Never call otp-service for anything other than `/otp/verify` — generation is event-driven
