# Event-Driven Architecture (EDA) — Turtle CRM Meeting Intelligence

> **What this document is:** A detailed explanation of how the meeting-intelligence
> part of Turtle CRM works using an *event-driven architecture*. It is written so a
> **non-technical reader** can follow the story, and it also lists exactly **which
> database entity (table)** each step touches so an engineer can trace it.

---

## 1. The one-paragraph summary (for everyone)

When an advisor has a client call, the system records it, the recording service
sends us the transcript, an **AI reads the transcript and fills in ~176 CRM fields**
(name, family, income, goals, etc.), a human reviewer checks and approves those
fields, and the approved data flows into the client's profile. None of these steps
call each other directly. Instead, each step **announces "I'm done" by dropping a
message (an "event") onto a shared message bus**, and the next step is listening for
that announcement and picks it up. This is what "event-driven" means.

---

## 2. What does "event-driven" mean? (plain language)

Think of a **restaurant kitchen with a ticket rail**:

- A waiter clips an order ticket to the rail and walks away. They do **not** wait at
  the grill.
- The grill chef sees a ticket, cooks, and clips a "ready for plating" ticket.
- The plating station sees *that* ticket and plates the dish.

Nobody stands around waiting for the next person. Each station does its job when a
ticket appears, then announces the next ticket. If the plating station is briefly
busy, tickets just wait on the rail — nothing is lost.

In our system:

| Restaurant idea | Our system |
|---|---|
| The ticket rail | **RabbitMQ** (the "message bus") |
| A ticket | An **event** (e.g. `meeting.transcribed`) |
| A cook reading tickets | A **worker / consumer** (a background program) |
| Clipping a new ticket | **Publishing** an event |
| Tickets wait if a cook is busy | RabbitMQ **queues** hold events until consumed |

**Why we built it this way:**
- **Resilience** — if the AI service is down, transcripts wait safely in the queue and
  get processed when it recovers. Nothing is dropped.
- **Speed for the user** — the web request returns immediately; the slow AI work
  happens in the background.
- **Independence** — each stage can be changed, restarted, or scaled on its own.

---

## 3. The actors (systems involved)

| Actor | What it is | Role here |
|---|---|---|
| **internal-app** | React web app used by the internal team | Where humans schedule meetings & review AI results |
| **meeting-service** | Python/FastAPI backend (port 4004) | The brain — handles requests, runs the workers, talks to everything |
| **RabbitMQ** | Message bus | Carries events between stages (the "ticket rail") |
| **PostgreSQL** | Database | The permanent record (all "entities/tables" live here) |
| **Fireflies.ai** | External meeting-recording service | Records the call and sends us the transcript |
| **Google Calendar** | External calendar | Creates the calendar event + Google Meet link |
| **CRM-AI service** | Separate Python/FastAPI AI service (port 5000) | Reads the transcript and extracts the 176 CRM fields + summary |
| **Redis** | In-memory store | Reserved for caching (initialized, lightly used today) |

> The bus is wired through a single module, `services/meeting-service/eventbus.py`.
> All events go to one RabbitMQ **topic exchange** named **`turtle.events`**, and each
> consumer reads from its own **durable queue** so messages survive restarts.

---

## 4. The events (the "tickets")

These are the actual event names ("topics") that travel on the bus. Publisher and
consumer columns are exact.

| Event topic | Published when… | Published by | Consumed by (queue) |
|---|---|---|---|
| `meeting.scheduled` | A meeting is booked | `routes/meetings.py` | *(announcement only — no worker yet)* |
| `meeting.cancelled` | A meeting is cancelled | `routes/meetings.py` | *(announcement only)* |
| `meeting.rescheduled` | A meeting is moved | `routes/meetings.py` | *(announcement only)* |
| `meeting.transcribed` | A transcript is ready | `routes/webhooks.py`, `routes/ingest.py` | **transcript_processor** (`meeting-service-transcript`) |
| `extraction.completed` | AI extraction is saved | `workers/transcript_processor.py` | *(announcement only)* |
| `extraction.summarize` | Ask AI for a summary | `workers/transcript_processor.py` | **summary_worker** (`meeting-service-summary`) |
| `extraction.save` | Push fields into domain tables | `workers/transcript_processor.py` | **data_persistence** (`meeting-service-persistence`) |
| `meeting.summarized` | Summary + action items saved | `workers/summary_worker.py` | *(announcement only)* |

> "Announcement only" means the event is published for the future / other services
> (notifications, analytics) but no worker consumes it **today**. The pipeline that is
> fully wired is: **`meeting.transcribed` → extraction → (`extraction.summarize` +
> `extraction.save`)**.

---

## 5. The end-to-end story (with the entity touched at each step)

Below, **"Entity"** = the PostgreSQL table that gets read or written. This is the
"which entity is used" map.

### Step 1 — Schedule the meeting
- **Who:** Internal user clicks "Schedule" in **internal-app**.
- **What happens:** meeting-service calls Google Calendar to create the event + Meet
  link, invites the Fireflies bot, then saves the meeting.
- **Event published:** `meeting.scheduled`
- **Entities used:**
  - `meetings` — the meeting row (title, time, status)
  - `meeting_attendees` — who is invited (client users + adviser users)
  - `meeting_internal_details` — agenda, which AI agents to run, pre-meeting notes
  - `meeting_external_sync` — Google event ID + Meet URL (used later to match the webhook)
- **Stored procedures:** `sp_schedule_meeting`, `sp_save_meeting_external_sync`

### Step 2 — The call happens & Fireflies records it
- **Who:** Advisor + client on the Google Meet; Fireflies bot is in the room.
- **What happens:** Nothing in our system yet — we wait for Fireflies.

### Step 3 — Transcript is ready (the trigger)
- **Who:** **Fireflies.ai** sends a webhook to `POST /webhooks/firefly`.
- **What happens:** meeting-service verifies the signature, downloads the full
  transcript from Fireflies, saves it to disk, then finds the matching meeting by its
  Meet URL. *If no meeting matches* (the call was never scheduled in our system), it
  **auto-ingests** one by reading the attendee list and matching an advisor + client.
- **Event published:** `meeting.transcribed` (carries the transcript text + meeting context)
- **Entities used:**
  - `meetings`, `meeting_external_sync` — to find the scheduled meeting
  - `transcripts` — the saved transcript row
  - For auto-ingest: `clients`, `client_users`, `advisors`, `adviser_users`,
    `meeting_attendees`
- **Stored procedures:** `fn_find_meeting_by_meet_url`, `sp_save_transcript`,
  `sp_ingest_meeting_from_fireflies`

> There is also a **manual ingest** path (`/api/meetings/ingest`) for importing past
> Fireflies meetings on demand. It publishes the *same* `meeting.transcribed` event,
> so the rest of the pipeline behaves identically.

### Step 4 — AI extraction (the heavy lifting)
- **Who:** The **transcript_processor** worker hears `meeting.transcribed`.
- **What happens:** It POSTs the transcript to the **CRM-AI service** at `/extract`.
  The AI runs ~10 specialist "agents" (Demographics, Finance, Goals, Professional,
  Schedule, Qualitative, Task, Feedback, Advisory, plus a System resolver) and returns
  up to **176 fields**, each with a value, a confidence score, and the supporting
  quote — plus a per-agent **token-usage** breakdown and an advisor **call-analysis**
  coaching report.
- **Events published:** `extraction.completed`, then `extraction.summarize` and
  `extraction.save`
- **Entities used:**
  - `extractions` — the extraction header (provider, model, version, validated flag, call_analysis)
  - `extraction_fields` — one row per extracted field (value + confidence)
  - `field_definitions` — the master list of the 176 fields (touch point, attribute name)
  - `extraction_token_usage` — tokens spent per agent (for cost tracking)
- **Stored procedure:** `sp_save_extraction`

### Step 5a — Generate the summary (parallel branch)
- **Who:** The **summary_worker** hears `extraction.summarize`.
- **What happens:** Calls CRM-AI `/summarize`, gets an executive summary, key points,
  decisions, sentiment, and action items, and saves them. (If the summarize endpoint
  isn't available it skips quietly.)
- **Event published:** `meeting.summarized`
- **Entities used:**
  - `meeting_summaries` — the executive summary + metadata
  - `meeting_action_items` — each follow-up task
- **Stored procedures:** `sp_save_summary`, `sp_save_action_item`

### Step 5b — Fan out into domain tables (parallel branch)
- **Who:** The **data_persistence** worker hears `extraction.save`.
- **What happens:** It splits the 176 fields into domain "buckets" by field-ID range
  and writes each bucket to its domain table.
- **Entities used (buckets):**
  - Demographics (field IDs 1–42) → demographics/family tables
  - Financials (43–78) → financial-profile tables
  - Goals (79–83) → life-goals tables
  - Qualitative (144–158) → qualitative-profile tables
- **Stored procedures:** `sp_save_demographics`, `sp_save_financials`,
  `sp_save_goals`, `sp_save_qualitative`

### Step 6 — Human validation (review & approve)
- **Who:** Internal reviewer opens the **AI Validation** page in internal-app.
- **What happens:** The reviewer sees every extracted field grouped by "touch point",
  can **edit / approve / reject** each one, and finally **Validate** the extraction
  (which locks it). They can **Unvalidate** to reopen it. Every change is audited.
- **Entities used:**
  - `extraction_fields` — edited values
  - `extraction_field_audit` — who changed what, before/after, and why
  - `extraction_validation_audit` — validate / unvalidate transitions (reason + reviewer)
  - `team_users` — the reviewer's identity
- **Stored procedures:** `sp_patch_extraction_fields`, `sp_validate_extraction`,
  `sp_unvalidate_extraction`, `fn_get_extraction`, `fn_validation_history`

---

## 6. The flow as a diagram

```
  internal-app (human)
        │  POST /api/meetings/schedule
        ▼
  ┌──────────────────┐   creates event + Meet link    ┌──────────────────┐
  │  meeting-service │ ─────────────────────────────► │  Google Calendar │
  └──────────────────┘                                └──────────────────┘
        │ publish: meeting.scheduled
        ▼
   ( … the call happens, Fireflies bot records … )
        │
        │  Fireflies → POST /webhooks/firefly  (transcript ready)
        ▼
  ┌──────────────────┐  download transcript   ┌──────────────────┐
  │  meeting-service │ ◄───────────────────── │   Fireflies.ai   │
  └──────────────────┘                        └──────────────────┘
        │ publish: meeting.transcribed
        ▼
   ┌─────────────────────────  RabbitMQ  (turtle.events)  ─────────────────────────┐
   │                                                                                │
   ▼                                                                                │
  [ transcript_processor ] ── POST /extract ──► CRM-AI service (≈176 fields)        │
        │  save → extractions / extraction_fields / extraction_token_usage          │
        │                                                                           │
        ├── publish: extraction.summarize ──►  [ summary_worker ] ── /summarize ──┐ │
        │                                          save → meeting_summaries        │ │
        │                                                 meeting_action_items     │ │
        │                                                                          │ │
        └── publish: extraction.save ──────►  [ data_persistence ]                 │ │
                                                  split 176 fields into buckets     │ │
                                                  save → demographics / financials  │ │
                                                         / goals / qualitative      │ │
                                                                                    │ │
        publish: extraction.completed (announcement)   publish: meeting.summarized ─┘ │
   └────────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
  internal-app  ──►  AI Validation page  ──►  reviewer edits / approves / validates
        save → extraction_fields / extraction_field_audit / extraction_validation_audit
```

---

## 7. Entity (table) quick-reference

The database is organised into numbered migration "domains". The meeting-intelligence
tables live mainly in these:

| Entity (table) | Domain / migration | What it holds |
|---|---|---|
| `meetings` | 005 meetings_and_communications | The meeting itself (time, status, type) |
| `meeting_attendees` | 005 | Clients & advisers on the meeting |
| `meeting_internal_details` | 005 / 020 | Agenda, agents-to-run, pre-meeting notes |
| `meeting_external_sync` | 021 fireflies_ingest_schema | Google/Fireflies IDs + Meet URL |
| `meeting_summaries` | 018 transcripts_and_extractions | Executive summary, key points |
| `meeting_action_items` | 018 | Follow-up tasks from the call |
| `transcripts` | 018 | The raw transcript text + provider info |
| `extractions` | 018 / 022 / 027 | Extraction header, version, validated flag, call_analysis |
| `extraction_fields` | 022 extraction_field_normalization | One row per extracted CRM field |
| `field_definitions` | 022 | Master catalogue of the 176 fields |
| `extraction_field_audit` | 022 | History of every field edit |
| `extraction_validation_audit` | 024 extraction_validation_audit | Validate / unvalidate log |
| `extraction_token_usage` | 025 extraction_token_usage | AI tokens spent per agent |
| `clients` / `client_users` | 011 / 003 | The client and their login user |
| `advisors` / `adviser_users` | 003 core_user_business_profiles | The advisor and their login user |
| `team_users` | 019 team_users_oauth_only | Internal staff (reviewers) |

> Domain breakdowns are documented in `turtle - Copy/turtlecrm-db/DOMAINS.md` and
> `FINAL_DOMAINS_TABLE.md`.

---

## 8. Key design rules (the guarantees)

- **Single exchange, durable queues.** Everything publishes to `turtle.events`; each
  consumer has its own durable queue (`meeting-service-transcript`,
  `meeting-service-summary`, `meeting-service-persistence`) so nothing is lost on
  restart. Prefetch = 1 (one message at a time, fair dispatch).
- **Idempotency everywhere.** Re-delivering the same event does not create duplicates.
  Writes key off natural keys: `extraction_job_id`, `fireflies_meeting_id`, and
  caller-supplied `idempotency_key`. Replaying a webhook is safe.
- **Self-healing workers.** Each worker runs in a supervisor loop with exponential
  backoff (up to ~30s), so a RabbitMQ cold-start or a transient crash doesn't kill the
  pipeline.
- **Retry with backoff on the AI call.** The extraction call retries transient (5xx /
  timeout) failures with 10s → 20s → 40s → 80s backoff; 4xx errors fail fast.
- **Optimistic locking on edits.** Each extraction has a `version`; concurrent edits
  are rejected with a 409 so two reviewers can't silently overwrite each other.
- **Full audit trail.** Every field edit and every validate/unvalidate is recorded
  with who, when, and why.

---

*Generated from the live codebase: `services/meeting-service/` (eventbus, routes,
workers, db), the CRM-AI service, `apps/internal-app/`, and
`turtle - Copy/turtlecrm-db/` migrations & stored procedures.*
