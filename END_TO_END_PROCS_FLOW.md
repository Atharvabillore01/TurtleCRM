# TurtleCRM — End-to-End Procs & Flow

**Companion to:** [`STORED_PROCS_SPEC.md`](STORED_PROCS_SPEC.md) (proc signatures &
result-envelope contract). This document walks the **chronological user journey**
— from login through to re-saving validated CRM parameters — and names every
proc, Redis key, event, and HTTP boundary the system crosses along the way.

Read this end-to-end if you want to understand "what fires when". Read
`STORED_PROCS_SPEC.md` when you need the exact column signature for a proc.

---

## Service map

| Service | Port | Stack | Owns |
|---|---|---|---|
| **auth-service** | 4000 | Python/FastAPI | JWT issuance, OAuth, OTP request, refresh, transactional outbox |
| **otp-service** | 4001 | Python/FastAPI + RabbitMQ | OTP generation, hashing, dispatch, verification |
| **user-service** | 4002 | Python/FastAPI | Client + advisor records (canonical user store) |
| **notification-service** | 4003 | Node/Fastify + RabbitMQ | Email/push fan-out (read-only on DB today) |
| **meeting-service** | 4004 | Python/FastAPI | Meetings, transcripts, extractions, summaries, action items |
| **crm-agent** | 5000 | Python/FastAPI | LLM extraction engine (stateless; no DB) |

Brokers: PostgreSQL · Redis · RabbitMQ (event bus).

---

## Phase 0 — Reference: result envelope & error ranges

Every proc returns `(result, errormessage, errornumber, nextAction)` — see
[`STORED_PROCS_SPEC.md`](STORED_PROCS_SPEC.md). Conventions:

| Range | Meaning | HTTP mapping |
|---|---|---|
| `1001–1099` | Validation | 400 |
| `2001–2099` | Not found | 404 |
| `3001–3099` | Conflict / idempotency | 409 |
| `4001–4099` | Auth / permission | 401 / 403 |
| `5000+` | Server / internal | 500 |

---

## Phase 1 — Login

Three login flows. All converge on **JWT pair (access 15 min + refresh 7 days)**.
Refresh token is rotated on every use.

### 1A. Client OTP-only login

```
┌───────────────┐ POST /auth/client/request-otp { phone or email }
│ client-app    │ ────────────────────────────────────────────────►
└───────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────────────┐
│ auth-service  routes/client.py:request_otp                       │
│   ├─► rate-limit Redis key `otprate:{destination}` (TTL 900s)    │
│   ├─► Redis SET `otp:pending:{request_id}` (TTL 300s)            │
│   └─► publish_event('auth.otp.requested', {channel, destination})│
└──────────────────────────────────────────────────────────────────┘
        │ (async, RabbitMQ)
        ▼
┌──────────────────────────────────────────────────────────────────┐
│ otp-service  on 'auth.otp.requested'                             │
│   ├─► generate 6-digit OTP                                        │
│   ├─► bcrypt-hash, Redis SET `otp:{channel}:{destination}`        │
│   │       value {hash, attempts:0, expiresAt} TTL 300s            │
│   └─► provider.send(destination, raw_otp)   ← SMS/email           │
└──────────────────────────────────────────────────────────────────┘

┌───────────────┐ POST /auth/client/verify-otp { request_id, otp }
│ client-app    │ ────────────────────────────────────────────────►
└───────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────────────┐
│ auth-service  routes/client.py:verify_otp                        │
│   ├─► Redis GET `otp:pending:{request_id}` (else 410 Gone)        │
│   ├─► HTTP POST otp-service /otp/verify {channel, destination,otp}│
│   │       → bcrypt.checkpw; on fail increments attempts; 3=delete │
│   ├─► user-service: proc_get_or_create_user(phone|email)          │
│   │       → sp_create_user OR sp_get_user                         │
│   ├─► auth-service: mint JWT pair                                 │
│   ├─► Redis SET `refresh:{user_id}:{token_id}` (TTL 7d)           │
│   ├─► proc_write_outbox_event('auth.login.success', payload)      │
│   └─► return access token + httpOnly refresh cookie               │
└──────────────────────────────────────────────────────────────────┘
```

### 1B. Advisor password + OTP 2FA

```
POST /auth/advisor/login { username, password }
  → user-service: proc_get_advisor_by_username(username)
       → bcrypt.checkpw(password, row.password_hash)
  → auth-service: Redis SET `advisor:session:{session_id}`
       value {advisor_id, step:'password_ok'} TTL 300s
  → publish_event('auth.otp.requested', ...)         [same as 1A from here]

POST /auth/advisor/verify-otp { session_id, otp }
  → Redis GET `advisor:session:{session_id}`
  → /otp/verify
  → mint JWT pair, set refresh in Redis
  → proc_write_outbox_event('auth.login.success', ...)
```

### 1C. OAuth (advisor-app + internal-app)

```
GET /auth/oauth/google → 302 to Google consent
GET /auth/oauth/google/callback?code=...
  → Google token exchange → ID token
  → For internal-app: proc_is_internal_user_allowed(email) (auth-service team_procs)
                       → fn_is_internal_user_allowed; 403 if not whitelisted
  → user-service: proc_get_or_create_user(email) (same proc as 1A)
  → mint JWT pair → proc_write_outbox_event('auth.login.success', ...)
```

### Procs touched in Phase 1

| Service | Proc | Direction |
|---|---|---|
| auth-service | `proc_is_internal_user_allowed` (`fn_is_internal_user_allowed`) | read |
| auth-service | `proc_write_outbox_event` (`sp_write_outbox_event`) | write |
| user-service | `proc_create_user` (`sp_create_user`) | write |
| user-service | `proc_get_user` (`sp_get_user`) | read |
| user-service | `proc_create_advisor` (`sp_create_advisor`) | write (registration only) |
| user-service | `proc_get_advisor_by_username` (`sp_get_advisor_by_username`) | read |

**Redis writes:** `otp:pending:{req}`, `otp:{ch}:{dest}`, `otprate:{dest}`,
`advisor:session:{sid}`, `refresh:{uid}:{tid}`.

---

## Phase 2 — Token refresh (background, recurring)

```
axios 401 → POST /auth/refresh (httpOnly cookie)
  → auth-service routes/refresh.py
       ├─► Redis GET `refresh:{user_id}:{token_id}` (else 401)
       ├─► Redis DEL old key
       ├─► mint new JWT pair (token_id rotated)
       ├─► Redis SET `refresh:{user_id}:{new_token_id}` TTL 7d
       └─► proc_write_outbox_event('auth.token.refreshed', payload)
```

Procs: `proc_write_outbox_event` only.

---

## Phase 3 — Outbox publisher (background daemon)

The transactional outbox lives in `auth-service` (and any other writer service).
It guarantees "DB write + event publish" atomicity.

```
loop every 2s:
  rows = proc_poll_unpublished_events(batch_size=50)   # sp_poll_unpublished_events
  for row in rows:
      try:
          eventbus.publish(row.event_type, row.payload)
          proc_mark_event_published(row.id)            # sp_mark_event_published
      except Exception as e:
          new_attempts = row.attempts + 1
          if new_attempts >= MAX_RETRIES:
              proc_move_to_dlq(row.id, row.event_type, row.payload, e, new_attempts)
          else:
              proc_mark_event_failed(row.id, str(e), new_attempts)
```

Procs: `proc_poll_unpublished_events`, `proc_mark_event_published`,
`proc_mark_event_failed`, `proc_move_to_dlq`.

---

## Phase 4 — Scheduling a meeting (ops picks agents)

```
┌──────────────────────────────────────────────────────────────────┐
│ internal-app  SchedulingModal opens                              │
│   GET /api/meetings/agents   → list of {name, touch_point, phase}│
│   GET /api/clients           → fn_list_clients                   │
│   GET /api/advisors          → fn_list_advisors                  │
└──────────────────────────────────────────────────────────────────┘
        │ ops picks client + advisor(s) + agents[]
        ▼
┌──────────────────────────────────────────────────────────────────┐
│ POST /api/meetings/schedule { ..., agents_to_use: [...] }        │
│                                                                  │
│ meeting-service routes/meetings.py:schedule_meeting               │
│   ├─► sp_schedule_meeting(..., p_agents_to_use)                  │
│   │       OUT: meeting_id, nextAction='create_firefly_meeting'   │
│   ├─► google_calendar_client.create_meet_event(attendees)        │
│   │       → returns meet_url + google_event_id                   │
│   ├─► sp_update_meeting_firefly_id(meeting_id, meet_url)         │
│   └─► publish_event('meeting.scheduled', payload)                │
└──────────────────────────────────────────────────────────────────┘
```

Procs: `sp_schedule_meeting`, `sp_update_meeting_firefly_id`, `fn_list_clients`,
`fn_list_advisors`, optional `fn_list_agents` (if agents promoted from
hardcoded list to a DB table).

---

## Phase 5 — Meeting happens & Fireflies finishes transcription

```
┌──────────────────────────────────────────────────────────────────┐
│ Fireflies bot records call → POST /webhooks/firefly              │
│   payload: { event:'meeting.transcribed', meeting_id }           │
└──────────────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────────────┐
│ meeting-service routes/webhooks.py:_handle_transcribed           │
│   ├─► FireflyClient.get_transcript(firefly_id)                   │
│   ├─► fn_find_meeting_by_meet_url(meet_url)            ★ NEW     │
│   │       returns { id, client_id, agenda, agents_to_use }       │
│   ├─► write transcript text to /app/transcripts/                 │
│   ├─► sp_save_transcript(meeting_id, text, url, dur)             │
│   ├─► sp_update_meeting_status(meeting_id, 'transcribed')        │
│   └─► publish_event('meeting.transcribed', {                     │
│         meeting_id, client_id, agenda,                           │
│         agents_to_use,           ← carries ops's selection       │
│         transcript_text, transcript_path,                        │
│         firefly_meeting_id, meet_url })                          │
└──────────────────────────────────────────────────────────────────┘
```

Procs: **`fn_find_meeting_by_meet_url` (new)**, `sp_save_transcript`,
`sp_update_meeting_status`.

---

## Phase 6 — Save CRM parameters (extraction pipeline)

```
┌──────────────────────────────────────────────────────────────────┐
│ workers/transcript_processor.py — RabbitMQ consumer              │
│   on 'meeting.transcribed':                                      │
│   ├─► (defensive) fn_get_meeting_for_extraction(meeting_id)      │
│   │       returns canonical agents_to_use from DB                │
│   ├─► POST http://crm-agent:5000/extract                         │
│   │       { transcript, meeting_id,                              │
│   │         context: { client_id, agenda, agents_to_use } }      │
│   │   crm-agent runs only the selected agents → returns          │
│   │       { fields: { "1": {...}, "2": {...}, ... 174 },         │
│   │         provider, model, duration, total_fields }            │
│   │                                                              │
│   ├─► sp_save_extraction(client_id, meeting_id,                  │
│   │                      extraction_job_id (idempotency),        │
│   │                      provider, model, extracted_at,          │
│   │                      duration_seconds, total_fields,         │
│   │                      raw_data=jsonb)                         │
│   │       OUT: extraction_id                                     │
│   │                                                              │
│   ├─► sp_save_demographics(client_id, extraction_id, data)       │
│   ├─► sp_save_financials  (client_id, extraction_id, data)       │
│   ├─► sp_save_goals       (client_id, extraction_id, data)       │
│   ├─► sp_save_qualitative (client_id, extraction_id, data)       │
│   │       (per-touch-point projections of raw_data;              │
│   │        skipped if the matching agent wasn't run)             │
│   │                                                              │
│   ├─► sp_update_meeting_status(meeting_id,'extraction_completed')│
│   └─► publish_event('extraction.completed', { meeting_id,        │
│             extraction_id, client_id })                          │
└──────────────────────────────────────────────────────────────────┘
```

In parallel (separate consumer):

```
┌──────────────────────────────────────────────────────────────────┐
│ workers/summary_worker.py — RabbitMQ consumer                    │
│   on 'meeting.transcribed':                                      │
│   ├─► LLM summarise(transcript) → {summary, key_points, ...}     │
│   ├─► sp_save_summary(meeting_id, client_id, ...)                │
│   └─► for each action: sp_save_action_item(...)                  │
└──────────────────────────────────────────────────────────────────┘
```

Procs: `fn_get_meeting_for_extraction`, `sp_save_extraction`,
`sp_save_demographics`, `sp_save_financials`, `sp_save_goals`,
`sp_save_qualitative`, `sp_save_summary`, `sp_save_action_item`,
`sp_update_meeting_status`.

**Idempotency:** `extractions.extraction_job_id` is `UNIQUE`. Re-delivery of the
event yields a `3001` conflict from `sp_save_extraction`; the wrapper swallows it.

---

## Phase 7 — Fetch CRM parameters (AI Validation page)

```
┌──────────────────────────────────────────────────────────────────┐
│ apps/internal-app  AiValidationPage.tsx                          │
│   GET /api/extractions/             → fn_list_extractions(       │
│                                          validated:false)        │
│   GET /api/extractions/{id}         → fn_get_extraction(id)      │
│   GET /api/meetings/                → fn_list_meetings           │
│        (used to join meeting context — client, advisor, agenda)  │
└──────────────────────────────────────────────────────────────────┘
```

`fn_list_extractions` accepts optional filters: `validated`, `client_id`,
`meeting_id`, `date_range`.

Each row returned carries `raw_data` (the 174-field JSONB) — the frontend
groups it by `touch_point` for review.

Procs: `fn_list_extractions`, `fn_get_extraction`, `fn_list_meetings`.

---

## Phase 8 — Validate & re-save parameters

Ops reviewer can edit individual field values, mark the whole extraction as
validated, and persist the corrections.

```
┌──────────────────────────────────────────────────────────────────┐
│ AiValidationPage   reviewer edits field "31" from "x" to "y"     │
│   POST /api/extractions/{id}/fields                              │
│        { updates: [ {field_id:"31", value:"y",                   │
│                      confidence:1.0, source:"reviewer"} ] }      │
│                                                                  │
│ meeting-service routes/extractions.py:patch_fields               │
│   └─► sp_patch_extraction_fields(extraction_id, updates jsonb)   │ ★ NEW
│        - merges updates into raw_data                            │
│        - appends an audit row per field to extraction_field_audit│
│        OUT: updated_extraction_id, version                       │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ AiValidationPage   reviewer clicks "Approve"                     │
│   POST /api/extractions/{id}/validate                            │
│        { validated_by, validation_notes? }                       │
│                                                                  │
│ meeting-service                                                   │
│   ├─► sp_validate_extraction(extraction_id, validated_by, notes) │
│   │       sets validated=true, validated_at=now()                │
│   ├─► sp_save_demographics / financials / goals / qualitative    │
│   │       re-run with the corrected raw_data                     │
│   │       (overwrites the post-LLM projection)                   │
│   └─► publish_event('extraction.validated', payload)             │
└──────────────────────────────────────────────────────────────────┘
```

### New procs for Phase 8

| Proc | Kind | Purpose |
|---|---|---|
| **`sp_patch_extraction_fields`** | sp | Merge a JSONB of `{field_id → value/confidence/source}` into `extractions.raw_data`; append rows to `extraction_field_audit`. Bumps `version` for optimistic concurrency. |
| **`fn_list_extraction_field_audit`** | fn | Audit trail per extraction (reviewer, before/after, timestamp). |

### Audit table

```sql
CREATE TABLE extraction_field_audit (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_id   uuid NOT NULL REFERENCES extractions(id),
  field_id        text NOT NULL,            -- '1'..'174'
  before_value    jsonb,
  after_value     jsonb,
  before_confidence numeric,
  after_confidence  numeric,
  changed_by      text NOT NULL,
  changed_at      timestamptz NOT NULL DEFAULT now(),
  reason          text
);
CREATE INDEX ON extraction_field_audit (extraction_id, changed_at DESC);
```

Add `version int NOT NULL DEFAULT 1` on `extractions` so concurrent reviewers
can't silently overwrite each other (sp returns `3001` if `expected_version`
doesn't match).

Procs touched: `sp_patch_extraction_fields` (new), `sp_validate_extraction`,
`sp_save_demographics` / `sp_save_financials` / `sp_save_goals` /
`sp_save_qualitative`, `fn_list_extraction_field_audit` (new).

---

## Phase 9 — Notification fan-out (parallel, throughout)

`notification-service` consumes:
- `auth.login.success` → optional "new device" email.
- `extraction.completed` → email advisor "extraction ready for review".
- `extraction.validated` → email client (if opt-in) or downstream system.

No DB writes today; reads via `user-service` for email lookup.

---

## Master proc index (every proc that exists or is proposed)

Legend: ✅ already stubbed in code · 🆕 new proc this design requires.

### auth-service
| Proc | Status | Purpose |
|---|---|---|
| `sp_write_outbox_event` | ✅ | Append to transactional outbox |
| `sp_poll_unpublished_events` | ✅ | Poll for outbox publisher |
| `sp_mark_event_published` | ✅ | Ack publish |
| `sp_mark_event_failed` | ✅ | Retry tracking |
| `sp_move_to_dlq` | ✅ | Move to dead-letter queue |
| `fn_is_internal_user_allowed` | ✅ | OAuth whitelist for internal-app |

### user-service
| Proc | Status | Purpose |
|---|---|---|
| `sp_create_user` | ✅ | Insert client user |
| `sp_get_user` | ✅ | Read user by id |
| `sp_create_advisor` | ✅ | Insert advisor with password_hash |
| `sp_get_advisor_by_username` | ✅ | Login lookup |
| `fn_get_user_by_phone_or_email` | 🆕 | Single lookup used by OTP login (replace ad-hoc combo) |
| `sp_update_user_profile` | 🆕 | Edit profile from client-app |

### meeting-service
| Proc | Status | Purpose |
|---|---|---|
| `sp_schedule_meeting` | ✅ | Insert meeting (now incl. `agents_to_use`) |
| `sp_update_meeting_firefly_id` | ✅ | Stamp post-calendar |
| `sp_update_meeting_status` | ✅ | Status transitions |
| `sp_save_transcript` | ✅ | Persist transcript |
| `fn_get_meeting_for_extraction` | ✅ | Read agents_to_use + context |
| `fn_find_meeting_by_meet_url` | 🆕 | Webhook lookup by Meet URL |
| `sp_save_extraction` | ✅ | Insert extraction row (174-field JSONB) |
| `sp_save_demographics` | ✅ | Per-touch-point projection |
| `sp_save_financials` | ✅ | Per-touch-point projection |
| `sp_save_goals` | ✅ | Per-touch-point projection |
| `sp_save_qualitative` | ✅ | Per-touch-point projection |
| `sp_save_summary` | ✅ | Save LLM summary |
| `sp_save_action_item` | ✅ | Save individual action item |
| `sp_cancel_meeting` | ✅ | Set status=cancelled |
| `fn_get_extraction` | ✅ | Read one extraction |
| `fn_list_extractions` | ✅ | List for AI Validation page |
| `fn_list_meetings` | ✅ | Scheduling table |
| `fn_list_clients` | ✅ | Scheduling picker |
| `fn_list_advisors` | ✅ | Scheduling picker |
| `fn_list_agents` | 🆕 | Optional: promote `AVAILABLE_AGENTS` to DB |
| `sp_validate_extraction` | ✅ | Approve extraction |
| `sp_patch_extraction_fields` | 🆕 | Edit individual fields with audit |
| `fn_list_extraction_field_audit` | 🆕 | Audit trail |

---

## Migration checklist

1. Stand up `clients`, `advisors`, `users`, `meetings`, `extractions`,
   `extraction_field_audit`, `summaries`, `action_items`, plus
   `outbox_events`, `outbox_dlq`, `internal_users_allowed`.
2. Implement procs in §11 in two waves:
   - **Wave 1 (blocking):** auth + outbox + user + scheduling + extraction save.
   - **Wave 2 (Phase 8):** `sp_patch_extraction_fields`, audit,
     `fn_find_meeting_by_meet_url` (★ unblocks the Fireflies-side agent
     selection feature).
3. For each `register_proc(...)` line in the relevant `*_procs.py`, swap the
   stub body with `await conn.fetch("SELECT * FROM sp_xxx($1,$2,...)")` and
   delete the in-memory dict.
4. Keep wrappers and `ProcResult` semantics — no caller code should change.
5. Add per-proc integration tests (testcontainers or pytest-postgresql).

---

## Quick reference: where to look in the repo

- Stub bodies: `services/<name>/db/*_procs.py`
- Result envelope contract & SQL signatures: [`STORED_PROCS_SPEC.md`](STORED_PROCS_SPEC.md)
- Meeting-service deep-dive on tables & migrations: [`services/meeting-service/STORED_PROCS_SPEC.md`](services/meeting-service/STORED_PROCS_SPEC.md)
- Routes that call the procs: `services/<name>/routes/*.py`
- Event bus adapters: `shared/events/src/adapters/*`
