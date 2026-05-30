# auth-service

JWT issuer and auth orchestrator. Does NOT generate OTPs itself — publishes `auth.otp.requested` to the event bus and calls `otp-service /otp/verify` for validation.

**Runtime:** Python 3.12 + FastAPI + Uvicorn  
**Port:** 4000  
**Dev:** `uvicorn main:app --reload --port 4000`

## Key files

- `main.py` — FastAPI entry, router registration, lifespan (event bus init)
- `routes/client.py` — `POST /auth/client/request-otp`, `POST /auth/client/verify-otp`
- `routes/advisor.py` — `POST /auth/advisor/login`, `POST /auth/advisor/verify-otp`
- `routes/oauth.py` — Google OAuth: `GET /auth/oauth/google` → `/auth/oauth/google/callback`; internal flow: `GET /auth/oauth/internal/google` → `/auth/oauth/internal/google/callback`
- `routes/refresh.py` — `POST /auth/refresh` (rotates refresh token)
- `db/team_procs.py` — `_fn_is_internal_user_allowed` (admission gate) + `proc_create_team_user_via_oauth` wrapper
- `eventbus.py` — process-level RabbitMQ singleton, `publish_event(topic, payload)`
- `jwt_utils.py` — issue / verify access and refresh tokens
- `auth_utils.py` — bcrypt helpers, session utilities
- `redis_client.py` — shared Redis async client
- `config.py` — pydantic-settings env loader

## Non-obvious patterns

- Access token: 15 min, returned in response body — stored in JS memory only (never in a cookie)
- Refresh token: 7 days, httpOnly cookie at path `/auth` only — not readable by JS
- Advisor login is 2-step: password check → stores `advisor:session:{sessionId}` in Redis → publishes `auth.otp.requested`
- On verify: checks Redis session + calls otp-service `/otp/verify` → if both pass, issues JWT pair and deletes session key
- Token rotation: refresh endpoint deletes `refresh:{userId}:{tokenId}` and writes new key atomically
- OAuth callback issues tokens via the same JWT structure as password flow

### Internal-team admission gate (2026-05-29 — current)

The internal Google-OAuth callback in `routes/oauth.py:internal_google_callback` runs two DB calls in order:

1. **Admission check** — `proc_is_internal_user_allowed(email)` →
   `_fn_is_internal_user_allowed` in `db/team_procs.py` executes
   `SELECT EXISTS(SELECT 1 FROM team_users WHERE lower(email) = $1 AND is_active = TRUE)`.
   This is a **membership gate**, not a domain allowlist: the user must already
   have an active `team_users` row before they can log in.
2. **Provisioning** — `sp_create_team_user_via_oauth` (Path 2) binds the Google
   OAuth identity to the pre-existing row and returns the canonical
   `team_users.id` UUID for the JWT.

To grant access: `INSERT` a row into `team_users` (id, role_id, username,
email, name, is_active=TRUE). To revoke: `UPDATE team_users SET is_active = FALSE`.

The legacy `application_config('oauth.allowed_email_domains')` row exists but
is no longer consulted by any code path. Safe to empty.

## Rules

- Never issue tokens without verifying OTP (client) or password+OTP (advisor)
- Never call otp-service for anything other than `/otp/verify` — OTP generation is event-driven
- Internal-team OAuth admission is **membership-gated** — never permit a login solely because the email's domain looks right. The roster lives in `team_users`.
