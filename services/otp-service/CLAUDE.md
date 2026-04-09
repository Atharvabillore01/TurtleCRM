# otp-service

Generates, stores, and validates OTPs. Also consumes `auth.otp.requested` from the event bus to dispatch OTPs via provider.

**Port:** 4001 | **Dev:** `npm run dev`

## Key files
- `src/index.ts` — Fastify entry + Kafka consumer startup
- `src/consumer/eventbus.consumer.ts` — `startConsumer()` subscribes to `auth.otp.requested`
- `src/consumer/eventbus.producer.ts` — publishes `auth.otp.verified`
- `src/routes/otp.ts` — `POST /otp/verify` (called by auth-service only, not client-facing)
- `src/providers/factory.ts` — switch on `OTP_PROVIDER` env to pick provider

## Non-obvious patterns
- Raw OTP is **never** stored — only bcrypt hash at `otp:{channel}:{destination}` with TTL 300s
- Redis key stores `{ hash, attempts, expiresAt }` — 3 failed attempts deletes the key entirely
- Rate limit key: `otprate:{destination}` — max requests per 900s window
- `POST /otp/send` returns 202 immediately (async delivery via provider)
- Provider factory uses static imports + switch — adding a provider requires editing `factory.ts` and the `OTP_PROVIDER` env docs
- In `mock` mode, OTP prints to stdout — no credentials needed for local dev

## Rules
- `OTP_PROVIDER` is env-driven: `mock | twilio | aws | msg91 | gupshup | haptic | infobit`
- Never expose raw OTP in any response or log
