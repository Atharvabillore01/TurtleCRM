# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack

**Services:** Python 3.12 + FastAPI + Uvicorn (auth, otp) · Node.js 20 + Fastify + Prisma (user, notification)
**Apps:** React 18 + Vite + TypeScript + Tailwind
**Infra:** PostgreSQL + Redis + RabbitMQ (default) or Kafka

## Commands

```bash
# Full stack (everything)
docker-compose up --build
docker-compose down
docker-compose down -v --remove-orphans   # nuke volumes too

# Local dev — start infra first, then services
docker-compose up -d postgres redis rabbitmq

# Python services (auth, otp)
cd services/auth-service         && pip install -r requirements.txt && uvicorn main:app --reload --port 4000
cd services/otp-service          && pip install -r requirements.txt && uvicorn main:app --reload --port 4001

# Node services (user, notification)
npm install
cd services/user-service         && npm run dev   # :4002
cd services/notification-service && npm run dev   # :4003

# React apps
cd apps/client-app               && npm run dev   # :3000 (Vite HMR)
cd apps/advisor-app              && npm run dev   # :3001 (Vite HMR)
cd apps/internal-app             && npm run dev   # :3002 (Vite HMR)

# Healthcheck
./scripts/healthcheck.sh          # check once
./scripts/healthcheck.sh --wait   # retry up to 120s
```

## Architecture

### Monorepo layout

```
apps/
  client-app/     React 18 SPA — OTP-only auth (port 3000)
  advisor-app/    React 18 SPA — Password + OTP 2FA + Google OAuth (port 3001)
  internal-app/   React 18 SPA — Internal team portal, Google OAuth only (port 3002)
services/
  auth-service/   Python/FastAPI — JWT issuer, OTP validation, OAuth (port 4000)
  otp-service/    Python/FastAPI + RabbitMQ consumer — dispatches OTPs via provider (port 4001)
  user-service/   Node/Fastify + Prisma — user CRUD (port 4002)
  notification-service/  Node/Fastify + RabbitMQ consumer — email/push (port 4003)
packages/
  types/    Shared TypeScript types, enums, event interfaces
  config/   Typed env loaders — loadEnv(), jwtConfig(), redisConfig(), etc.
  ui/       Shared React components — OTPInput, CountdownTimer, TurtleLogo, etc.
shared/
  events/   Pluggable event bus adapters (@turtle/events)
```

### Service dependency graph

```
postgres, redis, rabbitmq → auth-service, otp-service, user-service, notification-service → client-app, advisor-app, internal-app
```

All `depends_on` use `condition: service_healthy` in docker-compose.

### Authentication flows

**client-app** — OTP only:
1. `POST /auth/client/request-otp` → auth-service publishes `auth.otp.requested` → 202 immediately
2. otp-service consumes event → generates OTP → bcrypt-hashes it → stores in Redis (`otp:{channel}:{destination}`, TTL 300s) → sends via provider
3. `POST /auth/client/verify-otp` → auth-service calls otp-service `/otp/verify` → issues JWT pair

**advisor-app** — Password + OTP 2FA + Google OAuth:
1. `POST /auth/advisor/login` → bcrypt compare → stores `advisor:session:{sessionId}` in Redis → publishes `auth.otp.requested`
2. `POST /auth/advisor/verify-otp` → validates OTP + session → publishes `auth.otp.verified` + `auth.login.success` → issues JWT pair
3. Google OAuth: `GET /auth/oauth/google` → consent screen → `/auth/oauth/google/callback` → publishes `auth.login.success` → issue JWT

**internal-app** — Google OAuth only, **membership-gated**:
1. `GET /auth/oauth/internal/google` → Google consent screen
2. `GET /auth/oauth/internal/google/callback` → admission check `SELECT EXISTS(... FROM team_users WHERE lower(email)=$1 AND is_active=TRUE)`. **Reject** if no active row. Otherwise `sp_create_team_user_via_oauth` binds the Google identity to the existing row and returns the canonical `team_users.id` → JWT issued.

Onboarding a new internal user = `INSERT INTO team_users (...)` first, then the user logs in. There is no auto-provisioning — strangers who hit the OAuth endpoint receive `/auth/error?reason=not_authorised`.

### Token lifecycle

- **Access token** (15 min): JWT, stored in JS memory only (never localStorage). Validated by signature alone — no Redis lookup on every request.
- **Refresh token** (7 days): JWT stored in Redis at `refresh:{userId}:{tokenId}`, sent as httpOnly cookie. Treated as a **stable, revocable server-side session** — `/auth/refresh` validates it against Redis and mints a new access token **without rotating or deleting** it (single-use rotation caused concurrent-refresh races that logged browser sessions out). Revoked by deleting the Redis key (logout / admin); the key's TTL slides on activity. Session ends at refresh-token expiry or revocation.
- Silent refresh: AuthContext schedules a `setTimeout` 30s before access token expiry.
- On 401: axios interceptor calls `/auth/refresh`; concurrent refresh calls are **deduplicated** (one in-flight request shared) so they can't race.

### Event bus — pluggable adapter layer

Python services use `aio_pika` directly via a process-level singleton in `eventbus.py`. Node services import from `@turtle/events` (`shared/events/`). No service imports broker SDKs directly outside these modules.

**Python wiring pattern** (auth-service, otp-service):
```python
from eventbus import publish_event, start_consumer

await publish_event("auth.otp.requested", payload)  # publisher
await start_consumer("auth.otp.requested", "otp-service-group", handler)  # consumer
```

**Node wiring pattern** (user-service, notification-service):
```typescript
import { getEventBus } from "@turtle/events";
const bus = getEventBus({ clientId: "notification-service", groupId: "notification-service-group" });
await bus.subscribe("auth.login.success", handler);
```

**Adapters** (`shared/events/src/adapters/`):

| `EVENT_BUS` value | Adapter | Publish | Subscribe |
|---|---|---|---|
| `rabbitmq` | `RabbitMQAdapter` | topic exchange `turtle.events`, persistent | durable queue, prefetch=1 |
| `kafka` | `KafkaAdapter` | kafkajs producer, GZIP | kafkajs consumer group |
| `aws-sns` | `AWSSNSSQSAdapter` | SNS PublishCommand | SQS long-poll (20s) |
| `redis-streams` | `RedisStreamsAdapter` | XADD | XREADGROUP consumer group |
| `eventbridge` | `EventBridgeAdapter` | PutEvents to `turtle-corporate` bus | SQS long-poll (EB rule → SQS) |

RabbitMQ is the default in docker-compose. Kafka requires adding `zookeeper` + `kafka` services.

**Event topics** (defined in `packages/types/src/index.ts` as `KafkaTopics` enum):

| Topic | Published by | Consumed by |
|---|---|---|
| `auth.otp.requested` | auth-service | otp-service |
| `auth.otp.verified` | otp-service, auth-service | notification-service (not yet wired) |
| `auth.login.success` | auth-service | notification-service |
| `auth.login.failed` | auth-service | notification-service |
| `auth.token.refreshed` | auth-service | notification-service (not yet wired) |

### OTP providers

`OTP_PROVIDER` env: `mock | twilio | aws | msg91 | gupshup | haptic | infobip`

Factory in `services/otp-service/providers/factory.py`. In `mock` mode OTPs print to logs — no credentials needed for local dev.

Security: raw OTP is **never** stored in Redis. Only bcrypt hash. Validate via `bcrypt.checkpw()` only. 3 failed attempts → key deleted entirely.

### Redis key conventions

| Key | Value | TTL |
|---|---|---|
| `otp:{channel}:{destination}` | `{ hash, attempts, expiresAt }` | 300s |
| `otprate:{destination}` | request count | 900s (15 min) |
| `refresh:{userId}:{tokenId}` | sessionId | 7d |
| `advisor:session:{sessionId}` | `{ advisorId, role, step }` | 300s |
| `rl:{prefix}:ip:{ip}` | request count | window seconds |

### TypeScript path aliases (Node packages and apps only)

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

- `OTP_PROVIDER` is env-driven: `twilio | aws | msg91 | gupshup | haptic | infobip | mock`
- `EVENT_BUS` is env-driven: `rabbitmq` (default) `| kafka | aws-sns | redis-streams | eventbridge`
- Never hardcode secrets — use `.env.example` only
- All services must start via `docker-compose up`
- Never store raw OTPs in Redis — always bcrypt hash
- Access tokens in JS memory only, never localStorage or sessionStorage
- Refresh tokens in httpOnly cookies only — never readable by JS
- Python services (auth, otp): `aio_pika` directly via `eventbus.py` singleton
- Node services (user, notification): `@turtle/events` adapter from `shared/events/`
