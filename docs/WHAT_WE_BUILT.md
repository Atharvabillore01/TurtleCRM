# TurtleCRM — What We Built, Why, and How to Use It
**Date:** 2026-05-19  
**Branch:** `abi-dtq-implementation`

---

## 1. What is TurtleCRM

A microservices CRM platform with three user-facing apps and four backend services.

```
apps/
  client-app/        React SPA — clients authenticate via OTP only (port 3000)
  advisor-app/       React SPA — advisors authenticate via password + OTP 2FA + Google OAuth (port 3001)
  internal-app/      React SPA — internal team, Google OAuth only (port 3002)

services/
  auth-service/      Python/FastAPI — issues JWTs, orchestrates OTP and OAuth flows (port 4000)
  otp-service/       Python/FastAPI — generates and validates OTPs, dispatches via provider (port 4001)
  user-service/      Python/FastAPI — user/advisor CRUD (port 4002)
  notification-service/ Python/FastAPI — sends email/push on login events (port 4003)

shared/
  db/                Generic proc-caller library used by all Python services
  events/            Pluggable event bus adapters (RabbitMQ default)
```

---

## 2. Production Hardening — What Was Implemented

This section covers every improvement made to take the project from dev-grade to production-ready.

---

### 2.1 Transactional Outbox Pattern

**Why:**  
Without this, `publish_event()` was called directly inside route handlers. If the service crashed between the HTTP response and the RabbitMQ publish, the event was silently lost — a client would think OTP was requested but otp-service never received it.

**What:**  
Every event write now goes to the `outbox` DB table first. A background worker (`workers/outbox_publisher.py`) polls for unpublished rows and delivers them to RabbitMQ. If delivery fails, it retries up to 10 times. After 10 failures it moves the event to `outbox_dlq`.

**Flow:**
```
Route handler
  → write_outbox_event()        [writes to DB — atomic with any other DB write]
  → returns 202 to client

outbox_publisher (background)
  → sp_poll_unpublished_events  [FOR UPDATE SKIP LOCKED — safe for multiple workers]
  → publish_event() to RabbitMQ
  → sp_mark_event_published     [success]
  → sp_mark_event_failed        [transient failure, retry later]
  → sp_move_to_dlq              [exhausted retries]
```

**Files:**
- `services/auth-service/outbox.py` — thin wrapper: `write_outbox_event()`
- `services/auth-service/db/outbox_procs.py` — proc stubs for all outbox operations
- `services/auth-service/workers/outbox_publisher.py` — background polling loop

---

### 2.2 Dead Letter Queue (DLQ)

**Why:**  
RabbitMQ messages that fail processing (bad payload, downstream timeout, etc.) were being nacked and dropped — lost forever.

**What:**  
Every queue now has a corresponding DLQ bound via a dead-letter exchange (`turtle.dlx`). Failed messages are retried up to 3 times (tracked via `x-retry-count` header). On the 4th failure the message is routed to `<queue>.dlq` automatically by RabbitMQ — no code needed at the consumer.

**Files:**
- `services/otp-service/eventbus.py` — DLX setup, retry header logic
- `services/notification-service/consumer.py` — same pattern
- `shared/events/src/adapters/rabbitmq.adapter.ts` — TypeScript adapter updated with same pattern

---

### 2.3 Prefetch Count

**Why:**  
Default prefetch of 1 means each consumer fetches one message, processes it, then fetches the next. Under load this serialises everything.

**What:**  
Prefetch increased to 10 across all consumers. Consumer processes up to 10 messages concurrently before asking for more.

**Files:** `eventbus.py` in otp-service and notification-service.

---

### 2.4 Graceful Shutdown

**Why:**  
On `docker stop`, SIGTERM was sent but containers were killed after 10 seconds (Docker default) — in-flight messages were dropped.

**What:**  
`stop_grace_period: 45s` added to auth, otp, notification services in `docker-compose.yml`. Services already had asyncio lifespan cancellation wired in.

---

### 2.5 Rate Limiting

**Why:**  
Without rate limiting, anyone could spam OTP requests — both exhausting the SMS/email provider and enabling enumeration attacks.

**What:**  
Redis-based sliding window counter. `POST /auth/client/request-otp` allows 3 requests per 15 minutes per destination. Returns HTTP 429 with `Retry-After` header on breach.

**Files:**
- `services/auth-service/utils/rate_limiter.py` — `RateLimiter` class
- `services/auth-service/routes/client.py` — rate limit applied before publishing

---

### 2.6 Circuit Breaker

**Why:**  
If the OTP provider (Twilio, AWS SNS, etc.) is down, every message in the queue would fail, burn retries, and flood DLQ. The service should stop trying for a period rather than hammering a broken provider.

**What:**  
5 consecutive failures → circuit OPENS. All calls immediately fail for 60 seconds (no provider calls). After 60s → HALF-OPEN: one trial call. If it succeeds → CLOSED again.

**Files:**
- `services/otp-service/circuit_breaker.py` — `CircuitBreaker` class
- `services/otp-service/consumer.py` — wraps provider dispatch call

---

### 2.7 Message Deduplication

**Why:**  
RabbitMQ can redeliver a message after a consumer crash (at-least-once delivery). Without deduplication, a login success notification could fire twice.

**What:**  
On each message, a Redis key `dedup:{message_id}` is set with `NX` (only if not exists) and 1-hour TTL. If the key already exists → message already processed → silently ack and skip.

**Files:**
- `services/notification-service/deduplication.py` — `is_duplicate()` function
- `services/notification-service/consumer.py` — checks before handling

---

### 2.8 Schema Validation on Event Consumption

**Why:**  
A malformed event (missing fields, wrong types) would crash the handler and route to DLQ. Better to catch it explicitly at the boundary and log a clear error rather than a stack trace.

**What:**  
Pydantic models for every consumed event. Before processing, the raw payload is validated:  
`OTPRequestedEvent(**payload)` — if it fails, the message is nacked to DLQ immediately with a structured error log.

**Files:**
- `services/auth-service/schemas/events.py`
- `services/otp-service/schemas/events.py`
- `services/otp-service/consumer.py` — validation at message entry

---

### 2.9 Distributed Tracing (OpenTelemetry → Grafana Tempo)

**Why:**  
With 4 services, a single request touches multiple hops. Without tracing, debugging latency or errors across services means manually correlating logs.

**What:**  
Each Python service auto-instruments FastAPI with OpenTelemetry. Spans are exported via OTLP to Grafana Tempo. Trace ID flows through all HTTP hops.

**Files:**
- `services/auth-service/tracing.py`
- `services/otp-service/tracing.py`
- `services/notification-service/tracing.py`
- `monitoring/tempo.yaml`

---

### 2.10 Metrics (Prometheus → Grafana)

**Why:**  
No visibility into request rates, error rates, or latency in production.

**What:**  
Each service exposes `/metrics` (Prometheus format). Counters for requests total, events published/consumed. Histogram for request duration. Grafana dashboard pre-configured.

**Files:**
- `services/*/metrics.py` — middleware + endpoint in each service
- `monitoring/prometheus/prometheus.yml` — scrape config
- `monitoring/prometheus/alerts.yml` — alerting rules (high error rate, high latency, DLQ growth)
- `monitoring/alertmanager.yml` — alert routing
- `monitoring/grafana/` — dashboard JSON

---

### 2.11 No-DB Proc Layer (Shared Library)

**Why:**  
The backend team owns all DB schema and stored procedures. Application code must never write SQL, run migrations, or touch the DB directly. At the same time, the app needs to work end-to-end today without a real DB.

**What:**  
A single shared library (`shared/db/proc_caller.py`) handles all DB calls. Each service registers named handlers at startup. In the current state, handlers are in-memory stubs. When the backend team delivers a real stored proc, only the handler body changes — nothing else in the codebase.

**How the result envelope works:**  
Every handler returns a `ProcResult`:

```python
@dataclass
class ProcResult:
    result: Any = None          # the data — map this to your model
    errormessage: str = None    # human-readable error
    errornumber: int = None     # numeric code — None = success
    nextAction: str = None      # hint: "retry", "change_credentials", etc.

    @property
    def ok(self) -> bool:
        return self.errornumber is None
```

**Files:**
- `shared/db/proc_caller.py` — `call_proc()`, `register_proc()`, `ProcResult`
- `shared/db/__init__.py` — exports
- `services/auth-service/db/outbox_procs.py` — outbox proc stubs
- `services/user-service/db/user_procs.py` — user/advisor proc stubs

---

## 3. How to Run

```bash
# Start everything
docker-compose up --build

# Start infra only (for local service development)
docker-compose up -d postgres redis rabbitmq tempo prometheus grafana

# Individual services
cd services/auth-service && uvicorn main:app --reload --port 4000
cd services/otp-service  && uvicorn main:app --reload --port 4001
cd services/user-service && uvicorn main:app --reload --port 4002

# Check all services are healthy
./scripts/healthcheck.sh --wait
```

---

## 4. How to Add a New Proc

When the backend team delivers `sp_get_client_portfolio`:

**Step 1 — Add the domain model** (in `db/user_procs.py`):
```python
@dataclass
class PortfolioRow:
    id: str
    client_id: str
    total_value: float
```

**Step 2 — Replace the stub handler**:
```python
async def _sp_get_client_portfolio(client_id: str) -> ProcResult:
    # TODO: replace with real asyncpg call when DB_URL is set
    row = _portfolios.get(client_id)
    return ProcResult(result=row)
```

**Step 3 — Register it**:
```python
def register_user_mocks() -> None:
    ...
    register_proc("sp_get_client_portfolio", _sp_get_client_portfolio)
```

**Step 4 — Add the public wrapper**:
```python
async def proc_get_client_portfolio(client_id: str) -> Optional[PortfolioRow]:
    res = await call_proc("sp_get_client_portfolio", client_id)
    if not res.ok:
        raise RuntimeError(f"sp_get_client_portfolio failed [{res.errornumber}]: {res.errormessage}")
    return res.result
```

**Step 5 — Use it in routes**:
```python
portfolio = await proc_get_client_portfolio(client_id)
if not portfolio:
    raise HTTPException(404, "Portfolio not found")
```

No other files change. Call sites stay identical whether the handler is a stub or a real DB call.

---

## 5. Authentication Flows

### Client OTP Flow
```
POST /auth/client/request-otp  →  write_outbox_event("auth.otp.requested")
                                   → 202 immediately
outbox-publisher               →  publishes to RabbitMQ
otp-service consumer           →  generates OTP → bcrypt hash → stores in Redis (300s TTL) → dispatches via provider

POST /auth/client/verify-otp   →  calls otp-service POST /otp/verify
                                   → on success: issues access token (15min) + refresh token (7d)
```

### Advisor 2FA Flow
```
POST /auth/advisor/login        →  fetch advisor from user-service
                                   → bcrypt compare password
                                   → store session in Redis (300s)
                                   → write_outbox_event("auth.otp.requested")
                                   → 202

POST /auth/advisor/verify-otp   →  validate Redis session + call otp-service /otp/verify
                                   → on success: issue JWT pair + delete session key
```

### Token Lifecycle
- **Access token:** 15 min, JWT, kept in JS memory only (never localStorage)
- **Refresh token:** 7 days, JWT, httpOnly cookie at `/auth` path only
- **Silent refresh:** AuthContext schedules `setTimeout` 30s before expiry
- **Rotation:** On every `/auth/refresh`, old `refresh:{userId}:{tokenId}` key is deleted and a new pair issued atomically

---

## 6. Event Bus

Default broker: **RabbitMQ** (exchange: `turtle.events`, type: topic).  
Switch via `EVENT_BUS` env: `rabbitmq | kafka | aws-sns | redis-streams | eventbridge`

| Topic | Published by | Consumed by |
|---|---|---|
| `auth.otp.requested` | auth-service | otp-service |
| `auth.otp.verified` | auth-service, otp-service | notification-service (not yet wired) |
| `auth.login.success` | auth-service | notification-service |
| `auth.login.failed` | auth-service | notification-service |
| `auth.token.refreshed` | auth-service | notification-service (not yet wired) |
| `call.transcript.ready` | external | user-service |
| `crm.fields.extracted` | user-service | future analytics service |

---

## 7. OTP Providers

Switch via `OTP_PROVIDER` env: `mock | twilio | aws | msg91 | gupshup | haptic | infobip`

In `mock` mode (default for local dev), OTPs are printed to stdout — no credentials needed.

---

## 8. Monitoring (after `docker-compose up`)

| URL | What |
|---|---|
| `http://localhost:15672` | RabbitMQ management (turtle / changeme) |
| `http://localhost:9090` | Prometheus |
| `http://localhost:3100` | Grafana Tempo (trace search) |
| `http://localhost:3000` | Grafana dashboards |
| `http://localhost:4000/metrics` | auth-service raw metrics |
| `http://localhost:4001/metrics` | otp-service raw metrics |
| `http://localhost:4002/metrics` | user-service raw metrics (if metrics.py added) |
| `http://localhost:4003/metrics` | notification-service raw metrics |

---

## 9. Known Gaps (Intentional — Not Yet Built)

| Gap | Why not done |
|---|---|
| `auth.otp.verified`, `auth.token.refreshed` not consumed by notification-service | Event published, consumer stub not wired — next sprint |
| `crm.fields.extracted` has no consumer | Future analytics/CRM service, not in scope yet |
| Advisor login has no rate limiting | Will add after auth flow is fully stable |
| Notification-service handlers only log, don't send | SendGrid integration is next step |
| `sp_save_transcript_extraction` stub will be redesigned | Transcript flow is changing |
