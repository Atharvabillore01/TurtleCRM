# otp-service

Generates, stores, and validates OTPs. Consumes `auth.otp.requested` from the event bus to dispatch OTPs via provider.

**Runtime:** Python 3.12 + FastAPI + Uvicorn  
**Port:** 4001  
**Dev:** `uvicorn main:app --reload --port 4001`

## Key files

- `main.py` — FastAPI entry, starts RabbitMQ consumer as asyncio task in lifespan
- `eventbus.py` — process-level RabbitMQ singleton, `start_consumer(topic, queue_prefix, handler)`
- `consumer.py` — `handle_otp_requested(payload)` — validates staleness, rate limits, generates + dispatches OTP
- `otp/generate.py` — generates 6-digit OTP
- `otp/store.py` — bcrypt-hashes OTP, stores `{ hash, attempts, expiresAt }` in Redis
- `otp/validate.py` — `bcrypt.checkpw()` comparison, tracks failed attempts
- `otp/rate_limit.py` — `otprate:{destination}` key, 900s window
- `providers/factory.py` — switch on `OTP_PROVIDER` env to pick provider
- `providers/mock.py` — prints OTP to stdout, no credentials needed
- `providers/twilio.py`, `providers/infobip.py` — SMS/email dispatch
- `redis_client.py` — shared Redis async client
- `config.py` — pydantic-settings env loader

## Non-obvious patterns

- Raw OTP is **never** stored — only bcrypt hash at `otp:{channel}:{destination}` with TTL 300s
- Redis key stores `{ hash, attempts, expiresAt }` — 3 failed attempts deletes the key entirely
- Consumer validates message age against `otp_expires_in_seconds` — stale messages are dropped
- `POST /otp/verify` is called by auth-service only, not client-facing

## Rules

- `OTP_PROVIDER` is env-driven: `mock | twilio | aws | msg91 | gupshup | haptic | infobip`
- Never expose raw OTP in any response or log
