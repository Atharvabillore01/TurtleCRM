# Turtle CRM — Meeting Intelligence: What's Implemented & How It Works

> **Scope:** The meeting → transcript → AI extraction → human validation pipeline.
> This is the detailed technical companion to [`EDA_ARCHITECTURE.md`](./EDA_ARCHITECTURE.md).
> It describes **what is built today**, the **exact request/event flow**, and **how
> each piece works**, with file and stored-procedure references.

---

## 1. Components & ports

| Component | Tech | Port | Responsibility |
|---|---|---|---|
| **internal-app** | React 18 + Vite + TS + Tailwind | 3002 | Internal team UI: scheduling, ingest, AI validation, token usage |
| **meeting-service** | Python 3.12 + FastAPI + Uvicorn | 4004 | Orchestrates meetings, transcripts, extractions; runs background workers |
| **CRM-AI service** | Python + FastAPI (separate deploy) | 5000 | LLM extraction (`/extract`) + summarization (`/summarize`) |
| **PostgreSQL** | — | 5432 | System of record (all entities + stored procedures) |
| **RabbitMQ** | — | 5672 | Event bus (`turtle.events` topic exchange) |
| **Redis** | — | 6379 | Reserved for caching (initialized, lightly used) |
| **Fireflies.ai** | External | — | Records calls, delivers transcripts (GraphQL + webhook) |
| **Google Calendar** | External | — | Calendar event + Google Meet link creation |

The meeting-service is configured via `services/meeting-service/config.py`:
`database_url`, `rabbitmq_url`, `redis_url`, `crm_ai_service_url` (default
`http://localhost:5000`), Fireflies keys (`firefly_api_key`,
`firefly_webhook_secret`, `firefly_bot_email`), and Google service-account settings
(`google_service_account_file`, `google_impersonate_email`, `google_calendar_id`,
`google_calendar_timezone`).

---

## 2. Service startup

`services/meeting-service/main.py` uses a FastAPI `lifespan` that, on boot:

1. Registers stored-procedure wrappers and initializes the Postgres connection pool.
2. Hydrates any extractions cached on disk.
3. Launches **three background worker tasks**:
   - `run_transcript_processor()`
   - `run_data_persistence()`
   - `run_summary_worker()`
4. On shutdown, cancels the workers and closes RabbitMQ + Redis cleanly.

Routers mounted:

| Prefix | Router | File |
|---|---|---|
| `/api/meetings` | meetings | `routes/meetings.py` |
| `/api/meetings/ingest` | manual ingest | `routes/ingest.py` |
| `/webhooks` | Fireflies webhook | `routes/webhooks.py` |
| `/api/extractions` | extraction review/validation | `routes/extractions.py` |
| `/api/clients`, `/api/advisors` | lookups | `routes/clients.py` |
| `/metrics` | Prometheus | `metrics.py` |
| `/health` | health check | `main.py` |

---

## 3. The full flow, end to end

### 3.1 Schedule a meeting — `POST /api/meetings/schedule`
`routes/meetings.py`

1. `sp_schedule_meeting` creates the `meetings` row + `meeting_attendees` +
   `meeting_internal_details` (agenda, `agents_to_use`, pre-meeting notes), returns
   `meeting_id`.
2. `google_calendar_client.create_meet_event(...)` creates the calendar event with a
   Google Meet conference (`conferenceDataVersion=1`, `hangoutsMeet`), invites all
   attendees **and the Fireflies bot**, and emails invites (`sendUpdates='all'`).
3. `sp_save_meeting_external_sync` stores the Google `event_id` + Meet URL (this is the
   key later used to match the Fireflies webhook).
4. Publishes **`meeting.scheduled`**.
5. Returns `{ meeting_id, status, meet_url, google_event_id }`.

Related lifecycle endpoints (each updates status and syncs Google Calendar where
relevant, then publishes its event):
- `POST /{id}/cancel` → `sp_cancel_meeting` + `delete_meet_event` → `meeting.cancelled`
- `POST /{id}/reschedule` → `sp_reschedule_meeting` + `patch_meet_event` → `meeting.rescheduled`
- `POST /{id}/status`, `/complete`, `/no-show` → status transitions
- `GET /{id}/lifecycle` → `fn_meeting_lifecycle_state` (UI badge)
- `GET /agents` → the list of available AI agents

### 3.2 Transcript arrives — `POST /webhooks/firefly`
`routes/webhooks.py` → `_handle_transcript_ready()`

1. **Verify signature** — HMAC-SHA256 against `firefly_webhook_secret` (checks
   `x-hub-signature-256` / `x-fireflies-signature` / etc.; skipped if no secret set).
2. **Recognize event type** — accepts `meeting.transcribed`, `meeting.summarized`,
   "Transcription completed", and similar.
3. **Download transcript** from Fireflies GraphQL (`firefly_client.get_transcript`),
   formatted as `"{speaker}: {text}"` lines.
4. **Persist transcript to disk** at `TRANSCRIPTS_DIR` (default `/app/transcripts`).
5. **Find the scheduled meeting** via `fn_find_meeting_by_meet_url(meet_url)`:
   - **Path A (matched):** use that meeting's `client_id`, `agenda`, `agents_to_use`.
   - **Path B (no match):** `_auto_ingest_unscheduled_meeting()` — fetch attendees,
     drop the bot + system actor, require exactly **2 real attendees**, match one to an
     active advisor (`adviser_users JOIN advisors`), treat the other as the client, and
     call `sp_ingest_meeting_from_fireflies` to atomically create
     client/client_users/meeting/attendees/transcript/external-sync.
6. Publishes **`meeting.transcribed`** with the full payload (below).

A dev-only `POST /webhooks/firefly/replay` exists for local testing.

**`meeting.transcribed` payload:**
```json
{
  "firefly_meeting_id": "...", "title": "...", "meet_url": "...",
  "transcript_url": "...", "duration_seconds": 0, "transcript_path": "...",
  "transcript_text": "...", "meeting_id": "...", "client_id": "...",
  "agenda": "...", "agents_to_use": ["DemographicsAgent", "..."],
  "timestamp": "ISO-8601"
}
```

### 3.3 Manual ingest — `POST /api/meetings/ingest` (+ `/ingest/preview`)
`routes/ingest.py`

For importing **past** Fireflies meetings on demand from the internal-app Ingest page.

- Accepts a Fireflies share URL, a Google Meet URL, a bare Meet code, or a bare
  Fireflies ID (`_classify_input` + `_resolve_to_firefly_id`, which searches the recent
  50 transcripts when given a Meet code).
- `/preview` is read-only: it fetches, classifies attendees, and reports whether the
  client exists and whether this meeting was already ingested — **no DB writes**.
- `/ingest` re-fetches + re-classifies **server-side** (never trusts the client), then
  calls `sp_ingest_meeting_from_fireflies` and publishes the **same**
  `meeting.transcribed` event, so it merges into the identical downstream pipeline.
- **Idempotent** on `fireflies_meeting_id` (+ optional `idempotency_key`); replay-safe.

Attendee classification (`_classify_attendees`) filters bot emails
(`fred@fireflies.ai`, `talk@turtlefinance.in`), requires exactly 2 real attendees, and
rejects ambiguous cases (no advisor / both advisors).

### 3.4 AI extraction — `workers/transcript_processor.py`
Consumes **`meeting.transcribed`** (queue `meeting-service-transcript`).

1. If `agents_to_use` is empty, expands to **all 10 agents**.
2. POSTs to **CRM-AI `/extract`** (10-minute timeout) with
   `{ transcript, meeting_id, context: { client_id, agenda, agents_to_use } }`.
   - Retries transient failures (5xx/timeout/504) with backoff 10s→20s→40s→80s (max 4);
     4xx fails fast.
3. Response includes: `fields` (up to 176, keyed by field ID, each with value +
   confidence + source + agent), `model`, `duration_seconds`, `token_usage` (per
   agent), `agents`, and optional `call_analysis` (advisor coaching).
4. Saves via **`sp_save_extraction`** (writes `extractions`, `extraction_fields`,
   `extraction_token_usage` [migration 025], and `call_analysis` [migration 027]),
   keyed on `extraction_job_id` for idempotency.
5. **Post-save audit:** re-reads the persisted field count and warns if the SP silently
   dropped fields (schema/type mismatch).
6. Publishes **`extraction.completed`**, **`extraction.summarize`**, and
   **`extraction.save`**.

### 3.5 Summary branch — `workers/summary_worker.py`
Consumes **`extraction.summarize`** (queue `meeting-service-summary`).

- POSTs to **CRM-AI `/summarize`** (2-minute timeout). On HTTP 404 it assumes the
  endpoint isn't deployed and skips silently (graceful degradation).
- Saves the executive summary + key points + decisions + sentiment via
  `sp_save_summary` (→ `meeting_summaries`) and each action item via
  `sp_save_action_item` (→ `meeting_action_items`, up to 10).
- Publishes **`meeting.summarized`**.

### 3.6 Domain-persistence branch — `workers/data_persistence.py`
Consumes **`extraction.save`** (queue `meeting-service-persistence`).

- Loads the full extraction (`fn_get_extraction`) and **buckets** the fields by ID range:
  - Demographics `1–42` → `sp_save_demographics`
  - Financials `43–78` → `sp_save_financials`
  - Goals `79–83` → `sp_save_goals`
  - Qualitative `144–158` → `sp_save_qualitative`

### 3.7 Human validation — `routes/extractions.py` + internal-app
The reviewer-facing lifecycle. UI lives in
`apps/internal-app/src/components/ai-validation/` and `routes/AiValidationPage.tsx`;
API calls are in `src/api/meetingApi.ts`.

| Endpoint | Method | Purpose | SP |
|---|---|---|---|
| `/api/extractions/` | GET | List (filter by `validated`) | `fn_list_extractions` |
| `/api/extractions/{id}` | GET | Full detail (fields + recent edits + call_analysis) | `fn_get_extraction` |
| `/api/extractions/{id}/token-usage` | GET | Per-agent token breakdown | `fn_extraction_token_usage` |
| `/api/extractions/{id}/fields` | POST | Edit/approve/reject fields (optimistic version) | `sp_patch_extraction_fields` |
| `/api/extractions/{id}/validate` | POST | Lock as authoritative (reason ≥5 chars) | `sp_validate_extraction` |
| `/api/extractions/{id}/unvalidate` | POST | Reopen for editing (reason ≥5 chars) | `sp_unvalidate_extraction` |
| `/api/extractions/{id}/validation-history` | GET | Audit trail (newest 10) | `fn_validation_history` |

**Validation lifecycle:** `Pending` (editable) → **Validate** (locked, green badge) →
optionally **Unvalidate** (editable again). Every transition writes
`extraction_validation_audit` with reviewer (from JWT), timestamp, reason, and notes.
Field edits write `extraction_field_audit` (before/after + reason). Concurrent edits
are guarded by the extraction `version` — a stale `expected_version` returns **409**;
editing a validated extraction returns **423 (locked)**.

---

## 4. The CRM-AI extraction engine (how the 176 fields are produced)

The CRM-AI service is a multi-agent extractor for Turtle Finance (NRI wealth
management). Tech: Python + FastAPI; multi-provider LLM abstraction defaulting to
**Anthropic `claude-sonnet-4-6`** (OpenAI / Gemini / Groq / Azure also supported).

**Endpoints:** `POST /extract`, `POST /transcript/chunk` (live-stream placeholder),
`GET /health`.

**Agent pipeline (orchestrator):**
- **Phase 1 (parallel, full transcript):** Demographics, Finance, Goals, Professional,
  Schedule, Qualitative.
- **Phase 2:** Task agent (gets Phase-1 results for prioritization context).
- **Phase 3:** Feedback agent + Advisory agent (Advisory also emits a separate
  `call_analysis` coaching report — *not* a CRM field).
- **Phase 4:** `SystemResolver` fills deterministic system fields (e.g. T_id, extracted_at).

**Per-field output:** each field returns `{ value, confidence, source }`. Confidence
labels map to scores: `exact_quote` 0.95, `clearly_inferable` 0.80, `estimated` 0.60,
`indirect` 0.40, `speculative` 0.15. Fields below the confidence threshold (default
0.70) are filtered out; Advisory fields bypass the threshold. The system handles
English / Hindi (Devanagari) / Hinglish and normalizes everything to English (e.g.
"teen crore" → numeric).

**Schema:** `schema/crm_schema.json` defines the 176 fields — each with `id`,
`attribute`, `touch_point` (category), `entity_*`, `source`, `filled_by`, and a
per-field `extraction_instruction`. The DB mirror of this is the `field_definitions`
table.

**Token tracking:** each provider accumulates input/output tokens; the response
includes a per-agent `token_usage` map plus a `__total__`. This is what powers the
**Token Usage page** (`routes/TokenUsagePage.tsx`) via `fn_extraction_token_usage`.

---

## 5. Database entities (system of record)

All persistence is through **stored procedures** (no inline SQL from the service);
wrappers live in `services/meeting-service/db/meeting_procs.py`, and the SQL is under
`turtle - Copy/turtlecrm-db/stored_procedures/meetings_new/`.

| Entity | Migration | Purpose |
|---|---|---|
| `meetings` | 005 | Meeting record |
| `meeting_attendees` | 005 | Clients + advisers per meeting |
| `meeting_internal_details` | 005 / 020 | Agenda, agents-to-run, notes |
| `meeting_external_sync` | 021 | Google/Fireflies IDs + Meet URL |
| `meeting_summaries` | 018 | Executive summary + key points |
| `meeting_action_items` | 018 | Follow-up tasks |
| `transcripts` | 018 | Transcript text + provider metadata |
| `extractions` | 018 / 022 / 027 | Extraction header, version, validated, call_analysis |
| `extraction_fields` | 022 | One row per extracted field |
| `field_definitions` | 022 | Catalogue of the 176 fields |
| `extraction_field_audit` | 022 | Field edit history |
| `extraction_validation_audit` | 024 | Validate/unvalidate log |
| `extraction_token_usage` | 025 | Tokens per agent |
| `clients`, `client_users` | 011 / 003 | Client + login user |
| `advisors`, `adviser_users` | 003 | Advisor + login user |
| `team_users` | 019 | Internal staff (reviewers) |

**Migration timeline for this feature (018 → 027):**
- 018 — meeting transcripts & extractions
- 020 — meeting lifecycle config
- 021 — Fireflies ingest schema support
- 022 — extraction field normalization (`raw_data` JSON → `extraction_fields` rows)
- 023 — extraction field decisions
- 024 — extraction validation audit
- 025 — extraction token usage
- 026 — advisory suggestion fields
- 027 — extraction call analysis

---

## 6. Reliability & correctness guarantees

- **Durable queues + single topic exchange** (`turtle.events`) — events survive
  restarts; each worker has its own queue with prefetch=1.
- **Idempotent writes** — `extraction_job_id`, `fireflies_meeting_id`,
  `idempotency_key` prevent duplicates on replay.
- **Supervisor loops** — every worker auto-restarts with backoff on crash / broker
  cold-start.
- **AI retry policy** — transient errors retried with exponential backoff; client
  (4xx) errors fail fast.
- **Optimistic concurrency** — extraction `version` blocks silent overwrites (409);
  validated extractions are locked (423).
- **Full audit** — field edits and validation transitions are append-only logs.
- **Graceful degradation** — summarization is best-effort; a missing `/summarize`
  endpoint doesn't break extraction.
- **Observability** — Prometheus metrics (`/metrics`): `http_requests_total`,
  `http_request_duration_seconds`, `meetings_scheduled_total`,
  `extractions_completed_total`.

---

## 7. What is NOT yet wired (honest gaps)

- `meeting.scheduled`, `meeting.cancelled`, `meeting.rescheduled`,
  `extraction.completed`, and `meeting.summarized` are **published but have no
  consumer** today — they're emitted for future services (notifications/analytics).
- **Redis** is initialized but not actively used for caching yet.
- CRM-AI `/transcript/chunk` (live streaming) is a **placeholder** — it logs only.
- The summary worker tolerates a CRM-AI deployment **without** `/summarize`.

---

*Generated from the live codebase: `services/meeting-service/`, the CRM-AI service,
`apps/internal-app/src/`, and `turtle - Copy/turtlecrm-db/` migrations & stored
procedures. See [`EDA_ARCHITECTURE.md`](./EDA_ARCHITECTURE.md) for the non-technical
event-flow narrative.*
