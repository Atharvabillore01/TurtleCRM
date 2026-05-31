"""
Meeting-service proc stubs.

All handlers return ProcResult(result, errormessage, errornumber, nextAction).
Replace handler bodies when real stored procs are ready — public wrappers stay unchanged.

Pre-seeded with one extraction from the 174.txt sample so the validation screen
has live data immediately.
"""

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from typing import Any, Optional

from db.proc_caller import ProcResult, register_proc, call_proc, call_function


# ── In-memory stores ──────────────────────────────────────────────────────────

@dataclass
class MeetingRow:
    id: str
    client_id: str
    advisor_id: str
    scheduled_at: str
    duration_minutes: int
    agenda: str
    status: str = "scheduled"
    # enriched display fields
    title: Optional[str] = None
    client_name: Optional[str] = None
    advisor_name: Optional[str] = None
    # multi-advisor support (TODO: map to DB proc columns when ready)
    advisor_ids: list = field(default_factory=list)
    advisor_names: list = field(default_factory=list)
    member: Optional[str] = None          # ops team member who booked
    guests: list = field(default_factory=list)
    notes: Optional[str] = None           # detailsHappened / extra notes
    meeting_url: Optional[str] = None     # Google Meet URL
    # Fireflies
    firefly_meeting_id: Optional[str] = None
    firefly_meeting_url: Optional[str] = None
    # lifecycle timestamps
    started_at: Optional[str] = None
    ended_at: Optional[str] = None
    # transcript
    transcript_text: Optional[str] = None
    transcript_url: Optional[str] = None
    transcript_duration_seconds: Optional[int] = None
    # extraction
    extraction_job_id: Optional[str] = None
    extraction_status: Optional[str] = None
    # ops-selected CRM agents to run on the post-meeting transcript (empty = all)
    agents_to_use: list = field(default_factory=list)
    created_by: Optional[str] = None
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class ExtractionRow:
    id: str
    client_id: str
    meeting_id: str
    extraction_job_id: str
    provider: str
    model: str
    extracted_at: str
    duration_seconds: float
    total_fields: int
    raw_data: dict
    validated: bool = False
    validated_by: Optional[str] = None
    validated_at: Optional[str] = None
    validation_notes: Optional[str] = None
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class SummaryRow:
    id: str
    meeting_id: str
    client_id: str
    executive_summary: str
    key_points: list
    decisions_made: list
    client_sentiment: Optional[str]
    advisor_notes: Optional[str]
    generated_by_model: str
    generation_duration_seconds: float
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class ActionItemRow:
    id: str
    meeting_id: str
    client_id: str
    action_type: str
    description: str
    priority: str
    due_date: Optional[str]
    assigned_to: Optional[str]
    status: str = "pending"
    confidence: Optional[float] = None
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


_meetings: dict[str, MeetingRow] = {}
_extractions: dict[str, ExtractionRow] = {}
_summaries: dict[str, SummaryRow] = {}
_action_items: list[ActionItemRow] = []
_demographics: dict[str, dict] = {}
_financials: dict[str, dict] = {}
_goals: list[dict] = []
_qualitative: dict[str, dict] = {}


# ── Proc handlers ─────────────────────────────────────────────────────────────

def _to_uuid(value: Any) -> uuid.UUID | None:
    """Best-effort string/UUID → uuid.UUID. None / empty → None."""
    if value is None or value == "":
        return None
    if isinstance(value, uuid.UUID):
        return value
    return uuid.UUID(str(value))


def _parse_iso_datetime(value: str | datetime) -> datetime:
    """ISO-8601 string → tz-aware datetime. Already-datetime values pass through."""
    if isinstance(value, datetime):
        return value
    # Python 3.11+ fromisoformat handles 'Z' and offsets; for older runtimes the
    # service runs on python:3.12-slim so this is safe.
    return datetime.fromisoformat(value)


async def _sp_schedule_meeting(
    client_id: str,
    advisor_id: str,
    scheduled_at: str,
    duration_minutes: int,
    agenda: str,
    created_by: str,
    title: str | None = None,
    client_name: str | None = None,    # legacy — unused; SP looks up via FK
    advisor_name: str | None = None,   # legacy — unused
    advisor_ids: list | None = None,
    advisor_names: list | None = None, # legacy — unused
    member: str | None = None,         # legacy — booked_by is now FK to team_users
    guests: list | None = None,        # stashed into meetings.metadata.guests
    notes: str | None = None,          # → meeting_internal_details.pre_meeting_notes
    meeting_url: str | None = None,
    agents_to_use: list | None = None,
) -> ProcResult:
    """
    Real DB call to deployed `sp_schedule_meeting` (Wave B).

    Atomic 3-table write across meetings + meeting_internal_details + N
    meeting_attendees rows. Stores agents_to_use in meetings.metadata.
    Emits `meeting.scheduled` to domain_events via sp_record_auth_event.

    SIGNATURE CONTRACT:
      Same kwargs as the legacy stub — route handler is unchanged.
      Returns `meeting_id` string in ProcResult.result so callers that do
      `meeting_id = await proc_schedule_meeting(...)` keep working.

    TRANSLATION (legacy → SP):
      scheduled_at (str) + duration_minutes (int)  → start_time + end_time (TIMESTAMPTZ)
      client_id (str UUID)                          → p_client_user_ids = [UUID]
      advisor_id / advisor_ids (multi-advisor)      → p_adviser_user_ids = [UUID,…]
      created_by (str UUID from JWT)                → p_created_by (UUID)
      created_by                                    → p_booked_by (same actor; the
                                                      `member` form field is now a
                                                      display label derived from team_users)
      meeting_url                                   → p_google_meet_link
      agents_to_use                                 → p_agents_to_use (text[])

    DROPPED legacy fields (no schema columns for them yet):
      client_name, advisor_name, advisor_names, member, guests, notes —
      none of these are passed to the SP. If `guests`/`notes` need to
      persist, add columns or store in meetings.metadata in a follow-up.
    """
    from db.pool import get_pool

    # ---- Translate legacy params to SP params ----
    start_dt   = _parse_iso_datetime(scheduled_at)
    end_dt     = start_dt + timedelta(minutes=duration_minutes)
    creator    = _to_uuid(created_by)
    client_ids = [_to_uuid(client_id)] if client_id else []

    # advisor_ids is the multi-advisor array if present, else fall back to single advisor_id
    raw_adv = advisor_ids if advisor_ids else ([advisor_id] if advisor_id else [])
    adviser_ids = [_to_uuid(a) for a in raw_adv if a]

    agents = list(agents_to_use) if agents_to_use else []

    # Stash `guests` into meetings.metadata.guests so it survives end-to-end.
    # `member` is intentionally dropped — frontend's freeform string is
    # superseded by booked_by_name (derived from team_users at read-time).
    import json as _json
    meta = {}
    if guests:
        meta["guests"] = list(guests)
    # If the form submitted a `member` freeform label that doesn't match
    # booked_by, preserve it as a display hint so it can be shown alongside
    # the resolved booked_by_name.
    if member and member.strip():
        meta["member_label"] = member.strip()
    meta_json = _json.dumps(meta) if meta else "{}"

    # ---- Call SP ----
    async with get_pool().acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM sp_schedule_meeting("
            " $1::varchar, $2::text, $3::varchar,"
            " $4::timestamptz, $5::timestamptz, $6::varchar, $7::varchar,"
            " $8::uuid, $9::uuid,"
            " $10::text, $11::text,"
            " $12::uuid[], $13::uuid[], $14::text[], $15::jsonb,"
            " $16::text)",
            title or agenda,           # p_title
            None,                      # p_description
            "general",                 # p_event_type
            start_dt,                  # p_start_time
            end_dt,                    # p_end_time
            "Asia/Kolkata",            # p_timezone
            "manual",                  # p_source
            creator,                   # p_created_by
            creator,                   # p_booked_by (whoever is logged in)
            agenda,                    # p_agenda
            meeting_url,               # p_google_meet_link (filled later if NULL)
            client_ids,                # p_client_user_ids
            adviser_ids,               # p_adviser_user_ids
            agents,                    # p_agents_to_use
            meta_json,                 # p_metadata (carries guests + optional member_label)
            notes,                     # p_pre_meeting_notes
        )

    if row is None or row["errornumber"] != 0:
        err_no = row["errornumber"] if row else 5000
        err_msg = row["errormessage"] if row else "sp_schedule_meeting returned no row"
        return ProcResult(
            errornumber=err_no,
            errormessage=err_msg,
            nextAction=row["nextaction"] if row else "retry",
        )

    # row["result"] is a JSONB column — asyncpg returns it as a str unless a
    # codec is registered. Parse defensively.
    raw_result = row["result"]
    if isinstance(raw_result, str):
        import json as _json
        result = _json.loads(raw_result) if raw_result else {}
    else:
        result = raw_result or {}

    meeting_id = result.get("meeting_id")

    return ProcResult(
        result=str(meeting_id),
        nextAction=row["nextaction"] or "create_external_calendar_event",
    )


async def _sp_update_meeting_firefly_id(
    meeting_id: str,
    firefly_meeting_id: str,
    firefly_meeting_url: str,
) -> ProcResult:
    """
    Real DB call to deployed `sp_save_meeting_external_sync` (Wave B).

    LEGACY NAMING NOTE:
      The wrapper's name `_sp_update_meeting_firefly_id` is a misnomer
      kept for backward compatibility with the existing route handler
      (`routes/meetings.py:schedule_meeting`). It's called immediately
      after Google Calendar creates the event, with:
        - `firefly_meeting_id`  = "pending-{uuid}" sentinel (the real
                                  Fireflies meeting_id arrives later via
                                  webhook → meeting_transcripts.provider_meeting_id)
        - `firefly_meeting_url` = the actual Google Meet URL

    TRANSLATION:
      meeting_id          → p_meeting_id
      'google_meet'       → p_booking_provider (this is the calendar provider;
                            Fireflies' own id lives on meeting_transcripts, not here)
      firefly_meeting_id  → p_external_meeting_id (sentinel for now; the
                            webhook can upsert a real value later)
      firefly_meeting_url → p_meeting_url
      NULL                → p_actor_user_id  (system-driven from the scheduling
                            flow's post-calendar callback; actor_type='system'
                            in the audit row)
    """
    from db.pool import get_pool

    mid = _to_uuid(meeting_id)
    if mid is None:
        return ProcResult(
            errornumber=1008,
            errormessage="meeting_id is required.",
        )

    async with get_pool().acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM sp_save_meeting_external_sync("
            " $1::uuid, $2::varchar, $3::varchar, $4::text, "
            " $5::text, $6::jsonb, $7::varchar, $8::uuid)",
            mid,
            "google_meet",        # p_booking_provider
            firefly_meeting_id,   # p_external_meeting_id (sentinel "pending-..." OK)
            firefly_meeting_url,  # p_meeting_url
            None,                 # p_host_url
            "{}",                 # p_webhook_payload
            "synced",             # p_source_status
            None,                 # p_actor_user_id — system-driven post-calendar callback
        )

    if row is None or row["errornumber"] != 0:
        return ProcResult(
            errornumber=(row["errornumber"] if row else 5000),
            errormessage=(row["errormessage"] if row else "sp_save_meeting_external_sync returned no row"),
            nextAction=(row["nextaction"] if row else "retry"),
        )

    return ProcResult(
        result=meeting_id,  # preserve legacy contract (caller does `await ...; meeting_id = ...`)
        nextAction=row["nextaction"] or "publish_scheduled_event",
    )


async def _sp_update_meeting_status(
    firefly_meeting_id: str,
    status: str,
    started_at: str | None = None,
    ended_at: str | None = None,
) -> ProcResult:
    meeting = next((m for m in _meetings.values() if m.firefly_meeting_id == firefly_meeting_id), None)
    if not meeting:
        return ProcResult(errornumber=2002, errormessage=f"Meeting not found for Firefly ID: {firefly_meeting_id}", nextAction="verify_firefly_id")
    meeting.status = status
    if started_at:
        meeting.started_at = started_at
    if ended_at:
        meeting.ended_at = ended_at
    next_action = {
        "completed": "fetch_transcript",
        "transcribed": "start_extraction",
        "cancelled": "send_cancellation_notification",
    }.get(status, "continue")
    return ProcResult(result=meeting.id, nextAction=next_action)


async def _sp_save_transcript(
    meeting_id: str,
    transcript_text: str,
    transcript_url: str | None = None,
    duration_seconds: int = 0,
    language: str = "mixed",
    transcript_provider: str = "fireflies",
    provider_meeting_id: str | None = None,
) -> ProcResult:
    """
    Real DB call to deployed `sp_save_transcript` (Wave C).

    IDEMPOTENT on (meeting_id, transcript_provider) — table UNIQUE
    constraint from migration 018. Fireflies webhook re-delivery returns
    the existing transcript row instead of duplicating; the SP returns
    `was_insert: false` in the result on replay.

    SIGNATURE:
      Same first 4 positional args as the legacy stub
      (meeting_id, transcript_text, transcript_url, duration_seconds)
      plus 3 optional kwargs the deployed SP supports. Existing callers
      using the 4-arg form keep working.

    DROPPED LEGACY BEHAVIOUR:
      The old stub also flipped `meeting.status = "transcribed"` and
      `meeting.extraction_status = "pending"`. Those are orchestration
      concerns the webhook handler should now drive explicitly via
      sp_update_meeting_status (separate stub) — this SP is purely about
      persisting the transcript row.
    """
    from db.pool import get_pool

    mid = _to_uuid(meeting_id)
    if mid is None:
        return ProcResult(errornumber=1008, errormessage="meeting_id is required.")

    if not transcript_text:
        return ProcResult(errornumber=1008, errormessage="transcript_text is required.")

    async with get_pool().acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM sp_save_transcript("
            " $1::uuid, $2::text, $3::text, $4::int,"
            " $5::varchar, $6::varchar, $7::varchar)",
            mid,
            transcript_text,
            transcript_url,
            duration_seconds or 0,
            language,
            transcript_provider,
            provider_meeting_id,
        )

    if row is None or row["errornumber"] != 0:
        return ProcResult(
            errornumber=(row["errornumber"] if row else 5000),
            errormessage=(row["errormessage"] if row else "sp_save_transcript returned no row"),
            nextAction=(row["nextaction"] if row else "retry"),
        )

    # row["result"] is JSONB { transcript_id, meeting_id, was_insert, word_count }
    raw_result = row["result"]
    if isinstance(raw_result, str):
        import json as _json
        result = _json.loads(raw_result) if raw_result else {}
    else:
        result = raw_result or {}

    return ProcResult(
        result=result,
        nextAction=row["nextaction"] or "publish_transcribed_event",
    )


async def _fn_get_meeting_for_extraction(meeting_id: str) -> ProcResult:
    """
    Defensive re-read for transcript_processor / extraction worker. Given a
    meeting_id, return the canonical extraction context as it lives in the
    DB right now — overriding any stale value the worker might be holding
    from a delayed event delivery.

    NOTE: This helper is currently unused by routes/workers (the webhook
    handler uses fn_find_meeting_by_meet_url instead). Kept here so the
    contract is honest in case a future worker wants the by-id variant.

    LEGACY BEHAVIOUR REPLACED:
      Old stub derived `agents_to_use` by keyword-matching the agenda string
      ("initial" → six agents, "review" → five, "goal" → five). That heuristic
      was a stand-in until agents_to_use was persisted per-meeting. With the
      Wave B SPs, agents_to_use is now stored authoritatively in
      meetings.metadata->'agents_to_use' at schedule time. We read that
      directly here — no heuristic. If ops scheduled the meeting with no
      agents, we return an empty list and let crm-agent run its full
      default pipeline.

    RETURNED SHAPE (unchanged from legacy stub):
      { client_id, agenda, scheduled_at, agents_to_use }
      `client_id` resolves to the FIRST client attendee (most meetings
      have exactly one; the legacy contract assumed singular).
    """
    from db.pool import get_pool

    mid = _to_uuid(meeting_id)
    if mid is None:
        return ProcResult(errornumber=1008, errormessage="meeting_id is required.")

    async with get_pool().acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT
                m.start_time,
                mid.agenda,
                COALESCE(m.metadata->'agents_to_use', '[]'::JSONB) AS agents_to_use,
                (
                    SELECT ma.client_user_id
                      FROM meeting_attendees ma
                     WHERE ma.meeting_id = m.id
                       AND ma.client_user_id IS NOT NULL
                     ORDER BY ma.created_at ASC
                     LIMIT 1
                ) AS client_user_id
              FROM meetings m
              LEFT JOIN meeting_internal_details mid ON mid.meeting_id = m.id
             WHERE m.id = $1::uuid
            """,
            mid,
        )

    if row is None:
        return ProcResult(errornumber=2001, errormessage="Meeting not found")

    # agents_to_use comes back as either JSONB-parsed list or a JSON string
    raw_agents = row["agents_to_use"]
    if isinstance(raw_agents, str):
        import json as _json
        try:
            raw_agents = _json.loads(raw_agents) if raw_agents else []
        except ValueError:
            raw_agents = []
    agents_list = raw_agents if isinstance(raw_agents, list) else []

    return ProcResult(result={
        "client_id":     str(row["client_user_id"]) if row["client_user_id"] else None,
        "agenda":        row["agenda"] or "",
        "scheduled_at":  row["start_time"].isoformat() if row["start_time"] else None,
        "agents_to_use": agents_list,
    })


async def _sp_save_extraction(
    meeting_id: str,
    extraction_job_id: str,
    provider: str,
    model: str,
    raw_data: dict,
    transcript_id: str | None = None,
    extracted_at: str | None = None,
    duration_seconds: float = 0,
    total_fields: int | None = None,
    # Legacy keyword arg from transcript_processor — swallowed; the SP
    # derives the client from meeting_attendees, no need to pass it in.
    client_id: str | None = None,
) -> ProcResult:
    """
    Real DB call to deployed `sp_save_extraction` (Wave C).

    IDEMPOTENT on `extraction_job_id` — UNIQUE constraint in migration 018.
    Replay-safe: if transcript_processor crashes between LLM call and DB
    write and is restarted, the same job_id makes the second attempt a
    no-op (returns the existing row with `was_insert: false`).

    SIGNATURE:
      Loose kwarg layout that accepts the worker's exact call shape (it
      passes `client_id=...` which is no longer needed — swallowed by
      the `client_id` param above and ignored).

    DROPPED LEGACY BEHAVIOUR:
      The old stub also mutated meeting.status='extraction_completed' /
      extraction_status='completed' / extraction_job_id on the in-memory
      MeetingRow. That coupling moves to the orchestration layer — the
      transcript_processor should call sp_update_meeting_status('completed')
      separately after a successful extraction save.
    """
    from db.pool import get_pool

    mid = _to_uuid(meeting_id)
    jid = _to_uuid(extraction_job_id)
    if mid is None or jid is None:
        return ProcResult(
            errornumber=1008,
            errormessage="meeting_id and extraction_job_id are required.",
        )
    if not provider or not model or raw_data is None:
        return ProcResult(
            errornumber=1008,
            errormessage="provider, model, and raw_data are required.",
        )

    tid = _to_uuid(transcript_id) if transcript_id else None

    # asyncpg may or may not have a JSONB codec registered — pass a JSON
    # string to be safe.
    import json as _json
    raw_data_json = _json.dumps(raw_data)

    extracted_at_dt = _parse_iso_datetime(extracted_at) if extracted_at else None

    async with get_pool().acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM sp_save_extraction("
            " $1::uuid, $2::uuid, $3::varchar, $4::varchar, $5::jsonb,"
            " $6::uuid, $7::timestamptz, $8::numeric, $9::int)",
            mid,
            jid,
            provider,
            model,
            raw_data_json,
            tid,
            extracted_at_dt,
            duration_seconds or 0,
            total_fields,
        )

    if row is None or row["errornumber"] != 0:
        return ProcResult(
            errornumber=(row["errornumber"] if row else 5000),
            errormessage=(row["errormessage"] if row else "sp_save_extraction returned no row"),
            nextAction=(row["nextaction"] if row else "retry"),
        )

    # row["result"] = { extraction_id, meeting_id, version, was_insert,
    #                   total_fields, already_validated }
    raw_result = row["result"]
    if isinstance(raw_result, str):
        result_dict = _json.loads(raw_result) if raw_result else {}
    else:
        result_dict = raw_result or {}

    return ProcResult(
        result=result_dict,
        nextAction=row["nextaction"] or "open_for_validation",
    )


async def _sp_save_demographics(client_id: str, extraction_id: str, data: dict) -> ProcResult:
    _demographics[client_id] = {"extraction_id": extraction_id, "data": data}
    return ProcResult(result=client_id, nextAction="save_contacts")


async def _sp_save_financials(client_id: str, extraction_id: str, data: dict) -> ProcResult:
    _financials[client_id] = {"extraction_id": extraction_id, "data": data}
    return ProcResult(result=client_id, nextAction="save_goals")


async def _sp_save_goals(client_id: str, extraction_id: str, data: dict) -> ProcResult:
    _goals.append({"client_id": client_id, "extraction_id": extraction_id, "data": data})
    return ProcResult(result=client_id, nextAction="save_qualitative")


async def _sp_save_qualitative(client_id: str, extraction_id: str, data: dict) -> ProcResult:
    _qualitative[client_id] = {"extraction_id": extraction_id, "data": data}
    return ProcResult(result=client_id, nextAction="publish_data_saved_event")


async def _sp_save_summary(
    meeting_id: str,
    client_id: str,
    executive_summary: str,
    key_points: list,
    decisions_made: list,
    client_sentiment: str | None,
    advisor_notes: str | None,
    model: str,
    duration_seconds: float,
) -> ProcResult:
    if any(s.meeting_id == meeting_id for s in _summaries.values()):
        return ProcResult(errornumber=4001, errormessage="Summary already exists for this meeting", nextAction="update_or_skip")
    summary_id = str(uuid.uuid4())
    _summaries[summary_id] = SummaryRow(
        id=summary_id,
        meeting_id=meeting_id,
        client_id=client_id,
        executive_summary=executive_summary,
        key_points=key_points,
        decisions_made=decisions_made,
        client_sentiment=client_sentiment,
        advisor_notes=advisor_notes,
        generated_by_model=model,
        generation_duration_seconds=duration_seconds,
    )
    return ProcResult(result=summary_id, nextAction="save_action_items")


async def _sp_save_action_item(
    meeting_id: str,
    client_id: str,
    action_type: str,
    description: str,
    assigned_to: str | None,
    due_date: str | None,
    priority: str,
    confidence: float | None,
) -> ProcResult:
    action_id = str(uuid.uuid4())
    _action_items.append(ActionItemRow(
        id=action_id,
        meeting_id=meeting_id,
        client_id=client_id,
        action_type=action_type,
        description=description,
        assigned_to=assigned_to,
        due_date=due_date,
        priority=priority,
        confidence=confidence,
    ))
    return ProcResult(result=action_id, nextAction="continue_or_finish")


async def _sp_cancel_meeting(
    meeting_id: str,
    cancelled_by: str,
    cancellation_reason: str,
) -> ProcResult:
    meeting = _meetings.get(meeting_id)
    if not meeting:
        return ProcResult(errornumber=2004, errormessage="Meeting not found", nextAction="verify_meeting_id")
    if meeting.status in ("completed", "transcribed", "extraction_completed"):
        return ProcResult(errornumber=2005, errormessage="Cannot cancel completed meeting", nextAction="contact_admin")
    meeting.status = "cancelled"
    return ProcResult(result=meeting_id, nextAction="cancel_in_firefly")


async def _fn_get_extraction(extraction_id: str) -> ProcResult:
    """
    Real DB call to deployed `fn_get_extraction` (Wave D).

    AI Validation page DETAIL view. Returns one extraction with full
    `raw_data` (174-field JSONB) PLUS `recent_edits` — the last 50
    rows from extraction_field_audit, each enriched with the reviewer's
    `team_users.name`. Reviewer can see what's been changed and by whom
    before approving.

    LEGACY SHAPE PRESERVED:
      Returns a dict (not the legacy ExtractionRow dataclass). The route
      handler at routes/extractions.py:30 already handles both via
      `r if isinstance(r, dict) else asdict(r)`.
    """
    from db.pool import get_pool

    eid = _to_uuid(extraction_id)
    if eid is None:
        return ProcResult(errornumber=1008, errormessage="extraction_id is required.")

    async with get_pool().acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM fn_get_extraction($1::uuid)",
            eid,
        )

    if row is None:
        return ProcResult(errornumber=3002, errormessage="Extraction not found")

    import json as _json
    d = dict(row)

    # Normalise types for JSON serialization
    for k, v in list(d.items()):
        if isinstance(v, uuid.UUID):
            d[k] = str(v)
        elif isinstance(v, datetime):
            d[k] = v.isoformat()
        elif hasattr(v, "isoformat"):
            d[k] = v.isoformat()
        elif hasattr(v, "as_tuple"):
            d[k] = float(v)

    # raw_data + recent_edits may come back as JSONB strings; parse defensively.
    for jsonb_key in ("raw_data", "recent_edits"):
        v = d.get(jsonb_key)
        if isinstance(v, str):
            try:
                d[jsonb_key] = _json.loads(v) if v else ({} if jsonb_key == "raw_data" else [])
            except ValueError:
                d[jsonb_key] = {} if jsonb_key == "raw_data" else []

    return ProcResult(result=d)


async def _fn_list_meetings_real(
    status: str | None = None,
    p_from: datetime | None = None,
    p_to: datetime | None = None,
    limit: int = 100,
    offset: int = 0,
) -> ProcResult:
    """
    Real DB call to deployed `fn_list_meetings` (TABLE-returning function).

    The deployed SP returns a NEW shape (per migration 005 schema):
        id, title, event_type, status, start_time, end_time, timezone,
        agenda, google_meet_link, meeting_url, firefly_meeting_id,
        agents_to_use (jsonb), client_user_ids[], client_names[],
        adviser_user_ids[], adviser_names[], booked_by, booked_by_name,
        created_by, created_by_name, created_at

    The frontend's meetingRecordToRow (apps/internal-app/src/routes/
    SchedulingPage.tsx) still reads the OLD shape with fields like
    scheduled_at, duration_minutes, client_name, advisor_name, member,
    notes, guests, extraction_status. This adapter maps new→old so the
    UI keeps working WITHOUT a frontend deploy.

    When SchedulingPage migrates to the new shape, delete the adapter
    block below and just return the raw rows.
    """
    from db.pool import get_pool

    async with get_pool().acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM fn_list_meetings($1::text, $2::timestamptz, "
            "$3::timestamptz, $4::int, $5::int)",
            status, p_from, p_to, limit, offset,
        )

    result: list[dict] = []
    for r in rows:
        d = dict(r)

        # ── Normalise types for JSON serialization ────────────────────────
        for k, v in list(d.items()):
            if isinstance(v, uuid.UUID):
                d[k] = str(v)
            elif isinstance(v, list) and v and isinstance(v[0], uuid.UUID):
                d[k] = [str(x) for x in v]
            elif isinstance(v, datetime):
                d[k] = v.isoformat()
            elif hasattr(v, "isoformat"):     # date
                d[k] = v.isoformat()
            elif hasattr(v, "as_tuple"):      # Decimal
                d[k] = float(v)

        # ── Adapter: project new SP shape onto legacy fields the frontend
        # ── still reads (SchedulingPage.tsx meetingRecordToRow). Once the
        # ── frontend moves to the new shape this block can be deleted.
        client_names    = d.get("client_names") or []
        adviser_names   = d.get("adviser_names") or []
        client_user_ids = d.get("client_user_ids") or []
        adviser_uids    = d.get("adviser_user_ids") or []

        # Compute legacy duration_minutes from start_time / end_time.
        duration_min = 0
        if r["start_time"] and r["end_time"]:
            duration_min = int((r["end_time"] - r["start_time"]).total_seconds() // 60)

        # `guests` comes back as JSONB. asyncpg may return it as str or list.
        raw_guests = d.get("guests")
        if isinstance(raw_guests, str):
            import json as _json
            try:
                raw_guests = _json.loads(raw_guests) if raw_guests else []
            except ValueError:
                raw_guests = []
        guests_list = raw_guests if isinstance(raw_guests, list) else []

        d.update({
            "scheduled_at":       d.get("start_time"),
            "duration_minutes":   duration_min,
            "client_id":          client_user_ids[0] if client_user_ids else None,
            "client_name":        client_names[0]    if client_names    else "",
            "advisor_id":         adviser_uids[0]    if adviser_uids    else None,
            "advisor_name":       " & ".join(adviser_names) if adviser_names else "",
            "advisor_ids":        adviser_uids,
            "advisor_names":      adviser_names,
            "member":             d.get("booked_by_name") or d.get("created_by_name") or "—",
            "guests":             guests_list,
            "notes":              d.get("pre_meeting_notes") or "",
            "extraction_status":  "",   # set by future fn_list_meetings_with_extraction_status
            # `agents_to_use` already comes back from the SP — usually as a
            # Python list because asyncpg unwraps jsonb arrays automatically.
        })

        result.append(d)

    return ProcResult(result=result)


async def _fn_list_meetings(
    status: str | None = None,
    p_from: datetime | None = None,
    p_to: datetime | None = None,
    limit: int = 100,
    offset: int = 0,
) -> ProcResult:
    """Public-facing handler — delegates to the real DB implementation."""
    return await _fn_list_meetings_real(status, p_from, p_to, limit, offset)


async def _fn_list_clients(
    search: str | None = None,
    advisor_id: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> ProcResult:
    """
    Real DB call to deployed `fn_list_clients` (TABLE-returning function).
    Replaces the previous _STUB_CLIENTS in-memory fixture.

    Returned dict shape (per row):
        id, name, email, phone, advisor_id, advisor_code, advisor_name,
        client_type, importance_type, onboarding_status, lead_source_id,
        created_at

    Frontend ClientOption type currently declares `segment` — that field
    is absent at runtime and will be undefined in the React picker. Map
    importance_type to `segment` here so the existing type stays satisfied
    without a frontend change.
    """
    from db.pool import get_pool

    async with get_pool().acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM fn_list_clients($1::text, $2::uuid, $3::int, $4::int)",
            search,
            advisor_id,
            limit,
            offset,
        )

        # fn_list_clients returns clients.id but the schedule SP needs
        # client_users.id (FK on meeting_attendees.fk_ma_client_user). Pull
        # the primary client_user_id for each row in one batch query.
        client_ids = [r["id"] for r in rows]
        user_map: dict[uuid.UUID, uuid.UUID] = {}
        if client_ids:
            mapping_rows = await conn.fetch(
                """
                SELECT DISTINCT ON (caa.client_id)
                       caa.client_id, caa.client_user_id
                  FROM client_account_access caa
                 WHERE caa.client_id = ANY($1::uuid[])
                   AND caa.is_primary = TRUE
                   AND caa.is_active  = TRUE
                 ORDER BY caa.client_id, caa.created_at ASC
                """,
                client_ids,
            )
            user_map = {m["client_id"]: m["client_user_id"] for m in mapping_rows}

    result = []
    for r in rows:
        d = dict(r)
        # Backfill the legacy `segment` key the frontend type expects.
        d["segment"] = d.get("importance_type") or "standard"
        # Expose client_users.id for downstream sp_schedule_meeting attendee insert.
        cu_id = user_map.get(d["id"])
        d["client_user_id"] = str(cu_id) if cu_id else None
        # Stringify UUIDs/timestamps so FastAPI's JSONResponse can serialize cleanly.
        for k, v in list(d.items()):
            if isinstance(v, uuid.UUID):
                d[k] = str(v)
            elif isinstance(v, datetime):
                d[k] = v.isoformat()
        result.append(d)

    return ProcResult(result=result)


async def _fn_list_advisors(
    search: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> ProcResult:
    """
    Real DB call to deployed `fn_list_advisors` (TABLE-returning function).
    Replaces the previous _STUB_ADVISORS in-memory fixture.

    Returned dict shape (per row):
        id (advisors.id), adviser_user_id, advisor_code, username, email, name,
        payout_type, payout_percentage, experience_in_years,
        current_client_count, joining_date, is_active, created_at

    Frontend AdvisorOption type currently declares `specialization` — that
    field is not in the schema. Backfill an empty string here so the
    existing TS type stays satisfied without a frontend change. When the
    business decides what 'specialization' means (e.g. a JSONB tag on
    advisors), this mapping moves to the SP.
    """
    from db.pool import get_pool

    async with get_pool().acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM fn_list_advisors($1::text, $2::int, $3::int)",
            search,
            limit,
            offset,
        )

    result = []
    for r in rows:
        d = dict(r)
        # Backfill the legacy `specialization` key the frontend type expects.
        d["specialization"] = d.get("specialization") or ""
        # Stringify UUIDs / dates / timestamps / decimals for JSON-safe output.
        for k, v in list(d.items()):
            if isinstance(v, uuid.UUID):
                d[k] = str(v)
            elif isinstance(v, datetime):
                d[k] = v.isoformat()
            elif hasattr(v, "isoformat"):     # datetime.date
                d[k] = v.isoformat()
            elif hasattr(v, "as_tuple"):      # decimal.Decimal — NUMERIC columns
                d[k] = float(v)
        result.append(d)

    return ProcResult(result=result)


async def _fn_list_extractions(
    validated: bool | None = None,
    meeting_id: str | None = None,
    client_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> ProcResult:
    """
    Real DB call to deployed `fn_list_extractions` (Wave D).

    The SP intentionally omits `raw_data` (10–100KB JSONB) from its return
    shape for list-page perf. BUT the AI Validation page's React component
    (AiValidationPage.tsx) reads `e.raw_data` from list rows to compute the
    average-confidence preview. To keep the frontend working without a
    refactor we do a SINGLE follow-up query that pulls raw_data for all
    returned ids in one round-trip and merges it into each row.

    Two queries, not N+1. Drop the follow-up query later when the AI
    Validation page moves to per-row detail fetches via fn_get_extraction.

    Args mirror the SP signature; the route handler currently passes only
    `validated`, the rest accept their defaults.
    """
    from db.pool import get_pool

    mid = _to_uuid(meeting_id) if meeting_id else None
    cid = _to_uuid(client_id)  if client_id  else None

    async with get_pool().acquire() as conn:
        # 1. List with meeting context (no raw_data)
        rows = await conn.fetch(
            "SELECT * FROM fn_list_extractions("
            " $1::boolean, $2::uuid, $3::uuid, $4::int, $5::int)",
            validated, mid, cid, limit, offset,
        )

        if not rows:
            return ProcResult(result=[])

        # 2. One-shot raw_data fetch for all returned ids
        extraction_ids = [r["id"] for r in rows]
        raw_rows = await conn.fetch(
            "SELECT id, raw_data FROM extractions WHERE id = ANY($1::uuid[])",
            extraction_ids,
        )

    # ---- Build a {id → raw_data dict} map ----
    import json as _json
    raw_by_id: dict[str, dict] = {}
    for rr in raw_rows:
        raw = rr["raw_data"]
        if isinstance(raw, str):
            try:
                raw = _json.loads(raw) if raw else {}
            except ValueError:
                raw = {}
        raw_by_id[str(rr["id"])] = raw if isinstance(raw, dict) else {}

    # ---- Normalise rows + attach raw_data ----
    result: list[dict] = []
    for r in rows:
        d = dict(r)
        # Stringify UUIDs, datetimes, decimals for JSON
        for k, v in list(d.items()):
            if isinstance(v, uuid.UUID):
                d[k] = str(v)
            elif isinstance(v, list) and v and isinstance(v[0], uuid.UUID):
                d[k] = [str(x) for x in v]
            elif isinstance(v, datetime):
                d[k] = v.isoformat()
            elif hasattr(v, "isoformat"):
                d[k] = v.isoformat()
            elif hasattr(v, "as_tuple"):
                d[k] = float(v)
        d["raw_data"] = raw_by_id.get(d["id"], {})
        result.append(d)

    return ProcResult(result=result)


def hydrate_extractions_from_disk(extractions_dir: str = "/app/transcripts/extractions") -> int:
    """
    Load every saved extraction JSON into the in-memory _extractions store so the
    /api/extractions endpoints survive container restarts without a DB.
    Returns the number of extractions loaded.
    """
    import json as _json
    from pathlib import Path as _Path

    root = _Path(extractions_dir)
    if not root.exists():
        return 0

    loaded = 0
    for path in root.glob("*.json"):
        try:
            data = _json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        extraction_id = data.get("extraction_id")
        if not extraction_id or extraction_id in _extractions:
            continue
        fields = data.get("fields", {})
        _extractions[extraction_id] = ExtractionRow(
            id=extraction_id,
            client_id=data.get("client_id", ""),
            meeting_id=data.get("meeting_id", ""),
            extraction_job_id=data.get("extraction_job_id", f"job-{extraction_id}"),
            provider="crm-ai",
            model=data.get("model", "unknown"),
            extracted_at=data.get("extracted_at", ""),
            duration_seconds=data.get("duration_seconds", 0.0),
            total_fields=len(fields),
            raw_data=fields,
        )
        # Stub the parent meeting row so /api/extractions/{id} responses are complete.
        meeting_id = data.get("meeting_id", "")
        if meeting_id and meeting_id not in _meetings:
            _meetings[meeting_id] = MeetingRow(
                id=meeting_id,
                client_id=data.get("client_id", ""),
                advisor_id="",
                scheduled_at=data.get("extracted_at", ""),
                duration_minutes=int(data.get("duration_seconds") or 0) // 60,
                agenda=data.get("agenda", ""),
                title=data.get("agenda", ""),
                status="extraction_completed",
                extraction_status="completed",
                firefly_meeting_id=data.get("firefly_meeting_id", ""),
                meeting_url=data.get("meet_url", ""),
            )
        loaded += 1
    return loaded


async def _sp_validate_extraction(
    extraction_id: str,
    validated_by: str,
    validation_notes: str | None = None,
    # Legacy kwarg from old callers — silently dropped. Field edits are now
    # a separate concern handled by sp_patch_extraction_fields.
    changes: list[dict] | None = None,
) -> ProcResult:
    """
    Real DB call to deployed `sp_validate_extraction` (Wave D).

    Flips `extractions.validated=true`, stamps `validated_by`/`validated_at`/
    `validation_notes`. Idempotent — already-validated rows return 1016
    with the existing state, no rewrite. Writes
    `meeting.extraction.validated` to domain_events.

    LEGACY CONTRACT BREAKING CHANGE:
      Old stub also applied a list of field-value `changes` to raw_data at
      validate-time. That's separated now — reviewer field edits go through
      sp_patch_extraction_fields BEFORE validation. The `changes` param is
      kept for kwarg backward-compat but is silently ignored. The route
      handler doesn't pass it.
    """
    from db.pool import get_pool

    eid = _to_uuid(extraction_id)
    vby = _to_uuid(validated_by)
    if eid is None or vby is None:
        return ProcResult(
            errornumber=1008,
            errormessage="extraction_id and validated_by are required.",
        )

    async with get_pool().acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM sp_validate_extraction($1::uuid, $2::uuid, $3::text)",
            eid, vby, validation_notes,
        )

    if row is None:
        return ProcResult(errornumber=5000, errormessage="sp_validate_extraction returned no row")

    # 1016 = already validated — surface as soft success
    if row["errornumber"] == 1016:
        raw_result = row["result"]
        if isinstance(raw_result, str):
            import json as _json
            result = _json.loads(raw_result) if raw_result else {}
        else:
            result = raw_result or {"extraction_id": extraction_id, "validated": True}
        result.setdefault("already_validated", True)
        return ProcResult(result=result, nextAction=row["nextaction"])

    if row["errornumber"] != 0:
        return ProcResult(
            errornumber=row["errornumber"],
            errormessage=row["errormessage"],
            nextAction=row["nextaction"] or "retry",
        )

    # Parse result JSONB defensively
    raw_result = row["result"]
    if isinstance(raw_result, str):
        import json as _json
        result = _json.loads(raw_result) if raw_result else {}
    else:
        result = raw_result or {}

    return ProcResult(
        result=result,
        nextAction=row["nextaction"] or "project_to_domain_tables",
    )


# ── Registration ──────────────────────────────────────────────────────────────

def register_meeting_procs() -> None:
    register_proc("fn_list_meetings", _fn_list_meetings)
    register_proc("fn_list_clients", _fn_list_clients)
    register_proc("fn_list_advisors", _fn_list_advisors)
    register_proc("sp_schedule_meeting", _sp_schedule_meeting)
    register_proc("sp_update_meeting_firefly_id", _sp_update_meeting_firefly_id)
    register_proc("sp_update_meeting_status", _sp_update_meeting_status)
    register_proc("sp_save_transcript", _sp_save_transcript)
    register_proc("fn_get_meeting_for_extraction", _fn_get_meeting_for_extraction)
    register_proc("sp_save_extraction", _sp_save_extraction)
    register_proc("sp_save_demographics", _sp_save_demographics)
    register_proc("sp_save_financials", _sp_save_financials)
    register_proc("sp_save_goals", _sp_save_goals)
    register_proc("sp_save_qualitative", _sp_save_qualitative)
    register_proc("sp_save_summary", _sp_save_summary)
    register_proc("sp_save_action_item", _sp_save_action_item)
    register_proc("sp_cancel_meeting", _sp_cancel_meeting)
    register_proc("fn_get_extraction", _fn_get_extraction)
    register_proc("fn_list_extractions", _fn_list_extractions)
    register_proc("sp_validate_extraction", _sp_validate_extraction)
    # NOTE: seed data disabled — API now returns only real extractions
    # (hydrated from disk on startup, plus anything added live).


# ── Public wrappers ───────────────────────────────────────────────────────────

async def proc_list_meetings() -> list[dict]:
    res = await call_proc("fn_list_meetings")
    if not res.ok:
        raise RuntimeError(res.errormessage)
    return res.result


async def proc_list_clients() -> list[dict]:
    res = await call_proc("fn_list_clients")
    if not res.ok:
        raise RuntimeError(res.errormessage)
    return res.result


async def proc_list_advisors() -> list[dict]:
    res = await call_proc("fn_list_advisors")
    if not res.ok:
        raise RuntimeError(res.errormessage)
    return res.result


async def proc_schedule_meeting(**kwargs) -> MeetingRow:
    res = await call_proc("sp_schedule_meeting", **kwargs)
    if not res.ok:
        raise ValueError(res.errormessage) if res.errornumber in (1001, 1002, 1003, 1004) else RuntimeError(res.errormessage)
    return res.result


def proc_find_meeting_by_meet_url(meet_url: str) -> Optional[MeetingRow]:
    """Return the in-memory meeting row whose meeting_url or firefly_meeting_url
    matches `meet_url` (normalised). Sync — reads the in-memory store directly.
    Replace with a real DB proc call when sp_find_meeting_by_meet_url is ready."""
    if not meet_url:
        return None
    target = meet_url.strip().rstrip("/").lower()
    for m in _meetings.values():
        for candidate in (m.meeting_url, m.firefly_meeting_url):
            if candidate and candidate.strip().rstrip("/").lower() == target:
                return m
    return None


async def proc_update_meeting_firefly_id(**kwargs):
    res = await call_proc("sp_update_meeting_firefly_id", **kwargs)
    if not res.ok:
        raise RuntimeError(res.errormessage)


async def proc_update_meeting_status(**kwargs) -> str:
    res = await call_proc("sp_update_meeting_status", **kwargs)
    if not res.ok:
        raise RuntimeError(res.errormessage)
    return res.result


# proc_save_transcript wrapper is defined later in this file (line ~1427) —
# the call_function variant that goes direct to the deployed SP. The old
# call_proc-based duplicate that lived here was dead code (shadowed by the
# later definition due to Python's late binding) and is removed.


async def proc_get_meeting_for_extraction(meeting_id: str) -> dict:
    res = await call_proc("fn_get_meeting_for_extraction", meeting_id)
    if not res.ok:
        raise RuntimeError(res.errormessage)
    return res.result


# proc_save_extraction wrapper is defined later (line ~1506) — the
# call_function variant that goes directly to the deployed SP. The old
# call_proc-based duplicate that lived here was dead code (Python late-
# binding shadowed it with the later definition) and is removed.


async def proc_save_demographics(**kwargs):
    res = await call_proc("sp_save_demographics", **kwargs)
    if not res.ok:
        raise RuntimeError(res.errormessage)


async def proc_save_financials(**kwargs):
    res = await call_proc("sp_save_financials", **kwargs)
    if not res.ok:
        raise RuntimeError(res.errormessage)


async def proc_save_goals(**kwargs):
    res = await call_proc("sp_save_goals", **kwargs)
    if not res.ok:
        raise RuntimeError(res.errormessage)


async def proc_save_qualitative(**kwargs):
    res = await call_proc("sp_save_qualitative", **kwargs)
    if not res.ok:
        raise RuntimeError(res.errormessage)


async def proc_save_summary(**kwargs) -> str:
    res = await call_proc("sp_save_summary", **kwargs)
    if not res.ok:
        if res.errornumber == 4001:
            raise ValueError(res.errormessage)
        raise RuntimeError(res.errormessage)
    return res.result


async def proc_save_action_item(**kwargs) -> str:
    res = await call_proc("sp_save_action_item", **kwargs)
    if not res.ok:
        raise RuntimeError(res.errormessage)
    return res.result


async def proc_cancel_meeting(
    *,
    meeting_id: str,
    actor_id: str | None = None,
    reason: str | None = None,
    idempotency_key: str | None = None,
    # Legacy kwarg names — accept then ignore so old callers don't break.
    cancelled_by: str | None = None,            # legacy → actor_id
    cancellation_reason: str | None = None,     # legacy → reason
):
    """
    Cancel a meeting via the deployed sp_cancel_meeting SP.

    LEGACY COMPAT:
      The old in-memory stub used kwargs `cancelled_by` + `cancellation_reason`.
      Those are accepted here and forwarded to the SP's `actor_id` / `reason`
      so route handlers can migrate at their own pace.
    """
    return await proc_cancel_meeting_v2(
        meeting_id=meeting_id,
        actor_id=actor_id or cancelled_by,
        reason=reason or cancellation_reason,
        idempotency_key=idempotency_key,
    )


async def proc_get_extraction(extraction_id: str) -> dict:
    """
    AI Validation detail page. Dispatches through the registered
    `_fn_get_extraction` stub, which now calls the deployed SP and
    surfaces `raw_data` (174 fields) + `recent_edits` (last 50 audit
    rows enriched with reviewer name).

    Raises ValueError on not-found (1008/3002) so the route handler
    can map to HTTP 404. Other DB errors raise RuntimeError → HTTP 500.
    """
    res = await call_proc("fn_get_extraction", extraction_id)
    if not res.ok:
        if res.errornumber in (1008, 3002):
            raise ValueError(res.errormessage)
        raise RuntimeError(res.errormessage)
    if not res.result:
        raise ValueError(f"extraction {extraction_id} not found")
    return res.result


async def proc_list_extractions(validated: bool | None = None) -> list[dict]:
    """
    AI Validation page list feed. Dispatches through the registered
    `_fn_list_extractions` stub, which now calls the deployed SP and
    follows up with a one-shot raw_data merge so the frontend's
    avg-confidence preview keeps working.
    """
    res = await call_proc("fn_list_extractions", validated)
    if not res.ok:
        raise RuntimeError(res.errormessage)
    return res.result or []


# proc_validate_extraction wrapper is defined later (line ~1767) — the
# kwarg-only call_function variant that goes directly to the deployed SP and
# handles the idempotent 1016 'already validated' case. The old call_proc
# duplicate that lived here was dead code (Python late-binding shadowed it)
# and is removed.


# ─────────────────────────────────────────────────────────────────────────────
# REAL DB CALLS — these override the in-memory stubs above and route through
# the deployed Postgres SPs via shared/db/proc_caller.call_function.
#
# Module-load order: this block runs LAST, so the function names below
# replace the earlier definitions. The `register_meeting_procs` call in
# main.py still wires the stubs for any test that uses call_proc directly,
# but the public wrappers used by routes go through the real DB.
# ─────────────────────────────────────────────────────────────────────────────

from datetime import datetime as _dt, timezone as _tz
from uuid import UUID as _UUID

timezone_utc = _tz.utc


def _normalise_uuid_list(values) -> list[str]:
    """Best-effort cast to a list of UUID-string for an SP UUID[] parameter."""
    if values is None:
        return []
    if isinstance(values, str):
        return [values]
    return [str(v) for v in values if v]


async def proc_schedule_meeting(
    *,
    client_user_ids: list[str] | None = None,
    adviser_user_ids: list[str] | None = None,
    agents_to_use: list[str] | None = None,
    created_by: str,
    booked_by: str | None = None,
    title: str,
    description: str = "",
    event_type: str = "general",
    start_time: str,
    end_time: str | None = None,
    duration_minutes: int = 60,
    timezone: str = "Asia/Kolkata",
    source: str = "manual",
    agenda: str = "",
    google_meet_link: str | None = None,
    metadata: dict | None = None,
    pre_meeting_notes: str | None = None,
    idempotency_key: str | None = None,
    # Legacy compatibility shims — accept the old route's extra kwargs but ignore them.
    **legacy_kwargs,
) -> str:
    """
    Atomic meeting create against the deployed sp_schedule_meeting FUNCTION.

    `created_by` MUST be a real team_users.id UUID (str). The route gets this
    from the JWT via Depends(get_current_team_user) — never from the body.

    `client_user_ids` / `adviser_user_ids` are UUIDs from the picker payloads.
    """
    # Normalise to datetime instances — asyncpg's TIMESTAMPTZ codec rejects strings.
    try:
        start_dt = (
            start_time if isinstance(start_time, _dt)
            else _dt.fromisoformat(start_time.replace("Z", "+00:00"))
        )
    except Exception as exc:
        raise ValueError(f"could not parse start_time: {exc}")

    # Reject past meetings. Compare in UTC: tz-naive inputs are interpreted as
    # local (server) wall time, which on the container is UTC — same basis.
    now_utc = _dt.now(timezone_utc)
    start_for_check = start_dt if start_dt.tzinfo else start_dt.replace(tzinfo=timezone_utc)
    if start_for_check <= now_utc:
        raise ValueError("Meeting start_time must be in the future.")

    if end_time is None:
        end_dt = start_dt + timedelta(minutes=duration_minutes)
    else:
        try:
            end_dt = (
                end_time if isinstance(end_time, _dt)
                else _dt.fromisoformat(end_time.replace("Z", "+00:00"))
            )
        except Exception as exc:
            raise ValueError(f"could not parse end_time: {exc}")

    res = await call_function(
        "sp_schedule_meeting",
        title, description, event_type,
        start_dt, end_dt, timezone, source,
        created_by, booked_by or created_by,
        agenda, google_meet_link,
        _normalise_uuid_list(client_user_ids),
        _normalise_uuid_list(adviser_user_ids),
        list(agents_to_use or []),
        metadata or {},
        pre_meeting_notes,
        idempotency_key,
    )
    if res.ok:
        return res.result["meeting_id"]
    if res.errornumber == 1019:
        # Idempotency replay — the SP returns the cached meeting_id.
        return (res.result or {}).get("meeting_id")
    if res.errornumber in (1008, 1012, 1013):
        raise ValueError(res.errormessage)
    raise RuntimeError(res.errormessage)


async def proc_save_meeting_external_sync(
    *,
    meeting_id: str,
    booking_provider: str = "google_meet",
    external_meeting_id: str | None = None,
    meeting_url: str | None = None,
    host_url: str | None = None,
    webhook_payload: dict | None = None,
    source_status: str = "synced",
    actor_user_id: str | None = None,
) -> dict:
    res = await call_function(
        "sp_save_meeting_external_sync",
        meeting_id, booking_provider, external_meeting_id,
        meeting_url, host_url, webhook_payload or {}, source_status,
        actor_user_id,
    )
    if not res.ok:
        if res.errornumber in (1008, 1014):
            raise ValueError(res.errormessage)
        raise RuntimeError(res.errormessage)
    return res.result


async def proc_find_meeting_by_meet_url(meet_url: str) -> dict | None:  # type: ignore[override]
    """
    Look up the meeting + agents_to_use + attendee context by Meet URL.

    fn_find_meeting_by_meet_url is a plain TABLE-returning function (no 4-col
    envelope), so we bypass call_function and fetchrow directly. Returns a
    dict with the SP's column shape, or None when no match.

    Columns returned:
      id, title, status, agenda, agents_to_use (JSONB), metadata (JSONB),
      meeting_url, client_user_ids (UUID[]), adviser_user_ids (UUID[]).
    """
    if not meet_url:
        return None

    from db.pool import get_pool
    import json as _json

    async with get_pool().acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM fn_find_meeting_by_meet_url($1::text)",
            meet_url,
        )

    if row is None:
        return None

    d = dict(row)
    # Stringify UUIDs / UUID[] / JSONB so downstream JSON-serialises cleanly.
    if isinstance(d.get("id"), uuid.UUID):
        d["id"] = str(d["id"])
    for k in ("client_user_ids", "adviser_user_ids"):
        v = d.get(k) or []
        d[k] = [str(x) for x in v]
    for k in ("agents_to_use", "metadata"):
        v = d.get(k)
        if isinstance(v, (str, bytes)):
            try:
                d[k] = _json.loads(v) if v else None
            except (ValueError, TypeError):
                pass
    return d


async def proc_save_transcript(
    *,
    meeting_id: str,
    transcript_text: str,
    transcript_url: str | None = None,
    duration_seconds: int = 0,
    language: str = "mixed",
    transcript_provider: str = "fireflies",
    provider_meeting_id: str | None = None,
) -> dict:
    res = await call_function(
        "sp_save_transcript",
        meeting_id, transcript_text, transcript_url,
        duration_seconds, language, transcript_provider, provider_meeting_id,
    )
    if not res.ok:
        if res.errornumber in (1008, 1014):
            raise ValueError(res.errormessage)
        raise RuntimeError(res.errormessage)
    return res.result


async def proc_save_extraction(
    *,
    meeting_id: str,
    extraction_job_id: str,
    provider: str,
    model: str,
    raw_data: dict,
    transcript_id: str | None = None,
    extracted_at: str | None = None,
    duration_seconds: float = 0,
    total_fields: int | None = None,
    **legacy_kwargs,                # swallows `client_id` and any other legacy kwargs
) -> str:
    # asyncpg JSONB codec isn't guaranteed registered — pass a JSON string
    # so the SP's p_raw_data JSONB parameter receives a valid jsonb cast.
    import json as _json
    raw_data_json = _json.dumps(raw_data) if not isinstance(raw_data, str) else raw_data

    # Normalise extracted_at: asyncpg's TIMESTAMPTZ codec rejects strings,
    # needs a datetime instance.
    extracted_at_dt: _dt | None
    if extracted_at is None:
        extracted_at_dt = None
    elif isinstance(extracted_at, _dt):
        extracted_at_dt = extracted_at
    else:
        try:
            extracted_at_dt = _dt.fromisoformat(str(extracted_at).replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError(f"could not parse extracted_at: {exc}")

    res = await call_function(
        "sp_save_extraction",
        meeting_id, extraction_job_id, provider, model, raw_data_json,
        transcript_id, extracted_at_dt, duration_seconds, total_fields,
    )
    if not res.ok:
        if res.errornumber in (1008, 1014):
            raise ValueError(res.errormessage)
        raise RuntimeError(res.errormessage)

    # res.result may come back as a JSONB string from PG; parse defensively.
    result_dict = res.result
    if isinstance(result_dict, str):
        result_dict = _json.loads(result_dict) if result_dict else {}
    if not isinstance(result_dict, dict):
        raise RuntimeError(
            f"sp_save_extraction returned unexpected result shape: {type(result_dict).__name__}"
        )
    return result_dict["extraction_id"]


async def proc_patch_extraction_fields(
    *,
    extraction_id: str,
    expected_version: int,
    changed_by: str,
    updates: list[dict],
) -> dict:
    """
    Real DB call to deployed `sp_patch_extraction_fields` (Wave D).

    Per-field reviewer edits with audit trail + optimistic concurrency.
    Each edit becomes an append-only row in extraction_field_audit
    (immutable via fn_prevent_all_updates trigger). `extractions.version`
    bumps on success.

    OPTIMISTIC CONCURRENCY (1015):
      Caller passes the `expected_version` the reviewer saw on load.
      If another reviewer raced past and bumped the version first, the
      SP returns 1015 with the new current_version in result. We surface
      this as a ValueError carrying both versions so the route can map
      to HTTP 409 and the UI can prompt "reload and reapply".

    JSON SERIALIZATION:
      `updates` is a Python list of dicts → must be a JSON string for
      the SP's p_updates JSONB parameter (asyncpg JSONB codec isn't
      guaranteed registered).
    """
    import json as _json

    # Serialize the updates list so it lands cleanly in the JSONB param.
    updates_json = _json.dumps(updates) if not isinstance(updates, str) else updates

    res = await call_function(
        "sp_patch_extraction_fields",
        extraction_id, expected_version, changed_by, updates_json,
    )

    # res.result may come back as a parsed dict OR a JSON string depending
    # on whether asyncpg has a JSONB codec registered. Normalise.
    raw_result = res.result
    if isinstance(raw_result, str):
        try:
            raw_result = _json.loads(raw_result) if raw_result else {}
        except ValueError:
            raw_result = {}
    if not isinstance(raw_result, dict):
        raw_result = {}

    if not res.ok:
        if res.errornumber == 1015:
            current_version = raw_result.get("current_version")
            raise ValueError(
                f"version mismatch (current={current_version}, "
                f"expected={expected_version}) — reload and retry"
            )
        if res.errornumber in (1008, 1012, 1014):
            raise ValueError(res.errormessage)
        raise RuntimeError(res.errormessage)
    return raw_result


async def proc_validate_extraction(  # type: ignore[override]
    *,
    extraction_id: str,
    validated_by: str,
    validation_notes: str | None = None,
    **legacy_kwargs,
) -> dict:
    res = await call_function(
        "sp_validate_extraction",
        extraction_id, validated_by, validation_notes,
    )
    if not res.ok:
        if res.errornumber == 1016:
            # Already validated — surface as a soft success.
            return res.result or {"extraction_id": extraction_id, "validated": True, "already": True}
        if res.errornumber in (1008, 1012, 1014):
            raise ValueError(res.errormessage)
        raise RuntimeError(res.errormessage)
    return res.result


# proc_get_extraction: defined earlier (line ~1483) as the call_proc-based
# wrapper that dispatches to the registered _fn_get_extraction stub. Same
# single-source-of-truth rule as proc_list_extractions — the stub does the
# real DB call + recent_edits + raw_data JSONB parsing. The duplicate
# direct-call (call_function) variant that lived here was removed.


# proc_list_extractions: defined earlier (line ~1490) as the call_proc-based
# wrapper that dispatches to the registered _fn_list_extractions stub. The
# stub does the real DB call PLUS a follow-up raw_data merge that the AI
# Validation page needs. Keeping the wrapper single-shape (via the registry)
# means the merge always fires regardless of how the route invokes it.
# The direct-call (call_function) variant that lived here was removed —
# it bypassed the raw_data merge and would have broken the frontend.


# ============================================================================
# Meeting lifecycle wrappers  (deployed SPs in `meetings_new/` — 2026-05-28)
# ----------------------------------------------------------------------------
# These wrappers call the real Postgres SPs directly via call_function (not
# via the registered-stub registry). They supersede the in-memory stubs
# `_sp_cancel_meeting` and `_sp_update_meeting_status` defined earlier in
# this file — those stubs remain only for backward-compat with any caller
# that hasn't migrated; they should be considered deprecated.
# ============================================================================

async def proc_update_meeting_status_v2(
    *,
    meeting_id: str,
    new_status: str,            # in_progress | completed | cancelled | no_show
    actor_id: str | None = None,
    reason: str | None = None,
) -> dict:
    """
    Generic status-transition gate (deployed SP: sp_update_meeting_status).

    Raises ValueError on invalid transitions (1008/1014/1018), RuntimeError
    on infra errors. Returns the dict envelope with prior_status / new_status /
    was_change.
    """
    res = await call_function(
        "sp_update_meeting_status",
        meeting_id, new_status, actor_id, reason,
    )
    if not res.ok:
        if res.errornumber in (1008, 1014, 1018):
            raise ValueError(res.errormessage)
        raise RuntimeError(res.errormessage)
    return res.result


async def proc_complete_meeting(
    *,
    meeting_id: str,
    actor_id: str | None = None,
) -> dict:
    """sp_complete_meeting — thin wrapper, idempotent on already-completed."""
    res = await call_function("sp_complete_meeting", meeting_id, actor_id)
    if not res.ok:
        if res.errornumber in (1008, 1014, 1018):
            raise ValueError(res.errormessage)
        raise RuntimeError(res.errormessage)
    return res.result


async def proc_mark_no_show(
    *,
    meeting_id: str,
    actor_id: str | None = None,
    reason: str | None = None,
) -> dict:
    """
    sp_mark_no_show — atomically flips meetings.status='no_show' AND
    meeting_internal_details.is_no_show=TRUE. Idempotent.
    """
    res = await call_function(
        "sp_mark_no_show",
        meeting_id, actor_id, reason,
    )
    if not res.ok:
        if res.errornumber in (1008, 1014, 1018):
            raise ValueError(res.errormessage)
        raise RuntimeError(res.errormessage)
    return res.result


async def proc_cancel_meeting_v2(
    *,
    meeting_id: str,
    actor_id: str | None = None,
    reason: str | None = None,
    idempotency_key: str | None = None,
) -> dict:
    """
    sp_cancel_meeting — sets status='cancelled', preserves history, optional
    task cascade (config-gated). Idempotent via p_idempotency_key.

    Errornumber 1019 (idempotency replay) is surfaced as a successful result
    with was_replay=True — caller can treat it as success without retrying.
    """
    res = await call_function(
        "sp_cancel_meeting",
        meeting_id, actor_id, reason, idempotency_key,
    )
    if res.ok:
        return res.result
    if res.errornumber == 1019:
        # Idempotency replay — cached response in res.result
        return res.result or {"meeting_id": meeting_id, "was_replay": True}
    if res.errornumber in (1008, 1014, 1018):
        raise ValueError(res.errormessage)
    raise RuntimeError(res.errormessage)


async def proc_reschedule_meeting(
    *,
    meeting_id: str,
    new_start_time,             # datetime or ISO string
    new_end_time,               # datetime or ISO string
    new_google_meet_link: str | None = None,
    actor_id: str | None = None,
    reason: str | None = None,
    idempotency_key: str | None = None,
) -> dict:
    """
    sp_reschedule_meeting — in-place update of start/end + optional Meet link;
    bumps meeting_internal_details.reschedule_count. Status stays 'scheduled'.

    Rejects when a meeting_transcripts row exists (errornumber 1017) unless
    application_config('meeting.reschedule.blocked_when_transcript') is 'false'.

    Caller should follow with proc_save_meeting_external_sync if a new
    calendar event id was created (nextaction='patch_external_calendar').
    """
    # asyncpg's TIMESTAMPTZ codec rejects raw strings — normalise to datetime.
    def _to_dt(v):
        if v is None or isinstance(v, _dt):
            return v
        return _dt.fromisoformat(str(v).replace("Z", "+00:00"))

    res = await call_function(
        "sp_reschedule_meeting",
        meeting_id,
        _to_dt(new_start_time),
        _to_dt(new_end_time),
        new_google_meet_link,
        actor_id,
        reason,
        idempotency_key,
    )
    if res.ok:
        return res.result
    if res.errornumber == 1019:
        return res.result or {"meeting_id": meeting_id, "was_replay": True}
    if res.errornumber in (1008, 1014, 1017, 1018):
        raise ValueError(res.errormessage)
    raise RuntimeError(res.errormessage)


async def proc_ingest_meeting_from_fireflies(
    *,
    fireflies_meeting_id: str,
    meeting_url: str | None,
    title: str,
    start_time,
    duration_minutes: int,
    advisor_email: str,
    client_email: str,
    client_display_name: str | None,
    transcript_text: str,
    actor_email: str,
    idempotency_key: str | None = None,
) -> dict:
    """
    Wraps sp_ingest_meeting_from_fireflies. Translates errornumber 1020/1021
    into ValueError so the route can return a clean 422.

    Returns the SP's result dict. On replay (natural key already ingested OR
    client-side idempotency hit), the dict carries was_replay=True.
    """
    # Fireflies' GraphQL `date` field returns a Unix epoch in milliseconds
    # (float/int), e.g. 1748534400000. The webhook payload uses ISO strings.
    # Accept both: numbers → fromtimestamp; strings → fromisoformat.
    try:
        if isinstance(start_time, _dt):
            start_dt = start_time
        elif isinstance(start_time, (int, float)):
            # Detect seconds vs milliseconds — anything past year 9999 in seconds
            # (> ~253402300799) is millis. Use 1e12 as a safe threshold.
            ts = float(start_time)
            if ts > 1e12:
                ts = ts / 1000.0
            start_dt = _dt.fromtimestamp(ts, tz=timezone_utc)
        else:
            s = str(start_time).strip()
            # Numeric string?
            try:
                ts = float(s)
                if ts > 1e12:
                    ts = ts / 1000.0
                start_dt = _dt.fromtimestamp(ts, tz=timezone_utc)
            except ValueError:
                start_dt = _dt.fromisoformat(s.replace("Z", "+00:00"))
    except Exception as exc:
        raise ValueError(f"could not parse start_time {start_time!r}: {exc}")

    res = await call_function(
        "sp_ingest_meeting_from_fireflies",
        fireflies_meeting_id,
        meeting_url,
        title,
        start_dt,
        int(duration_minutes),
        advisor_email,
        client_email,
        client_display_name,
        transcript_text,
        actor_email,
        idempotency_key,
    )
    if res.ok:
        return res.result
    # 1022 is the natural-key replay path — return the cached result, not an error.
    if res.errornumber == 1022:
        return res.result or {"was_replay": True}
    if res.errornumber in (1008, 1020, 1021):
        raise ValueError(res.errormessage)
    raise RuntimeError(res.errormessage)


async def proc_get_external_event_id(meeting_id: str) -> str | None:
    """Return the Google Calendar event_id stored on meeting_external_sync, or None."""
    if not meeting_id:
        return None
    from db.pool import get_pool
    async with get_pool().acquire() as conn:
        row = await conn.fetchrow(
            "SELECT external_meeting_id FROM meeting_external_sync "
            "WHERE meeting_id = $1::uuid AND booking_provider = 'google_meet' "
            "ORDER BY updated_at DESC LIMIT 1",
            meeting_id,
        )
    if row is None:
        return None
    val = row["external_meeting_id"]
    if not val or str(val).startswith("pending-"):
        return None
    return str(val)


async def proc_meeting_lifecycle_state(meeting_id: str) -> dict | None:
    """
    fn_meeting_lifecycle_state — read-only derivation of the meeting's
    current lifecycle bucket (scheduled | in_progress | completed |
    transcribed | extracted | validated | cancelled | no_show).

    Returns None when the meeting is not found (function returns zero rows
    rather than erroring).
    """
    if not meeting_id:
        return None

    from db.pool import get_pool

    async with get_pool().acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM fn_meeting_lifecycle_state($1::uuid)",
            meeting_id,
        )

    if row is None:
        return None

    d = dict(row)
    # Stringify UUIDs / timestamps for JSON-safe output.
    for k, v in list(d.items()):
        if isinstance(v, uuid.UUID):
            d[k] = str(v)
        elif isinstance(v, datetime):
            d[k] = v.isoformat()
    return d


