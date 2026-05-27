# Meeting Service — Stored Procedures & End-to-End Flow

This document specifies every stored procedure / DB function the `meeting-service`
needs to replace its current in-memory stubs (see [`db/meeting_procs.py`](db/meeting_procs.py))
with real PostgreSQL procs, plus the **end-to-end runtime flow** showing exactly
where each proc is invoked.

> Naming convention:
> - `sp_*` → stored **procedure** (CALL, no return rows; uses OUT params for status).
> - `fn_*` → stored **function** (SELECT, returns row(s) or scalar).
> - All wrappers return a uniform `ProcResult(result, errormessage, errornumber, nextAction)`
>   via [`db/proc_caller.py`](db/proc_caller.py). The `nextAction` hint lets the
>   caller advance the workflow without hardcoding state machines in Python.

---

## 1. Tables (target schema)

### 1.1 `meetings`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PRIMARY KEY` | server-generated |
| `client_id` | `text NOT NULL` | FK → `clients.id` |
| `advisor_id` | `text NOT NULL` | primary advisor (denormalised) |
| `advisor_ids` | `text[] NOT NULL DEFAULT '{}'` | multi-advisor support |
| `advisor_names` | `text[] NOT NULL DEFAULT '{}'` | display cache |
| `client_name` | `text` | display cache |
| `advisor_name` | `text` | display cache (joined names) |
| `scheduled_at` | `timestamptz NOT NULL` | |
| `duration_minutes` | `int NOT NULL DEFAULT 60` | |
| `agenda` | `text NOT NULL` | |
| `title` | `text` | falls back to agenda |
| `status` | `text NOT NULL DEFAULT 'scheduled'` | `scheduled \| in_progress \| transcribed \| extraction_completed \| cancelled` |
| `member` | `text` | ops team member |
| `guests` | `text[]` | guest emails |
| `notes` | `text` | "details that happened" |
| `meeting_url` | `text` | Google Meet URL |
| `firefly_meeting_id` | `text` | Fireflies meeting id (post-call) |
| `firefly_meeting_url` | `text` | mirror of meeting_url for lookup |
| `started_at` / `ended_at` | `timestamptz` | lifecycle |
| `transcript_text` | `text` | full transcript (optional — also on disk) |
| `transcript_url` | `text` | Fireflies link |
| `transcript_duration_seconds` | `int` | |
| `extraction_job_id` | `uuid` | links to `extractions.id` |
| `extraction_status` | `text` | mirrors latest extraction status |
| **`agents_to_use`** | **`text[] NOT NULL DEFAULT '{}'`** | **ops-selected CRM agents (empty = run all)** |
| `created_by` | `text` | user id |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |

**Indexes:**
- `UNIQUE (meeting_url)` partial `WHERE meeting_url IS NOT NULL` — enables Meet-URL lookup from webhook.
- `(client_id, scheduled_at DESC)` — list-by-client.
- `(scheduled_at DESC)` — list page.
- `(firefly_meeting_id)` — webhook fast path.

### 1.2 `extractions`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PRIMARY KEY` | |
| `meeting_id` | `uuid NOT NULL` | FK → `meetings.id` |
| `client_id` | `text NOT NULL` | denormalised |
| `extraction_job_id` | `uuid NOT NULL UNIQUE` | idempotency key |
| `provider` | `text NOT NULL` | `anthropic \| openai \| ...` |
| `model` | `text NOT NULL` | |
| `extracted_at` | `timestamptz NOT NULL` | |
| `duration_seconds` | `numeric NOT NULL` | wall time of `/extract` call |
| `total_fields` | `int NOT NULL` | |
| `raw_data` | `jsonb NOT NULL` | full 174-field payload |
| `validated` | `boolean NOT NULL DEFAULT false` | |
| `validated_by` / `validated_at` / `validation_notes` | | review trail |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |

### 1.3 `summaries`, `action_items`
Mirror current `SummaryRow` / `ActionItemRow` dataclasses.

### 1.4 `agents_catalog` (optional — see §4)
| Column | Type |
|---|---|
| `name` | `text PRIMARY KEY` |
| `touch_point` | `text NOT NULL` |
| `phase` | `int NOT NULL` |
| `enabled` | `boolean NOT NULL DEFAULT true` |
| `display_order` | `int NOT NULL DEFAULT 0` |

Today the agent list is hardcoded in [`routes/meetings.py`](routes/meetings.py) (`AVAILABLE_AGENTS`).
Promote to a table only if ops needs to add/disable agents without a deploy.

---

## 2. Stored procedures

### 2.1 Already registered (need real impl)

| Proc | Kind | Purpose | Called from |
|---|---|---|---|
| `sp_schedule_meeting` | sp | Insert a `meetings` row (incl. `agents_to_use`). | `POST /api/meetings/schedule` |
| `sp_update_meeting_firefly_id` | sp | Stamp `firefly_meeting_id` + `firefly_meeting_url` post-calendar. | scheduling flow |
| `sp_update_meeting_status` | sp | Transition `status` field with guardrails. | webhook, workers |
| `sp_save_transcript` | sp | Persist transcript text/url/duration on the meeting row. | webhook |
| `fn_get_meeting_for_extraction` | fn | Return `{client_id, agenda, agents_to_use}` by `meeting_id`. | `transcript_processor` (alternative to event payload) |
| `sp_save_extraction` | sp | Insert into `extractions` and update meeting's `extraction_*` fields. | `transcript_processor` |
| `sp_save_demographics` / `sp_save_financials` / `sp_save_goals` / `sp_save_qualitative` | sp | Optional per-touch-point projections of the extraction. | `transcript_processor` |
| `sp_save_summary` | sp | Insert into `summaries`. | `summary_worker` |
| `sp_save_action_item` | sp | Insert into `action_items`. | `summary_worker` |
| `sp_cancel_meeting` | sp | Set status=`cancelled`. | `DELETE /api/meetings/{id}` |
| `fn_get_extraction` | fn | Return one extraction by id. | AI Validation page |
| `fn_list_meetings` | fn | List with display joins. | scheduling table |
| `fn_list_clients` / `fn_list_advisors` | fn | Picker option lists. | scheduling modal |
| `fn_list_extractions` | fn | List + filter by `validated`. | AI Validation page |
| `sp_validate_extraction` | sp | Flip `validated=true`, stamp reviewer. | validation submit |

### 2.2 New procs required for the agent-assignment flow

| Proc | Kind | Purpose | Called from |
|---|---|---|---|
| **`fn_find_meeting_by_meet_url`** | **fn** | Return the full meeting row given a Google Meet URL (normalised lower-case, trailing `/` stripped). **This is what the Fireflies webhook uses to look up which agents ops selected.** | `routes/webhooks.py:_handle_transcribed` |
| `fn_list_agents` *(optional)* | fn | Return enabled agents from `agents_catalog`. Drops the hardcoded list in code. | `GET /api/meetings/agents` |

### 2.3 Signatures (Postgres)

```sql
-- sp_schedule_meeting -----------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_schedule_meeting(
  IN  p_client_id        text,
  IN  p_advisor_id       text,
  IN  p_advisor_ids      text[],
  IN  p_advisor_names    text[],
  IN  p_scheduled_at     timestamptz,
  IN  p_duration_minutes int,
  IN  p_agenda           text,
  IN  p_title            text,
  IN  p_client_name      text,
  IN  p_member           text,
  IN  p_guests           text[],
  IN  p_notes            text,
  IN  p_meeting_url      text,
  IN  p_agents_to_use    text[],     -- NEW
  IN  p_created_by       text,
  OUT o_meeting_id       uuid,
  OUT o_errornumber      int,
  OUT o_errormessage     text,
  OUT o_nextaction       text        -- e.g. 'create_firefly_meeting'
) LANGUAGE plpgsql AS $$ ... $$;

-- fn_find_meeting_by_meet_url --------------------------------------------
CREATE OR REPLACE FUNCTION fn_find_meeting_by_meet_url(p_meet_url text)
RETURNS TABLE (
  id              uuid,
  client_id       text,
  agenda          text,
  agents_to_use   text[],
  status          text
) LANGUAGE sql STABLE AS $$
  SELECT id, client_id, agenda, agents_to_use, status
  FROM meetings
  WHERE lower(rtrim(meeting_url, '/'))         = lower(rtrim(p_meet_url, '/'))
     OR lower(rtrim(firefly_meeting_url, '/')) = lower(rtrim(p_meet_url, '/'))
  LIMIT 1;
$$;

-- sp_save_extraction -----------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_save_extraction(
  IN  p_meeting_id        uuid,
  IN  p_client_id         text,
  IN  p_extraction_job_id uuid,
  IN  p_provider          text,
  IN  p_model             text,
  IN  p_extracted_at      timestamptz,
  IN  p_duration_seconds  numeric,
  IN  p_total_fields      int,
  IN  p_raw_data          jsonb,
  OUT o_extraction_id     uuid,
  OUT o_errornumber       int,
  OUT o_errormessage      text,
  OUT o_nextaction        text
) LANGUAGE plpgsql AS $$ ... $$;
```

Error-number conventions used in stubs (keep these in real procs):

| Range | Meaning |
|---|---|
| `1001–1099` | Validation errors → wrapper raises `ValueError` (HTTP 400). |
| `2001–2099` | Not-found errors → HTTP 404. |
| `3001–3099` | Conflict / idempotency. |
| `5000+` | Server/runtime → HTTP 500. |

---

## 3. End-to-end flow

### Phase A — Scheduling (ops creates a meeting)

```
┌─────────────────┐     POST /api/meetings/agents
│ internal-app    │ ──► fetchAvailableAgents()
│ SchedulingModal │ ◄── [{name, touch_point, phase}, ...]
└─────────────────┘
        │ ops picks N agents
        ▼
┌─────────────────┐     POST /api/meetings/schedule
│ internal-app    │ ──► { ..., agents_to_use: [...] }
└─────────────────┘
        │
        ▼
┌────────────────────────────────────────────────────────┐
│ meeting-service                                         │
│  routes/meetings.py:schedule_meeting()                  │
│   ├─► sp_schedule_meeting(... p_agents_to_use ...)      │ ◄── persists row
│   │       returns meeting_id, nextAction='create_firefly_meeting'
│   ├─► google_calendar_client.create_meet_event(...)     │ ◄── Meet URL + invite
│   ├─► sp_update_meeting_firefly_id(meeting_id, meet_url)│
│   └─► publish_event('meeting.scheduled', {...})         │
└────────────────────────────────────────────────────────┘
```

### Phase B — Meeting happens, Fireflies finishes transcription

```
Fireflies bot (invited via calendar) records the call, then POSTs:

┌────────────────────────────────────────────────────────┐
│ Fireflies → POST /webhooks/firefly                     │
│   payload: { event: 'meeting.transcribed',             │
│              meeting_id: <firefly_id> }                │
└────────────────────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────────────────────┐
│ routes/webhooks.py:_handle_transcribed()               │
│   ├─► FireflyClient.get_transcript(firefly_id)         │ ◄── GraphQL fetch
│   │       returns { title, meet_url, transcript, ... } │
│   ├─► fn_find_meeting_by_meet_url(meet_url)            │ ◄── NEW PROC ★
│   │       returns { meeting_id, client_id, agents_to_use }
│   │       (fall back to ALLOWED_MEETINGS for ad-hoc tests)
│   ├─► save transcript file to /app/transcripts/        │
│   ├─► sp_save_transcript(meeting_id, text, url, dur)   │
│   ├─► sp_update_meeting_status(meeting_id, 'transcribed')
│   └─► publish_event('meeting.transcribed', {           │
│         meeting_id, client_id, agenda,                 │
│         agents_to_use,           ← from the meeting row│
│         transcript_text, transcript_path,              │
│         firefly_meeting_id, meet_url, ...              │
│       })                                               │
└────────────────────────────────────────────────────────┘
```

### Phase C — Agent extraction (transcript_processor consumes the event)

```
┌────────────────────────────────────────────────────────┐
│ workers/transcript_processor.py                        │
│   on 'meeting.transcribed':                            │
│   ├─► (optional safety) fn_get_meeting_for_extraction  │ ◄── re-reads agents_to_use from DB
│   │       if event payload is stale/missing            │
│   ├─► POST http://crm-agent:5000/extract               │
│   │       { transcript,                                │
│   │         meeting_id,                                │
│   │         context: {                                 │
│   │           client_id, agenda,                       │
│   │           agents_to_use   ← drives which agents run│
│   │         } }                                        │
│   ├─► sp_save_extraction(meeting_id, raw_data, ...)    │ ◄── persists 174-field result
│   ├─► sp_update_meeting_status(meeting_id, 'extraction_completed')
│   ├─► (optional) sp_save_demographics / financials / goals / qualitative
│   └─► publish_event('extraction.completed', {...})     │
└────────────────────────────────────────────────────────┘
```

### Phase D — Summary worker (parallel to extraction)

```
┌────────────────────────────────────────────────────────┐
│ workers/summary_worker.py                              │
│   on 'meeting.transcribed':                            │
│   ├─► LLM summary + action-item extraction             │
│   ├─► sp_save_summary(meeting_id, summary, points, ...)│
│   └─► for each item: sp_save_action_item(...)          │
└────────────────────────────────────────────────────────┘
```

### Phase E — Review & validation (internal-app AI Validation page)

```
┌────────────────────────────────────────────────────────┐
│ apps/internal-app/src/routes/AiValidationPage.tsx      │
│   GET /api/extractions/        → fn_list_extractions   │
│   GET /api/extractions/{id}    → fn_get_extraction     │
│   POST /api/extractions/{id}/validate                  │
│        → sp_validate_extraction(id, validated_by, ...) │
└────────────────────────────────────────────────────────┘
```

---

## 4. Open decisions

1. **Promote `agents_catalog` to a table?** Today `AVAILABLE_AGENTS` is hardcoded
   in [`routes/meetings.py`](routes/meetings.py). If ops should toggle agents
   without redeploying, add the table + `fn_list_agents`. Otherwise keep static.
2. **Idempotency on transcript webhook.** Fireflies retries on 5xx. The
   `extraction_job_id` UNIQUE constraint handles re-runs of extraction; we also
   want `(firefly_meeting_id)` UNIQUE on `meetings` to make `sp_save_transcript`
   idempotent.
3. **`fn_get_meeting_for_extraction` vs event payload.** Today
   `agents_to_use` is carried in the event payload. The DB lookup is a safety net
   in case the bus drops or duplicates messages. Decide whether the event is
   authoritative or the DB row is — current design uses the **DB row** (set at
   scheduling time, immutable for the meeting).
4. **What happens with empty `agents_to_use`?** Confirmed: empty = run all
   agents (current crm-agent default). Enforced in `app.py` of crm-agent — no
   server-side validation in meeting-service.

---

## 5. Migration checklist (when moving off stubs)

1. Write the SQL DDL in `db/migrations/0001_meetings_initial.sql` (table + indexes).
2. Add `0002_meetings_agents_to_use.sql` *(this branch)* — adds `agents_to_use text[]` if migrating an existing schema.
3. For each `register_proc(...)` line in [`db/meeting_procs.py`](db/meeting_procs.py),
   write the matching `CREATE OR REPLACE PROCEDURE/FUNCTION` and swap the stub
   body with `await conn.fetchrow("CALL sp_xxx($1,$2,...)", ...)`.
4. Keep `ProcResult` + `nextAction` semantics — wrappers in §2.1 stay unchanged.
5. Add an integration test per proc using `pytest-postgresql` or testcontainers
   so the API never depends on in-memory state again.
