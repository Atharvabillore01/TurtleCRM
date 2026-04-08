# notification-service

Purely event-driven — no client-facing HTTP routes. Consumes auth/OTP events from the event bus and dispatches notifications (email, push).

**Port:** 4003 (health only) | **Dev:** `npm run dev`

## Key files
- `src/index.ts` — Fastify entry + starts event consumer in lifespan hook
- `src/consumer/eventbus.consumer.ts` — subscribes to login/OTP events, calls notification handlers

## Consumed events
- `auth.otp.verified`
- `auth.login.success`
- `auth.login.failed`
- `auth.token.refreshed`

## Non-obvious patterns
- No HTTP routes except `/health` — do not add client-facing endpoints here
- Consumer starts in Fastify `onReady` hook and is cancelled on `onClose`
- Notification channels (email/push) configured via env — see `packages/config` for loaders
