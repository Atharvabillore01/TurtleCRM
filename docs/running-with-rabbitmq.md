# Running TurtleCRM with RabbitMQ

This guide covers how to spin up the full stack using **RabbitMQ** as the event bus and **Redis** for sessions, OTP storage, and refresh tokens.

---

## 1. Prerequisites

- Docker Desktop running
- `.env` file at repo root (copy from `.env.example`)

---

## 2. Configure `.env`

Only these variables need to be set correctly for RabbitMQ mode:

```env
# ─── Event Bus ───────────────────────────────────────────────
EVENT_BUS=rabbitmq
RABBITMQ_URL=amqp://guest:guest@localhost:5672   # local dev
# Inside Docker containers, the URL is set automatically by docker-compose

RABBITMQ_USER=turtle        # optional — defaults to "turtle"
RABBITMQ_PASS=changeme      # optional — defaults to "changeme"

# ─── Redis ───────────────────────────────────────────────────
REDIS_PASSWORD=changeme
REDIS_URL=redis://:changeme@localhost:6379       # local dev
# Inside Docker containers, this is overridden to redis://:changeme@redis:6379
```

> `KAFKA_BROKERS` is not needed and can be left blank or removed when `EVENT_BUS=rabbitmq`.

---

## 3. Run with Docker (full stack)

### Start everything

```bash
docker-compose up --build
```

This starts in order (each waits for its dependency to be healthy):

```
redis → rabbitmq → auth-service, otp-service, notification-service → client-app, advisor-app
```

### Start only infrastructure (for local dev of services)

```bash
docker-compose up -d redis rabbitmq
```

### Stop everything

```bash
docker-compose down
```

### Stop and wipe all volumes (fresh start)

```bash
docker-compose down -v --remove-orphans
```

---

## 4. Redis — what it stores

Redis is used for **session state, OTPs, and refresh tokens** — it is not the event bus.

| Key pattern | What it holds | TTL |
|---|---|---|
| `otp:{channel}:{destination}` | bcrypt-hashed OTP + attempt count | 300s (5 min) |
| `otprate:{destination}` | rate-limit counter | 900s (15 min) |
| `advisor:session:{sessionId}` | advisor login step (`{ advisorId, role, step }`) | 300s |
| `refresh:{userId}:{tokenId}` | refresh token (rotated on every use) | 7 days |
| `rl:{prefix}:ip:{ip}` | rate-limit counter per IP | window seconds |

### Redis Docker config (from docker-compose.yml)

```yaml
redis:
  image: redis:7-alpine
  command: redis-server --requirepass ${REDIS_PASSWORD}
  ports:
    - "6379:6379"
  volumes:
    - redis_data:/data
  healthcheck:
    test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
    interval: 10s
    timeout: 5s
    retries: 5
```

- Password is set via `REDIS_PASSWORD` in `.env`
- Data is persisted in the `redis_data` Docker volume
- All services connect via `redis://:${REDIS_PASSWORD}@redis:6379` inside Docker

### Test Redis is working

```bash
docker exec -it $(docker ps -qf name=redis) redis-cli -a changeme ping
# Expected: PONG

# Check an OTP key (replace with actual destination)
docker exec -it $(docker ps -qf name=redis) redis-cli -a changeme keys "otp:*"

# Check advisor sessions
docker exec -it $(docker ps -qf name=redis) redis-cli -a changeme keys "advisor:session:*"
```

---

## 5. RabbitMQ — what it routes

RabbitMQ is the **event bus** — services publish and subscribe via a single topic exchange named `turtle.events`.

| Topic (routing key) | Publisher | Consumer(s) |
|---|---|---|
| `auth.otp.requested` | auth-service | otp-service |
| `auth.otp.verified` | otp-service | — |
| `auth.login.success` | auth-service | notification-service |
| `auth.login.failed` | auth-service | notification-service |
| `auth.token.refreshed` | auth-service | — |

Each consumer gets its own **durable queue** named `{servicePrefix}.{topic}`, e.g.:
- `otp-service.auth.otp.requested`
- `notification-service.auth.login.success`

Queues survive broker restarts and have a 7-day message TTL. Failed messages are nacked without requeue to avoid poison-pill loops.

### RabbitMQ Docker config (from docker-compose.yml)

```yaml
rabbitmq:
  image: rabbitmq:3.13-management-alpine
  environment:
    RABBITMQ_DEFAULT_USER: ${RABBITMQ_USER:-turtle}
    RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASS:-changeme}
  ports:
    - "5672:5672"    # AMQP — services connect here
    - "15672:15672"  # Management UI
  volumes:
    - rabbitmq_data:/var/lib/rabbitmq
  healthcheck:
    test: ["CMD", "rabbitmq-diagnostics", "ping"]
    interval: 10s
    timeout: 5s
    retries: 5
    start_period: 20s
```

### RabbitMQ Management UI

Open [http://localhost:15672](http://localhost:15672) in your browser.

**Turtle Team Login — Advisor & Staff Portal**

| Field | Value |
|---|---|
| Username | `turtle` (override via `RABBITMQ_USER` in `.env`) |
| Password | `changeme` (override via `RABBITMQ_PASS` in `.env`) |

From the UI you can:
- See the `turtle.events` exchange under **Exchanges**
- Inspect queues and message counts under **Queues**
- Publish test messages manually

---

## 6. Service URLs after startup

| Service | URL |
|---|---|
| client-app | http://localhost:3000 |
| advisor-app | http://localhost:3001 |
| auth-service | http://localhost:4000 |
| otp-service | http://localhost:4001 |
| user-service | http://localhost:4002 |
| notification-service | http://localhost:4003 |
| RabbitMQ Management | http://localhost:15672 |
| Redis | localhost:6379 |

---

## 7. Healthcheck

```bash
# One-shot check
./scripts/healthcheck.sh

# Retry loop (up to 120s — useful right after docker-compose up)
./scripts/healthcheck.sh --wait
```

---

## 8. Common issues

| Problem | Fix |
|---|---|
| Service exits with `ECONNREFUSED 5672` | RabbitMQ not healthy yet — wait ~20s or use `--wait` flag |
| `WRONGPASS` on Redis connect | `REDIS_PASSWORD` in `.env` doesn't match what Redis was started with — run `docker-compose down -v` and restart |
| OTPs not arriving | Check `EVENT_BUS=rabbitmq` in `.env` and confirm otp-service subscribed: look for `[rabbitmq] subscribed to auth.otp.requested` in otp-service logs |
| Exchange not found | First publish creates it — if you wiped volumes, it re-creates automatically on next startup |

---

## 9. Switching back to Kafka

Change one line in `.env`:

```env
EVENT_BUS=kafka
KAFKA_BROKERS=kafka:9092
```

Then add the Kafka/Zookeeper services back to docker-compose (or restore from git) and restart.
