# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack

Node.js + Fastify + Prisma + PostgreSQL + Redis + Kafka + React 18 + TypeScript + Tailwind

## Commands

```bash
# Full stack (everything)
docker-compose up --build
docker-compose down
docker-compose down -v --remove-orphans   # nuke volumes too

# Local dev (infra via Docker, services via tsx watch)
docker-compose up -d postgres redis zookeeper kafka
npm install
cd services/auth-service   && npm run dev   # :4000
cd services/otp-service    && npm run dev   # :4001
cd services/user-service   && npm run dev   # :4002
cd services/notification-service && npm run dev  # :4003
cd apps/client-app         && npm run dev   # :3000 (Vite HMR)
cd apps/advisor-app        && npm run dev   # :3001 (Vite HMR)

# Build
npm run build                              # all workspaces
cd services/auth-service && npm run build  # single service

# Healthcheck
./scripts/healthcheck.sh          # check once
./scripts/healthcheck.sh --wait   # retry up to 120s
```

## Architecture

### Monorepo layout

```
apps/
  client-app/     React 18 SPA — OTP-only auth (port 3000)
  advisor-app/    React 18 SPA — Password + OTP 2FA + OAuth (port 3001)
services/
  auth-service/   Fastify — JWT issuer, OTP validation, OAuth (port 4000)
  otp-service/    Fastify + Kafka consumer — dispatches OTPs via provider (port 4001)
  user-service/   Fastify + Prisma — user CRUD (port 4002)
  notification-service/  Fastify + Kafka consumer — email/push (port 4003)
packages/
  types/    Shared TypeScript types, enums, Kafka event interfaces
  config/   Typed env loaders — loadEnv(), jwtConfig(), redisConfig(), etc.
  ui/       Shared React components — OTPInput, CountdownTimer, TurtleLogo, etc.
```

### Service dependency graph

```
postgres, redis, zookeeper → kafka → auth-service, otp-service, user-service, notification-service → client-app, advisor-app
```

All `depends_on` use `condition: service_healthy` in docker-compose.

### Authentication flows

**client-app** — OTP only:
1. `POST /auth/client/request-otp` → auth-service publishes `auth.otp.requested` to Kafka → 202 immediately
2. otp-service consumes event → generates OTP → bcrypt-hashes it → stores in Redis (`otp:{channel}:{destination}`, TTL 300s) → sends via provider
3. `POST /auth/client/verify-otp` → auth-service calls otp-service `/otp/verify` → issues JWT pair

**advisor-app** — Password + OTP 2FA + Google OAuth:
1. `POST /auth/advisor/login` → bcrypt compare → stores `advisor:session:{sessionId}` in Redis → publishes OTP event
2. `POST /auth/advisor/verify-otp` → validates OTP + session → issues JWT pair
3. Google OAuth: `GET /auth/oauth/google` → consent screen → `/auth/oauth/google/callback` → exchange code → issue JWT

### Token lifecycle

- **Access token** (15 min): JWT, stored in JS memory only (never localStorage). Validated by signature alone — no Redis lookup on every request.
- **Refresh token** (7 days): JWT stored in Redis at `refresh:{userId}:{tokenId}`. Sent as httpOnly cookie. Rotated on every use (old key deleted, new pair issued).
- Silent refresh: AuthContext schedules a `setTimeout` 30s before access token expiry.
- On 401: axios interceptor calls `/auth/refresh`, queues concurrent requests, retries all after new token issued.

### Event bus — pluggable adapter layer

All services import from `@turtle/events` (`shared/events/`). No service imports `kafkajs`, `amqplib`, or any AWS SDK directly.

```typescript
import { getEventBus } from "@turtle/events";
const bus = getEventBus({ clientId: "auth-service", groupId: "auth-service-group" });
await bus.publish("auth.otp.requested", payload);
await bus.subscribe("auth.otp.requested", handler);
await bus.disconnect();
```

**Adapters** (`shared/events/src/adapters/`):

| `EVENT_BUS` value | Adapter | Publish | Subscribe |
|---|---|---|---|
| `kafka` | `KafkaAdapter` | kafkajs producer, GZIP | kafkajs consumer group |
| `rabbitmq` | `RabbitMQAdapter` | topic exchange, persistent | durable queue, prefetch=1 |
| `aws-sns` | `AWSSNSSQSAdapter` | SNS PublishCommand | SQS long-poll loop |
| `redis-streams` | `RedisStreamsAdapter` | XADD | XREADGROUP consumer group |
| `eventbridge` | `EventBridgeAdapter` | PutEvents to named bus | SQS long-poll (EB rule → SQS) |

**Kafka topics** (defined in `packages/types/src/index.ts` as `KafkaTopics` enum):
- `auth.otp.requested` → consumed by otp-service
- `auth.otp.verified` → published by otp-service after validation
- `auth.login.success` / `auth.login.failed` → consumed by notification-service
- `auth.token.refreshed`

**Service wiring:**
- `auth-service/src/plugins/eventbus.ts` — `initEventBus()` + typed `publishEvent(AuthEvent)`
- `otp-service/src/consumer/eventbus.producer.ts` — same pattern
- `otp-service/src/consumer/eventbus.consumer.ts` — `startConsumer()` calls `bus.subscribe()`

### OTP providers

`OTP_PROVIDER` env: `mock | twilio | aws | msg91 | gupshup | haptic | infobit`

Factory in `services/otp-service/src/providers/factory.ts` uses static imports + switch. In `mock` mode OTPs print to logs — no credentials needed for local dev.

Security: raw OTP is **never** stored in Redis. Only bcrypt hash. Validate via `bcrypt.compare()` only. 3 failed attempts → key deleted entirely.

### Redis key conventions

| Key | Value | TTL |
|---|---|---|
| `otp:{channel}:{destination}` | `{ hash, attempts, expiresAt }` | 300s |
| `otprate:{destination}` | request count | 900s (15 min) |
| `refresh:{userId}:{tokenId}` | sessionId | 7d |
| `advisor:session:{sessionId}` | `{ advisorId, role, step }` | 300s |
| `rl:{prefix}:ip:{ip}` | request count | window seconds |

### TypeScript path aliases

All packages use `baseUrl: "../.."` (repo root) in tsconfig.json so `@turtle/*` resolves:

```json
"@turtle/types":  ["packages/types/src/index.ts"]
"@turtle/config": ["packages/config/src/index.ts"]
"@turtle/ui":     ["packages/ui/src/index.ts"]
```

npm workspaces symlink these in `node_modules/@turtle/*` for runtime resolution.

### Docker build context

All services and apps use `context: .` (repo root) in docker-compose so Dockerfiles can `COPY packages/` alongside the service source. Never set `context:` to a subdirectory — the shared packages would be unreachable.

## Rules

- `OTP_PROVIDER` is env-driven: `twilio | aws | msg91 | gupshup | haptic | infobit | mock`
- `EVENT_BUS` is env-driven: `kafka | rabbitmq`
- Never hardcode secrets — use `.env.example` only
- All services must start via `docker-compose up`
- Never store raw OTPs in Redis — always bcrypt hash
- Access tokens in JS memory only, never localStorage or sessionStorage
- Refresh tokens in httpOnly cookies only — never readable by JS
