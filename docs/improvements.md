# Improvement Backlog

Prioritized by impact vs effort.

---

## 🔴 High Priority (Security / Correctness)

### 1. Refresh token stored in response body — should be cookie-only
**Problem:** `refreshToken` is returned in the JSON response body. The frontend must store it somewhere (likely memory or localStorage) to send it on refresh. This defeats the purpose of httpOnly cookies.  
**Fix:** Set the refresh token as a second httpOnly cookie (`refresh_token`) and read it server-side. Remove it from the response body.  
**Files:** `auth_utils.py`, all routes that return `refreshToken`, frontend `AuthContext`.

### 2. No input sanitization on user-service
**Problem:** `POST /advisors` and `POST /users` have no validation — any string length goes into the DB. Auth-service validates, but user-service is directly reachable.  
**Fix:** Add Pydantic validators to user-service models with the same rules as auth-service.

### 3. Google OAuth user not persisted
**Problem:** OAuth login uses `userId = "google:{sub}"` but never creates a record in the database. On next login a new "user" is created with no history, no role from DB, hardcoded `role: "advisor"`.  
**Fix:** On OAuth callback, call user-service to upsert the advisor by `google_id`. The `Advisor` model already has a `google_id` field — it's just never used.

### 4. Refresh endpoint hardcodes `userType: "client"`
**Problem:** `POST /auth/refresh` in `refresh.py` always issues new tokens with `userType: "client"`, `role: "client"`. If an advisor refreshes, their token gets downgraded.  
**Fix:** Store `userType` and `role` in the refresh token payload (or look it up from DB on refresh).

---

## 🟡 Medium Priority (Reliability / Features)

### 5. No email notifications
**Problem:** Login success/failure events are consumed but only logged. Users receive no security alerts.  
**Fix:** Add SendGrid/SMTP to `notification-service`. Config is already wired (`SENDGRID_API_KEY`).

### 6. No password reset flow
**Problem:** Advisors have no way to reset a forgotten password. There's a "forgot password" link in the UI that leads nowhere.  
**Fix:** Add `POST /auth/advisor/forgot-password` → sends OTP to email → `POST /auth/advisor/reset-password` with OTP + new password.

### 7. No advisor profile endpoint
**Problem:** After login, advisor-app has the JWT but no way to fetch the advisor's profile (name, email, role) without decoding the JWT client-side.  
**Fix:** Add `GET /auth/me` that decodes the access token and returns the advisor's profile from user-service.

### 8. OTP audit events are published but not consumed
**Problem:** `auth.otp.verified` and `auth.token.refreshed` are published to RabbitMQ but no service consumes them. They pile up until the TTL (7 days) expires.  
**Fix:** Either add a consumer (e.g., notification-service), or stop publishing them if they serve no purpose.

### 9. User-service has no auth middleware
**Problem:** `user-service` endpoints (`/advisors`, `/users`) are publicly accessible — any service or external caller can create/read users without authentication.  
**Fix:** Add an internal API key header check (e.g., `X-Internal-Token`) validated against an env var, so only auth-service can call it.

### 10. httpx client created per-request
**Problem:** Each HTTP call to user-service or otp-service creates a new `httpx.AsyncClient()` and closes it. This wastes connection setup time on every request.  
**Fix:** Create a module-level `httpx.AsyncClient` in auth-service, initialized in `lifespan`, and reuse it across requests.

---

## 🟢 Low Priority (Developer Experience / Cleanup)

### 11. Dead `package.json` and `tsconfig.json` in Python services
**Problem:** After removing the TypeScript `src/` folders, `package.json` and `tsconfig.json` remain in each Python service. They're confusing.  
**Fix:** Delete them from auth-service, otp-service, notification-service.

### 12. `POST /otp/send` endpoint is unused
**Problem:** `otp-service` exposes a direct HTTP `POST /otp/send` endpoint that bypasses the event bus. Nothing calls it.  
**Fix:** Remove it, or document it as an emergency bypass with auth.

### 13. No structured logging correlation ID
**Problem:** Logs across services can't be correlated to a single request — if an OTP send fails, you can't trace the request from auth-service → RabbitMQ → otp-service.  
**Fix:** Generate a `correlationId` in auth-service when publishing events, pass it through event payloads, and include it in all log entries.

### 14. `version` field in docker-compose.yml
**Problem:** Docker warns `version is obsolete` on every command.  
**Fix:** Remove the `version:` line from `docker-compose.yml`.

### 15. SSL hardcoded in user-service database config
**Problem:** `connect_args={"ssl": "require"}` is hardcoded in `database.py`. This works for Neon (cloud Postgres) but breaks local Postgres without SSL.  
**Fix:** Make it env-driven: `ssl = "require" if settings.db_ssl else None`.
