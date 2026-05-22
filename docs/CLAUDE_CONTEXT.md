# TurtleCRM — Claude Context File

Paste this entire file at the start of a new Claude session to continue without re-explaining.

---

## Project

**TurtleCRM** — internal CRM platform for a financial advisory firm (Turtle Corporate).
Repo root: `d:\Atharva\videototemplate\thumb-curator\TurtleCRM`
Current branch: `abi-dtq-test`

---

## Stack

| Layer | Tech |
|---|---|
| Auth, OTP | Python 3.12 + FastAPI + Uvicorn (ports 4000, 4001) |
| User, Notification | Node 20 + Fastify + Prisma (ports 4002, 4003) |
| **Meeting** | Python 3.12 + FastAPI (port 4004) — new service |
| Frontend ×3 | React 18 + Vite + TypeScript + Tailwind |
| Infra | PostgreSQL + Redis + RabbitMQ |
| Observability | OpenTelemetry → Grafana Tempo, Prometheus, Grafana |

**Run everything:** `docker-compose up --build`

---

## Architecture — what's built and working

### Services
```
apps/
  client-app/      :3000  OTP-only auth
  advisor-app/     :3001  Password + OTP 2FA + Google OAuth
  internal-app/    :3002  Internal ops portal — Google OAuth only
services/
  auth-service/    :4000  JWT issuer, OAuth
  otp-service/     :4001  OTP dispatch via provider
  user-service/    :4002  User CRUD
  notification-service/ :4003  Email/push
  meeting-service/ :4004  Meeting pipeline — NEW
shared/
  db/proc_caller.py       Proc registry + ProcResult envelope
  logger/logger.py        Shared structured logger
  events/                 Pluggable event bus adapters
```

### DB pattern — PROCS ONLY, NO SQL/ORM
Every DB call goes through `call_proc(proc_name, **kwargs)` → returns `ProcResult(result, errormessage, errornumber, nextAction)`.
`res.ok` = `errornumber is None`.

For missing procs: comment out real DB call, return hardcoded stub data, add `# TODO: uncomment when proc ready`.

```python
# Example public wrapper pattern
async def proc_schedule_meeting(**kwargs) -> str:
    res = await call_proc("sp_schedule_meeting", **kwargs)
    if not res.ok:
        raise RuntimeError(res.errormessage)
    return res.result
```

---

## meeting-service (port 4004) — full detail

### Files
```
services/meeting-service/
  main.py                     FastAPI app, lifespan starts 3 workers
  config.py                   Pydantic settings
  eventbus.py                 RabbitMQ publish/consume (aio_pika)
  firefly_client.py           Fireflies.ai GraphQL client
  google_calendar_client.py   Google Calendar API — creates Meet links
  metrics.py                  Prometheus counters
  logger.py                   Placeholder (overwritten by shared/logger/logger.py in Docker)
  db/meeting_procs.py         ALL 16+ proc stubs + in-memory stores
  routes/meetings.py          GET /api/meetings, POST /api/meetings/schedule, DELETE /api/meetings/{id}
  routes/clients.py           GET /api/clients, GET /api/advisors
  routes/extractions.py       GET/POST /api/extractions, POST /api/extractions/{id}/validate
  routes/webhooks.py          POST /webhooks/firefly
  workers/transcript_processor.py   Consumes meeting.transcribed → POST /extract on AI agent
  workers/data_persistence.py       Consumes extraction.save → splits fields into domain buckets
  workers/summary_worker.py         Consumes extraction.summarize → POST /summarize on AI agent
```

### Event flow
```
schedule click
  → POST /api/meetings/schedule
  → Google Calendar API → meet.google.com/xxx link (if GOOGLE_SERVICE_ACCOUNT_FILE set)
  → calendar invite emails sent to client_email + advisor_email
  → Fireflies addToLiveMeeting → bot joins the Meet
  → meeting.scheduled published to RabbitMQ

meeting ends
  → Fireflies webhook → POST /webhooks/firefly
  → meeting.transcribed published

transcript_processor consumes meeting.transcribed
  → POST http://CRM_AI_SERVICE_URL/extract  (real AI agent at localhost:8090)
  → extraction.completed + extraction.summarize + extraction.save published

data_persistence consumes extraction.save
  → splits 174 fields into demographics/financials/goals/qualitative procs

summary_worker consumes extraction.summarize
  → POST http://CRM_AI_SERVICE_URL/summarize
  → saves summary + action items via procs
  → meeting.summarized published
```

### Proc stubs in meeting_procs.py
All procs are in-memory. Pre-seeded with a 174-field extraction from the sample transcript.
- `sp_schedule_meeting` — stores MeetingRow with: id, client_id, advisor_id, scheduled_at, duration_minutes, agenda, title, client_name, advisor_name, member, guests, notes, meeting_url
- `fn_list_meetings` — returns all meetings with full fields
- `fn_list_clients` — returns 5 stub clients (all email: atharvabillore001@gmail.com)
- `fn_list_advisors` — returns 4 stub advisors (all email: atharvabillore007@gmail.com)
- `sp_save_extraction`, `fn_list_extractions`, `fn_get_extraction`, `sp_validate_extraction`
- `sp_save_transcript`, `fn_get_meeting_for_extraction`, `sp_update_meeting_status`
- `sp_save_demographics`, `sp_save_financials`, `sp_save_goals`, `sp_save_qualitative`
- `sp_save_summary`, `sp_save_action_item`, `sp_cancel_meeting`

---

## internal-app (port 3002) — relevant files

```
apps/internal-app/src/
  api/meetingApi.ts           All meeting-service API calls
  routes/SchedulingPage.tsx   Scheduling page — fully live from meeting-service
  routes/AiValidationPage.tsx AI validation — loads from meeting-service extractions
  routes/DashboardPage.tsx    Stats cards — scheduling count fetched live
  data/mockData.js            Still used for non-meeting data (clients, leads, tasks etc.)
                              initialSchedulingRecords/schedulingClientOptions REMOVED
  components/scheduling/
    SchedulingModal.tsx       Google Meet URL field, loading state, error display
```

### meetingApi.ts exports
- `fetchMeetings()` → `MeetingRecord[]`
- `fetchClients()` → `ClientOption[]`  (id, name, email, segment)
- `fetchAdvisors()` → `AdvisorOption[]` (id, name, email, specialization)
- `scheduleMeeting(payload)` → `{ meeting_id, status, meet_url, google_event_id }`
- `fetchExtractions(validated?)` → `Extraction[]`
- `validateExtraction(id, validatedBy, changes, notes)`
- `extractionToMeetingValues(raw)` → maps 174-field IDs to UI attribute IDs

### ScheduleMeetingPayload fields
```typescript
client_id, advisor_id, scheduled_at, duration_minutes, agenda, meeting_url,
created_by, title, client_name, advisor_name, client_email, advisor_email,
member, guests, notes
```

---

## Google Meet + Fireflies setup

### Auth approach — OAuth2 refresh token (ops team email)
Service accounts hit a 403 (`forbiddenForServiceAccounts`) when inviting attendees.
Solution: use OAuth2 user credentials tied to the ops team email directly.

### One-time token setup
```bash
# Set your GCP OAuth app creds, then run:
python scripts/get_calendar_token.py
# Sign in as the OPS TEAM email → paste printed token into .env
```

### Required env vars
```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALENDAR_REFRESH_TOKEN=<from get_calendar_token.py>
GOOGLE_CALENDAR_ID=primary          # or specific calendar email
GOOGLE_CALENDAR_TIMEZONE=Asia/Kolkata
```

### GCP checklist
- Google Calendar API enabled
- OAuth consent screen → ops email added as **Test User** (if app is in Testing mode)
- Redirect URIs in GCP: `http://localhost:4000/auth/oauth/google/callback` and `http://localhost:4000/auth/oauth/internal/google/callback`

### What happens on Schedule click (when configured)
1. Google Calendar API (as ops email) creates event → returns `meet.google.com/xxx` link
2. Meeting saved with real Meet link
3. `sendUpdates="none"` currently — change to `"all"` in `routes/meetings.py` once verified

### What happens without Calendar config
Meeting saved, no Meet link generated. User can paste Meet URL manually in the form.

---

## Key .env values
```
FIREFLY_API_KEY=40fbef4f-c889-4eb2-9e29-8fa464cb255e
GOOGLE_CLIENT_ID=48518383916-ln6sruqo76t334f1ahrhfol6t41vui8q.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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
CRM_AI_SERVICE_URL=http://localhost:8090        # your AI extraction agent
MEETING_SERVICE_PORT=4004
VITE_MEETING_SERVICE_URL=http://localhost:4004
OTP_PROVIDER=mock                               # switch to twilio when ready
```

---

## Rules — always follow these

1. **No SQL, no ORM** — only `call_proc()`. Comment out real DB call, use stub data, add TODO.
2. **No mock calls to AI** — always POST to CRM_AI_SERVICE_URL (`/extract`, `/summarize`).
3. **No mock data for meetings/clients/advisors** — all come from meeting-service proc stubs.
4. **Event bus is env-driven** — `EVENT_BUS=rabbitmq` default. Never hardcode broker SDK calls outside `eventbus.py`.
5. **Access tokens in JS memory only** — never localStorage. Refresh tokens in httpOnly cookies only.
6. **Docker build context is always repo root** — `context: .` so `COPY packages/` works.
7. **VITE env vars baked at build time** — must be in Dockerfile ARG/ENV AND docker-compose `args:`.
8. **ProcResult envelope**: `result, errormessage, errornumber, nextAction`. `res.ok = errornumber is None`.

---

## Changes — session 2026-05-20

### multi-advisor + name sync + join button

**`services/meeting-service/db/meeting_procs.py`**
- Added `advisor_ids: list` and `advisor_names: list` fields to `MeetingRow`
- Moved `_STUB_CLIENTS` / `_STUB_ADVISORS` above the proc handlers (they were below, causing reference errors)
- Added `_resolve_client_name(client_id, provided)` and `_resolve_advisor_name(advisor_id, provided)` — look up display names from stubs when not stored on the meeting row; prevents raw IDs showing in the table
- Updated `_sp_schedule_meeting` to accept `advisor_ids` / `advisor_names` lists; resolves all names via stubs; joins them with `" & "` for `advisor_name` display field
- Updated `_fn_list_meetings` to return `advisor_ids` / `advisor_names` and use resolver fallback for both client and advisor names
- Fixed seed data: seeded meeting now has `client_name="Priya Kapoor"`, `advisor_name="Anil Mehta"`, `advisor_id="advisor_1"`, `title`, `member` all set — was showing raw IDs before

**`services/meeting-service/routes/meetings.py`**
- Added `advisor_ids: list[str]`, `advisor_names: list[str]`, `advisor_emails: list[str]` to `ScheduleMeetingRequest`
- `attendee_emails` property now fans out all advisor emails for Google Calendar invites
- Passes `advisor_ids` / `advisor_names` to proc and to the `meeting.scheduled` event payload

**`apps/internal-app/src/api/meetingApi.ts`**
- Added `advisor_ids`, `advisor_names`, `advisor_emails` to `ScheduleMeetingPayload`
- Added `advisor_ids`, `advisor_names` to `MeetingRecord`

**`apps/internal-app/src/routes/SchedulingPage.tsx`**
- `meetingRecordToRow` reads `m.advisor_names` and joins with `" & "` for display; no more raw IDs in table
- `handleSubmit` now uses all `selectedAdvisors` (not just `[0]`); passes `advisor_ids`, `advisor_names`, `advisor_emails` arrays to `scheduleMeeting`

**`apps/internal-app/src/components/scheduling/SchedulingTable.tsx`**
- Join meeting (camera) button: renders as `<a target="_blank">` opening `meetingUrl`; shows disabled/greyed when no URL available

---

## Full event + worker flow (confirmed working in code)

```
Schedule click
  → proc: sp_schedule_meeting (saves with client_name, advisor_names[])
  → Google Calendar API → meet_url  (if GOOGLE_SERVICE_ACCOUNT_FILE set)
  → Fireflies addToLiveMeeting(meet_url) → firefly_meeting_id
  → proc: sp_update_meeting_firefly_id
  → event: meeting.scheduled

Meeting ends → Fireflies webhook POST /webhooks/firefly
  → proc: sp_save_transcript(meeting_id)
  → event: meeting.transcribed

transcript_processor consumes meeting.transcribed
  → proc: fn_get_meeting_for_extraction(meeting_id)
        returns: client_id + agents_to_use (derived from agenda text)
  → POST CRM_AI_SERVICE_URL/extract  { transcript, context: { agents_to_use } }
        returns: 174 filled fields
  → proc: sp_save_extraction
  → events (3, parallel): extraction.completed + extraction.save + extraction.summarize

data_persistence consumes extraction.save
  → procs: sp_save_demographics (fields 1-42)
           sp_save_financials   (fields 43-78)
           sp_save_goals        (fields 79-83)
           sp_save_qualitative  (fields 144-158)

summary_worker consumes extraction.summarize
  → POST CRM_AI_SERVICE_URL/summarize  { transcript, extraction: 174 fields }
  → proc: sp_save_summary + sp_save_action_item (up to 10)
  → event: meeting.summarized
```

**Agent selection (fn_get_meeting_for_extraction):**
| agenda keyword | agents_to_use |
|---|---|
| "initial" | DemographicsAgent, FinanceAgent, GoalsAgent, ProfessionalAgent, QualitativeAgent, SystemResolver |
| "review" | FinanceAgent, GoalsAgent, TaskAgent, FeedbackAgent, SystemResolver |
| "goal" | GoalsAgent, FinanceAgent, ScheduleAgent, TaskAgent, SystemResolver |

**Known stub bypass to fix when switching to real DB:**
`transcript_processor.py:31` — directly imports `_meetings` dict to look up by `firefly_meeting_id`. Needs to become a proc call `fn_get_meeting_by_firefly_id` when real DB is wired.

---

## Pending / next tasks

- [ ] **Google Calendar refresh token** — run `scripts/get_calendar_token.py` as ops email, paste token into `.env` (see setup above)
- [ ] **End-to-end calendar test** — schedule a meeting, confirm meet_url non-empty, event appears on ops calendar, attendee invites arrive; then change `sendUpdates="none"` → `"all"` in `routes/meetings.py`
- [ ] **Google OAuth redirect URIs** — add to Google Cloud Console:
  - `http://localhost:4000/auth/oauth/google/callback`
  - `http://localhost:4000/auth/oauth/internal/google/callback`
- [ ] **Fireflies end-to-end** — `addToLiveMeeting` only works on a live meeting URL; test by scheduling a real Meet and verifying bot joins
- [ ] **Real DB procs** — backend team will deliver stored procs; uncomment real DB calls in proc stubs when ready
- [ ] **OTP provider** — switch `OTP_PROVIDER` from `mock` to `twilio` once Twilio creds are ready
- [ ] **transcript_processor.py:31** — replace direct `_meetings` import with a `fn_get_meeting_by_firefly_id` proc when DB is ready

---

## How to run

```bash
# Full stack
docker-compose up --build

# Rebuild only changed services
docker-compose up -d --build meeting-service internal-app

# Local dev (infra first)
docker-compose up -d postgres redis rabbitmq
cd services/meeting-service && pip install -r requirements.txt && python main.py
cd apps/internal-app && npm run dev
```

---

## Changes — session 2026-05-22

### Google Calendar auth — switched from service account to OAuth2 user credentials

**Problem:** Service accounts return 403 (`forbiddenForServiceAccounts`) when inviting attendees without Domain-Wide Delegation (requires paid Google Workspace).

**Solution:** Use OAuth2 refresh token for the ops team email directly — no DWD needed.

**`services/meeting-service/google_calendar_client.py`**
- Replaced `service_account.Credentials` with `google.oauth2.credentials.Credentials`
- Reads `GOOGLE_CALENDAR_REFRESH_TOKEN` + existing `GOOGLE_CLIENT_ID/SECRET`
- Eagerly refreshes access token on each call

**`services/meeting-service/config.py`**
- Removed `google_service_account_file`, `google_service_account_json`, `google_impersonate_subject`
- Added `google_calendar_refresh_token`

**`services/meeting-service/requirements.txt`**
- Added `google-auth-oauthlib==1.2.1`

**`scripts/get_calendar_token.py`** (new)
- One-time CLI script: opens browser → consent as ops email → prints refresh token

**`services/meeting-service/firefly_client.py`**
- Fixed `addToLiveMeeting` GraphQL mutation signature (`meeting_link` not `url`, no `scheduled_at`)
- Now checks `success` field in response; better HTTP error logging

**`services/meeting-service/routes/meetings.py`**
- Simplified: removed Redis token fetch + per-user Google OAuth token logic
- Calendar call now always uses ops email refresh token from settings
- Fireflies direct API call removed (bot invited via calendar attendee instead)

**`apps/internal-app/src/components/layout/Sidebar.tsx`**
- Added logout button at bottom of sidebar with user name/email display
- Uses `useAuth().logout()` → redirects to `/login`

**`apps/internal-app/src/routes/SchedulingPage.tsx`**
- Added date/time validation before submitting (prevents silent empty-field scheduling)

**`docker-compose.yml`**
- Added `FIREFLY_BOT_EMAIL` env passthrough to meeting-service
- Added `secrets/gcp-sa.json` volume mount (still present for optional SA use)
- Cleaned up service account env var passthrough

**`.gitignore`**
- Added `secrets/` to prevent accidental commit of key files

---

## Commit history (recent)
- `a433bb0` feat: replace service account with OAuth2 user credentials for Google Calendar
- `aeecaed` feat: Google OAuth login + auto Meet link generation for internal-app scheduling
- `822c712` feat: multi-advisor support, name sync, join meeting button
- `540b15d` docs: add CLAUDE_CONTEXT.md — context file for continuing in new Claude sessions
- `a020aa9` feat: meeting-service — full pipeline, scheduling from DB procs, Google Meet + Fireflies
- `579a8a7` fix: wire /metrics on otp-service and user-service
