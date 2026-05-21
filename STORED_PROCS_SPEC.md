# TurtleCRM — Stored Procedures Specification

**For:** Backend / Database Team  
**Date:** 2026-05-20  
**Version:** 1.0  

All services call stored procedures through a thin `call_proc()` wrapper. This document is the authoritative contract for every proc the application code expects. The app code is already written and tested against in-memory stubs; replacing those stubs with real DB calls requires only the backend team to implement these procedures with the exact signatures below.

---

## Standard Result Envelope

Every procedure must return a result set with **exactly these four columns**. The app reads them directly.

| Column | Type | Description |
|---|---|---|
| `result` | `JSONB` | The actual payload — varies per proc. `NULL` on error. |
| `errormessage` | `TEXT` | Human-readable error string. `NULL` on success. |
| `errornumber` | `INTEGER` | Numeric error code. `NULL` means success. |
| `nextAction` | `TEXT` | Hint for the caller — e.g. `"retry"`, `"create_firefly_meeting"`. `NULL` is fine if unused. |

---

## Error Code Registry

| Code | Meaning | Proc(s) |
|---|---|---|
| `1001–1004` | Scheduling validation failures | `sp_schedule_meeting` |
| `2001` | Meeting not found by meeting_id | `sp_update_meeting_firefly_id`, `fn_get_meeting_for_extraction`, `sp_save_transcript`, `sp_cancel_meeting` |
| `2002` | Meeting not found by firefly_meeting_id | `sp_update_meeting_status` |
| `2003` | Meeting not found (transcript save) | `sp_save_transcript` |
| `2004` | Meeting not found (cancel) | `sp_cancel_meeting` |
| `2005` | Cannot cancel — meeting already completed/transcribed | `sp_cancel_meeting` |
| `3001` | Duplicate extraction_job_id | `sp_save_extraction` |
| `3002` | Extraction not found | `fn_get_extraction`, `sp_validate_extraction` |
| `4001` | Summary already exists for meeting | `sp_save_summary` |
| `409` | Username or email already exists | `sp_create_advisor` |

---

## Section 1 — Auth Service Team Procs

Called by: `services/auth-service` — controls who can log in to the internal app.

---

### `fn_is_internal_user_allowed`

Read-only. Called on every internal Google OAuth login to check if the email is an authorised ops/internal team member. The internal team is managed entirely in the DB — no env var or config file needed.

**Parameters**

| # | Name | Type | Nullable |
|---|---|---|---|
| 1 | `email` | `VARCHAR(255)` | NO |

**Returns** (`result` column)

```json
true
```
or
```json
false
```

`true` = allow login, `false` = reject with `not_authorised` redirect.

**Error cases:** None — if the lookup fails, treat as denied (caller handles the exception).

---

## Section 2 — User Service Procs

Called by: `services/user-service`

---

### `sp_create_user`

Creates a new client/user record.

**Parameters**

| # | Name | Type | Nullable | Notes |
|---|---|---|---|---|
| 1 | `phone` | `VARCHAR(20)` | YES | At least one of phone/email must be provided |
| 2 | `email` | `VARCHAR(255)` | YES | |

**Returns** (`result` column)

```json
{
  "id": "uuid",
  "phone": "string or null",
  "email": "string or null",
  "is_active": true
}
```

**Error cases:** None defined — raise a generic DB error on constraint violations.

---

### `sp_get_user`

Fetches a user by primary key.

**Parameters**

| # | Name | Type | Nullable |
|---|---|---|---|
| 1 | `user_id` | `UUID` | NO |

**Returns** (`result` column)

Same shape as `sp_create_user` result, or `NULL` if not found (not an error — caller handles `NULL`).

---

### `sp_create_advisor`

Creates an advisor account.

**Parameters**

| # | Name | Type | Nullable | Notes |
|---|---|---|---|---|
| 1 | `username` | `VARCHAR(100)` | NO | Must be unique |
| 2 | `email` | `VARCHAR(255)` | NO | Must be unique |
| 3 | `password_hash` | `TEXT` | NO | bcrypt hash — store as-is, never re-hash |
| 4 | `otp_channel` | `VARCHAR(20)` | NO | `"email"` or `"phone"` |
| 5 | `otp_target` | `VARCHAR(255)` | NO | The email address or phone number for OTP delivery |

**Returns** (`result` column)

```json
{
  "id": "uuid",
  "username": "string",
  "email": "string",
  "password_hash": "string",
  "role": "advisor",
  "otp_channel": "string",
  "otp_target": "string",
  "is_active": true
}
```

**Error cases**

| errornumber | errormessage | nextAction | Trigger |
|---|---|---|---|
| `409` | `"username_or_email_exists"` | `"change_credentials"` | Username or email already in use |

---

### `sp_get_advisor_by_username`

Looks up an advisor for login.

**Parameters**

| # | Name | Type | Nullable |
|---|---|---|---|
| 1 | `username` | `VARCHAR(100)` | NO |

**Returns** (`result` column)

Same shape as `sp_create_advisor` result (including `password_hash` — the auth service needs it for bcrypt comparison), or `NULL` if not found.

---

## Section 2 — Auth Service Outbox Procs

Called by: `services/auth-service` — implements the transactional outbox pattern for reliable event publishing.

---

### `sp_write_outbox_event`

Writes an event to the outbox table in the same transaction as the triggering business operation.

**Parameters**

| # | Name | Type | Nullable | Notes |
|---|---|---|---|---|
| 1 | `aggregate_type` | `VARCHAR(100)` | NO | e.g. `"auth"`, `"user"` |
| 2 | `aggregate_id` | `VARCHAR(255)` | NO | The entity ID the event relates to |
| 3 | `event_type` | `VARCHAR(100)` | NO | e.g. `"auth.otp.requested"` |
| 4 | `payload` | `JSONB` | NO | Full event payload |
| 5 | `metadata` | `JSONB` | YES | Optional extra metadata (correlation IDs, etc.) |

**Returns** (`result` column)

```json
"<event_id as uuid string>"
```

---

### `sp_poll_unpublished_events`

Fetches a batch of outbox events that have not yet been successfully published. Called repeatedly by the background outbox publisher worker (every ~2s).

**Parameters**

| # | Name | Type | Nullable | Notes |
|---|---|---|---|---|
| 1 | `batch_size` | `INTEGER` | NO | Max rows to return — typically `100` |

**Returns** (`result` column)

```json
[
  {
    "id": "uuid",
    "event_type": "string",
    "payload": {},
    "publish_attempts": 0
  }
]
```

**Important:** Must use `SELECT ... FOR UPDATE SKIP LOCKED` (or equivalent) to be safe under concurrent worker replicas.

---

### `sp_mark_event_published`

Marks an outbox event as successfully delivered to the broker.

**Parameters**

| # | Name | Type | Nullable |
|---|---|---|---|
| 1 | `event_id` | `UUID` | NO |

**Returns** (`result` column): `NULL` — no payload needed.

---

### `sp_mark_event_failed`

Records a failed publish attempt. Called after a transient broker error.

**Parameters**

| # | Name | Type | Nullable | Notes |
|---|---|---|---|---|
| 1 | `event_id` | `UUID` | NO | |
| 2 | `error` | `TEXT` | NO | Error message/stack for debugging |
| 3 | `new_attempt_count` | `INTEGER` | NO | The updated total attempts count |

**Returns** (`result` column): `NULL`.

---

### `sp_move_to_dlq`

Moves a permanently-failed event to the dead-letter queue table (after max retries — currently 10).

**Parameters**

| # | Name | Type | Nullable |
|---|---|---|---|
| 1 | `event_id` | `UUID` | NO |
| 2 | `event_type` | `VARCHAR(100)` | NO |
| 3 | `payload` | `JSONB` | NO |
| 4 | `error` | `TEXT` | NO |
| 5 | `retry_count` | `INTEGER` | NO |

**Returns** (`result` column): `NULL`.

---

## Section 3 — Meeting Service Procs

Called by: `services/meeting-service`

---

### `sp_schedule_meeting`

Creates a new meeting record. Called when ops team books a meeting from the internal app.

**Parameters**

| # | Name | Type | Nullable | Notes |
|---|---|---|---|---|
| 1 | `client_id` | `VARCHAR(255)` | NO | |
| 2 | `advisor_id` | `VARCHAR(255)` | NO | Primary advisor (first in list) |
| 3 | `scheduled_at` | `TIMESTAMPTZ` | NO | ISO 8601 UTC string |
| 4 | `duration_minutes` | `INTEGER` | NO | |
| 5 | `agenda` | `TEXT` | NO | |
| 6 | `created_by` | `VARCHAR(255)` | NO | Ops member who booked |
| 7 | `title` | `TEXT` | YES | Display title — defaults to agenda if NULL |
| 8 | `client_name` | `VARCHAR(255)` | YES | Denormalized for fast list queries |
| 9 | `advisor_name` | `VARCHAR(255)` | YES | Denormalized — primary advisor display name |
| 10 | `advisor_ids` | `JSONB` | YES | `["advisor_1", "advisor_2"]` — multi-advisor support |
| 11 | `advisor_names` | `JSONB` | YES | `["Anil Mehta", "Deepa Nair"]` — parallel array to advisor_ids |
| 12 | `member` | `VARCHAR(255)` | YES | Ops team member who booked (display) |
| 13 | `guests` | `JSONB` | YES | `["email1", "email2"]` — guest emails for calendar invite |
| 14 | `notes` | `TEXT` | YES | Pre-meeting notes |
| 15 | `meeting_url` | `TEXT` | YES | Google Meet URL (set after calendar event created) |

**Returns** (`result` column)

```json
"<meeting_id as uuid string>"
```

**nextAction:** `"create_firefly_meeting"` — tells the caller to now create the Fireflies recording session.

**Error cases**

| errornumber | Description |
|---|---|
| `1001` | Invalid client_id |
| `1002` | Invalid advisor_id |
| `1003` | scheduled_at is in the past |
| `1004` | Scheduling conflict for advisor |

---

### `sp_update_meeting_firefly_id`

Stores the Fireflies meeting ID and URL after the recording session is created.

**Parameters**

| # | Name | Type | Nullable |
|---|---|---|---|
| 1 | `meeting_id` | `UUID` | NO |
| 2 | `firefly_meeting_id` | `VARCHAR(255)` | NO |
| 3 | `firefly_meeting_url` | `TEXT` | NO |

**Returns** (`result` column): The `meeting_id` string.

**nextAction:** `"publish_scheduled_event"`

**Error cases**

| errornumber | errormessage | Trigger |
|---|---|---|
| `2001` | `"Meeting not found"` | No row for meeting_id |

---

### `sp_update_meeting_status`

Updates meeting status from a Fireflies webhook event. Looked up by Fireflies ID, not our internal ID.

**Parameters**

| # | Name | Type | Nullable | Notes |
|---|---|---|---|---|
| 1 | `firefly_meeting_id` | `VARCHAR(255)` | NO | Fireflies' own ID — not our UUID |
| 2 | `status` | `VARCHAR(50)` | NO | One of: `scheduled`, `in_progress`, `completed`, `transcribed`, `cancelled` |
| 3 | `started_at` | `TIMESTAMPTZ` | YES | Set when status = `in_progress` |
| 4 | `ended_at` | `TIMESTAMPTZ` | YES | Set when status = `completed` |

**Returns** (`result` column): Our internal `meeting_id` UUID string.

**nextAction values by status**

| status | nextAction |
|---|---|
| `completed` | `"fetch_transcript"` |
| `transcribed` | `"start_extraction"` |
| `cancelled` | `"send_cancellation_notification"` |
| anything else | `"continue"` |

**Error cases**

| errornumber | errormessage | Trigger |
|---|---|---|
| `2002` | `"Meeting not found for Firefly ID: <id>"` | No row for firefly_meeting_id |

---

### `sp_save_transcript`

Saves the transcript after Fireflies finishes processing.

**Parameters**

| # | Name | Type | Nullable |
|---|---|---|---|
| 1 | `meeting_id` | `UUID` | NO |
| 2 | `transcript_text` | `TEXT` | NO |
| 3 | `transcript_url` | `TEXT` | NO |
| 4 | `duration_seconds` | `INTEGER` | NO |

**Returns** (`result` column): The `meeting_id` string.

**Side effect:** Sets `status = 'transcribed'` and `extraction_status = 'pending'` on the meeting row.

**nextAction:** `"publish_transcribed_event"`

**Error cases**

| errornumber | errormessage | Trigger |
|---|---|---|
| `2003` | `"Meeting not found"` | No row for meeting_id |

---

### `fn_get_meeting_for_extraction`

Read-only. Returns meeting context needed by the AI extraction pipeline.

**Parameters**

| # | Name | Type | Nullable |
|---|---|---|---|
| 1 | `meeting_id` | `UUID` | NO |

**Returns** (`result` column)

```json
{
  "client_id": "string",
  "agenda": "string",
  "scheduled_at": "ISO8601 string",
  "agents_to_use": ["DemographicsAgent", "FinanceAgent", "..."]
}
```

The `agents_to_use` list is derived from the `agenda` text:
- Contains "initial" → `["DemographicsAgent", "FinanceAgent", "GoalsAgent", "ProfessionalAgent", "QualitativeAgent", "SystemResolver"]`
- Contains "review" → `["FinanceAgent", "GoalsAgent", "TaskAgent", "FeedbackAgent", "SystemResolver"]`
- Contains "goal" → `["GoalsAgent", "FinanceAgent", "ScheduleAgent", "TaskAgent", "SystemResolver"]`
- Default → initial_consultation set

**Error cases**

| errornumber | errormessage | Trigger |
|---|---|---|
| `2001` | `"Meeting not found"` | No row for meeting_id |

---

### `sp_save_extraction`

Saves the full 174-field AI extraction result. Called once per meeting after the extraction pipeline completes.

**Parameters**

| # | Name | Type | Nullable | Notes |
|---|---|---|---|---|
| 1 | `client_id` | `VARCHAR(255)` | NO | |
| 2 | `meeting_id` | `UUID` | NO | |
| 3 | `extraction_job_id` | `VARCHAR(255)` | NO | Must be unique — idempotency key |
| 4 | `provider` | `VARCHAR(50)` | NO | e.g. `"openai"` |
| 5 | `model` | `VARCHAR(100)` | NO | e.g. `"gpt-4o"` |
| 6 | `extracted_at` | `TIMESTAMPTZ` | NO | |
| 7 | `duration_seconds` | `FLOAT` | NO | AI processing time |
| 8 | `total_fields` | `INTEGER` | NO | Always `174` currently |
| 9 | `raw_data` | `JSONB` | NO | See 174-field schema below |

**`raw_data` JSONB schema** — each key is the field number `"1"` through `"174"`:

```json
{
  "1": {
    "value": "any scalar or array or null",
    "confidence": 0.95,
    "confidence_level": "exact_quote | clearly_inferable | estimated | indirect | not_extracted",
    "source": "verbatim quote or explanation",
    "agent": "AgentName or null",
    "attribute": "Human-readable field name",
    "touch_point": "Section name"
  }
}
```

**Returns** (`result` column): The new `extraction_id` UUID string.

**Side effect:** Sets meeting `status = 'extraction_completed'` and `extraction_status = 'completed'`.

**nextAction:** `"process_by_domain"`

**Error cases**

| errornumber | errormessage | nextAction | Trigger |
|---|---|---|---|
| `3001` | `"Extraction job ID already exists"` | `"check_duplicate"` | Duplicate extraction_job_id |

---

### `sp_save_demographics`

Saves the demographics domain bucket (fields 1–42) for a client after extraction.

**Parameters**

| # | Name | Type | Nullable | Notes |
|---|---|---|---|---|
| 1 | `client_id` | `VARCHAR(255)` | NO | |
| 2 | `extraction_id` | `UUID` | NO | FK to extraction |
| 3 | `data` | `JSONB` | NO | Subset of raw_data — fields 1–42 only |

**Returns** (`result` column): `client_id` string.

**nextAction:** `"save_contacts"`

---

### `sp_save_financials`

Saves the financials domain bucket (fields 43–78).

**Parameters**

| # | Name | Type | Nullable |
|---|---|---|---|
| 1 | `client_id` | `VARCHAR(255)` | NO |
| 2 | `extraction_id` | `UUID` | NO |
| 3 | `data` | `JSONB` | NO |

**Returns** (`result` column): `client_id` string.

**nextAction:** `"save_goals"`

---

### `sp_save_goals`

Saves the life goals domain bucket (fields 79–83).

**Parameters**

| # | Name | Type | Nullable |
|---|---|---|---|
| 1 | `client_id` | `VARCHAR(255)` | NO |
| 2 | `extraction_id` | `UUID` | NO |
| 3 | `data` | `JSONB` | NO |

**Returns** (`result` column): `client_id` string.

**nextAction:** `"save_qualitative"`

---

### `sp_save_qualitative`

Saves the qualitative parameters domain bucket (fields 144–158).

**Parameters**

| # | Name | Type | Nullable |
|---|---|---|---|
| 1 | `client_id` | `VARCHAR(255)` | NO |
| 2 | `extraction_id` | `UUID` | NO |
| 3 | `data` | `JSONB` | NO |

**Returns** (`result` column): `client_id` string.

**nextAction:** `"publish_data_saved_event"`

---

### `sp_save_summary`

Saves the AI-generated executive summary for a meeting. One summary per meeting — duplicate is an error.

**Parameters**

| # | Name | Type | Nullable | Notes |
|---|---|---|---|---|
| 1 | `meeting_id` | `UUID` | NO | |
| 2 | `client_id` | `VARCHAR(255)` | NO | |
| 3 | `executive_summary` | `TEXT` | NO | 2–5 sentence narrative |
| 4 | `key_points` | `JSONB` | NO | `["string", ...]` array |
| 5 | `decisions_made` | `JSONB` | NO | `["string", ...]` array |
| 6 | `client_sentiment` | `VARCHAR(50)` | YES | `"positive"`, `"neutral"`, `"negative"` |
| 7 | `advisor_notes` | `TEXT` | YES | |
| 8 | `model` | `VARCHAR(100)` | NO | LLM model used for generation |
| 9 | `duration_seconds` | `FLOAT` | NO | Generation time |

**Returns** (`result` column): New `summary_id` UUID string.

**nextAction:** `"save_action_items"`

**Error cases**

| errornumber | errormessage | nextAction | Trigger |
|---|---|---|---|
| `4001` | `"Summary already exists for this meeting"` | `"update_or_skip"` | Duplicate meeting_id |

---

### `sp_save_action_item`

Saves a single action item. Called in a loop — up to 10 times per meeting.

**Parameters**

| # | Name | Type | Nullable | Notes |
|---|---|---|---|---|
| 1 | `meeting_id` | `UUID` | NO | |
| 2 | `client_id` | `VARCHAR(255)` | NO | |
| 3 | `action_type` | `VARCHAR(100)` | NO | e.g. `"advisor_task"`, `"client_task"` |
| 4 | `description` | `TEXT` | NO | |
| 5 | `assigned_to` | `VARCHAR(255)` | YES | Advisor ID or client ID |
| 6 | `due_date` | `DATE` | YES | |
| 7 | `priority` | `VARCHAR(20)` | NO | `"P0"`, `"P1"`, `"P2"`, `"P3"`, `"P4"` |
| 8 | `confidence` | `FLOAT` | YES | 0.0–1.0 extraction confidence |

**Returns** (`result` column): New `action_item_id` UUID string.

**nextAction:** `"continue_or_finish"`

---

### `sp_cancel_meeting`

Cancels a meeting. Cannot cancel a meeting that has already been completed or transcribed.

**Parameters**

| # | Name | Type | Nullable |
|---|---|---|---|
| 1 | `meeting_id` | `UUID` | NO |
| 2 | `cancelled_by` | `VARCHAR(255)` | NO |
| 3 | `cancellation_reason` | `TEXT` | NO |

**Returns** (`result` column): The `meeting_id` string.

**nextAction:** `"cancel_in_firefly"` — caller will also cancel the Fireflies session.

**Error cases**

| errornumber | errormessage | nextAction | Trigger |
|---|---|---|---|
| `2004` | `"Meeting not found"` | `"verify_meeting_id"` | No row for meeting_id |
| `2005` | `"Cannot cancel completed meeting"` | `"contact_admin"` | Status is `completed`, `transcribed`, or `extraction_completed` |

---

### `fn_get_extraction`

Read-only. Fetches a full extraction record by ID.

**Parameters**

| # | Name | Type | Nullable |
|---|---|---|---|
| 1 | `extraction_id` | `UUID` | NO |

**Returns** (`result` column)

```json
{
  "id": "uuid",
  "client_id": "string",
  "meeting_id": "uuid",
  "extraction_job_id": "string",
  "provider": "string",
  "model": "string",
  "extracted_at": "ISO8601",
  "duration_seconds": 93.87,
  "total_fields": 174,
  "raw_data": { "1": {}, "2": {}, "...": {} },
  "validated": false,
  "validated_by": null,
  "validated_at": null,
  "validation_notes": null,
  "created_at": "ISO8601"
}
```

**Error cases**

| errornumber | errormessage | Trigger |
|---|---|---|
| `3002` | `"Extraction not found"` | No row for extraction_id |

---

### `fn_list_meetings`

Read-only. Returns all meetings sorted by `scheduled_at` descending.

**Parameters:** None.

**Returns** (`result` column): Array of meeting objects:

```json
[
  {
    "id": "uuid",
    "title": "string",
    "agenda": "string",
    "client_id": "string",
    "client_name": "string",
    "advisor_id": "string",
    "advisor_name": "string",
    "advisor_ids": ["string"],
    "advisor_names": ["string"],
    "member": "string",
    "guests": ["email"],
    "notes": "string",
    "scheduled_at": "ISO8601",
    "duration_minutes": 60,
    "status": "string",
    "meeting_url": "string",
    "firefly_meeting_id": "string",
    "extraction_status": "string",
    "created_by": "string",
    "created_at": "ISO8601"
  }
]
```

---

### `fn_list_clients`

Read-only. Returns the client roster.

**Parameters:** None.

**Returns** (`result` column):

```json
[
  {
    "id": "string",
    "name": "string",
    "email": "string",
    "segment": "HNI | Mass Affluent | Ultra HNI"
  }
]
```

---

### `fn_list_advisors`

Read-only. Returns the advisor roster.

**Parameters:** None.

**Returns** (`result` column):

```json
[
  {
    "id": "string",
    "name": "string",
    "email": "string",
    "specialization": "string"
  }
]
```

---

### `fn_list_extractions`

Read-only. Returns extraction records, optionally filtered by validation status.

**Parameters**

| # | Name | Type | Nullable | Notes |
|---|---|---|---|---|
| 1 | `validated` | `BOOLEAN` | YES | `NULL` = return all; `true` = validated only; `false` = unvalidated only |

**Returns** (`result` column): Array of extraction objects (same shape as `fn_get_extraction` result).

---

### `sp_validate_extraction`

Marks an extraction as human-validated and applies any field value corrections from the advisor.

**Parameters**

| # | Name | Type | Nullable | Notes |
|---|---|---|---|---|
| 1 | `extraction_id` | `UUID` | NO | |
| 2 | `validated_by` | `VARCHAR(255)` | NO | Advisor user ID |
| 3 | `validation_notes` | `TEXT` | YES | Free-text notes |
| 4 | `changes` | `JSONB` | NO | Array of field corrections — see below |

**`changes` array schema:**

```json
[
  {
    "field_id": 3,
    "new_value": "corrected value"
  }
]
```

Field IDs are integers 1–174 matching the extraction's `raw_data` keys. The proc should update `raw_data[field_id]["value"]` for each entry in `changes`.

**Returns** (`result` column): The `extraction_id` string.

**nextAction:** `"publish_validated_event"`

**Error cases**

| errornumber | errormessage | Trigger |
|---|---|---|
| `3002` | `"Extraction not found"` | No row for extraction_id |

---

## Section 4 — Meeting Status State Machine

The backend must enforce this state machine on the `meetings.status` column:

```
scheduled
    ↓ (Fireflies webhook: meeting starts)
in_progress
    ↓ (Fireflies webhook: meeting ends)
completed
    ↓ (Fireflies webhook: transcript ready)
transcribed
    ↓ (AI extraction pipeline finishes)
extraction_completed

Any state → cancelled  (only if NOT already in: completed / transcribed / extraction_completed)
```

---

## Section 5 — The 174 Field Taxonomy

The `raw_data` JSONB in `sp_save_extraction` / `fn_get_extraction` contains all 174 fields. Below is the full index for schema design reference.

| Field # | Attribute | Touch Point / Section |
|---|---|---|
| 1 | T_id (Turtle CRM ID) | System |
| 2 | Lead/Client Name | Demographics & Family |
| 3 | Lead/Client Gender | Demographics & Family |
| 4 | Lead/Client Age | Demographics & Family |
| 5 | Marital Status | Demographics & Family |
| 6 | Spouse Name | Demographics & Family |
| 7 | Spouse Gender | Demographics & Family |
| 8 | Spouse Age | Demographics & Family |
| 9 | Tax Residency (Self, Spouse, Kids) | Demographics & Family |
| 10 | Citizenship (Self, Spouse, Kids) | Demographics & Family |
| 11 | Native (City, State) | Demographics & Family |
| 12 | Current Residence (City, State) | Demographics & Family |
| 13 | Kids (Count) | Demographics & Family |
| 14 | Returning from (State, Country) | Demographics & Family |
| 15 | Kids as Foreign Citizens (Y/N) | Demographics & Family |
| 16 | Date of Birth | Demographics & Family |
| 17 | Anniversary Date | Demographics & Family |
| 18 | PAN (Primary Member) | Demographics & Family |
| 19 | Aadhaar (Primary Member) | Demographics & Family |
| 20 | Primary Phone | Contact Details |
| 21 | Secondary Phone | Contact Details |
| 22 | Primary Email Id | Contact Details |
| 23 | Secondary Email Id | Contact Details |
| 24 | Nominee Name | Contact Details |
| 25 | Nominee Phone | Contact Details |
| 26 | Beneficiary Name | Contact Details |
| 27 | Beneficiary Phone | Contact Details |
| 28 | Insurance Agent Name | Contact Details |
| 29 | Insurance Agent Phone | Contact Details |
| 30 | KC Date | Acquisition |
| 31 | Acquisition Source | Acquisition |
| 32 | Membership Date | Acquisition |
| 33 | Membership Status | Acquisition |
| 34 | Membership Renewal Date | Acquisition |
| 35 | KC taker's Name | Internal |
| 36 | KC taker's Attitude | Internal |
| 37 | KC taker's Readiness | Internal |
| 38 | KC taker's Knowledge | Internal |
| 39 | KC taker's Remark (1) | Internal |
| 40 | KC taker's Remark (2) | Internal |
| 41 | Client Type (Resident/R2I) | Internal |
| 42 | Assigned to (Turtle PoC) | Internal |
| 43 | Assets Worth ($) | Finances |
| 44 | Assets Worth (Rs.) | Finances |
| 45 | Liabilities ($) | Finances |
| 46 | Liabilities (Rs.) | Finances |
| 47 | Family Income ($) | Finances |
| 48 | Family Income (Rs.) | Finances |
| 49 | Monthly Expenses ($) | Finances |
| 50 | Monthly Expenses (Rs.) | Finances |
| 51 | Policy Type | Finances |
| 52 | Insurance Company | Finances |
| 53 | Policy Name | Finances |
| 54 | Purchase Mode (Online/Offline) | Finances |
| 55 | Coverage Amount (Rs.) | Finances |
| 56 | Premium (Rs.) | Finances |
| 57 | Policy Renewal Date | Finances |
| 58 | Coverage Adequacy (H/M/L/Ok) | Finances |
| 59 | HUF (Y/N) | Finances |
| 60 | Will Executed (Y/N) | Finances |
| 61 | Credit Card (Y/N) | Finances |
| 62 | Card Name(s) | Finances |
| 63 | CC Issuing Authority | Finances |
| 64 | Card Type (Visa/MC/Diners/Amex) | Finances |
| 65 | Banking Partner(s) | Finances |
| 66 | Account Holder (Self/Spouse/Kid/Parent) | Finances |
| 67 | Income Tax Portal Password | Finances |
| 68 | ESOPs/RSUs Vested Units | Finances |
| 69 | ESOPs Exercised Units | Finances |
| 70 | FMV ($) | Finances |
| 71 | ESOPs/RSUs Worth ($) | Finances |
| 72 | FMV (Rs.) | Finances |
| 73 | ESOPs/RSUs Worth (Rs.) | Finances |
| 74 | Tax Filed till FY | Finances |
| 75 | Advance Tax paid till (MM/YY) | Finances |
| 76 | Penalty Paid in FY | Finances |
| 77 | Interest Paid in FY | Finances |
| 78 | Investing since (year) | Finances |
| 79 | Family Planning | Life Goals |
| 80 | Buying a house | Life Goals |
| 81 | Kids Education | Life Goals |
| 82 | Retirement Planning | Life Goals |
| 83 | Custom Goals | Life Goals |
| 84 | Employment Type | Professional Details |
| 85 | LinkedIn Profile | Professional Details |
| 86 | Works at | Professional Details |
| 87 | Alumni (Institute) | Professional Details |
| 88 | Alumni (Organization) | Professional Details |
| 89 | Annual Income (Self) | Professional Details |
| 90 | Annual Income (Spouse) | Professional Details |
| 91 | Annual Income (HUF) | Professional Details |
| 92 | From (Destination) | Travel Dates |
| 93 | From (Date) | Travel Dates |
| 94 | To (Destination) | Travel Dates |
| 95 | To (Date) | Travel Dates |
| 96 | Days in FY (Autocalculated) | Travel Dates |
| 97 | Date of Return | Travel Dates |
| 98 | Client's Availability | Schedule & Communication |
| 99 | Advisor's Availability | Schedule & Communication |
| 100 | Preferred mode of communication | Schedule & Communication |
| 101 | P0 (Highest priority task) | Task Priority |
| 102 | P1 | Task Priority |
| 103 | P2 | Task Priority |
| 104 | P3 | Task Priority |
| 105 | P4 | Task Priority |
| 106 | Action Items | Custom Fields |
| 107 | Open Queries | Custom Fields |
| 108 | Case Complexity (H/M/L + text) | Custom Fields |
| 109 | Special Request | Custom Fields |
| 110 | Special Information | Custom Fields |
| 111 | Special Instructions | Custom Fields |
| 112 | Consultation Agenda | Custom Fields |
| 113 | Sentiment Analysis | Custom Fields |
| 114 | Client's feedback on Financial Planner | Custom Fields |
| 115 | Client's feedback on Tax Advisor | Custom Fields |
| 116 | Client's feedback on Estate Planner | Custom Fields |
| 117 | Client's feedback on Banking & Compliance Advisor | Custom Fields |
| 118 | Client's feedback on Insurance Advisor | Custom Fields |
| 119 | Client's feedback on Credit Card Advisor | Custom Fields |
| 120 | Financial Planner's feedback on Client | Custom Fields |
| 121 | Tax Advisor's feedback on Client | Custom Fields |
| 122 | Estate Planner's feedback on Client | Custom Fields |
| 123 | Insurance Advisor's feedback on Client | Custom Fields |
| 124 | Banking & Compliance Advisor's feedback on Client | Custom Fields |
| 125 | Credit Card Advisor's feedback on Client | Custom Fields |
| 126 | Wins | Custom Fields |
| 127 | Gaps | Custom Fields |
| 128 | Suggestions | Custom Fields |
| 129 | PAN (Self) — attachment | Attachments (PDFs) |
| 130 | Aadhaar (Self) — attachment | Attachments (PDFs) |
| 131 | PAN (Spouse) — attachment | Attachments (PDFs) |
| 132 | Aadhaar (Spouse) — attachment | Attachments (PDFs) |
| 133 | PAN (Other) — attachment | Attachments (PDFs) |
| 134 | Aadhaar (Other) — attachment | Attachments (PDFs) |
| 135 | Insurance Policies — attachment | Attachments (PDFs) |
| 136 | Previous Indian ITR — attachment | Attachments (PDFs) |
| 137 | Previous Foreign ITR — attachment | Attachments (PDFs) |
| 138 | e-CAS — attachment | Attachments (PDFs) |
| 139 | Holding Statement — attachment | Attachments (PDFs) |
| 140 | ESOPs/RSUs Letter — attachment | Attachments (PDFs) |
| 141 | Payslip(s) — attachment | Attachments (PDFs) |
| 142 | Other (Doc. name) — attachment | Attachments (PDFs) |
| 143 | Deliverables (Financial Plan, Tax Plan etc.) | Attachments (PDFs) |
| 144 | Turtle Relevance (H/M/L) | Qualitative Parameters |
| 145 | Prospect's Attitude | Qualitative Parameters |
| 146 | Prospect's Financial Acumen (H/M/L) | Qualitative Parameters |
| 147 | Prospect's Financial Background (Y/N) | Qualitative Parameters |
| 148 | Prospect's Price Sensitivity (Y/N) | Qualitative Parameters |
| 149 | Introvert/Extrovert | Qualitative Parameters |
| 150 | RPA (Aggressive/Moderate/Conservative) | Qualitative Parameters |
| 151 | Areas of Interest (tags) | Qualitative Parameters |
| 152 | Financial Biases (tags) | Qualitative Parameters |
| 153 | Investing Style (tags) | Qualitative Parameters |
| 154 | Likes | Qualitative Parameters |
| 155 | Dislikes | Qualitative Parameters |
| 156 | Tech Saviness (H/M/L) | Qualitative Parameters |
| 157 | Execution Capability (H/M/L) | Qualitative Parameters |
| 158 | Behavioural Traits | Qualitative Parameters |
| 159 | ITR Filing (Spouse, Parents etc.) | Special Projects/VAS |
| 160 | Rental TDS | Special Projects/VAS |
| 161 | GST services | Special Projects/VAS |
| 162 | Remittance | Special Projects/VAS |
| 163 | Custom Services | Special Projects/VAS |
| 164 | Advisor Name | Advisor |
| 165 | Advisor Phone | Advisor |
| 166 | Advisor Email Id | Advisor |
| 167 | Advisor's Qualification | Advisor |
| 168 | Advisor's Experience | Advisor |
| 169 | Advance Tax | Campaign |
| 170 | India Tax Filing status for FY | Campaign |
| 171 | US Tax Filing status for Year | Campaign |
| 172 | W8-BEN | Campaign |
| 173 | Last touchpoint date | Engagement |
| 174 | Last touchpoint agenda | Engagement |

---

## Section 6 — Proc Count Summary

| Service | Proc Count | Procs |
|---|---|---|
| auth-service (team) | 1 | `fn_is_internal_user_allowed` |
| user-service | 4 | `sp_create_user`, `sp_get_user`, `sp_create_advisor`, `sp_get_advisor_by_username` |
| auth-service (outbox) | 5 | `sp_write_outbox_event`, `sp_poll_unpublished_events`, `sp_mark_event_published`, `sp_mark_event_failed`, `sp_move_to_dlq` |
| meeting-service | 19 | `sp_schedule_meeting`, `sp_update_meeting_firefly_id`, `sp_update_meeting_status`, `sp_save_transcript`, `fn_get_meeting_for_extraction`, `sp_save_extraction`, `sp_save_demographics`, `sp_save_financials`, `sp_save_goals`, `sp_save_qualitative`, `sp_save_summary`, `sp_save_action_item`, `sp_cancel_meeting`, `fn_get_extraction`, `fn_list_meetings`, `fn_list_clients`, `fn_list_advisors`, `fn_list_extractions`, `sp_validate_extraction` |
| **Total** | **29** | |

---

## Section 7 — Integration Notes for DB Team

1. **How the app calls procs:** `asyncpg` with `CALL proc_name($1, $2, ...)` for mutations, `SELECT * FROM fn_name($1)` for read functions. The distinction matters — `sp_` procs are `PROCEDURE`, `fn_` procs are `FUNCTION RETURNS TABLE(...)`.

2. **Result envelope:** Every proc/function must output exactly four columns named `result` (JSONB), `errormessage` (TEXT), `errornumber` (INTEGER), `nextAction` (TEXT). The wrapper reads them by name.

3. **No ORM, no migrations in this repo:** The application code has zero schema knowledge. All DDL, indexes, and constraints are owned entirely by the DB team.

4. **Swapping in real procs:** In each `*_procs.py` file, there are commented-out `async with get_db_pool()...` blocks showing exactly how the real call will be wired. Once a proc is ready, only the handler function body changes — all public wrappers and callers remain identical.

5. **Concurrency safety:** `sp_poll_unpublished_events` must use `SELECT ... FOR UPDATE SKIP LOCKED` — multiple outbox publisher replicas may run simultaneously.

6. **Idempotency:** `sp_save_extraction` must enforce uniqueness on `extraction_job_id` and return error `3001` on duplicate — the extraction pipeline may retry on transient failures.
