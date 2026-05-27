# notification-service

Purely event-driven — no client-facing HTTP routes. Consumes auth/OTP events from the event bus and dispatches notifications (email, push).

**Runtime:** Python 3.12 + FastAPI + Uvicorn  
**Port:** 4003 (health only)  
**Dev:** `uvicorn main:app --reload --port 4003`

## Key files

- `main.py` — FastAPI entry, starts RabbitMQ consumer as asyncio task in lifespan
- `consumer.py` — subscribes to login/OTP events via `aio_pika`, calls notification handlers
- `config.py` — pydantic-settings env loader

## Consumed events

- `auth.login.success`
- `auth.login.failed`
- `auth.otp.verified` — not yet wired
- `auth.token.refreshed` — not yet wired

## Non-obvious patterns

- No HTTP routes except `/health` — do not add client-facing endpoints here
- Consumer starts as asyncio task in FastAPI lifespan and is cancelled on shutdown
- Uses `aio_pika` directly — same pattern as otp-service `eventbus.py`

## Rules

- All event consumption via `aio_pika` — do not import Node packages
