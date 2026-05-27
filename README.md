# Turtle Corporate — Fintech Monorepo

Full-stack authentication platform for client, advisor, and internal team portals.

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| Docker + Docker Compose | 25+ | Compose v2 healthcheck syntax |
| Node.js | 20+ LTS | Apps and Node services |
| npm | 10+ | Workspace resolver |
| Python | 3.12+ | auth-service and otp-service |

## Quick Start

```bash
git clone https://github.com/your-org/turtle-corporate
cd turtle-corporate
cp .env.example .env          # fill in secrets (see below)
docker-compose up --build
```

All services start in dependency order. When ready:

| URL | App |
|---|---|
| http://localhost:3000 | Client app (OTP-only auth) |
| http://localhost:3001 | Advisor app (Password + OTP 2FA + OAuth) |
| http://localhost:3002 | Internal app (Google OAuth only) |

## Ports

| Port | Service | Notes |
|---|---|---|
| 3000 | client-app | React SPA — OTP login for clients |
| 3001 | advisor-app | React SPA — full auth flow for advisors |
| 3002 | internal-app | React SPA — Google OAuth for internal team |
| 4000 | auth-service | Python/FastAPI — JWT issuer, OTP validation, OAuth |
| 4001 | otp-service | Python/FastAPI + RabbitMQ consumer — OTP dispatch |
| 4002 | user-service | Node/Fastify + Prisma — user CRUD |
| 4003 | notification-service | Node/Fastify + RabbitMQ consumer — email/push |
| 5432 | PostgreSQL | Persistent user data |
| 6379 | Redis | OTP cache, refresh tokens, rate-limit buckets |
| 5672 | RabbitMQ (AMQP) | Event bus between services |
| 15672 | RabbitMQ Management | http://localhost:15672 (guest/guest) |

## Switching OTP Provider

Set `OTP_PROVIDER` in `.env` before running:

```bash
OTP_PROVIDER=mock     # Prints OTP to service logs (no credentials needed)
OTP_PROVIDER=infobip  # Infobip SMS/email → requires INFOBIP_API_KEY, INFOBIP_SENDER_ID, INFOBIP_BASE_URL
OTP_PROVIDER=twilio   # Twilio SMS → requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
OTP_PROVIDER=aws      # AWS SNS (SMS) + SES (email) → requires AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
OTP_PROVIDER=msg91    # MSG91 → India-focused → requires MSG91_AUTH_KEY, MSG91_SENDER_ID, MSG91_TEMPLATE_ID
OTP_PROVIDER=haptic   # Haptic SMS → requires HAPTIC_API_KEY, HAPTIC_SENDER_ID, HAPTIC_BASE_URL
OTP_PROVIDER=gupshup  # Gupshup SMS → requires GUPSHUP_API_KEY, GUPSHUP_USERID, GUPSHUP_SENDER_ID
```

In `mock` mode the OTP prints to otp-service logs:

```bash
docker-compose logs -f otp-service
# [mock] SMS → +919876543210  OTP: 482910
```

## Switching Event Bus

```bash
EVENT_BUS=rabbitmq      # Default — durable queues, simple ops, runs in docker-compose out of the box
EVENT_BUS=kafka         # Persistent topics, consumer group offsets, event replay (add zookeeper + kafka to compose)
EVENT_BUS=aws-sns       # SNS publish → SQS consume — requires AWS credentials
EVENT_BUS=redis-streams # XADD/XREADGROUP — uses existing Redis, no extra infra
EVENT_BUS=eventbridge   # AWS EventBridge → SQS — requires AWS credentials
```

**RabbitMQ** is the default. It runs as part of docker-compose with no extra config.

**Kafka** offers event replay — if otp-service restarts it resumes from its last offset. To use it, add `zookeeper` and `kafka` services to docker-compose and set `EVENT_BUS=kafka`.

## Running Without Docker (local dev)

```bash
# Start infrastructure only
docker-compose up -d postgres redis rabbitmq

# Node services
npm install
cd services/user-service         && npm run dev   # :4002
cd services/notification-service && npm run dev   # :4003

# Python services
cd services/auth-service         && pip install -r requirements.txt && uvicorn main:app --reload --port 4000
cd services/otp-service          && pip install -r requirements.txt && uvicorn main:app --reload --port 4001

# React apps (each in a separate terminal)
cd apps/client-app               && npm run dev   # :3000 (Vite HMR)
cd apps/advisor-app              && npm run dev   # :3001 (Vite HMR)
cd apps/internal-app             && npm run dev   # :3002 (Vite HMR)
```

## Healthcheck

```bash
chmod +x scripts/healthcheck.sh
./scripts/healthcheck.sh
```

## Project Structure

```
apps/
  client-app/     React 18 — OTP-only auth (port 3000)
  advisor-app/    React 18 — Password + OTP + OAuth (port 3001)
  internal-app/   React 18 — Google OAuth for internal team (port 3002)
services/
  auth-service/   Python/FastAPI — JWT, OTP validation, OAuth (port 4000)
  otp-service/    Python/FastAPI + RabbitMQ consumer — OTP dispatch (port 4001)
  user-service/   Node/Fastify + Prisma — user CRUD (port 4002)
  notification-service/  Node/Fastify + RabbitMQ consumer — email/push (port 4003)
packages/
  types/          Shared TypeScript types + event interfaces
  config/         Typed env loaders (loadEnv, jwtConfig, redisConfig…)
  ui/             Shared React components (OTPInput, TurtleLogo, etc.)
shared/
  events/         Pluggable event bus adapters (@turtle/events)
```

## Environment Variables

Copy `.env.example` to `.env` and fill in:

- **JWT_SECRET** / **REFRESH_TOKEN_SECRET** — minimum 32 random characters
- **OTP_PROVIDER** credentials — depends on provider chosen above
- **GOOGLE_CLIENT_ID** / **GOOGLE_CLIENT_SECRET** — for advisor and internal app Google OAuth
- **RABBITMQ_URL** — defaults to `amqp://guest:guest@localhost:5672` for local dev
- **SENDGRID_API_KEY** — for email OTP and notifications

All other variables have working defaults for local development.

