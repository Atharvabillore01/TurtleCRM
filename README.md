# Turtle Corporate — Fintech Monorepo

Full-stack authentication platform for client and advisor portals.

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| Docker + Docker Compose | 25+ | Compose v2 healthcheck syntax |
| Node.js | 20+ LTS | Matches container base image |
| npm | 10+ | Workspace resolver |

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

## Ports

| Port | Service | Notes |
|---|---|---|
| 3000 | client-app | React SPA — OTP login for clients |
| 3001 | advisor-app | React SPA — full auth flow for advisors |
| 4000 | auth-service | JWT issuer, OTP validation, OAuth handler |
| 4001 | otp-service | Kafka consumer → OTP send via provider |
| 4002 | user-service | User CRUD, Prisma + PostgreSQL |
| 4003 | notification-service | Kafka consumer → email/push notifications |
| 5432 | PostgreSQL | Persistent user data |
| 6379 | Redis | OTP cache, refresh tokens, rate-limit buckets |
| 9092 | Kafka (internal) | Event bus between services |
| 29092 | Kafka (host) | Access Kafka from your local machine |

## Switching OTP Provider

Set `OTP_PROVIDER` in `.env` before running:

```bash
OTP_PROVIDER=infobip  # Default for this setup -> requires INFOBIP_API_KEY, INFOBIP_SENDER_ID, INFOBIP_BASE_URL
OTP_PROVIDER=mock     # Prints OTP to service logs (no credentials needed)
OTP_PROVIDER=twilio   # Twilio SMS → requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
OTP_PROVIDER=aws      # AWS SNS (SMS) + SES (email) → requires AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
OTP_PROVIDER=msg91    # MSG91 → India-focused → requires MSG91_AUTH_KEY, MSG91_SENDER_ID, MSG91_TEMPLATE_ID
OTP_PROVIDER=haptic   # Haptic SMS → requires HAPTIC_API_KEY, HAPTIC_SENDER_ID, HAPTIC_BASE_URL
OTP_PROVIDER=infobip  # Infobip SMS/email -> requires INFOBIP_API_KEY, INFOBIP_SENDER_ID, INFOBIP_BASE_URL
```

In `mock` mode the OTP prints to otp-service logs:

```bash
docker-compose logs -f otp-service
# [mock] SMS → +919876543210  OTP: 482910
```

## Switching Event Bus

```bash
EVENT_BUS=kafka      # Default — persistent topics, consumer group offsets, event replay
EVENT_BUS=rabbitmq   # Traditional queues, simpler ops, requires RABBITMQ_URL
```

**Kafka** is recommended for production. It stores events for 7 days (configurable), so if otp-service restarts it resumes from where it left off without dropping any OTP requests.

**RabbitMQ** is simpler to operate locally without Zookeeper overhead — set `EVENT_BUS=rabbitmq` and remove the `zookeeper` and `kafka` services from docker-compose for a lighter dev stack.

## Running Without Docker (local dev)

Requires PostgreSQL, Redis, and Kafka running locally (or via Docker for infra only).

```bash
# Start infrastructure only
docker-compose up -d postgres redis zookeeper kafka

# Install all workspace dependencies
npm install

# Run all services in watch mode (tsx reloads on save)
npm run dev

# Or run a single service
cd services/auth-service && npm run dev    # :4000
cd services/otp-service  && npm run dev    # :4001
cd apps/client-app        && npm run dev   # :3000 with Vite HMR
cd apps/advisor-app       && npm run dev   # :3001 with Vite HMR
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
services/
  auth-service/   Fastify — JWT, OTP validation, OAuth (port 4000)
  otp-service/    Fastify + Kafka consumer — OTP dispatch (port 4001)
  user-service/   Fastify + Prisma — user CRUD (port 4002)
  notification-service/  Fastify + Kafka consumer — email/push (port 4003)
packages/
  types/          Shared TypeScript types + Kafka event interfaces
  config/         Typed env loaders (loadEnv, jwtConfig, redisConfig…)
  ui/             Shared React components (OTPInput, TurtleLogo, etc.)
```

## Environment Variables

Copy `.env.example` to `.env` and fill in:

- **JWT_SECRET** / **REFRESH_TOKEN_SECRET** — minimum 32 random characters
- **OTP_PROVIDER** credentials — depends on provider chosen above
- **GOOGLE_CLIENT_ID** / **GOOGLE_CLIENT_SECRET** — for advisor Google OAuth
- **SENDGRID_API_KEY** — for email OTP and notifications

All other variables have working defaults for local development.

