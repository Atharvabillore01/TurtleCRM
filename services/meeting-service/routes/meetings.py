from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from auth_dep import get_current_team_user
from config import settings
from db.meeting_procs import (
    proc_cancel_meeting,
    proc_complete_meeting,
    proc_get_external_event_id,
    proc_list_meetings,
    proc_mark_no_show,
    proc_meeting_lifecycle_state,
    proc_reschedule_meeting,
    proc_save_meeting_external_sync,
    proc_schedule_meeting,
    proc_update_meeting_firefly_id,
    proc_update_meeting_status_v2,
)
from eventbus import publish_event
from firefly_client import FireflyClient
from google_calendar_client import create_meet_event, delete_meet_event, patch_meet_event
from logger import get_logger
from metrics import meetings_scheduled_total

router = APIRouter(prefix="/api/meetings", tags=["meetings"])
logger = get_logger("meeting-service")


# Canonical list of CRM-agent agents available for ops to assign at scheduling time.
# Keep in sync with turtle-crm-agent/agents/__init__.py.
AVAILABLE_AGENTS: list[dict] = [
    {"name": "DemographicsAgent",  "touch_point": "Demographics & Family",       "phase": 1},
    {"name": "FinanceAgent",       "touch_point": "Finances",                    "phase": 1},
    {"name": "GoalsAgent",         "touch_point": "Life Goals",                  "phase": 1},
    {"name": "ProfessionalAgent",  "touch_point": "Professional Details",        "phase": 1},
    {"name": "ScheduleAgent",      "touch_point": "Schedule & Communication",    "phase": 1},
    {"name": "QualitativeAgent",   "touch_point": "Qualitative Parameters",      "phase": 1},
    {"name": "TaskAgent",          "touch_point": "Task Priority",               "phase": 2},
    {"name": "FeedbackAgent",      "touch_point": "Custom Fields",               "phase": 3},
    {"name": "AdvisoryAgent",      "touch_point": "AI Advisory",                 "phase": 3},
    {"name": "SystemResolver",     "touch_point": "Turtle ID",                   "phase": 0},
]


class ScheduleMeetingRequest(BaseModel):
    client_id: str
    advisor_id: str
    scheduled_at: str
    duration_minutes: int = 60
    agenda: str
    meeting_url: str = ""
    # NB: `created_by` and `booked_by` are NO LONGER accepted from the request
    # body — they now come from the JWT (Depends(get_current_team_user)). The
    # field below is retained as a no-op so existing frontend callers don't
    # break their payload schema; the value is ignored server-side.
    created_by: str = ""
    title: str = ""
    client_name: str = ""
    advisor_name: str = ""
    client_email: str = ""
    advisor_email: str = ""
    # multi-advisor support — TODO: wire to DB proc columns when sp_schedule_meeting is ready
    advisor_ids: list[str] = []
    advisor_names: list[str] = []
    advisor_emails: list[str] = []
    # Auth-side UUIDs for the attendees the SP actually wires. Frontend gets
    # these from fn_list_clients / fn_list_advisors. Falls back to client_id /
    # advisor_ids if not supplied (legacy).
    client_user_ids: list[str] = []
    adviser_user_ids: list[str] = []
    member: str = ""
    guests: list[str] = []
    notes: str = ""
    # Ops-selected agents to run on the post-meeting transcript. Empty = run all.
    agents_to_use: list[str] = []



@router.get("/agents")
async def list_available_agents():
    """List CRM-agent agents that ops can assign to a meeting at scheduling time."""
    return AVAILABLE_AGENTS


@router.get("/")
async def list_meetings():
    try:
        return await proc_list_meetings()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/schedule", status_code=status.HTTP_201_CREATED)
async def schedule_meeting(
    req: ScheduleMeetingRequest,
    team_user_id: UUID = Depends(get_current_team_user),
):
    # `created_by` and `booked_by` are JWT-derived — never trust the body.
    # Prefer the new client_user_ids/adviser_user_ids fields; fall back to the
    # legacy single-id fields if the frontend hasn't been updated yet.
    client_user_ids = req.client_user_ids or ([req.client_id] if req.client_id else [])
    adviser_user_ids = req.adviser_user_ids or (
        req.advisor_ids or ([req.advisor_id] if req.advisor_id else [])
    )

    try:
        meeting_id = await proc_schedule_meeting(
            title=req.title or req.agenda,
            description="",
            event_type="general",
            start_time=req.scheduled_at,
            duration_minutes=req.duration_minutes,
            timezone=settings.google_calendar_timezone or "Asia/Kolkata",
            source="manual",
            created_by=str(team_user_id),
            booked_by=str(team_user_id),
            agenda=req.agenda,
            google_meet_link=req.meeting_url or None,
            client_user_ids=client_user_ids,
            adviser_user_ids=adviser_user_ids,
            agents_to_use=req.agents_to_use,
            metadata={
                "guests":     req.guests,
                "notes":      req.notes,
                "member":     req.member,
                "client_name":  req.client_name,
                "advisor_name": req.advisor_name,
            },
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    # ── Step 1: auto-create Google Meet + send calendar invites ─────────────────
    # Uses the Service Account + Domain-Wide Delegation (impersonates
    # settings.google_impersonate_email). No per-user token lookup needed.
    meet_url = req.meeting_url  # fallback if calendar creation fails
    google_event_id = ""

    try:
        attendees = list(filter(None, [
            req.client_email,
            *req.advisor_emails,
            *([] if not req.advisor_email or req.advisor_email in req.advisor_emails else [req.advisor_email]),
            *req.guests,
            "talk@turtlefinance.in",
            # Fireflies bot — invite it so it joins, records, and the webhook fires.
            (settings.firefly_bot_email or "").strip() or None,
        ]))
        cal_result = await create_meet_event(
            settings=settings,
            title=req.title or req.agenda,
            agenda=req.agenda,
            scheduled_at=req.scheduled_at,
            duration_minutes=req.duration_minutes,
            attendee_emails=attendees,
            timezone=settings.google_calendar_timezone,
            calendar_id=settings.google_calendar_id,
        )
        meet_url = cal_result["meet_url"] or meet_url
        google_event_id = cal_result["event_id"]
        logger.info("google_meet_created", extra={"meeting_id": meeting_id, "meet_url": meet_url})
    except Exception as exc:
        logger.warning("google_calendar_failed", extra={"error": str(exc), "meeting_id": meeting_id})

    # Persist the Google Meet URL + calendar event id into meeting_external_sync
    # so the Fireflies webhook can match by Meet URL later (fn_find_meeting_by_meet_url).
    if google_event_id or meet_url:
        try:
            await proc_save_meeting_external_sync(
                meeting_id=meeting_id,
                booking_provider="google_meet",
                external_meeting_id=google_event_id or None,
                meeting_url=meet_url or None,
                source_status="synced",
                actor_user_id=str(team_user_id),
            )
        except Exception as exc:
            logger.warning("save_meeting_external_sync_failed", extra={
                "meeting_id": meeting_id,
                "error": str(exc),
            })

    # Fireflies bot is invited via calendar attendee (firefly_bot_email).
    # The real Fireflies meeting_id arrives later via webhook → meeting_transcripts.

    await publish_event("meeting.scheduled", {
        "meeting_id": meeting_id,
        "client_id": req.client_id,
        "client_name": req.client_name,
        "client_email": req.client_email,
        "advisor_id": req.advisor_ids[0] if req.advisor_ids else req.advisor_id,
        "advisor_ids": req.advisor_ids or ([req.advisor_id] if req.advisor_id else []),
        "advisor_names": req.advisor_names or ([req.advisor_name] if req.advisor_name else []),
        "advisor_emails": req.advisor_emails or ([req.advisor_email] if req.advisor_email else []),
        "scheduled_at": req.scheduled_at,
        "duration_minutes": req.duration_minutes,
        "title": req.title or req.agenda,
        "agenda": req.agenda,
        "meet_url": meet_url,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    meetings_scheduled_total.inc()
    logger.info("meeting_scheduled", extra={"meeting_id": meeting_id, "client_id": req.client_id, "meet_url": meet_url})
    return {"meeting_id": meeting_id, "status": "scheduled", "meet_url": meet_url, "google_event_id": google_event_id}


@router.get("/transcript/{firefly_meeting_id}")
async def get_transcript_by_firefly_id(firefly_meeting_id: str):
    """
    Fetch a transcript directly from Fireflies by their meeting id.
    Useful for pulling transcripts from older meetings that weren't scheduled
    through this service.
    """
    if not settings.firefly_api_key:
        raise HTTPException(status_code=500, detail="FIREFLY_API_KEY is not configured")
    try:
        client = FireflyClient(settings.firefly_api_key)
        result = await client.get_transcript(firefly_meeting_id)
    except Exception as exc:
        logger.error("firefly_transcript_fetch_failed", extra={
            "error": str(exc), "firefly_meeting_id": firefly_meeting_id,
        })
        raise HTTPException(status_code=502, detail=f"Fireflies API error: {exc}")
    return {
        "firefly_meeting_id": firefly_meeting_id,
        "title": result["title"],
        "meeting_link": result["meeting_link"],
        "transcript_url": result["transcript_url"],
        "duration": result["duration"],
        "transcript": result["text"],
    }


class CancelMeetingRequest(BaseModel):
    reason: str | None = None
    idempotency_key: str | None = None


@router.post("/{meeting_id}/cancel", status_code=status.HTTP_200_OK)
async def cancel_meeting(
    meeting_id: str,
    req: CancelMeetingRequest = CancelMeetingRequest(),
    team_user_id: UUID = Depends(get_current_team_user),
):
    """
    Cancel a meeting. `cancelled_by` is JWT-derived (Depends(get_current_team_user))
    — never taken from the request body or query string. Idempotent on
    `idempotency_key` if supplied.
    """
    try:
        result = await proc_cancel_meeting(
            meeting_id=meeting_id,
            actor_id=str(team_user_id),
            reason=req.reason,
            idempotency_key=req.idempotency_key,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    # Delete the Google Calendar event so attendees get a cancellation email.
    # DB cancel already succeeded; calendar failure is non-fatal.
    try:
        event_id = await proc_get_external_event_id(meeting_id)
        if event_id:
            await delete_meet_event(
                settings,
                event_id=event_id,
                calendar_id=settings.google_calendar_id or "primary",
            )
        else:
            logger.warning("cancel_no_external_event_id", extra={"meeting_id": meeting_id})
    except Exception as exc:
        logger.exception("google_calendar_delete_failed", extra={
            "meeting_id": meeting_id, "error": str(exc),
        })

    await publish_event("meeting.cancelled", {
        "meeting_id":    meeting_id,
        "cancelled_by":  str(team_user_id),
        "reason":        req.reason,
        "timestamp":     datetime.now(timezone.utc).isoformat(),
    })

    logger.info("meeting_cancelled", extra={
        "meeting_id":    meeting_id,
        "cancelled_by":  str(team_user_id),
        "was_replay":    bool((result or {}).get("was_replay")),
    })
    return result or {"meeting_id": meeting_id, "status": "cancelled"}


# Legacy DELETE alias — same behaviour, kept so existing frontends keep working.
# Deprecated: switch callers to POST /{meeting_id}/cancel.
@router.delete("/{meeting_id}", status_code=status.HTTP_200_OK)
async def cancel_meeting_legacy(
    meeting_id: str,
    team_user_id: UUID = Depends(get_current_team_user),
    reason: str = "",
):
    return await cancel_meeting(
        meeting_id=meeting_id,
        req=CancelMeetingRequest(reason=reason or None, idempotency_key=None),
        team_user_id=team_user_id,
    )


# ── Reschedule ────────────────────────────────────────────────────────────────

class RescheduleMeetingRequest(BaseModel):
    new_start_time: str                     # ISO-8601; SP normalises to datetime
    new_end_time:   str
    new_google_meet_link: str | None = None
    reason: str | None = None
    idempotency_key: str | None = None


@router.post("/{meeting_id}/reschedule", status_code=status.HTTP_200_OK)
async def reschedule_meeting(
    meeting_id: str,
    req: RescheduleMeetingRequest,
    team_user_id: UUID = Depends(get_current_team_user),
):
    """
    In-place reschedule. Meeting id stays the same — existing transcripts /
    extractions / attendees keep their references. Rejects when a transcript
    already exists (unless application_config flag overrides).

    Caller is responsible for patching the Google Calendar event afterwards
    if `new_google_meet_link` was issued; this SP does not call any external
    provider.
    """
    try:
        result = await proc_reschedule_meeting(
            meeting_id=meeting_id,
            new_start_time=req.new_start_time,
            new_end_time=req.new_end_time,
            new_google_meet_link=req.new_google_meet_link,
            actor_id=str(team_user_id),
            reason=req.reason,
            idempotency_key=req.idempotency_key,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    # Patch the Google Calendar event so attendees get an updated invite email.
    # DB reschedule already succeeded; calendar patch failure is non-fatal.
    try:
        event_id = await proc_get_external_event_id(meeting_id)
        if event_id:
            await patch_meet_event(
                settings,
                event_id=event_id,
                new_start=req.new_start_time,
                new_end=req.new_end_time,
                timezone=settings.google_calendar_timezone or "Asia/Kolkata",
                calendar_id=settings.google_calendar_id or "primary",
            )
        else:
            logger.warning("reschedule_no_external_event_id", extra={"meeting_id": meeting_id})
    except Exception as exc:
        logger.exception("google_calendar_patch_failed", extra={
            "meeting_id": meeting_id, "error": str(exc),
        })

    await publish_event("meeting.rescheduled", {
        "meeting_id":    meeting_id,
        "rescheduled_by": str(team_user_id),
        "new_start":     req.new_start_time,
        "new_end":       req.new_end_time,
        "reason":        req.reason,
        "timestamp":     datetime.now(timezone.utc).isoformat(),
    })

    logger.info("meeting_rescheduled", extra={
        "meeting_id":       meeting_id,
        "rescheduled_by":   str(team_user_id),
        "reschedule_count": (result or {}).get("reschedule_count"),
        "was_replay":       bool((result or {}).get("was_replay")),
    })
    return result


# ── Generic status transition (escape hatch for ops UI) ───────────────────────

class UpdateMeetingStatusRequest(BaseModel):
    new_status: str                         # in_progress | completed | cancelled | no_show
    reason: str | None = None


@router.post("/{meeting_id}/status", status_code=status.HTTP_200_OK)
async def update_meeting_status(
    meeting_id: str,
    req: UpdateMeetingStatusRequest,
    team_user_id: UUID = Depends(get_current_team_user),
):
    """Generic status transition gate. For cancel use POST /cancel."""
    try:
        result = await proc_update_meeting_status_v2(
            meeting_id=meeting_id,
            new_status=req.new_status,
            actor_id=str(team_user_id),
            reason=req.reason,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    logger.info("meeting_status_changed", extra={
        "meeting_id": meeting_id,
        "new_status": req.new_status,
        "actor":      str(team_user_id),
        "was_change": (result or {}).get("was_change"),
    })
    return result


# ── No-show + complete (operator + cron-driven) ───────────────────────────────

@router.post("/{meeting_id}/no-show", status_code=status.HTTP_200_OK)
async def mark_no_show(
    meeting_id: str,
    team_user_id: UUID = Depends(get_current_team_user),
    reason: str = "",
):
    try:
        return await proc_mark_no_show(
            meeting_id=meeting_id,
            actor_id=str(team_user_id),
            reason=reason or None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/{meeting_id}/complete", status_code=status.HTTP_200_OK)
async def complete_meeting(
    meeting_id: str,
    team_user_id: UUID = Depends(get_current_team_user),
):
    try:
        return await proc_complete_meeting(
            meeting_id=meeting_id,
            actor_id=str(team_user_id),
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


# ── Lifecycle state (read-only — for the UI badge) ────────────────────────────

@router.get("/{meeting_id}/lifecycle")
async def get_meeting_lifecycle_state(meeting_id: str):
    """
    Returns the derived lifecycle bucket plus the underlying flags. Used by the
    AI Validation / Scheduling pages to render a single "where is this meeting?"
    badge without joining transcripts/extractions client-side.
    """
    row = await proc_meeting_lifecycle_state(meeting_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found.")
    return row
