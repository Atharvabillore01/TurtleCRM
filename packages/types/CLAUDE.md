# packages/types

Shared TypeScript types only — no runtime code. Central source of truth for event payloads, JWT structures, and enums.

## Key exports (`src/index.ts`)
- `KafkaTopics` enum — `auth.otp.requested`, `auth.otp.verified`, `auth.login.success`, `auth.login.failed`, `auth.token.refreshed`
- `UserType` — `"client" | "advisor"`
- `OTPChannel` — `"sms" | "email"`
- `JWTPayload`, `RefreshTokenPayload`
- Kafka event interfaces: `OTPRequestedEvent`, `LoginSuccessEvent`, etc.

## Rules
- All services and apps import from `@turtle/types` — never redefine these locally
- Adding a new Kafka topic: add to `KafkaTopics` enum AND create the event interface here
