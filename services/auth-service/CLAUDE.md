# auth-service

JWT issuer and auth orchestrator. Does NOT generate OTPs itself — publishes `auth.otp.requested` to the event bus and calls `otp-service /otp/verify` for validation.

**Runtime:** Python 3.12 + FastAPI + Uvicorn  
**Port:** 4000  
**Dev:** `uvicorn main:app --reload --port 4000`

## Key files

- `main.py` — FastAPI entry, router registration, lifespan (event bus init)
- `routes/client.py` — `POST /auth/client/request-otp`, `POST /auth/client/verify-otp`
- `routes/advisor.py` — `POST /auth/advisor/login`, `POST /auth/advisor/verify-otp`
- `routes/oauth.py` — Google OAuth: `GET /auth/oauth/google` → `/auth/oauth/google/callback`
- `routes/refresh.py` — `POST /auth/refresh` (rotates refresh token)
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

## Rules

- Never issue tokens without verifying OTP (client) or password+OTP (advisor)
- Never call otp-service for anything other than `/otp/verify` — OTP generation is event-driven
